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

type LoadState = "idle" | "loading" | "ready" | "error";

type DashboardClientProps = {
    selectedRagClientId?: string;
    onSelectClient?: (client: RagClientRow) => void;
    onConnectClient?: (client: RagClientRow) => void;
    compact?: boolean;
};

export default function DashboardClient({
    selectedRagClientId,
    onSelectClient,
    onConnectClient,
    compact = false,
}: DashboardClientProps) {
    const [state, setState] = useState<LoadState>("idle");
    const [err, setErr] = useState<string>("");

    const [rows, setRows] = useState<RagClientRow[]>([]);
    const [statusById, setStatusById] = useState<Record<string, RagClientStatus>>({});
    const [connectingId, setConnectingId] = useState<string | null>(null);

    const ids = useMemo(() => rows.map((r) => r.id), [rows]);

    async function boot() {
        setState("loading");
        setErr("");

        try {
            const list = await listRagClients();
            setRows(list);
            setState("ready");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(msg);
            setState("error");
        }
    }

    useEffect(() => {
        void boot();
    }, []);

    useEffect(() => {
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
    }, [state, ids]);

    async function onConnect(row: RagClientRow) {
        setConnectingId(row.id);

        try {
            await connectRagClient(row.id);

            const statuses = await getRagClientStatuses(ids);
            setStatusById(statuses);

            onConnectClient?.(row);
            onSelectClient?.(row);
        } finally {
            setConnectingId(null);
        }
    }

    function onSelect(row: RagClientRow) {
        onSelectClient?.(row);
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
                    Select a host app to load it in the demo frame. Connect marks the active RAG client for dock messaging.
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
                        const busy = connectingId === row.id;
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
                                            {busy ? "Connecting..." : connected ? "Reconnect" : "Connect"}
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