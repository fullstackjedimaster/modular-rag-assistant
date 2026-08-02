// app/components/dashboard/DashboardShell.tsx
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
  parseTargetSelectedMessage,
  type RagDockConnectMessage,
  type RagDockDisconnectMessage,
} from "@/src/lib/messages";
import DashboardClient from "@/src/components/dashboard/DashboardClient";
import PostMessageTap from "@/src/components/debug/PostMessageTap";
import { useDebugFlags } from "@/src/components/debug/useDebugFlags";
import { useAppMode} from "@/src/contexts/AppModeContext";
import { useEmbedToken } from "@/src/hooks/useEmbedToken";

function DebugTapMount() {
  const { msgdebug } = useDebugFlags();
  return <PostMessageTap enabled={msgdebug} label="mod-rag-host" />;
}

function safeOrigin(url: string): string {
  return new URL(url).origin;
}

function clampHeight(height: number): number {
  return Math.max(240, Math.min(height, 5000));
}


export default function DashboardShell() {

  const { isReadOnly, isDemo } = useAppMode();
  const embedToken = useEmbedToken();
  const [selfOrigin, setSelfOrigin] = useState("");

  useEffect(() => {
    setSelfOrigin(window.location.origin);
  }, []);

    const [ragClients, setRagClients] = useState<RagClientRow[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>("");
    const [loadingClients, setLoadingClients] = useState<boolean>(true);
    const [clientError, setClientError] = useState<string | null>(null);
    const [hostReady, setHostReady] = useState(false);
    const [connectedClientId, setConnectedClientId] = useState("");
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

      const url = new URL(selectedClient.host_url);
      if (selfOrigin) url.searchParams.set("embedParentOrigin", selfOrigin);
      if (embedToken) url.searchParams.set("pf_embed_token", embedToken);
      return url.toString();
    }, [selectedClient, embedToken, selfOrigin]);

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

    const discoverHost = useCallback(() => {
      const targetWindow = targetFrameRef.current?.contentWindow;
      if (!targetWindow) return;

      targetWindow.postMessage(
          { type: "RAG_HOST_DISCOVER" },
          targetOrigin,
      );
    }, [targetOrigin]);

    const sendDockConnect = useCallback(
        (client: RagClientRow) => {
          const msg: RagDockConnectMessage = {
            type: "RAG_DOCK_CONNECT",
            ragClientId: client.id,
          };

          sendMessageToTarget(msg);
        },
        [sendMessageToTarget]
    );

    const sendDockDisconnect = useCallback(
        () => {
          const msg: RagDockDisconnectMessage = {
            type: "RAG_DOCK_DISCONNECT",
          };

          sendMessageToTarget(msg);
        },
        [sendMessageToTarget]
    );

    useEffect(() => {
      setHostReady(false);
    }, [targetUrl]);

    useEffect(() => {
      if (!selectedClient || !hostReady) return;
      if (connectedClientId !== selectedClient.id) return;
      sendDockConnect(selectedClient);
    }, [selectedClient, connectedClientId, hostReady, sendDockConnect]);

    useEffect(() => {
      const onMessage = (ev: MessageEvent<unknown>) => {
        const targetWindow = targetFrameRef.current?.contentWindow;

        if (!targetWindow) return;
        if (ev.source !== targetWindow) return;

        if (ev.origin !== targetOrigin) return;

        const data = ev.data;

        if (
            data &&
            typeof data === "object" &&
            "type" in data &&
            data.type === "RAG_HOST_READY"
        ) {
          setHostReady(true);
          return;
        }

        if (
            data &&
            typeof data === "object" &&
            "type" in data &&
            data.type === "EMBED_HEIGHT" &&
            "height" in data &&
            typeof data.height === "number"
        ) {
          setHostFrameHeight(clampHeight(data.height));
          return;
        }

        const message = parseTargetSelectedMessage(ev.data);

        if (message) {
          setLastSelection(message.id);
        }
      };

      window.addEventListener("message", onMessage);

      return () => {
        window.removeEventListener("message", onMessage);
      };
    }, [targetOrigin]);

    function handleSelectClient(client: RagClientRow) {
      setSelectedClientId(client.id);
      setHostFrameHeight(1400);
      setLastSelection("");
    }

    function handleConnectClient(client: RagClientRow) {
      setConnectedClientId(client.id);
      setSelectedClientId(client.id);
    }

    function handleDisconnectClient(client: RagClientRow) {
      if (client.id !== connectedClientId) return;
      if (hostReady) sendDockDisconnect();
      setConnectedClientId("");
    }

    if (loadingClients) {
      return (

          <main className="rag-page">
            <div className="rag-page-inner rag-page-inner-narrow">
              <h1 className="rag-title">Modular RAG Assistant Demo</h1>
              <p className="rag-subtitle">Loading RAG clients...</p>

              <Suspense fallback={null}>
                <DebugTapMount />
              </Suspense>
            </div>
          </main>
      );
    }

    if (clientError) {
      return (
          <main className="rag-page">
            <div className="rag-page-inner rag-page-inner-narrow">
              <h1 className="rag-title">Modular RAG Assistant Demo</h1>

              <div className="rag-error">
                Failed to load RAG clients: {clientError}
              </div>

              <div className="rag-toolbar">
                <Link href="/clients" className="rag-button rag-button-secondary">
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
          <main className="rag-page">
            <div className="rag-page-inner rag-page-inner-narrow">
              <h1 className="rag-title">Modular RAG Assistant Demo</h1>
              <p className="rag-error-text">No RAG clients are configured.</p>

              <div className="rag-toolbar">
                <Link href="/clients" className="rag-button rag-button-secondary">
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
                  onSelectClientAction={handleSelectClient}
                  onConnectClientAction={handleConnectClient}
                  onDisconnectClientAction={handleDisconnectClient}
                  compact
              />
            </header>

            <section className="rag-host-frame-card">
              <iframe
                  ref={targetFrameRef}
                  title={`${selectedClient.name} target host`}
                  src={targetUrl}
                  className="rag-host-frame"
                  style={{
                    height: `${hostFrameHeight}px`,
                  }}
                  onLoad={discoverHost}
              />
            </section>
          </div>

          <Suspense fallback={null}>
            <DebugTapMount />
          </Suspense>
        </main>
    );
  }
