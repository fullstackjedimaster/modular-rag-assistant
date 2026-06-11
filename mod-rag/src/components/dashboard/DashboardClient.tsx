"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import GroupBox from "@/src/components/GroupBox";
import { useAppMode } from "@/src/contexts/AppModeContext";
import {
    connectRagClient,
    getRagClientStatuses,
    listRagClients,
    type RagClientRow,
    type RagClientStatus,
} from "@/src/lib/ragClientApi";

type LoadState = "idle" | "loading" | "ready" | "error";

type DashboardClientProps = {
    selectedRagClientId?: string;
    onSelectClientAction?: (client: RagClientRow) => void;
    onConnectClientAction?: (client: RagClientRow) => void;
    onDisconnectClientAction?: (client: RagClientRow) => void;
    compact?: boolean;
};

async function disconnectRagClient(ragClientId: string): Promise<void> {
    const res = await fetch(`/api/rag-clients/${encodeURIComponent(ragClientId)}/disconnect`, {
        method: "POST",
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
            `disconnectRagClient failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`
        );
    }
}

export default function DashboardClient({
    selectedRagClientId,
    onSelectClientAction,
    onConnectClientAction,
    onDisconnectClientAction,
    compact = false,
}: DashboardClientProps) {
    const { disablePolling, isReadOnly } = useAppMode();

    const [state, setState] = useState<LoadState>("idle");
    const [err, setErr] = useState<string>("");

    const [rows, setRows] = useState<RagClientRow[]>([]);
    const [statusById, setStatusById] = useState<Record<string, RagClientStatus>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const ids: RagClientRow["id"][] = useMemo(
      () => rows.map((r) => r.id),
      [rows]
    );
  const refreshStatuses = useCallback(async (nextIds: RagClientRow["id"][]) => {
    if (nextIds.length === 0) {
      setStatusById({});
      return;
    }

    const statuses = await getRagClientStatuses(nextIds);
    setStatusById(statuses);
  },
  []
);

    const boot = useCallback(async () => {
        setState("loading");
        setErr("");

        try {
            const list = await listRagClients();

            setRows(list);
            setState("ready");

            if (list.length > 0) {
                await refreshStatuses(list.map((r) => r.id));
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);

            setErr(msg);
            setState("error");
        }
    }, [refreshStatuses]);

    useEffect(() => {
        void boot();
    }, [boot]);

    useEffect(() => {
        if (disablePolling) return;
        if (state !== "ready" || ids.length === 0) return;

        let cancelled = false;

        const tick = async () => {
            try {
                const statuses = await getRagClientStatuses(ids);

                if (!cancelled) {
                    setStatusById(statuses);
                }
            } catch {
                // Status polling should not hard-fail dashboard.
            }
        };

        void tick();

        const t = window.setInterval(tick, 2000);

        return () => {
            cancelled = true;
            window.clearInterval(t);
        };
    }, [state, ids, disablePolling]);

    async function onConnect(row: RagClientRow) {
        if (isReadOnly) return;

        setBusyId(row.id);

        try {
            await connectRagClient(row.id);
            await refreshStatuses(ids);
            onConnectClientAction?.(row);
            onSelectClientAction?.(row);
        } finally {
            setBusyId(null);
        }
    }

    async function onDisconnect(row: RagClientRow) {
        if (isReadOnly) return;

        setBusyId(row.id);

        try {
            await disconnectRagClient(row.id);
            await refreshStatuses(ids);
            onDisconnectClientAction?.(row);
        } finally {
            setBusyId(null);
        }
    }

    function onSelect(row: RagClientRow) {
        onSelectClientAction?.(row);
    }

    if (state === "loading" || state === "idle") {
        return (
            <GroupBox title="Configured Host Apps">
                <div className="text-sm text-gray-600">Loading...</div>
            </GroupBox>
        );
    }

    if (state === "error") {
        return (
            <GroupBox title="Configured Host Apps">
                <div className="text-sm text-red-600 whitespace-pre-wrap">
                    {err || "Failed to load."}
                </div>

                <button
                    className="mt-3 border rounded px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => void boot()}
                    type="button"
                >
                    Retry
                </button>
            </GroupBox>
        );
    }

    if (compact) {
        return (
            <GroupBox title="Configured Host Apps">
                <div className="host-card-list">
                    {rows.map((row) => {
                        const st = statusById[row.id];
                        const connected = Boolean(st?.connected);
                        const busy = busyId === row.id;
                        const selected = selectedRagClientId === row.id;

                        return (
                            <div
                                key={row.id}
                                className={selected ? "host-card selected" : "host-card"}
                            >
                                <button
                                    type="button"
                                    className="host-name"
                                    onClick={() => onSelect(row)}
                                >
                                    {row.name}
                                </button>

                                <div className="host-url">{row.host_url}</div>

                                <div className="host-actions">
                                    {/*<span className={connected ? "pill connected" : "pill"}>*/}
                                    {/*    {connected ? "Connected" : "Not connected"}*/}
                                    {/*</span>*/}

                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void onConnect(row)}
                                    >
                                        {busy ? "Working..." : connected ? "Reconnect" : "Connect"}
                                    </button>

                                </div>
                            </div>
                        );
                    })}
                </div>
            </GroupBox>
        );
    }
}