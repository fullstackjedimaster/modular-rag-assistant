"use host";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import DashboardHost from "@/src/components/dashboard/DashboardHost";
import PostMessageTap from "@/src/components/debug/PostMessageTap";
import { useDebugFlags } from "@/src/components/debug/useDebugFlags";
import { useAppMode } from "@/src/contexts/AppModeContext";
import { useEmbedToken } from "@/src/hooks/useEmbedToken";
import { listRagHosts, type RagHostRow } from "@/src/lib/ragHostApi";
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
    const [hosts, setHosts] = useState<RagHostRow[]>([]);
    const [selectedHostId, setSelectedHostId] = useState("");
    const [connectedHostId, setConnectedHostId] = useState("");
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
                const rows = await listRagHosts();
                if (cancelled) return;
                setHosts(rows);
                setSelectedHostId((current) => current || rows[0]?.id || "");
            } catch (caught: unknown) {
                if (!cancelled) {
                    setHosts([]);
                    setSelectedHostId("");
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

    const selectedHost = useMemo(
        () => hosts.find((host) => host.id === selectedHostId) ?? hosts[0] ?? null,
        [hosts, selectedHostId],
    );

    const selectedOrigin = useMemo(() => {
        if (!selectedHost) return "";
        try {
            return new URL(selectedHost.host_url).origin;
        } catch {
            return "";
        }
    }, [selectedHost]);

    const selectedUrl = useMemo(() => {
        if (!selectedHost || !browserOrigin) return "";

        const url = new URL(selectedHost.host_url);
        url.searchParams.set("embedParentOrigin", browserOrigin);
        if (embedToken) url.searchParams.set("pf_embed_token", embedToken);
        return url.toString();
    }, [browserOrigin, embedToken, selectedHost]);

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
    }, [selectedHostId]);

    useEffect(() => {
        if (!hostReady || !selectedHost || connectedHostId !== selectedHost.id) return;
        postToHost({ type: "RAG_DOCK_CONNECT", ragHostId: selectedHost.id });
    }, [connectedHostId, hostReady, postToHost, selectedHost]);

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

    function selectHost(host: RagHostRow): void {
        setSelectedHostId(host.id);
    }

    function connectHost(host: RagHostRow): void {
        setConnectedHostId(host.id);
        setSelectedHostId(host.id);
    }

    function disconnectHost(host: RagHostRow): void {
        if (host.id === selectedHost?.id && hostReady) {
            postToHost({ type: "RAG_DOCK_DISCONNECT" });
        }
        setConnectedHostId((current) => current === host.id ? "" : current);
    }

    if (loading) {
        return (
            <main className="rag-page">
                <div className="rag-page-inner rag-page-inner-narrow">
                    <h1 className="rag-title">Modular RAG Assistant Demo</h1>
                    <p className="rag-subtitle">Loading RAG hosts...</p>
                </div>
            </main>
        );
    }

    if (error || !selectedHost) {
        return (
            <main className="rag-page">
                <div className="rag-page-inner rag-page-inner-narrow">
                    <h1 className="rag-title">Modular RAG Assistant Demo</h1>
                    <div className="rag-error">{error || "No RAG hosts are configured."}</div>
                    <div className="rag-toolbar">
                        <Link href="/hosts" className="rag-button rag-button-secondary">
                            {isDemo ? "View RAG Hosts" : "Manage RAG Hosts"}
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="rag-page">
            <div className="rag-page-inner">
                <header className="rag-host-header">
                    <div className="rag-host-topline">
                        <div className="rag-host-title-wrap">
                            {lastSelection ? (
                                <p className="rag-last-selection">
                                    target: <span>{lastSelection}</span>
                                </p>
                            ) : null}
                        </div>
                        {!isReadOnly ? (
                            <Link href="/host/new" className="rag-button rag-button-secondary">
                                New Host
                            </Link>
                        ) : null}
                    </div>

                    <DashboardHost
                        selectedRagHostId={selectedHost.id}
                        onSelectHostAction={selectHost}
                        onConnectHostAction={connectHost}
                        onDisconnectHostAction={disconnectHost}
                        onConnectedHostChangeAction={setConnectedHostId}
                        compact
                    />
                </header>

                <section className="rag-host-frame-card">
                    {selectedUrl ? (
                        <iframe
                            key={selectedHost.id}
                            ref={iframeRef}
                            title={`${selectedHost.name} target host`}
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
