"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GroupBox from "@/src/components/GroupBox";
import { useAppMode } from "@/src/contexts/AppModeContext";
import { createRagHost, deleteRagHost, getRagHost, type RagHostFull } from "@/src/lib/ragHostApi";
import ContentDocsBox from "@/src/components/management/ContentDocsBox";
import ContextMessagesBox from "@/src/components/management/ContextMessagesBox";
import SystemPromptBox from "@/src/components/management/SystemPromptBox";

type Mode = "create" | "edit";
type LoadState = "loading" | "ready" | "error";
type RagHostId = RagHostFull["id"];
function isRagHostId(value: string | undefined | null): value is RagHostId { return typeof value === "string" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value); }

export default function ManagementShell({ mode, hostId }: { mode: Mode; hostId?: string }) {
  const router = useRouter();
  const { isReadOnly } = useAppMode();
  const activeHostId = useMemo<RagHostId | null>(() => isRagHostId(hostId) ? hostId : null, [hostId]);
  const [state, setState] = useState<LoadState>(mode === "edit" ? "loading" : "ready");
  const [err, setErr] = useState("");
  const [host, setHost] = useState<RagHostFull | null>(null);
  const [name, setName] = useState("");
  const [hostUrl, setHostUrl] = useState("");
  const title = mode === "create" ? "Configure New Host" : host ? host.name : "Host Details";

  const load = useCallback(async () => {
    if (mode !== "edit") return;
    await Promise.resolve();
    if (!activeHostId) { setErr("Invalid or missing RAG host id."); setState("error"); return; }
    setState("loading"); setErr("");
    try {
      const current = await getRagHost(activeHostId);
      setHost(current); setName(current.name || ""); setHostUrl(current.host_url || ""); setState("ready");
    } catch (error: unknown) { setErr(error instanceof Error ? error.message : String(error)); setState("error"); }
  }, [activeHostId, mode]);
  useEffect(() => { if (mode === "edit") void load(); }, [load, mode]);

  async function onCreate() {
    if (isReadOnly) return;
    setErr("");
    try { const created = await createRagHost({ name: name.trim(), host_url: hostUrl.trim() }); router.push(`/host/${created.id}`); }
    catch (error: unknown) { setErr(error instanceof Error ? error.message : String(error)); }
  }
  async function onDelete() {
    if (!activeHostId || isReadOnly || !window.confirm("Delete this host? This cannot be undone.")) return;
    try { await deleteRagHost(activeHostId); router.push("/"); }
    catch (error: unknown) { setErr(error instanceof Error ? error.message : String(error)); }
  }

  if (state === "loading") return <div className="p-4"><GroupBox title={title}><div className="text-sm">Loading...</div></GroupBox></div>;
  if (state === "error") return <div className="p-4"><GroupBox title={title}><div className="text-sm text-red-600">{err || "Failed to load."}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => void load()}>Retry</button><Link href="/">Back</Link></div></GroupBox></div>;

  return (
    <div className="management-shell">
      <GroupBox title={title}>
        {err ? <div className="mb-3 text-sm text-red-600">{err}</div> : null}
        <div className="grid gap-3">
          <div className="grid gap-1"><label htmlFor="rag-host-name">Host Name</label><input id="rag-host-name" value={name} onChange={(e) => setName(e.target.value)} readOnly={mode === "edit" || isReadOnly} disabled={mode === "edit" || isReadOnly} /></div>
          <div className="grid gap-1"><label htmlFor="rag-host-url">Host URL</label><input id="rag-host-url" value={hostUrl} onChange={(e) => setHostUrl(e.target.value)} readOnly={mode === "edit" || isReadOnly} disabled={mode === "edit" || isReadOnly} /></div>
        </div>
      </GroupBox>

      {mode === "edit" && activeHostId ? <><ContentDocsBox hostId={activeHostId} /><ContextMessagesBox hostId={activeHostId} /><SystemPromptBox hostId={activeHostId} /></> : null}

      <div className="management-actions-bottom">
        {mode === "create" && !isReadOnly ? <button type="button" onClick={() => void onCreate()}>Create Host</button> : null}
        {mode === "edit" && !isReadOnly ? <button type="button" className="management-delete" onClick={() => void onDelete()}>Delete Host</button> : null}
        <Link href="/">{mode === "create" ? "Cancel" : "Back"}</Link>
      </div>
    </div>
  );
}
