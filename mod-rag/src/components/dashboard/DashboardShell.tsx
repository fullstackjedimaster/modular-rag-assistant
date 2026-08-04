"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import DashboardHost from "@/src/components/dashboard/DashboardHost";
import PostMessageTap from "@/src/components/debug/PostMessageTap";
import { useDebugFlags } from "@/src/components/debug/useDebugFlags";
import { useAppMode } from "@/src/contexts/AppModeContext";
import { useEmbedToken } from "@/src/hooks/useEmbedToken";
import { connectRagHost, listRagHosts, type RagHostRow } from "@/src/lib/ragHostApi";

const DEFAULT_HOST_HEIGHT = 600;
const MIN_HOST_HEIGHT = 240;
const MAX_HOST_HEIGHT = 5000;
const DISCOVERY_RETRIES = [0, 250, 750, 1500, 3000];

function DebugTapMount() {
    const { msgdebug } = useDebugFlags();
    return <PostMessageTap enabled={msgdebug} label="mod-rag-host" />;
}
function clampHeight(height: number): number { return Math.max(MIN_HOST_HEIGHT, Math.min(MAX_HOST_HEIGHT, Math.ceil(height))); }
function isMeshHost(host: RagHostRow): boolean {
    const haystack = `${host.name} ${host.host_url}`.toLowerCase();
    return haystack.includes("mesh") || haystack.includes("daq");
}

export default function DashboardShell() {
    const { isDemo } = useAppMode();
    const embedToken = useEmbedToken();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const discoveryTimersRef = useRef<number[]>([]);
    const [browserOrigin, setBrowserOrigin] = useState("");
    const [hosts, setHosts] = useState<RagHostRow[]>([]);
    const [activeHostId, setActiveHostId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [hostReady, setHostReady] = useState(false);
    const [hostHeight, setHostHeight] = useState(DEFAULT_HOST_HEIGHT);

    useEffect(() => { setBrowserOrigin(window.location.origin); }, []);

    useEffect(() => {
        let cancelled = false;
        async function load(): Promise<void> {
            setLoading(true); setError("");
            try {
                const rows = await listRagHosts();
                if (cancelled) return;
                setHosts(rows);
                const preferred = rows.find(isMeshHost) ?? rows[0];
                if (preferred) {
                    await connectRagHost(preferred.id);
                    if (!cancelled) setActiveHostId(preferred.id);
                }
            } catch (caught: unknown) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
            } finally { if (!cancelled) setLoading(false); }
        }
        void load();
        return () => { cancelled = true; };
    }, []);

    const activeHost = useMemo(() => hosts.find((host) => host.id === activeHostId) ?? null, [hosts, activeHostId]);
    const activeOrigin = useMemo(() => {
        if (!activeHost) return "";
        try { return new URL(activeHost.host_url).origin; } catch { return ""; }
    }, [activeHost]);
    const activeUrl = useMemo(() => {
        if (!activeHost || !browserOrigin) return "";
        const url = new URL(activeHost.host_url);
        url.searchParams.set("embedParentOrigin", browserOrigin);
        if (embedToken) url.searchParams.set("pf_embed_token", embedToken);
        return url.toString();
    }, [activeHost, browserOrigin, embedToken]);

    const postToHost = useCallback((message: object) => {
        const win = iframeRef.current?.contentWindow;
        if (win && activeOrigin) win.postMessage(message, activeOrigin);
    }, [activeOrigin]);

    const scheduleDiscovery = useCallback(() => {
        discoveryTimersRef.current.forEach(window.clearTimeout);
        discoveryTimersRef.current = DISCOVERY_RETRIES.map((delay) => window.setTimeout(() => {
            postToHost({ type: "RAG_HOST_DISCOVER" });
            if (activeHostId) postToHost({ type: "RAG_DOCK_CONNECT", ragHostId: activeHostId });
        }, delay));
    }, [activeHostId, postToHost]);

    useEffect(() => () => discoveryTimersRef.current.forEach(window.clearTimeout), []);
    useEffect(() => { setHostReady(false); setHostHeight(DEFAULT_HOST_HEIGHT); }, [activeHostId]);
    useEffect(() => { if (hostReady && activeHostId) postToHost({ type: "RAG_DOCK_CONNECT", ragHostId: activeHostId }); }, [activeHostId, hostReady, postToHost]);

    useEffect(() => {
        function onMessage(event: MessageEvent<unknown>): void {
            const win = iframeRef.current?.contentWindow;
            if (!win || event.source !== win || !activeOrigin || event.origin !== activeOrigin) return;
            const data = event.data as { type?: unknown; height?: unknown } | null;
            if (data?.type === "RAG_HOST_READY") {
                setHostReady(true);
                if (activeHostId) postToHost({ type: "RAG_DOCK_CONNECT", ragHostId: activeHostId });
            } else if (data?.type === "EMBED_HEIGHT" && typeof data.height === "number") {
                setHostHeight(clampHeight(data.height));
            }
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [activeHostId, activeOrigin, postToHost]);

    async function activateHost(host: RagHostRow): Promise<void> {
        setError("");
        try {
            await connectRagHost(host.id);
            setActiveHostId(host.id);
        } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : String(caught)); }
    }

    if (loading) return <main className="rag-page"><div className="rag-page-inner rag-page-inner-narrow"><h1 className="rag-title">Modular RAG Assistant Demo</h1><p className="rag-subtitle">Loading hosts...</p></div></main>;
    if (error || !activeHost) return <main className="rag-page"><div className="rag-page-inner rag-page-inner-narrow"><h1 className="rag-title">Modular RAG Assistant Demo</h1><div className="rag-error">{error || "No RAG hosts are configured."}</div><div className="rag-toolbar"><Link href="/hosts" className="rag-button rag-button-secondary">{isDemo ? "View RAG Hosts" : "Manage RAG Hosts"}</Link></div></div></main>;

    return (
        <main className="rag-page">
            <div className="rag-page-inner">
                <header className="rag-host-header">
                    <DashboardHost selectedRagHostId={activeHost.id} onActivateHostAction={activateHost} onConnectedHostChangeAction={(id) => { if (id && id !== activeHostId) setActiveHostId(id); }} compact />
                </header>
                <section className="rag-host-frame-card">
                    <iframe key={activeHost.id} ref={iframeRef} title={`${activeHost.name} host application`} src={activeUrl} className="rag-host-frame" style={{ height: `${hostHeight}px` }} onLoad={scheduleDiscovery} />
                </section>
            </div>
            <Suspense fallback={null}><DebugTapMount /></Suspense>
        </main>
    );
}
