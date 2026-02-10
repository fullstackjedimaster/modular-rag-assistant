// app/components/dashboard/DashboardClient.tsx
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

export default function DashboardClient() {
    const [state, setState] = useState<LoadState>("idle");
    const [err, setErr] = useState<string>("");

    const [rows, setRows] = useState<RagClientRow[]>([]);
    const [statusById, setStatusById] = useState<Record<number, RagClientStatus>>({});
    const [connectingId, setConnectingId] = useState<number | null>(null);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Poll connection statuses
    useEffect(() => {
        if (state !== "ready" || ids.length === 0) return;

        let canceled = false;
        const tick = async () => {
            try {
                const statuses = await getRagClientStatuses(ids);
                if (!canceled) setStatusById(statuses);
            } catch {
                // Status polling should not hard-fail dashboard.
            }
        };

        void tick();
        const t = window.setInterval(tick, 2000);
        return () => {
            canceled = true;
            window.clearInterval(t);
        };
    }, [state, ids]);

    async function onConnect(id: number) {
        setConnectingId(id);
        try {
            await connectRagClient(id);
            const statuses = await getRagClientStatuses(ids);
            setStatusById(statuses);
        } finally {
            setConnectingId(null);
        }
    }

    if (state === "loading" || state === "idle") {
        return (
            <GroupBox title="Configured Host Apps">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">Loading…</div>
                    <a className="border rounded px-3 py-2 text-sm hover:bg-gray-50" href="/hosts/new">
                        Configure New Client
                    </a>
                </div>
            </GroupBox>
        );
    }

    if (state === "error") {
        return (
            <GroupBox title="Configured Host Apps">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-red-600 whitespace-pre-wrap">{err || "Failed to load."}</div>
                    <a className="border rounded px-3 py-2 text-sm hover:bg-gray-50" href="/hosts/new">
                        Configure New Client
                    </a>
                </div>

                <button className="mt-3 border rounded px-3 py-2 text-sm" onClick={() => void boot()} type="button">
                    Retry
                </button>
            </GroupBox>
        );
    }

    return (
        <GroupBox title="Configured Host Apps">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-xs text-gray-600">
                    Click a client to manage its context (docs, messages, prompt).
                </div>
                <a className="border rounded px-3 py-2 text-sm hover:bg-gray-50" href="/hosts/new">
                    Configure New Client
                </a>
            </div>

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
                    {rows.map((r) => {
                        const st = statusById[r.id];
                        const connected = Boolean(st?.connected);
                        const busy = connectingId === r.id;

                        return (
                            <tr key={r.id} className="border-b hover:bg-gray-50">
                                <td className="py-2 pr-3">
                                    <a className="underline" href={`/hosts/${r.id}`}>
                                        {r.name}
                                    </a>
                                </td>
                                <td className="py-2 pr-3 font-mono text-xs break-all">{r.host_url}</td>
                                <td className="py-2 pr-3">
                    <span
                        className={[
                            "inline-flex items-center px-2 py-1 rounded text-xs border",
                            connected ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200",
                        ].join(" ")}
                        title={st?.detail || ""}
                    >
                      {connected ? "Connected" : "Not connected"}
                    </span>
                                </td>
                                <td className="py-2 pr-3">
                                    <div className="flex gap-2">
                                        <button
                                            className="border rounded px-3 py-2 text-sm disabled:opacity-50"
                                            type="button"
                                            disabled={connected || busy}
                                            onClick={() => void onConnect(r.id)}
                                        >
                                            {busy ? "Connecting…" : "Connect"}
                                        </button>

                                        <a className="border rounded px-3 py-2 text-sm" href={`/hosts/${r.id}`}>
                                            Manage
                                        </a>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}

                    {rows.length === 0 ? (
                        <tr>
                            <td className="py-3 text-sm text-gray-600" colSpan={4}>
                                No host apps configured yet.
                            </td>
                        </tr>
                    ) : null}
                    </tbody>
                </table>
            </div>
        </GroupBox>
    );
}
