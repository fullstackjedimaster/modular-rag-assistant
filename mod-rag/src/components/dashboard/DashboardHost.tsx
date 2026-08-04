"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAppMode } from "@/src/contexts/AppModeContext";
import {
    connectRagHost,
    getRagHostStatuses,
    listRagHosts,
    type RagHostRow,
    type RagHostStatus,
} from "@/src/lib/ragHostApi";

type LoadState = "idle" | "loading" | "ready" | "error";

type DashboardHostProps = {
    selectedRagHostId?: string;
    onActivateHostAction?: (host: RagHostRow) => void;
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
    onActivateHostAction,
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
            if (hosts.length) {
                const statuses = await getRagHostStatuses(hosts.map((host) => host.id));
                setStatusById(statuses);
                onConnectedHostChangeAction?.(findConnectedId(hosts, statuses));
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

    useEffect(() => { void boot(); }, [boot]);

    useEffect(() => {
        if (disablePolling || state !== "ready" || ids.length === 0) return;
        let cancelled = false;
        const tick = async () => {
            try {
                const statuses = await getRagHostStatuses(ids);
                if (!cancelled) applyStatuses(statuses);
            } catch {}
        };
        const timer = window.setInterval(() => void tick(), 2500);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [applyStatuses, disablePolling, ids, state]);

    async function activate(row: RagHostRow): Promise<void> {
        if (busyId) return;
        setBusyId(row.id);
        setError("");
        try {
            if (connectedId !== row.id) {
                await connectRagHost(row.id);
                await refreshStatuses();
            }
            onActivateHostAction?.(row);
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusyId(null);
        }
    }

    if (state === "loading" || state === "idle") return <div className="rag-host-loading">Loading hosts...</div>;
    if (state === "error") return <div className="rag-host-error-box"><div className="rag-host-error-message">{error || "Failed to load."}</div><button className="rag-link-button" onClick={() => void boot()} type="button">Retry</button></div>;

    return (
        <div className={compact ? "rag-host-list rag-host-list-compact" : "rag-host-list"}>
            {!compact ? <div className="rag-host-help">Choose which host application the assistant should attach to.</div> : null}
            {error ? <div className="rag-host-error-message">{error}</div> : null}
            <table className="rag-host-table">
                <thead><tr><th>Host</th><th>Assistant</th></tr></thead>
                <tbody>
                    {rows.map((row) => {
                        const attached = connectedId === row.id;
                        const selected = selectedRagHostId === row.id;
                        const busy = busyId === row.id;
                        const label = busy ? "Attaching..." : attached ? "Attached" : "Attach";
                        return (
                            <tr key={row.id} className={selected ? "selected" : ""}>
                                <td>
                                    <Link href={`/host/${row.id}`} className="rag-host-primary-link" title={row.host_url}>{row.name}</Link>
                                </td>
                                <td>
                                    <button type="button" disabled={busyId !== null || attached} onClick={() => void activate(row)} className="rag-link-button rag-connect-button">{label}</button>
                                </td>
                            </tr>
                        );
                    })}
                    {!rows.length ? <tr><td className="rag-host-empty" colSpan={2}>No hosts configured.</td></tr> : null}
                </tbody>
            </table>
        </div>
    );
}
