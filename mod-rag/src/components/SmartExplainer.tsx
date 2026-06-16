"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ExplanationPanel,
  type HallucinationMetrics,
  type Telemetry,
} from "@/src/components/ExplanationPanel";
import { useStream } from "@/src/hooks/useStream";
import { useAIConfig } from "@/src/hooks/useAIConfig";
import Toast from "@/src/components/Toast";
import { settings } from "@/src/lib/settings";
import type { TelemetryMessage } from "@/src/lib/ragClientApi";
import { PromptChainingMode } from "@/src/lib/ragClientApi";

type AttrValue = string | number | boolean | null | undefined;
type Attrs = Record<string, AttrValue>;

type HeatmapSentence = {
  idx: number;
  sentence: string;
  score: number;
};

type EvalResponse = {
  coverage?: number;
  contradiction_risk?: number;
  hallucination_estimate?: number;
  faithfulness?: number;
  per_context_saliency?: {
    sentences?: HeatmapSentence[];
  }[];
};

type DiagnosticsHeatmapResponse = {
  scores?: HeatmapSentence[];
  avg_score?: number;
  max_score?: number;
  min_score?: number;
};

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

function getBestEvalHeatmap(data: EvalResponse): HeatmapSentence[] {
  const perContext = data.per_context_saliency || [];

  const allSentences = perContext.flatMap((ctx) => ctx.sentences || []);

  if (allSentences.length === 0) {
    return [];
  }

  return allSentences.map((item, idx) => ({
    idx,
    sentence: item.sentence,
    score: Number(item.score ?? 0),
  }));
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

  const [heatmapData, setHeatmapData] = useState<HeatmapSentence[] | null>(null);
  const [hallucinationMetrics, setHallucinationMetrics] =
      useState<HallucinationMetrics | null>(null);

  const [evaluationStatus, setEvaluationStatus] = useState<string | null>(null);

  const [toast, setToast] = useState<{
    message: string;
    type?: "info" | "success" | "error";
  } | null>(null);

  const { cfg } = useAIConfig({
    local_model: llm_model,
    embed_model,
  });

  const telemetryKeys = useMemo<string[]>((() => {
    return telemetry_messages
        .map(getTelemetryKey)
        .filter((key): key is string => Boolean(key));
  }), [telemetry_messages]);

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

  useEffect(() => {
    if (streaming) return;
    if (!answer.trim()) return;

    const cleanContexts = (contexts || [])
        .map((ctx) => String(ctx || "").trim())
        .filter(Boolean);

    if (cleanContexts.length === 0) {
      setEvaluationStatus("skipped: no contexts");
      return;
    }

    let cancelled = false;

    async function loadDiagnosticsHeatmapFallback() {
      const resp = await fetch(`${base}/diagnostics/heatmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer,
          context: cleanContexts.join("\n"),
        }),
      });

      if (!resp.ok) {
        throw new Error(`/diagnostics/heatmap failed: ${resp.status}`);
      }

      const data = (await resp.json()) as DiagnosticsHeatmapResponse;

      if (cancelled) return;

      setHeatmapData(data.scores || []);
    }

    async function loadCompletedAnswerEvaluation() {
      setEvaluationStatus("running");

      try {
        const resp = await fetch(`${base}/eval/hallucination`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer,
            contexts: cleanContexts,
          }),
        });

        if (!resp.ok) {
          throw new Error(`/eval/hallucination failed: ${resp.status}`);
        }

        const data = (await resp.json()) as EvalResponse;

        if (cancelled) return;

        setHallucinationMetrics({
          coverage: Number(data.coverage ?? 0),
          contradictionRisk: Number(data.contradiction_risk ?? 0),
          faithfulness: Number(data.faithfulness ?? 0),
        });

        const evalHeatmap = getBestEvalHeatmap(data);

        if (evalHeatmap.length > 0) {
          setHeatmapData(evalHeatmap);
          setEvaluationStatus("ready");
          return;
        }

        setEvaluationStatus("eval ready; loading fallback heatmap");
        await loadDiagnosticsHeatmapFallback();

        if (!cancelled) {
          setEvaluationStatus("ready");
        }
      } catch (err) {
        console.warn("Completed-answer evaluation error:", err);

        if (!cancelled) {
          setEvaluationStatus("eval failed; trying fallback heatmap");
        }

        try {
          await loadDiagnosticsHeatmapFallback();

          if (!cancelled) {
            setEvaluationStatus("heatmap ready; badges unavailable");
          }
        } catch (fallbackErr) {
          console.warn("Fallback heatmap error:", fallbackErr);

          if (!cancelled) {
            setEvaluationStatus("failed");
          }
        }
      }
    }

    void loadCompletedAnswerEvaluation();

    return () => {
      cancelled = true;
    };
  }, [streaming, answer, contexts, base]);

  const clearEvaluation = () => {
    setContextsOpen(false);
    setHeatmapData(null);
    setHallucinationMetrics(null);
    setEvaluationStatus(null);
  };

  const onExplain = () => {
    clearEvaluation();
    reset();
    start();
  };

  const onReset = () => {
    clearEvaluation();
    reset();
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
            onResetAction={onReset}
            contexts={contexts}
            contextsOpen={contextsOpen}
            heatmapData={heatmapData}
            hallucinationMetrics={hallucinationMetrics}
            evaluationStatus={evaluationStatus}
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