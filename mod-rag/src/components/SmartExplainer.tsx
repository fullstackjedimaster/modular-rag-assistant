"use client";

import { useEffect, useMemo, useState } from "react";
import { ExplanationPanel, type Telemetry } from "@/src/components/ExplanationPanel";
import { useStream } from "@/src/hooks/useStream";
import { useAIConfig } from "@/src/hooks/useAIConfig";
import Toast from "@/src/components/Toast";
import { settings } from "@/src/lib/settings";
import type { TelemetryMessage } from "@/src/lib/ragClientApi";
import { PromptChainingMode } from "@/src/lib/ragClientApi";

type AttrValue = string | number | boolean | null | undefined;
type Attrs = Record<string, AttrValue>;

interface SmartExplainerProps {
  subjectId?: string;
  attrs?: Attrs;
  collection: string;
  llm_model: string;
  embed_model: string;
  prompt: string;
  chaining_mode: PromptChainingMode;
  telemetry_messages?: TelemetryMessage[];
  showControls?: boolean;
  showPanel?: boolean;
}

function getTelemetryKey(message: TelemetryMessage): string | null {
  if (!message) return null;

  const raw = message.message_name;

  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function coerceTelemetryValue(value: AttrValue): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return undefined;
}

export function SmartExplainer({
  subjectId,
  attrs = {},
  collection,
  llm_model,
  embed_model,
  prompt,
  chaining_mode,
  telemetry_messages = [],
}: SmartExplainerProps) {
  const [query, setQuery] = useState<string>(prompt || "");
  const [contextsOpen, setContextsOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    message: string;
    type?: "info" | "success" | "error";
  } | null>(null);

  const { cfg } = useAIConfig({
    local_model: llm_model,
    embed_model,
  });

  const telemetryKeys = useMemo<string[]>(() => {
    return telemetry_messages
      .map(getTelemetryKey)
      .filter((key): key is string => Boolean(key));
  }, [telemetry_messages]);

  const telemetry = useMemo<Telemetry>(() => {
    const t: Telemetry = {};

    for (const key of telemetryKeys) {
      const value = coerceTelemetryValue(attrs?.[key]);

      if (value !== undefined) {
        t[key] = value;
      }
    }

    return t;
  }, [attrs, telemetryKeys]);

  const base = (settings.AI_CORE_BASE || "https://ai-core.fullstackjedi.dev").replace(/\/$/, "");
  const explainPath = `${base}/rag/explain`;

  const url = useMemo(() => {
    const p = new URLSearchParams({
      q: query,
      collection,
      model: cfg.local_model || llm_model,
      llm_model: cfg.local_model || llm_model,
      embed_model: cfg.embed_model || embed_model,
      provider: cfg.provider,
      prompt,
      chaining_mode,
    });

    if (subjectId) {
      p.set("subject", subjectId);
    }

    if (telemetryKeys.length > 0) {
      p.set("telemetry_messages", telemetryKeys.join(","));
    }

    for (const [key, val] of Object.entries(telemetry)) {
      if (val !== undefined && val !== null) {
        p.set(key, String(val));
      }
    }

    return `${explainPath}?${p.toString()}`;
  }, [
    query,
    telemetry,
    telemetryKeys,
    collection,
    llm_model,
    embed_model,
    prompt,
    chaining_mode,
    cfg.local_model,
    cfg.embed_model,
    cfg.provider,
    subjectId,
    explainPath,
  ]);

  const {
    streaming,
    banner,
    answer,
    progress,
    error,
    start,
    cancel,
    reset,
    contexts,
  } = useStream({
    url,
    forceSSE: false,
    stallMs: 20000,
    heartbeatMs: 2000,
    onNotifyAction: (message, type) => setToast({ message, type }),
  });

  const [heatmapData, setHeatmapData] = useState<
    { idx: number; sentence: string; score: number }[] | null
  >(null);

  useEffect(() => {
    if (!answer || !cfg.heatmap) return;

    let cancelled = false;

    async function loadHeatmap() {
      try {
        const resp = await fetch(`${base}/diagnostics/heatmap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer,
            context: (contexts || []).join("\n"),
            embed_model: cfg.embed_model || embed_model,
          }),
        });

        if (!resp.ok) {
          console.warn("Heatmap fetch failed:", resp.status);
          return;
        }

        const data = await resp.json();

        if (!cancelled) {
          setHeatmapData(data.scores || []);
        }
      } catch (err) {
        console.warn("Heatmap analysis error:", err);
      }
    }

    void loadHeatmap();

    return () => {
      cancelled = true;
    };
  }, [answer, cfg.heatmap, cfg.embed_model, contexts, base, embed_model]);

  const onExplain = () => {
    setContextsOpen(false);
    reset();
    start();
  };

  return (
    <div className="smart-explainer">
      <style jsx global>{`
        .smart-explainer {
          width: 100%;
          margin: 0;
          padding: 3px;
          color: #000;
          font-family: Orbitron, system-ui, sans-serif;
          font-size: 13px;
          font-weight: 600;
          background: transparent;
          overflow: hidden;
        }

        .smart-explainer * {
          box-sizing: border-box;
          min-height: 0;
        }

        .smart-explainer > div,
        .smart-explainer section,
        .smart-explainer article {
          max-width: 100%;
          border-radius: 0 !important;
          box-shadow: none !important;
        }

        .smart-explainer .rounded,
        .smart-explainer .rounded-lg,
        .smart-explainer .rounded-xl,
        .smart-explainer .shadow,
        .smart-explainer .shadow-sm,
        .smart-explainer .shadow-md,
        .smart-explainer .shadow-lg {
          border-radius: 0 !important;
          box-shadow: none !important;
        }

        .smart-explainer input,
        .smart-explainer textarea,
        .smart-explainer select {
          width: 100%;
          max-width: 100%;
          font-family: Orbitron, system-ui, sans-serif;
          font-size: 12px;
          font-weight: 600;
          color: #000;
          background: #fff;
          border: thick inset #c0c0c0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          outline: none;
        }

        .smart-explainer textarea {
          min-height: 76px;
          resize: vertical;
        }

        .smart-explainer button {
          font-family: Orbitron, system-ui, sans-serif;
          font-size: 12px;
          font-weight: 700;
          color: #000;
          background: #d9d9d9;
          border: 2px outset #c0c0c0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 4px 8px;
        }

        .smart-explainer button:active {
          border-style: inset !important;
        }

        .smart-explainer pre,
        .smart-explainer code {
          max-width: 100%;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
        }

        .smart-explainer [class*="bg-white"],
        .smart-explainer [class*="dark:bg"],
        .smart-explainer [class*="bg-gray"],
        .smart-explainer [class*="bg-slate"] {
          background: transparent !important;
        }

        .smart-explainer [class*="border"] {
          border-color: #777 !important;
        }

        .smart-explainer [class*="text-gray"],
        .smart-explainer [class*="text-slate"] {
          color: #000 !important;
        }

        .smart-explainer .space-y-6 > :not([hidden]) ~ :not([hidden]),
        .smart-explainer .space-y-4 > :not([hidden]) ~ :not([hidden]),
        .smart-explainer .space-y-3 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 6px !important;
        }

        .smart-explainer .p-4,
        .smart-explainer .p-6 {
          padding: 4px !important;
        }

        .smart-explainer .px-4 {
          padding-left: 4px !important;
          padding-right: 4px !important;
        }

        .smart-explainer .py-4 {
          padding-top: 4px !important;
          padding-bottom: 4px !important;
        }
      `}</style>

      <ExplanationPanel
        query={query}
        setQuery={setQuery}
        telemetry={telemetry}
        streaming={streaming}
        banner={banner}
        answer={answer}
        progress={progress}
        error={error}
        onExplain={onExplain}
        onCancel={cancel}
        onReset={reset}
        contexts={contexts}
        contextsOpen={contextsOpen}
        heatmapData={heatmapData}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onCloseAction={() => setToast(null)}
        />
      )}
    </div>
  );
}