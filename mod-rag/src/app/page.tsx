"use client";

import React, {
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import Link from "next/link";
import { listRagClients, type RagClientRow } from "@/src/lib/ragClientApi";
import {
    parseSelectionMessage,
    type RagDockConnectMessage,
    type RagDockDisconnectMessage,
} from "@/src/lib/messages";
import DashboardClient from "@/src/components/dashboard/DashboardClient";
import PostMessageTap from "@/src/components/debug/PostMessageTap";
import { useDebugFlags } from "@/src/components/debug/useDebugFlags";
import { useAppMode } from "@/src/contexts/AppModeContext";

function DebugTapMount() {
    const { msgdebug } = useDebugFlags();
    return <PostMessageTap enabled={msgdebug} label="mod-rag-host" />;
}

function safeOrigin(url: string): string {
    return new URL(url).origin;
}

function dockUrlFor(ragClientId: string): string {
    const origin =
        typeof window !== "undefined"
            ? window.location.origin
            : "https://rag.fullstackjedi.dev";

    const url = new URL("/dock", origin);
    url.searchParams.set("ragClientId", ragClientId);
    return url.toString();
}

function clampHeight(height: number): number {
    return Math.max(520, Math.min(height, 2600));
}

export default function HomePage() {
    const { isDemo, isReadOnly } = useAppMode();
    const [ragClients, setRagClients] = useState<RagClientRow[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>("");
    const [loadingClients, setLoadingClients] = useState<boolean>(true);
    const [clientError, setClientError] = useState<string | null>(null);
    const [hostFrameLoaded, setHostFrameLoaded] = useState(false);
    const [hostFrameHeight, setHostFrameHeight] = useState(1400);
    const [lastSelection, setLastSelection] = useState<string>("");

    const targetFrameRef = useRef<HTMLIFrameElement | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadClients() {
            setLoadingClients(true);
            setClientError(null);

            try {
                const rows = await listRagClients();

                if (cancelled) return;

                setRagClients(rows);
                setSelectedClientId((prev) => prev || rows[0]?.id || "");
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : String(err || "Unknown error");

                if (!cancelled) {
                    setRagClients([]);
                    setSelectedClientId("");
                    setClientError(message);
                }
            } finally {
                if (!cancelled) {
                    setLoadingClients(false);
                }
            }
        }

        void loadClients();

        return () => {
            cancelled = true;
        };
    }, []);

    const selectedClient = useMemo(() => {
        return ragClients.find((client) => client.id === selectedClientId) ?? ragClients[0];
    }, [ragClients, selectedClientId]);

    const targetUrl = useMemo(() => {
        if (!selectedClient) return "";
        return selectedClient.host_url;
    }, [selectedClient]);

    const targetOrigin = useMemo(() => {
        if (!selectedClient) return "*";

        try {
            return safeOrigin(selectedClient.host_url);
        } catch {
            return "*";
        }
    }, [selectedClient]);

    const sendMessageToTarget = useCallback(
        (msg: RagDockConnectMessage | RagDockDisconnectMessage) => {
            const targetWindow = targetFrameRef.current?.contentWindow;
            if (!targetWindow) return;

            targetWindow.postMessage(msg, targetOrigin);
        },
        [targetOrigin]
    );

    const sendDockConnect = useCallback(
        (client: RagClientRow) => {
            const msg: RagDockConnectMessage = {
                type: "RAG_DOCK_CONNECT",
                ragClientId: client.id,
                dockUrl: dockUrlFor(client.id),
                hostUrl: client.host_url,
                label: client.name,
            };

            sendMessageToTarget(msg);
        },
        [sendMessageToTarget]
    );

    const sendDockDisconnect = useCallback(
        (client?: RagClientRow) => {
            const msg: RagDockDisconnectMessage = {
                type: "RAG_DOCK_DISCONNECT",
                ragClientId: client?.id,
            };

            sendMessageToTarget(msg);
        },
        [sendMessageToTarget]
    );

    useEffect(() => {
        const onMessage = (ev: MessageEvent<unknown>) => {
            const targetWindow = targetFrameRef.current?.contentWindow;

            if (!targetWindow) return;
            if (ev.source !== targetWindow) return;

            const data = ev.data;

            if (
                data &&
                typeof data === "object" &&
                "type" in data &&
                data.type === "HOST_APP_HEIGHT" &&
                "height" in data &&
                typeof data.height === "number"
            ) {
                setHostFrameHeight(clampHeight(data.height));
                return;
            }

            try {
                const msg = parseSelectionMessage(ev.data);
                setLastSelection(msg.id);
            } catch {
                // Ignore unrelated messages from the target iframe.
            }
        };

        window.addEventListener("message", onMessage);

        return () => {
            window.removeEventListener("message", onMessage);
        };
    }, []);

    function handleSelectClient(client: RagClientRow) {
        setSelectedClientId(client.id);
        setHostFrameLoaded(false);
        setHostFrameHeight(1400);
        setLastSelection("");
    }

    function handleConnectClient(client: RagClientRow) {
        setSelectedClientId(client.id);

        window.setTimeout(() => {
            sendDockConnect(client);
        }, hostFrameLoaded ? 0 : 300);
    }

    function handleDisconnectClient(client: RagClientRow) {
        sendDockDisconnect(client);
    }

    if (loadingClients) {
        return (
            <main className="min-h-screen bg-slate-50 text-gray-900">
                <div className="mx-auto max-w-5xl p-6">
                    <h1 className="text-2xl font-bold">Modular RAG Assistant Demo</h1>
                    <p className="mt-2 text-sm text-gray-600">Loading RAG clients...</p>

                    <Suspense fallback={null}>
                        <DebugTapMount />
                    </Suspense>
                </div>
            </main>
        );
    }

    if (clientError) {
        return (
            <main className="min-h-screen bg-slate-50 text-gray-900">
                <div className="mx-auto max-w-5xl p-6">
                    <h1 className="text-2xl font-bold">Modular RAG Assistant Demo</h1>

                    <div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                        Failed to load RAG clients: {clientError}
                    </div>

                    <div className="mt-4">
                        <Link
                            href="/clients"
                            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            {isDemo ? "View RAG Clients" : "Manage RAG Clients"}
                        </Link>
                    </div>

                    <Suspense fallback={null}>
                        <DebugTapMount />
                    </Suspense>
                </div>
            </main>
        );
    }




    if (!selectedClient) {
        return (
            <main>
                <div className="shell">
                    <h1>Modular RAG Assistant Demo</h1>
                    <p className="error-text">No RAG clients are configured.</p>

                    <div className="btns">
                        <Link href="/clients" className="button secondary">
                            {isDemo ? "View RAG Clients" : "Manage RAG Clients"}
                        </Link>
                    </div>

                    <Suspense fallback={null}>
                        <DebugTapMount />
                    </Suspense>
                </div>
            </main>
        );
    }

    return (
        <main>
            <div className="shell wide stack">
                <header className="stack">
                    <div className="header-row">
                        <div>
                            {/*<h1>Modular RAG Assistant Demo</h1>*/}

                            {/*<p className="subtitle">*/}
                            {/*    Select a host app to load it below. Connect attaches the RAG dock inside the embedded host app.*/}
                            {/*</p>*/}

                            {/*{isDemo ? (*/}
                            {/*    <p className="card muted-note">*/}
                            {/*        Demo mode is read-only for configuration. Status polling is disabled; client details remain viewable.*/}
                            {/*    </p>*/}
                            {/*) : null}*/}

                            {lastSelection ? (
                                <p className="small muted">
                                    Latest target selection from host:{" "}
                                    <span className="mono">{lastSelection}</span>
                                </p>
                            ) : null}
                        </div>

                        {/*{!isReadOnly ? (*/}
                        {/*    <Link href="/client/new" className="button secondary">*/}
                        {/*        Configure New Client*/}
                        {/*    </Link>*/}
                        {/*) : null}*/}
                    </div>


                    <DashboardClient
                        selectedRagClientId={selectedClient.id}
                        onSelectClientAction={handleSelectClient}
                        onConnectClientAction={handleConnectClient}
                        onDisconnectClientAction={handleDisconnectClient}
                        compact
                    />
                </header>

                 <section className="card iframe-card">
                    {/*<div className="card-header">*/}
                    {/*    <h2>{selectedClient.name}</h2>*/}
                    {/*    <p className="small muted">{targetUrl}</p>*/}
                    {/*</div>*/}

                    <iframe
                        key={selectedClient.id}
                        ref={targetFrameRef}
                        title={`${selectedClient.name} target host`}
                        src={targetUrl}
                        className="block w-full border-0 overflow-hidden"
                        style={{
                            height: `${hostFrameHeight}px`,
                            overflow: "hidden",
                        }}
                        onLoad={() => setHostFrameLoaded(true)}
                    />
                </section>
            </div>

            <Suspense fallback={null}>
                <DebugTapMount />
            </Suspense>
        </main>
    );
}