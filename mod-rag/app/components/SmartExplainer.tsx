"use client";

import { useEffect, useMemo, useState } from "react";
import { ExplanationPanel, type Telemetry } from "@/app/components/ExplanationPanel";
import { useStream } from "@/app/hooks/useStream";
import { useAIConfig } from "@/app/hooks/useAIConfig";
import Toast from "@/app/components/Toast";
import { settings } from "@/app/lib/settings";
import type { UseCaseConfig } from "@/app/hooks/useUseCase";

type AttrValue = string | number | boolean | null | undefined;
type Attrs = Record<string, AttrValue>;

interface SmartExplainerProps {
  subjectId?: string;
  attrs?: Attrs;
  usecase: UseCaseConfig;
  showControls?: boolean;
  showPanel?: boolean;
}

export function SmartExplainer({
  subjectId,
  attrs = {},
  usecase,
}: SmartExplainerProps) {
  const [query, setQuery] = useState<string>(usecase.default_query || "");
  const [contextsOpen, setContextsOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    message: string;
    type?: "info" | "success" | "error";
  } | null>(null);

  const { cfg } = useAIConfig({
    local_model: usecase.llm_model,
    embed_model: usecase.embed_model,
  });

  const telemetry = useMemo<Telemetry>(() => {
    const t: Telemetry = {};

    if (Array.isArray(usecase.telemetry_keys)) {
      for (const key of usecase.telemetry_keys) {
        const v = attrs?.[key];

        if (typeof v === "string" || typeof v === "number") {
          t[key] = v;
        }
      }
    }

    return t;
  }, [attrs, usecase.telemetry_keys]);

  const base = (settings.AI_CORE_BASE || "https://ai-core.fullstackjedi.dev").replace(/\/$/, "");
  const explainPath = `${base}/rag/explain`;

  const url = useMemo(() => {
    const p = new URLSearchParams({
      q: query,
      usecase: usecase.id,
      collection: usecase.collection,
      model: cfg.local_model || usecase.llm_model,
      llm_model: cfg.local_model || usecase.llm_model,
      embed_model: cfg.embed_model || usecase.embed_model,
      provider: cfg.provider,
      prompt_template: usecase.prompt_template,
      chaining_mode: usecase.chaining_mode,
    });

    if (subjectId) {
      p.set("subject", subjectId);
    }

    for (const [key, val] of Object.entries(telemetry)) {
      if (val !== undefined) {
        p.set(key, String(val));
      }
    }

    return `${explainPath}?${p.toString()}`;
  }, [
    query,
    telemetry,
    usecase.id,
    usecase.collection,
    usecase.llm_model,
    usecase.embed_model,
    usecase.prompt_template,
    usecase.chaining_mode,
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
    forceSSE: true,
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
            embed_model: cfg.embed_model || usecase.embed_model,
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
  }, [answer, cfg.heatmap, cfg.embed_model, contexts, base, usecase.embed_model]);

  const onExplain = () => {
    setContextsOpen(false);
    reset();
    start();
  };

  return (
    <div className="space-y-6 rounded-lg bg-white p-4 shadow dark:bg-gray-900">
      <ExplanationPanel
        usecase={usecase}
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