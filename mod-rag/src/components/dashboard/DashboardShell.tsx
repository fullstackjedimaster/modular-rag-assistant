"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import DashboardClient from "@/src/components/dashboard/DashboardClient";
import PostMessageTap from "@/src/components/debug/PostMessageTap";
import { useDebugFlags } from "@/src/components/debug/useDebugFlags";
import { useAppMode } from "@/src/contexts/AppModeContext";
import { useEmbedToken } from "@/src/hooks/useEmbedToken";
import { listRagClients, type RagClientRow } from "@/src/lib/ragClientApi";
import { parseTargetSelectedMessage } from "@/src/lib/messages";

const DEFAULT_HOST_HEIGHT = 600;
const MIN_HOST_HEIGHT = 240;
const MAX_HOST_HEIGHT = 5000;

function DebugTapMount() {
    const { msgdebug } = useDebugFlags();
    return <PostMessageTap enabled={msgdebug} label="mod-rag-host" />;
}

function clampHeight(height: number): number {
    return Math.max(MIN_HOST_HEIGHT, Math.min(MAX_HOST_HEIGHT, Math.ceil(height)));
}

export default function DashboardShell() {
    const { isReadOnly, isDemo } = useAppMode();
    const embedToken = useEmbedToken();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    const [browserOrigin, setBrowserOrigin] = useState("");
    const [clients, setClients] = useState<RagClientRow[]>([]);
    const [selectedClientId, setSelectedClientId] = useState("");
    const [connectedClientId, setConnectedClientId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [hostReady, setHostReady] = useState(false);
    const [hostHeight, setHostHeight] = useState(DEFAULT_HOST_HEIGHT);
    const [lastSelection, setLastSelection] = useState("");

    useEffect(() => {
        setBrowserOrigin(window.location.origin);
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function load(): Promise<void> {
            setLoading(true);
            setError("");

            try {
                const rows = await listRagClients();
                if (cancelled) return;
                setClients(rows);
                setSelectedClientId((current) => current || rows[0]?.id || "");
            } catch (caught: unknown) {
                if (!cancelled) {
                    setClients([]);
                    setSelectedClientId("");
                    setError(caught instanceof Error ? caught.message : String(caught));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const selectedClient = useMemo(
        () => clients.find((client) => client.id === selectedClientId) ?? clients[0] ?? null,
        [clients, selectedClientId],
    );

    const selectedOrigin = useMemo(() => {
        if (!selectedClient) return "";
        try {
            return new URL(selectedClient.host_url).origin;
        } catch {
            return "";
        }
    }, [selectedClient]);

    const selectedUrl = useMemo(() => {
        if (!selectedClient || !browserOrigin) return "";

        const url = new URL(selectedClient.host_url);
        url.searchParams.set("embedParentOrigin", browserOrigin);
        if (embedToken) url.searchParams.set("pf_embed_token", embedToken);
        return url.toString();
    }, [browserOrigin, embedToken, selectedClient]);

    const postToHost = useCallback((message: object) => {
        const targetWindow = iframeRef.current?.contentWindow;
        if (!targetWindow || !selectedOrigin) return;
        targetWindow.postMessage(message, selectedOrigin);
    }, [selectedOrigin]);

    const discoverHost = useCallback(() => {
        setHostReady(false);
        postToHost({ type: "RAG_HOST_DISCOVER" });
    }, [postToHost]);

    useEffect(() => {
        setHostReady(false);
        setHostHeight(DEFAULT_HOST_HEIGHT);
        setLastSelection("");
    }, [selectedClientId]);

    useEffect(() => {
        if (!hostReady || !selectedClient || connectedClientId !== selectedClient.id) return;
        postToHost({ type: "RAG_DOCK_CONNECT", ragClientId: selectedClient.id });
    }, [connectedClientId, hostReady, postToHost, selectedClient]);

    useEffect(() => {
        function onMessage(event: MessageEvent<unknown>): void {
            const targetWindow = iframeRef.current?.contentWindow;
            if (!targetWindow || event.source !== targetWindow) return;
            if (!selectedOrigin || event.origin !== selectedOrigin) return;

            const data = event.data as { type?: unknown; height?: unknown } | null;

            if (data?.type === "RAG_HOST_READY") {
                setHostReady(true);
                return;
            }

            if (data?.type === "EMBED_HEIGHT" && typeof data.height === "number") {
                setHostHeight(clampHeight(data.height));
                return;
            }

            const target = parseTargetSelectedMessage(event.data);
            if (target) setLastSelection(target.id);
        }

        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [selectedOrigin]);

    function selectClient(client: RagClientRow): void {
        setSelectedClientId(client.id);
    }

    function connectClient(client: RagClientRow): void {
        setConnectedClientId(client.id);
        setSelectedClientId(client.id);
    }

    function disconnectClient(client: RagClientRow): void {
        if (client.id === selectedClient?.id && hostReady) {
            postToHost({ type: "RAG_DOCK_DISCONNECT" });
        }
        setConnectedClientId((current) => current === client.id ? "" : current);
    }

    if (loading) {
        return (
            <main className="rag-page">
                <div className="rag-page-inner rag-page-inner-narrow">
                    <h1 className="rag-title">Modular RAG Assistant Demo</h1>
                    <p className="rag-subtitle">Loading RAG clients...</p>
                </div>
            </main>
        );
    }

    if (error || !selectedClient) {
        return (
            <main className="rag-page">
                <div className="rag-page-inner rag-page-inner-narrow">
                    <h1 className="rag-title">Modular RAG Assistant Demo</h1>
                    <div className="rag-error">{error || "No RAG clients are configured."}</div>
                    <div className="rag-toolbar">
                        <Link href="/clients" className="rag-button rag-button-secondary">
                            {isDemo ? "View RAG Clients" : "Manage RAG Clients"}
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="rag-page">
            <div className="rag-page-inner">
                <header className="rag-client-header">
                    <div className="rag-client-topline">
                        <div className="rag-client-title-wrap">
                            {lastSelection ? (
                                <p className="rag-last-selection">
                                    target: <span>{lastSelection}</span>
                                </p>
                            ) : null}
                        </div>
                        {!isReadOnly ? (
                            <Link href="/client/new" className="rag-button rag-button-secondary">
                                New Client
                            </Link>
                        ) : null}
                    </div>

                    <DashboardClient
                        selectedRagClientId={selectedClient.id}
                        onSelectClientAction={selectClient}
                        onConnectClientAction={connectClient}
                        onDisconnectClientAction={disconnectClient}
                        onConnectedClientChangeAction={setConnectedClientId}
                        compact
                    />
                </header>

                <section className="rag-host-frame-card">
                    {selectedUrl ? (
                        <iframe
                            key={selectedClient.id}
                            ref={iframeRef}
                            title={`${selectedClient.name} target host`}
                            src={selectedUrl}
                            className="rag-host-frame"
                            style={{ height: `${hostHeight}px` }}
                            onLoad={discoverHost}
                        />
                    ) : null}
                </section>
            </div>

            <Suspense fallback={null}>
                <DebugTapMount />
            </Suspense>
        </main>
    );
}
