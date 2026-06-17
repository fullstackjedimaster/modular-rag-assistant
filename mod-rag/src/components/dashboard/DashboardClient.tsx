"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
    }, []);

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
            await refreshStatuses(ids);
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
            await refreshStatuses(ids);
            onDisconnectClientAction?.(row);
        } finally {
            setBusyId(null);
        }
    }

    async function onToggleConnection(row: RagClientRow, connected: boolean) {
        if (connected) {
            await onDisconnect(row);
            return;
        }

        await onConnect(row);
    }

    if (state === "loading" || state === "idle") {
        return <div className="rag-client-loading">Loading...</div>;
    }

    if (state === "error") {
        return (
            <div className="rag-client-error-box">
                <div className="rag-client-error-message">
                    {err || "Failed to load."}
                </div>

                <button
                    className="rag-link-button rag-retry-button"
                    onClick={() => void boot()}
                    type="button"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className={compact ? "rag-client-list rag-client-list-compact" : "rag-client-list"}>
            {!compact && (
                <div className="rag-client-help">
                    Select a host app to load it in the demo frame. Connect attaches the RAG dock inside that host app.
                </div>
            )}

            <table className="rag-client-table">
                <thead>
                <tr>
                    <th>Name</th>
                    <th>Dock</th>
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
                            className={selected ? "selected" : ""}
                        >
                            <td>
                                <Link
                                    href={`/hosts/${row.id}`}
                                    title={row.host_url}
                                    className="rag-client-name"
                                >
                                    {row.name}
                                </Link>
                            </td>

                            <td>
                                <button
                                    type="button"
                                    disabled={busy}
                                    title={st?.detail || ""}
                                    onClick={() => void onToggleConnection(row, connected)}
                                    className="rag-link-button rag-connect-button"
                                >
                                    {busy
                                        ? "Working..."
                                        : connected
                                            ? "Disconnect"
                                            : "Connect"}
                                </button>
                            </td>
                        </tr>
                    );
                })}

                {rows.length === 0 && (
                    <tr>
                        <td className="rag-client-empty" colSpan={2}>
                            No host apps configured yet.
                        </td>
                    </tr>
                )}
                </tbody>
            </table>
        </div>
    );
}