"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  listRagClients,
  type RagClientRow,
} from "@/app/lib/ragClientApi";
import {
  parseSelectionMessage,
  type RagClientSelectedMsg,
} from "@/app/lib/messages";
import PostMessageTap from "@/app/components/debug/PostMessageTap";
import { useDebugFlags } from "@/app/components/debug/useDebugFlags";
import { debugPostMessage } from "@/app/lib/debugPostMessage";

function DebugTapMount() {
  const { msgdebug } = useDebugFlags();
  return <PostMessageTap enabled={msgdebug} label="mod-rag-host" />;
}

export default function HomePage() {
  const [ragClients, setRagClients] = useState<RagClientRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [loadingClients, setLoadingClients] = useState<boolean>(true);
  const [clientError, setClientError] = useState<string | null>(null);

  const targetFrameRef = useRef<HTMLIFrameElement | null>(null);
  const dockFrameRef = useRef<HTMLIFrameElement | null>(null);

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
        const message = err instanceof Error ? err.message : String(err || "Unknown error");

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

  const selectedClient = useMemo(
    () => ragClients.find((client) => client.id === selectedClientId) ?? ragClients[0],
    [ragClients, selectedClientId]
  );

  const dockUrl = useMemo(() => {
    if (!selectedClient) return "/dock";

    const params = new URLSearchParams({
      client: selectedClient.id,
      collapsed: "1",
    });

    return `/dock?${params.toString()}`;
  }, [selectedClient]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent<unknown>) => {
      const targetWindow = targetFrameRef.current?.contentWindow;
      const dockWindow = dockFrameRef.current?.contentWindow;

      if (!targetWindow || !dockWindow) return;
      if (ev.source !== targetWindow) return;

      try {
        const msg = parseSelectionMessage(ev.data);
        debugPostMessage(dockWindow, msg, "*", "host relay TARGET_SELECTED -> dock");
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
    const dockWindow = dockFrameRef.current?.contentWindow;
    if (!dockWindow || !selectedClient) return;

    const msg: RagClientSelectedMsg = {
      type: "RAG_CLIENT_SELECTED",
      client: selectedClient.id,
      hostUrl: selectedClient.host_url,
      label: selectedClient.name,
      defaultUsecase: null,
    };

    debugPostMessage(dockWindow, msg, "*", "host -> dock RAG_CLIENT_SELECTED");
  }, [selectedClient]);

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
                Select a RAG client host, then explore it side-by-side with the
                SmartExplainer controller. The host relays runtime target selections from the
                target app into the dock automatically.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/clients"
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                Manage RAG Clients
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
            <label
              htmlFor="rag-client"
              className="mb-2 block text-sm font-medium text-gray-800"
            >
              Select RAG Client
            </label>

            <select
              id="rag-client"
              value={selectedClient.id}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 md:max-w-md"
            >
              {ragClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>

            <p className="mt-3 text-sm text-gray-600">
              {selectedClient.host_url}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900">
                {selectedClient.name}
              </h2>
              <p className="text-xs text-gray-500">{selectedClient.host_url}</p>
            </div>

            <div className="h-[72vh] min-h-[560px]">
              <iframe
                ref={targetFrameRef}
                title={`${selectedClient.name} target host`}
                src={selectedClient.host_url}
                className="h-full w-full border-0"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900">
                SmartExplainer Controller
              </h2>
              <p className="text-xs text-gray-500">
                Client: {selectedClient.id}
              </p>
            </div>

            <div className="h-[72vh] min-h-[560px]">
              <iframe
                ref={dockFrameRef}
                title="SmartExplainer controller"
                src={dockUrl}
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </section>
      </div>

      <Suspense fallback={null}>
        <DebugTapMount />
      </Suspense>
    </main>
  );
}