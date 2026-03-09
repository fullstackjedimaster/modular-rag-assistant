"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SmartExplainer } from "@/app/components/SmartExplainer";
import { useUsecase } from "@/app/hooks/useUseCase";
import { parseDockMessage } from "@/app/lib/messages";

type AttrValue = string | number | boolean | null | undefined;
type Attrs = Record<string, AttrValue>;

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(`[dock] ${msg}`);
}

function requireAllowlist(usecase: any): string[] {
  const keys = usecase?.telemetry_keys;
  assert(Array.isArray(keys), "usecase.telemetry_keys must exist and be an array.");
  assert(keys.length > 0, "usecase.telemetry_keys must be non-empty.");

  for (const k of keys) {
    assert(typeof k === "string" && k.length > 0, "usecase.telemetry_keys contains an invalid key.");
  }

  return keys as string[];
}

function pickRequiredAttrs(attrs: Attrs, allow: string[]) {
  const out: Record<string, string | number | boolean> = {};

  for (const key of allow) {
    const v = attrs[key];
    assert(v !== null && v !== undefined, `missing required attr "${key}" in TARGET_SELECTED.attrs.`);

    const t = typeof v;
    assert(
      t === "string" || t === "number" || t === "boolean",
      `attr "${key}" must be string|number|boolean, got ${t}.`
    );

    out[key] = v as string | number | boolean;
  }

  return out;
}

export default function DockInner() {
  const params = useSearchParams();
  const forcedUsecase = params.get("usecase") || undefined;
  const forcedClient = params.get("client") || undefined;

  const { selected, loaded, setSelectedId } = useUsecase();

  const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
  const [attrs, setAttrs] = useState<Attrs>({});
  const [dockError, setDockError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | undefined>(forcedClient);
  const [clientLabel, setClientLabel] = useState<string | undefined>(undefined);
  const [clientHostUrl, setClientHostUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!loaded) return;
    if (!forcedUsecase) return;
    setSelectedId(forcedUsecase);
  }, [loaded, forcedUsecase, setSelectedId]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent<unknown>) => {
      try {
        const msg = parseDockMessage(ev.data);

        if (msg.type === "RAG_CLIENT_SELECTED") {
          setClientId(msg.client);
          setClientLabel(msg.label);
          setClientHostUrl(msg.hostUrl);

          if (!forcedUsecase && msg.defaultUsecase) {
            setSelectedId(msg.defaultUsecase);
          }

          setDockError(null);
          return;
        }

        if (msg.type === "TARGET_SELECTED") {
          setSubjectId(msg.id);

          const a = (msg.attrs ?? {}) as Attrs;
          assert(a && typeof a === "object", "TARGET_SELECTED.attrs must be an object when provided.");

          setAttrs(a);
          setDockError(null);
          return;
        }
      } catch (err: any) {
        const text = String(err?.message || "");
        if (text.includes("invalid message type")) return;
        setDockError(text || "Unknown dock error.");
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [forcedUsecase, setSelectedId]);

  const forwardedAttrs = useMemo(() => {
    if (!loaded || !selected) return {};
    if (!subjectId) return {};

    const allow = requireAllowlist(selected);
    return pickRequiredAttrs(attrs, allow);
  }, [attrs, loaded, selected, subjectId]);

  if (!loaded) {
    return <div className="p-3 text-sm text-gray-500">Loading dock…</div>;
  }

  return (
    <div className="m-0 bg-transparent p-3">
      {dockError && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {dockError}
        </div>
      )}

      <div className="mb-3 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm">
        <div>
          <span className="font-medium text-gray-800">Client:</span>{" "}
          {clientId ?? "waiting…"}
        </div>
        {clientLabel && (
          <div>
            <span className="font-medium text-gray-800">Project:</span> {clientLabel}
          </div>
        )}
        {clientHostUrl && (
          <div className="truncate">
            <span className="font-medium text-gray-800">Host:</span> {clientHostUrl}
          </div>
        )}
        <div>
          <span className="font-medium text-gray-800">Use case:</span>{" "}
          {selected?.id ?? forcedUsecase ?? "waiting…"}
        </div>
        <div>
          <span className="font-medium text-gray-800">Selected target:</span>{" "}
          {subjectId ?? "none"}
        </div>
      </div>

      {!selected && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Waiting for explainer configuration…
        </div>
      )}

      {selected && !subjectId && (
        <div className="mb-3 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Waiting for a selection from the target demo…
        </div>
      )}

      {selected ? (
        <SmartExplainer
          subjectId={subjectId}
          attrs={forwardedAttrs}
          usecase={selected}
          showControls={false}
          showPanel={true}
        />
      ) : (
        <div className="rounded border border-gray-200 bg-white px-3 py-4 text-sm text-gray-600 shadow-sm">
          The dock is loaded, but no explainer use case has been resolved yet.
        </div>
      )}
    </div>
  );
}
