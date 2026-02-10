// app/components/management/DockInjectionBox.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import GroupBox from "@/app/components/GroupBox";
import {
    connectRagClient,
    getRagClientStatuses,
    listRagClients,
    type RagClientRow,
    type RagClientStatus,
} from "@/app/lib/ragClientApi";

/**
 * DockInjectionBox (adminApi-free)
 *
 * Uses rag_client as the source of host_url targets.
 * - Loads rag clients from /api/rag-clients
 * - Lets you open the host app URL
 * - Lets you trigger backend "connect/inject" via POST /api/rag-clients/{id}/connect
 * - Shows live status for the selected client via /api/rag-clients/status?id=<id>
 *
 * Props:
 * - clientId?: preferred explicit numeric selection
 * - selectedId?: optional legacy string selection (we try to parse int)
 */
export default function DockInjectionBox(props: {
    clientId?: number;
    selectedId?: string;
}) {
    const { clientId, selectedId } = props;

    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState("");
    const [clients, setClients] = useState<RagClientRow[]>([]);
    const [pickedId, setPickedId] = useState<number | null>(null);

    const [statusBusy, setStatusBusy] = useState(false);
    const [statusNote, setStatusNote] = useState<string>("");
    const [status, setStatus] = useState<RagClientStatus | null>(null);

    const preferredId = useMemo(() => {
        if (typeof clientId === "number" && Number.isFinite(clientId)) return clientId;
        if (selectedId) {
            const n = Number(selectedId);
            if (Number.isFinite(n)) return n;
        }
        return null;
    }, [clientId, selectedId]);

    const picked = useMemo(() => {
        if (pickedId == null) return null;
        return clients.find((c) => c.id === pickedId) || null;
    }, [clients, pickedId]);

    async function refreshClients() {
        setBusy(true);
        setNote("");
        try {
            const list = await listRagClients();
            const next = list || [];
            setClients(next);

            // Pick a sane default after load
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

            // keep existing picked if still valid, else fall back to first
            setPickedId((prev) => (prev != null && ids.includes(prev) ? prev : ids[0]));
        } catch (e: unknown) {
            setClients([]);
            setPickedId(null);
            setStatus(null);
            setNote(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }

    async function refreshStatus(id: number) {
        setStatusBusy(true);
        setStatusNote("");
        try {
            const map = await getRagClientStatuses([id]);
            const s = map?.[id] || null;
            setStatus(s);
        } catch (e: unknown) {
            setStatus(null);
            setStatusNote(e instanceof Error ? e.message : String(e));
        } finally {
            setStatusBusy(false);
        }
    }

    useEffect(() => {
        void refreshClients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // If caller changes preferred id, follow it when possible
    useEffect(() => {
        if (preferredId == null) return;
        if (clients.some((c) => c.id === preferredId)) {
            setPickedId(preferredId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preferredId, clients.length]);

    // Refresh status whenever selection changes
    useEffect(() => {
        if (pickedId == null) {
            setStatus(null);
            return;
        }
        void refreshStatus(pickedId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pickedId]);

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

    function formatLastSeen(raw?: string) {
        const s = (raw || "").trim();
        if (!s) return "—";
        // Don’t parse; just show what server returns (keeps timezone/format stable)
        return s;
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
                            className="border rounded px-2 py-2 text-sm"
                            value={pickedId ?? ""}
                            onChange={(e) => setPickedId(Number(e.target.value))}
                            disabled={busy}
                        >
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} — {c.host_url}
                                </option>
                            ))}
                        </select>

                        {picked ? (
                            <div className="border rounded p-2">
                                <div className="text-xs text-gray-600 mb-1">Selected</div>
                                <div className="text-sm font-medium">{picked.name}</div>
                                <div className="text-xs font-mono break-all">{picked.host_url}</div>

                                <div className="mt-2 grid gap-1 text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-600 w-24">Connected</span>
                                        <span className="font-medium">
                                            {statusBusy ? "…" : status ? (status.connected ? "Yes" : "No") : "—"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-600 w-24">Last seen</span>
                                        <span className="font-mono">{statusBusy ? "…" : formatLastSeen(status?.last_seen_at)}</span>
                                    </div>
                                    {status?.detail ? (
                                        <div className="flex items-start gap-2">
                                            <span className="text-gray-600 w-24 mt-[1px]">Detail</span>
                                            <span className="whitespace-pre-wrap">{status.detail}</span>
                                        </div>
                                    ) : null}
                                    {statusNote ? (
                                        <div className="text-xs text-red-600 whitespace-pre-wrap mt-1">{statusNote}</div>
                                    ) : null}
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                                        onClick={openHost}
                                        disabled={busy || !picked.host_url}
                                    >
                                        Open Host App
                                    </button>

                                    <button
                                        type="button"
                                        className="border rounded px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                                        onClick={() => void injectDock()}
                                        disabled={busy || !pickedId}
                                    >
                                        Inject Dock
                                    </button>

                                    <button
                                        type="button"
                                        className="border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                                        onClick={() => pickedId != null && void refreshStatus(pickedId)}
                                        disabled={busy || statusBusy || pickedId == null}
                                        title="Refresh status"
                                    >
                                        Refresh Status
                                    </button>

                                    <button
                                        type="button"
                                        className="border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                                        onClick={() => void refreshClients()}
                                        disabled={busy}
                                        title="Refresh client list"
                                    >
                                        Refresh Clients
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </>
                )}

                {note ? <div className="text-xs text-gray-700 whitespace-pre-wrap">{note}</div> : null}

                <details className="text-xs">
                    <summary className="cursor-pointer">How this works</summary>
                    <div className="mt-2 text-gray-600 grid gap-2">
                        <div>
                            <span className="font-medium">Open Host App</span> opens the saved{" "}
                            <code>host_url</code> in a new tab.
                        </div>
                        <div>
                            <span className="font-medium">Inject Dock</span> calls{" "}
                            <code>POST /api/rag-clients/&lt;id&gt;/connect</code>. Your backend decides how to
                            reach the host and perform the actual injection/handshake.
                        </div>
                        <div>
                            Status is loaded from <code>GET /api/rag-clients/status?id=&lt;id&gt;</code>.
                        </div>
                    </div>
                </details>
            </div>
        </GroupBox>
    );
}
