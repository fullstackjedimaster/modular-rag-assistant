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
    stallMs: 90000,
    heartbeatMs: 5000,
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


      <ExplanationPanel
        query={query}
        setQueryAction={setQuery}
        telemetry={telemetry}
        streaming={streaming}
        banner={banner}
        answer={answer}
        progress={progress}
        error={error}
        onExplainAction={onExplain}
        onCancelAction={cancel}
        onResetAction={reset}
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