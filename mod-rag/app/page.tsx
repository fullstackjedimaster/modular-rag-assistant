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
import {
    listRagClients,
    type RagClientRow,
} from "@/app/lib/ragClientApi";
import {
    parseSelectionMessage,
    type RagClientSelectedMsg,
} from "@/app/lib/messages";
import DashboardClient from "@/app/components/dashboard/DashboardClient";
import PostMessageTap from "@/app/components/debug/PostMessageTap";
import { useDebugFlags } from "@/app/components/debug/useDebugFlags";
import { debugPostMessage } from "@/app/lib/debugPostMessage";

function DebugTapMount() {
    const { msgdebug } = useDebugFlags();
    return <PostMessageTap enabled={msgdebug} label="mod-rag-host" />;
}

function withRagClientId(hostUrl: string, ragClientId: string): string {
    const url = new URL(hostUrl);
    url.searchParams.set("ragClientId", ragClientId);
    return url.toString();
}

export default function HomePage() {
    const [ragClients, setRagClients] = useState<RagClientRow[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>("");
    const [loadingClients, setLoadingClients] = useState<boolean>(true);
    const [clientError, setClientError] = useState<string | null>(null);

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
        return (
            ragClients.find((client) => client.id === selectedClientId) ??
            ragClients[0]
        );
    }, [ragClients, selectedClientId]);

    const ragClientSelectedMsg = useMemo<RagClientSelectedMsg | null>(() => {
        if (!selectedClient) return null;

        return {
            type: "RAG_CLIENT_SELECTED",
            ragClientId: selectedClient.id,
            hostUrl: selectedClient.host_url,
            label: selectedClient.name,
        };
    }, [selectedClient]);

    const targetUrl = useMemo(() => {
        if (!selectedClient) return "";
        return withRagClientId(selectedClient.host_url, selectedClient.id);
    }, [selectedClient]);

    const sendRagClientSelected = useCallback(() => {
        if (!ragClientSelectedMsg) return;

        const targetWindow = targetFrameRef.current?.contentWindow;

        if (targetWindow) {
            debugPostMessage(
                targetWindow,
                ragClientSelectedMsg,
                "*",
                "host -> target RAG_CLIENT_SELECTED"
            );
        }
    }, [ragClientSelectedMsg]);

    useEffect(() => {
        const onMessage = (ev: MessageEvent<unknown>) => {
            const targetWindow = targetFrameRef.current?.contentWindow;

            if (!targetWindow) return;
            if (ev.source !== targetWindow) return;

            try {
                parseSelectionMessage(ev.data);
            } catch {
                // Ignore unrelated messages from the target iframe.
            }
        };

        window.addEventListener("message", onMessage);

        return () => {
            window.removeEventListener("message", onMessage);
        };
    }, []);

    useEffect(() => {
        sendRagClientSelected();
    }, [sendRagClientSelected]);

    function handleSelectClient(client: RagClientRow) {
        setSelectedClientId(client.id);
    }

    function handleConnectClient(client: RagClientRow) {
        setSelectedClientId(client.id);
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
                            Manage RAG Clients
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
            <main className="min-h-screen bg-slate-50 text-gray-900">
                <div className="mx-auto max-w-5xl p-6">
                    <h1 className="text-2xl font-bold">Modular RAG Assistant Demo</h1>
                    <p className="mt-2 text-sm text-red-600">No RAG clients are configured.</p>

                    <div className="mt-4">
                        <Link
                            href="/clients"
                            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            Manage RAG Clients
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
        <main className="min-h-screen bg-slate-50 text-gray-900">
            <div className="mx-auto max-w-7xl space-y-6 p-6">
                <header className="space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold">Modular RAG Assistant Demo</h1>

                            <p className="max-w-3xl text-sm text-gray-600">
                                Select or connect a RAG client host, then use the embedded target app.
                                The target app owns its own bottom dock.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Link
                                href="/client/new"
                                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                Configure New Client
                            </Link>
                        </div>
                    </div>

                    <DashboardClient
                        selectedRagClientId={selectedClient.id}
                        onSelectClient={handleSelectClient}
                        onConnectClient={handleConnectClient}
                        compact
                    />
                </header>

                <section className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
                    <div className="border-b border-gray-200 px-4 py-3">
                        <h2 className="text-base font-semibold text-gray-900">
                            {selectedClient.name}
                        </h2>
                        <p className="text-xs text-gray-500">{targetUrl}</p>
                    </div>

                    <div className="h-[78vh] min-h-[640px]">
                        <iframe
                            ref={targetFrameRef}
                            title={`${selectedClient.name} target host`}
                            src={targetUrl}
                            className="h-full w-full border-0"
                            onLoad={sendRagClientSelected}
                        />
                    </div>
                </section>
            </div>

            <Suspense fallback={null}>
                <DebugTapMount />
            </Suspense>
        </main>
    );
}