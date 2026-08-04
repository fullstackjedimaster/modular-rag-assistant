"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAppMode } from "@/src/contexts/AppModeContext";
import {
    connectRagHost,
    disconnectRagHost,
    getRagHostStatuses,
    listRagHosts,
    type RagHostRow,
    type RagHostStatus,
} from "@/src/lib/ragHostApi";

type LoadState = "idle" | "loading" | "ready" | "error";

type DashboardHostProps = {
    selectedRagHostId?: string;
    onSelectHostAction?: (host: RagHostRow) => void;
    onConnectHostAction?: (host: RagHostRow) => void;
    onDisconnectHostAction?: (host: RagHostRow) => void;
    onConnectedHostChangeAction?: (hostId: string) => void;
    compact?: boolean;
};

function findConnectedId(
    rows: RagHostRow[],
    statuses: Record<string, RagHostStatus>,
): string {
    return rows.find((row) => statuses[row.id]?.connected)?.id ?? "";
}

export default function DashboardHost({
    selectedRagHostId,
    onSelectHostAction,
    onConnectHostAction,
    onDisconnectHostAction,
    onConnectedHostChangeAction,
    compact = false,
}: DashboardHostProps) {
    const { disablePolling } = useAppMode();

    const [state, setState] = useState<LoadState>("idle");
    const [error, setError] = useState("");
    const [rows, setRows] = useState<RagHostRow[]>([]);
    const [statusById, setStatusById] = useState<Record<string, RagHostStatus>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const ids = useMemo(() => rows.map((row) => row.id), [rows]);
    const connectedId = useMemo(
        () => findConnectedId(rows, statusById),
        [rows, statusById],
    );

    const applyStatuses = useCallback(
        (statuses: Record<string, RagHostStatus>) => {
            setStatusById(statuses);
            onConnectedHostChangeAction?.(findConnectedId(rows, statuses));
        },
        [onConnectedHostChangeAction, rows],
    );

    const refreshStatuses = useCallback(async () => {
        if (ids.length === 0) {
            setStatusById({});
            onConnectedHostChangeAction?.("");
            return;
        }

        applyStatuses(await getRagHostStatuses(ids));
    }, [applyStatuses, ids, onConnectedHostChangeAction]);

    const boot = useCallback(async () => {
        setState("loading");
        setError("");

        try {
            const hosts = await listRagHosts();
            setRows(hosts);

            if (hosts.length > 0) {
                const statuses = await getRagHostStatuses(
                    hosts.map((host) => host.id),
                );
                setStatusById(statuses);
                onConnectedHostChangeAction?.(
                    findConnectedId(hosts, statuses),
                );
            } else {
                setStatusById({});
                onConnectedHostChangeAction?.("");
            }

            setState("ready");
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : String(caught));
            setState("error");
        }
    }, [onConnectedHostChangeAction]);

    useEffect(() => {
        void boot();
    }, [boot]);

    useEffect(() => {
        if (disablePolling || state !== "ready" || ids.length === 0) return;

        let cancelled = false;

        async function tick(): Promise<void> {
            try {
                const statuses = await getRagHostStatuses(ids);
                if (!cancelled) applyStatuses(statuses);
            } catch {
                // A transient status failure should not replace the dashboard.
            }
        }

        const timer = window.setInterval(() => void tick(), 2000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [applyStatuses, disablePolling, ids, state]);

    async function connect(row: RagHostRow): Promise<void> {
        setBusyId(row.id);
        setError("");

        try {
            await connectRagHost(row.id);
            await refreshStatuses();
            onSelectHostAction?.(row);
            onConnectHostAction?.(row);
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusyId(null);
        }
    }

    async function disconnect(row: RagHostRow): Promise<void> {
        setBusyId(row.id);
        setError("");

        try {
            await disconnectRagHost(row.id);
            await refreshStatuses();
            onDisconnectHostAction?.(row);
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusyId(null);
        }
    }

    if (state === "loading" || state === "idle") {
        return <div className="rag-host-loading">Loading...</div>;
    }

    if (state === "error") {
        return (
            <div className="rag-host-error-box">
                <div className="rag-host-error-message">
                    {error || "Failed to load."}
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
        <div className={compact ? "rag-host-list rag-host-list-compact" : "rag-host-list"}>
            {!compact ? (
                <div className="rag-host-help">
                    Select a host to preview it. Connect attaches the one active RAG dock.
                </div>
            ) : null}

            {error ? <div className="rag-host-error-message">{error}</div> : null}

            <table className="rag-host-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Dock</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const connected = connectedId === row.id;
                        const selected = selectedRagHostId === row.id;
                        const busy = busyId === row.id;
                        const label = busy ? "Working..." : connected ? "Connected" : connectedId ? "Use Dock" : "Connect";

                        return (
                            <tr key={row.id} className={selected ? "selected" : ""}>
                                <td>
                                    <button
                                        type="button"
                                        className="rag-host-name rag-link-button"
                                        title={row.host_url}
                                        onClick={() => onSelectHostAction?.(row)}
                                    >
                                        {row.name}
                                    </button>
                                    <Link href={`/host/${row.id}`} className="rag-host-detail-link" aria-label={`Open ${row.name} host settings`}>Manage</Link>
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        disabled={busyId !== null || connected}
                                        title={statusById[row.id]?.detail || ""}
                                        onClick={() => { if (!connected) void connect(row); }}
                                        className="rag-link-button rag-connect-button"
                                    >
                                        {label}
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                    {rows.length === 0 ? (
                        <tr>
                            <td className="rag-host-empty" colSpan={2}>
                                No host apps configured yet.
                            </td>
                        </tr>
                    ) : null}
                </tbody>
            </table>
        </div>
    );
}
