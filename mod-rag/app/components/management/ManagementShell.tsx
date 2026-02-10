// app/components/management/ManagementShell.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GroupBox from "@/app/components/GroupBox";
import {
    connectRagClient,
    disconnectRagClient,
    createRagClient,
    deleteRagClient,
    getRagClient,
    updateRagClient,
    type RagClientFull,
} from "@/app/lib/ragClientApi";

import ContentDocsBox from "@/app/components/management/ContentDocsBox";
import ContextMessagesBox from "@/app/components/management/ContextMessagesBox";
import SystemPromptBox from "@/app/components/management/SystemPromptBox";

type Mode = "create" | "edit";
type LoadState = "idle" | "loading" | "ready" | "error";

export default function ManagementShell(props: { mode: Mode; clientId?: number }) {
    const { mode, clientId } = props;
    const router = useRouter();

    const [state, setState] = useState<LoadState>(mode === "edit" ? "loading" : "ready");
    const [err, setErr] = useState<string>("");

    const [client, setClient] = useState<RagClientFull | null>(null);

    const [name, setName] = useState<string>("");
    const [hostUrl, setHostUrl] = useState<string>("");

    const title = useMemo(() => {
        if (mode === "create") return "Configure New Client";
        return client ? `Manage: ${client.name}` : "Manage Client";
    }, [mode, client]);

    async function load() {
        if (mode !== "edit" || !clientId || !Number.isFinite(clientId)) return;
        setState("loading");
        setErr("");
        try {
            const c = await getRagClient(clientId);
            setClient(c);
            setName(c.name || "");
            setHostUrl(c.host_url || "");
            setState("ready");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(msg);
            setState("error");
        }
    }

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, clientId]);

    async function onCreate() {
        setErr("");
        try {
            const created = await createRagClient({ name: name.trim(), host_url: hostUrl.trim() });
            router.push(`/hosts/${created.id}`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(msg);
        }
    }

    async function onSave() {
        if (!clientId) return;
        setErr("");
        try {
            await updateRagClient(clientId, { name: name.trim(), host_url: hostUrl.trim() });
            await load();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(msg);
        }
    }

    async function onDelete() {
        if (!clientId) return;
        if (!confirm("Delete this client? This cannot be undone.")) return;
        setErr("");
        try {
            await deleteRagClient(clientId);
            router.push(`/`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(msg);
        }
    }

    async function onConnect() {
        if (!clientId) return;
        setErr("");
        try {
            await connectRagClient(clientId);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(msg);
        }
    }

    async function onDisconnect() {
        if (!clientId) return;
        setErr("");
        try {
            await disconnectRagClient(clientId);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(msg);
        }
    }

    if (state === "loading") {
        return (
            <div className="p-4">
                <GroupBox title={title}>
                    <div className="text-sm">Loading…</div>
                </GroupBox>
            </div>
        );
    }

    if (state === "error") {
        return (
            <div className="p-4">
                <GroupBox title={title}>
                    <div className="text-sm text-red-600 whitespace-pre-wrap">{err || "Failed to load."}</div>
                    <div className="mt-3 flex gap-2">
                        <button className="border rounded px-3 py-2 text-sm" type="button" onClick={() => void load()}>
                            Retry
                        </button>
                        <Link className="border rounded px-3 py-2 text-sm" href="/">
                            Back
                        </Link>
                    </div>
                </GroupBox>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4">
            <GroupBox title={title}>
                {err ? <div className="mb-3 text-sm text-red-600 whitespace-pre-wrap">{err}</div> : null}

                <div className="grid gap-3">
                    <div className="grid gap-1">
                        <label className="text-sm font-medium">Client Name</label>
                        <input
                            className="border rounded px-2 py-2 text-sm"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Mesh DAQ Dashboard"
                        />
                    </div>

                    <div className="grid gap-1">
                        <label className="text-sm font-medium">Host URL</label>
                        <input
                            className="border rounded px-2 py-2 text-sm font-mono"
                            value={hostUrl}
                            onChange={(e) => setHostUrl(e.target.value)}
                            placeholder="https://daq.fullstackjedi.dev"
                        />
                        <div className="text-xs text-gray-600">
                            This is the URL where the dock will be injected / where the client app lives.
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                        {mode === "create" ? (
                            <>
                                <button
                                    className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                                    type="button"
                                    onClick={onCreate}
                                >
                                    Create Client
                                </button>
                                <Link className="border rounded px-3 py-2 text-sm hover:bg-gray-50" href="/">
                                    Cancel
                                </Link>
                            </>
                        ) : (
                            <>
                                <button
                                    className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                                    type="button"
                                    onClick={onSave}
                                >
                                    Save Changes
                                </button>
                                <button
                                    className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                                    type="button"
                                    onClick={onConnect}
                                >
                                    Connect
                                </button>
                                <button
                                    className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                                    type="button"
                                    onClick={onDisconnect}
                                >
                                    Disconnect
                                </button>
                                <button
                                    className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                                    type="button"
                                    onClick={onDelete}
                                >
                                    Delete
                                </button>
                                <Link className="border rounded px-3 py-2 text-sm hover:bg-gray-50" href="/">
                                    Back
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </GroupBox>

            {mode === "edit" && clientId ? (
                <>
                    <ContentDocsBox clientId={clientId} />
                    <ContextMessagesBox clientId={clientId} />
                    <SystemPromptBox clientId={clientId} />

                    <GroupBox title="Client Context (debug)">
                        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(client, null, 2)}</pre>
                        <button className="mt-3 border rounded px-3 py-2 text-sm hover:bg-gray-50" type="button" onClick={load}>
                            Refresh
                        </button>
                    </GroupBox>
                </>
            ) : null}
        </div>
    );
}
