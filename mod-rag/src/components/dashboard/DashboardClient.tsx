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
    const { disablePolling } = useAppMode();

    const [state, setState] = useState<LoadState>("idle");
    const [err, setErr] = useState<string>("");

    const [rows, setRows] = useState<RagClientRow[]>([]);
    const [statusById, setStatusById] = useState<Record<string, RagClientStatus>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const ids = useMemo(() => rows.map((r) => r.id), [rows]);

    const refreshStatuses = useCallback(
        async (nextIds = ids) => {
            if (nextIds.length === 0) {
                setStatusById({});
                return;
            }

            const statuses = await getRagClientStatuses(nextIds);
            setStatusById(statuses);
        },
        [ids]
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
        setBusyId(row.id);

        try {
            await connectRagClient(row.id);
            await refreshStatuses();
            onConnectClientAction?.(row);
            onSelectClientAction?.(row);
        } finally {
            setBusyId(null);
        }
    }

    async function onDisconnect(row: RagClientRow) {
        setBusyId(row.id);

        try {
            await disconnectRagClient(row.id);
            await refreshStatuses();
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

    return (
        <GroupBox title="Configured Host Apps">
            {!compact && (
                <div className="mb-3 text-xs text-gray-600">
                    Select a host app to load it in the demo frame. Connect attaches the RAG dock inside that host app.
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                    <tr className="text-left border-b">
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Host URL</th>
                        <th className="py-2 pr-3">Connected</th>
                        <th className="py-2 pr-3">Actions</th>
                    </tr>
                    </thead>

                    <tbody>
                    {rows.map((row) => {
                        const st = statusById[row.id];
                        const connected = Boolean(st?.connected);
                        const busy = busyId === row.id;
                        const selected = selectedRagClientId === row.id;

                        return (
                            <tr
                                key={row.id}
                                className={[
                                    "border-b hover:bg-gray-50",
                                    selected ? "bg-blue-50" : "",
                                ].join(" ")}
                            >
                                <td className="py-2 pr-3">
                                    <button
                                        type="button"
                                        className="underline text-left"
                                        onClick={() => onSelect(row)}
                                    >
                                        {row.name}
                                    </button>
                                </td>

                                <td className="py-2 pr-3 font-mono text-xs break-all">
                                    {row.host_url}
                                </td>

                                <td className="py-2 pr-3">
                                    <span
                                        className={[
                                            "inline-flex items-center px-2 py-1 rounded text-xs border",
                                            connected
                                                ? "bg-green-50 border-green-200"
                                                : "bg-gray-50 border-gray-200",
                                        ].join(" ")}
                                        title={st?.detail || ""}
                                    >
                                        {connected ? "Connected" : "Not connected"}
                                    </span>
                                </td>

                                <td className="py-2 pr-3">
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            className="border rounded px-3 py-2 text-sm disabled:opacity-50 hover:bg-gray-50"
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void onConnect(row)}
                                        >
                                            {busy ? "Working..." : connected ? "Reconnect" : "Connect"}
                                        </button>

                                        <button
                                            className="border rounded px-3 py-2 text-sm disabled:opacity-50 hover:bg-gray-50"
                                            type="button"
                                            disabled={busy || !connected}
                                            onClick={() => void onDisconnect(row)}
                                        >
                                            Disconnect
                                        </button>

                                        <a
                                            className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                                            href={`/hosts/${row.id}`}
                                        >
                                            Manage
                                        </a>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}

                    {rows.length === 0 && (
                        <tr>
                            <td className="py-3 text-sm text-gray-600" colSpan={4}>
                                No host apps configured yet.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        </GroupBox>
    );
}