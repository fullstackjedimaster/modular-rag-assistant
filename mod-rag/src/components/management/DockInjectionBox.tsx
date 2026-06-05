// app/components/management/DockInjectionBox.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import GroupBox from "@/src/components/GroupBox";
import {
  connectRagClient,
  getRagClientStatuses,
  listRagClients,
  type RagClientRow,
  type RagClientStatus,
} from "@/src/lib/ragClientApi";

type RagClientId = RagClientRow["id"];

export default function DockInjectionBox(props: {
  clientId?: RagClientId;
  selectedId?: RagClientId;
}) {
  const { clientId, selectedId } = props;

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [clients, setClients] = useState<RagClientRow[]>([]);
  const [pickedId, setPickedId] = useState<RagClientId | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [status, setStatus] = useState<RagClientStatus | null>(null);

  const preferredId = useMemo<RagClientId | null>(() => {
    return clientId || selectedId || null;
  }, [clientId, selectedId]);

  const picked = useMemo(() => {
    if (pickedId == null) return null;
    return clients.find((c) => c.id === pickedId) || null;
  }, [clients, pickedId]);

  const refreshStatus = useCallback(async (id: RagClientId) => {
    setStatusBusy(true);
    setStatusNote("");

    try {
      const map = await getRagClientStatuses([id]);
      setStatus(map?.[id] || null);
    } catch (e: unknown) {
      setStatus(null);
      setStatusNote(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusBusy(false);
    }
  }, []);

  const refreshClients = useCallback(async () => {
    setBusy(true);
    setNote("");

    try {
      const list = await listRagClients();
      const next = list || [];

      setClients(next);

      const ids = next.map((x) => x.id);

      if (!ids.length) {
        setPickedId(null);
        setStatus(null);
        return;
      }

      if (preferredId != null && ids.includes(preferredId)) {
        setPickedId(preferredId);
        return;
      }

      setPickedId((prev) => (prev != null && ids.includes(prev) ? prev : ids[0]));
    } catch (e: unknown) {
      setClients([]);
      setPickedId(null);
      setStatus(null);
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [preferredId]);

  useEffect(() => {
    void refreshClients();
  }, [refreshClients]);

  useEffect(() => {
    if (preferredId == null) return;

    if (clients.some((c) => c.id === preferredId)) {
      setPickedId(preferredId);
    }
  }, [preferredId, clients]);

  useEffect(() => {
    if (pickedId == null) {
      setStatus(null);
      return;
    }

    void refreshStatus(pickedId);
  }, [pickedId, refreshStatus]);

  function openHost() {
    setNote("");

    if (!picked || !picked.host_url) {
      setNote("No host app selected.");
      return;
    }

    window.open(picked.host_url, "_blank", "noopener,noreferrer");
  }

  async function injectDock() {
    setNote("");

    if (!picked) {
      setNote("No host app selected.");
      return;
    }

    setBusy(true);

    try {
      await connectRagClient(picked.id);
      setNote("Connect triggered. If the client is reachable, dock injection should occur.");
      await refreshStatus(picked.id);
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function formatLastSeen(raw?: string | null) {
    const s = (raw || "").trim();
    return s || "?";
  }

  return (
    <GroupBox title="5) Dock injection">
      <div className="grid gap-3">
        {clients.length === 0 ? (
          <div className="text-xs text-gray-600">
            No RAG clients found yet. Create one first (Client Name + Host URL).
          </div>
        ) : (
          <>
            <label className="text-sm font-medium">Select Host App</label>

            <select
              className="rounded border px-2 py-2 text-sm"
              value={pickedId ?? ""}
              onChange={(e) => setPickedId(e.target.value as RagClientId)}
              disabled={busy}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.host_url}
                </option>
              ))}
            </select>

            {picked ? (
              <div className="rounded border p-2">
                <div className="mb-1 text-xs text-gray-600">Selected</div>
                <div className="text-sm font-medium">{picked.name}</div>
                <div className="break-all font-mono text-xs">{picked.host_url}</div>

                <div className="mt-2 grid gap-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-24 text-gray-600">Connected</span>
                    <span className="font-medium">
                      {statusBusy ? "?" : status ? (status.connected ? "Yes" : "No") : "?"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="w-24 text-gray-600">Last seen</span>
                    <span className="font-mono">
                      {statusBusy ? "?" : formatLastSeen(status?.last_seen_at)}
                    </span>
                  </div>

                  {status?.detail ? (
                    <div className="flex items-start gap-2">
                      <span className="mt-[1px] w-24 text-gray-600">Detail</span>
                      <span className="whitespace-pre-wrap">{status.detail}</span>
                    </div>
                  ) : null}

                  {statusNote ? (
                    <div className="mt-1 whitespace-pre-wrap text-xs text-red-600">
                      {statusNote}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={openHost}
                    disabled={busy || !picked.host_url}
                  >
                    Open Host App
                  </button>

                  <button
                    type="button"
                    className="rounded border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => void injectDock()}
                    disabled={busy || !pickedId}
                  >
                    Inject Dock
                  </button>

                  <button
                    type="button"
                    className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => pickedId != null && void refreshStatus(pickedId)}
                    disabled={busy || statusBusy || pickedId == null}
                  >
                    Refresh Status
                  </button>

                  <button
                    type="button"
                    className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => void refreshClients()}
                    disabled={busy}
                  >
                    Refresh Clients
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}

        {note ? <div className="whitespace-pre-wrap text-xs text-gray-700">{note}</div> : null}
      </div>
    </GroupBox>
  );
}