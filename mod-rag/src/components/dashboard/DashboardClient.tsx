"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAppMode } from "@/src/contexts/AppModeContext";
import {
    connectRagClient,
    disconnectRagClient,
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
    onConnectedClientChangeAction?: (clientId: string) => void;
    compact?: boolean;
};

function findConnectedId(
    rows: RagClientRow[],
    statuses: Record<string, RagClientStatus>,
): string {
    return rows.find((row) => statuses[row.id]?.connected)?.id ?? "";
}

export default function DashboardClient({
    selectedRagClientId,
    onSelectClientAction,
    onConnectClientAction,
    onDisconnectClientAction,
    onConnectedClientChangeAction,
    compact = false,
}: DashboardClientProps) {
    const { disablePolling } = useAppMode();

    const [state, setState] = useState<LoadState>("idle");
    const [error, setError] = useState("");
    const [rows, setRows] = useState<RagClientRow[]>([]);
    const [statusById, setStatusById] = useState<Record<string, RagClientStatus>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const ids = useMemo(() => rows.map((row) => row.id), [rows]);
    const connectedId = useMemo(
        () => findConnectedId(rows, statusById),
        [rows, statusById],
    );

    const applyStatuses = useCallback(
        (statuses: Record<string, RagClientStatus>) => {
            setStatusById(statuses);
            onConnectedClientChangeAction?.(findConnectedId(rows, statuses));
        },
        [onConnectedClientChangeAction, rows],
    );

    const refreshStatuses = useCallback(async () => {
        if (ids.length === 0) {
            setStatusById({});
            onConnectedClientChangeAction?.("");
            return;
        }

        applyStatuses(await getRagClientStatuses(ids));
    }, [applyStatuses, ids, onConnectedClientChangeAction]);

    const boot = useCallback(async () => {
        setState("loading");
        setError("");

        try {
            const clients = await listRagClients();
            setRows(clients);

            if (clients.length > 0) {
                const statuses = await getRagClientStatuses(
                    clients.map((client) => client.id),
                );
                setStatusById(statuses);
                onConnectedClientChangeAction?.(
                    findConnectedId(clients, statuses),
                );
            } else {
                setStatusById({});
                onConnectedClientChangeAction?.("");
            }

            setState("ready");
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : String(caught));
            setState("error");
        }
    }, [onConnectedClientChangeAction]);

    useEffect(() => {
        void boot();
    }, [boot]);

    useEffect(() => {
        if (disablePolling || state !== "ready" || ids.length === 0) return;

        let cancelled = false;

        async function tick(): Promise<void> {
            try {
                const statuses = await getRagClientStatuses(ids);
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

    async function connect(row: RagClientRow): Promise<void> {
        setBusyId(row.id);
        setError("");

        try {
            await connectRagClient(row.id);
            await refreshStatuses();
            onSelectClientAction?.(row);
            onConnectClientAction?.(row);
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusyId(null);
        }
    }

    async function disconnect(row: RagClientRow): Promise<void> {
        setBusyId(row.id);
        setError("");

        try {
            await disconnectRagClient(row.id);
            await refreshStatuses();
            onDisconnectClientAction?.(row);
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusyId(null);
        }
    }

    if (state === "loading" || state === "idle") {
        return <div className="rag-client-loading">Loading...</div>;
    }

    if (state === "error") {
        return (
            <div className="rag-client-error-box">
                <div className="rag-client-error-message">
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
        <div className={compact ? "rag-client-list rag-client-list-compact" : "rag-client-list"}>
            {!compact ? (
                <div className="rag-client-help">
                    Select a host to preview it. Connect attaches the one active RAG dock.
                </div>
            ) : null}

            {error ? <div className="rag-client-error-message">{error}</div> : null}

            <table className="rag-client-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Dock</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const connected = connectedId === row.id;
                        const selected = selectedRagClientId === row.id;
                        const busy = busyId === row.id;
                        const label = busy
                            ? "Working..."
                            : connected
                                ? "Disconnect"
                                : connectedId
                                    ? "Switch"
                                    : "Connect";

                        return (
                            <tr key={row.id} className={selected ? "selected" : ""}>
                                <td>
                                    <button
                                        type="button"
                                        className="rag-client-name rag-link-button"
                                        title={row.host_url}
                                        onClick={() => onSelectClientAction?.(row)}
                                    >
                                        {row.name}
                                    </button>
                                    {!compact ? (
                                        <Link href={`/hosts/${row.id}`} className="rag-client-manage-link">
                                            Manage
                                        </Link>
                                    ) : null}
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        disabled={busyId !== null}
                                        title={statusById[row.id]?.detail || ""}
                                        onClick={() => void (connected ? disconnect(row) : connect(row))}
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
                            <td className="rag-client-empty" colSpan={2}>
                                No host apps configured yet.
                            </td>
                        </tr>
                    ) : null}
                </tbody>
            </table>
        </div>
    );
}
