// app/components/management/ManagementShell.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GroupBox from "@/src/components/GroupBox";
import { useAppMode } from "@/src/contexts/AppModeContext";
import {
  connectRagClient,
  disconnectRagClient,
  createRagClient,
  deleteRagClient,
  getRagClient,
  updateRagClient,
  type RagClientFull,
} from "@/src/lib/ragClientApi";

import ContentDocsBox from "@/src/components/management/ContentDocsBox";
import ContextMessagesBox from "@/src/components/management/ContextMessagesBox";
import SystemPromptBox from "@/src/components/management/SystemPromptBox";

type Mode = "create" | "edit";
type LoadState = "idle" | "loading" | "ready" | "error";
type RagClientId = RagClientFull["id"];

function isRagClientId(value: string | undefined | null): value is RagClientId {
  return typeof value === "string" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

export default function ManagementShell(props: { mode: Mode; clientId?: string }) {
  const { mode, clientId } = props;
  const router = useRouter();
  const { isReadOnly } = useAppMode();

  const activeClientId = useMemo<RagClientId | null>(() => {
    return isRagClientId(clientId) ? clientId : null;
  }, [clientId]);

  const [state, setState] = useState<LoadState>(mode === "edit" ? "loading" : "ready");
  const [err, setErr] = useState("");

  const [client, setClient] = useState<RagClientFull | null>(null);

  const [name, setName] = useState("");
  const [hostUrl, setHostUrl] = useState("");

  const title = useMemo(() => {
    if (mode === "create") return "Configure New Client";
    return client ? `Manage: ${client.name}` : "Manage Client";
  }, [mode, client]);

  const load = useCallback(async () => {
    if (mode !== "edit") return;

    if (!activeClientId) {
      setErr("Invalid or missing RAG client id.");
      setState("error");
      return;
    }

    setState("loading");
    setErr("");

    try {
      const c = await getRagClient(activeClientId);
      setClient(c);
      setName(c.name || "");
      setHostUrl(c.host_url || "");
      setState("ready");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [mode, activeClientId]);

  useEffect(() => {
    if (mode === "create") {
      setState("ready");
      return;
    }

    void load();
  }, [mode, load]);

  async function onCreate() {
    setErr("");

    if (isReadOnly) {
      setErr("Demo mode is read-only. Creating clients is disabled.");
      return;
    }

    try {
      const created = await createRagClient({
        name: name.trim(),
        host_url: hostUrl.trim(),
      });

      router.push(`/hosts/${created.id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function onSave() {
    if (!activeClientId) return;

    setErr("");

    if (isReadOnly) {
      setErr("Demo mode is read-only. Saving changes is disabled.");
      return;
    }

    try {
      await updateRagClient(activeClientId, {
        name: name.trim(),
        host_url: hostUrl.trim(),
      });

      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDelete() {
    if (!activeClientId) return;

    setErr("");

    if (isReadOnly) {
      setErr("Demo mode is read-only. Deleting clients is disabled.");
      return;
    }

    if (!confirm("Delete this client? This cannot be undone.")) return;

    try {
      await deleteRagClient(activeClientId);
      router.push("/");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function onConnect() {
    if (!activeClientId) return;

    setErr("");

    if (isReadOnly) {
      setErr("Demo mode is read-only. Connect actions are disabled from this screen.");
      return;
    }

    try {
      await connectRagClient(activeClientId);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDisconnect() {
    if (!activeClientId) return;

    setErr("");

    if (isReadOnly) {
      setErr("Demo mode is read-only. Disconnect actions are disabled from this screen.");
      return;
    }

    try {
      await disconnectRagClient(activeClientId);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (state === "loading") {
    return (
      <div className="p-4">
        <GroupBox title={title}>
          <div className="text-sm">Loading...</div>
        </GroupBox>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="p-4">
        <GroupBox title={title}>
          <div className="whitespace-pre-wrap text-sm text-red-600">
            {err || "Failed to load."}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              className="rounded border px-3 py-2 text-sm"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>

            <Link className="rounded border px-3 py-2 text-sm" href="/mod-rag/public">
              Back
            </Link>
          </div>
        </GroupBox>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <GroupBox title={title}>
        {err ? <div className="mb-3 whitespace-pre-wrap text-sm text-red-600">{err}</div> : null}

        {isReadOnly ? (
          <div className="mb-3 rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700">
            Demo mode is read-only. You can view client details, but create, edit, connect, disconnect, and delete actions are disabled here.
          </div>
        ) : null}

        <div className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Client Name</label>
            <input
              className="rounded border px-2 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={isReadOnly}
              disabled={isReadOnly}
              placeholder="e.g. Mesh DAQ Dashboard"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium">Host URL</label>
            <input
              className="rounded border px-2 py-2 font-mono text-sm"
              value={hostUrl}
              onChange={(e) => setHostUrl(e.target.value)}
              readOnly={isReadOnly}
              disabled={isReadOnly}
              placeholder="https://daq.fullstackjedi.dev"
            />

            <div className="text-xs text-gray-600">
              This is the URL where the dock will be injected / where the client app lives.
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {mode === "create" ? (
              <>
                {!isReadOnly ? (
                <button
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  type="button"
                  onClick={() => void onCreate()}
                >
                  Create Client
                </button>
                ) : null}

                <Link className="rounded border px-3 py-2 text-sm hover:bg-gray-50" href="/mod-rag/public">
                  Cancel
                </Link>
              </>
            ) : (
              <>
                {!isReadOnly ? (
                  <>
                    <button
                      className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                      type="button"
                      onClick={() => void onSave()}
                      disabled={!activeClientId}
                    >
                      Save Changes
                    </button>

                    <button
                      className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                      type="button"
                      onClick={() => void onConnect()}
                      disabled={!activeClientId}
                    >
                      Connect
                    </button>

                    <button
                      className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                      type="button"
                      onClick={() => void onDisconnect()}
                      disabled={!activeClientId}
                    >
                      Disconnect
                    </button>

                    <button
                      className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                      type="button"
                      onClick={() => void onDelete()}
                      disabled={!activeClientId}
                    >
                      Delete
                    </button>
                  </>
                ) : null}

                <Link className="rounded border px-3 py-2 text-sm hover:bg-gray-50" href="/mod-rag/public">
                  Back
                </Link>
              </>
            )}
          </div>
        </div>
      </GroupBox>

      {mode === "edit" && activeClientId ? (
        <>
          <ContentDocsBox clientId={activeClientId} />
          <ContextMessagesBox clientId={activeClientId} />
          <SystemPromptBox clientId={activeClientId} />

          <GroupBox title="Client Context (debug)">
            <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(client, null, 2)}</pre>

            <button
              className="mt-3 rounded border px-3 py-2 text-sm hover:bg-gray-50"
              type="button"
              onClick={() => void load()}
            >
              Refresh
            </button>
          </GroupBox>
        </>
      ) : null}
    </div>
  );
}