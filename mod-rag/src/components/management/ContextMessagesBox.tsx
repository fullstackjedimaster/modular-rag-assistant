"use client";
import React, { useCallback, useEffect, useState } from "react";
import GroupBox from "@/src/components/GroupBox";
import { useAppMode } from "@/src/contexts/AppModeContext";
import { getContextMessages, saveContextMessages, type ContextMessageRow } from "@/src/lib/hostContextApi";
const EMPTY_ROW: ContextMessageRow = { name: "" };
export default function ContextMessagesBox({ hostId }: { hostId: string }) {
  const { isReadOnly } = useAppMode();
  const [rows, setRows] = useState<ContextMessageRow[]>([]); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const refresh = useCallback(async () => { setBusy(true); setNote(""); try { setRows(await getContextMessages(hostId)); } catch (e: unknown) { setRows([]); setNote(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }, [hostId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const update = (index:number, name:string) => setRows((current) => current.map((row,i)=> i===index ? {...row,name}:row));
  const remove = (index:number) => setRows((current)=>current.filter((_,i)=>i!==index));
  async function save(){ if(isReadOnly)return; const normalized=rows.map((row)=>({name:row.name.trim()})).filter((row)=>row.name); setBusy(true); try{await saveContextMessages(hostId,normalized); setNote("Saved telemetry fields."); await refresh();}catch(e:unknown){setNote(e instanceof Error?e.message:String(e));}finally{setBusy(false);} }
  return <GroupBox title="Telemetry Fields"><div className="grid gap-3"><p className="text-xs text-gray-600">Choose which telemetry keys this host may forward to the assistant.</p><div className="grid gap-2">{rows.map((row,index)=><div key={row.id||index} className="telemetry-row"><input value={row.name} onChange={(e)=>update(index,e.target.value)} placeholder="e.g. irradiance" disabled={busy||isReadOnly}/><button type="button" onClick={()=>remove(index)} disabled={busy||isReadOnly}>×</button></div>)}{!rows.length?<div className="empty-state">No telemetry fields configured.</div>:null}</div><div className="flex flex-wrap gap-2">{!isReadOnly?<><button type="button" onClick={()=>setRows((c)=>[...c,{...EMPTY_ROW}])} disabled={busy}>Add Field</button><button type="button" onClick={()=>void save()} disabled={busy}>Save</button></>:null}<button type="button" onClick={()=>void refresh()} disabled={busy}>Refresh</button></div>{note?<div className="text-xs">{note}</div>:null}</div></GroupBox>;
}
