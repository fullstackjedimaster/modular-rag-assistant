"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExplanationPanel, Telemetry, UseCaseContext } from "@/app/components/ExplanationPanel";
import { useStream } from "@/app/hooks/useStream";
import { useAIConfig } from "@/app/hooks/useAIConfig";
import Toast from "@/app/components/Toast";
import { settings } from "@/app/lib/settings";

type AttrValue = string | number | boolean | null | undefined;
type Attrs = Record<string, AttrValue>;

interface SmartExplainerProps {
  subjectId?: string;
  attrs?: Attrs;
  usecase: UseCaseContext;
  showControls?: boolean;
  showPanel?: boolean;
}

export function SmartExplainer({
  subjectId,
  attrs = {},
  usecase,
  showControls = false,
  showPanel = false,
}: SmartExplainerProps) {
  const effectiveId = subjectId;

  const [query, setQuery] = useState<string>(usecase.default_query || "");
  const [setTelemetry] = useState<Telemetry>({});
  const [log, setLog] = useState<string>("");
  const [contextsOpen, setContextsOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    message: string;
    type?: "info" | "success" | "error";
  } | null>(null);

  const [llmModels, setLlmModels] = useState<Record<"ollama" | "openai", string[]>>({
    ollama: ["phi3:mini"],
    openai: ["gpt-4o", "gpt-3.5-turbo"],
  });

  const [embedChoices, setEmbedChoices] = useState<string[]>([
    "BAAI/bge-small-en-v1.5",
    "intfloat/multilingual-e5-small",
    "local/cpp-embedder",
  ]);

  const { cfg, onChange } = useAIConfig({
    local_model: usecase.llm_model,
    embed_model: usecase.embed_model,
  });

  const telemetry = useMemo<Telemetry>(() => {
  const t: Telemetry = {};

  if (Array.isArray(usecase.telemetry_keys) && usecase.telemetry_keys.length > 0) {
    for (const key of usecase.telemetry_keys) {
      const v = attrs?.[key];

      if (typeof v === "string" || typeof v === "number") {
        t[key] = v;
      }
    }
  }

  return t;
}, [attrs, usecase.telemetry_keys]);

  const base = (settings.AI_CORE_BASE || "https://ai-ui.fullstackjedi.dev").replace(/\/$/, "");
  const explainPath = `${base}/rag/explain`;

  const url = useMemo(() => {
    const p = new URLSearchParams({
      q: query,
      usecase: usecase.id,
      model: cfg.local_model,
      embed_model: cfg.embed_model,
      provider: cfg.provider,
    });

    if (effectiveId) {
      p.set("subject", effectiveId);
    }

    if (Array.isArray(usecase.telemetry_keys)) {
      for (const key of usecase.telemetry_keys) {
        const val = telemetry[key];
        if (val != null) {
          p.set(key, String(val));
        }
      }
    }

    return `${explainPath}?${p.toString()}`;
  }, [
    query,
    telemetry,
    usecase.id,
    usecase.telemetry_keys,
    cfg.local_model,
    cfg.embed_model,
    cfg.provider,
    effectiveId,
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

    (async () => {
      try {
        const resp = await fetch(`${base}/diagnostics/heatmap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer,
            context: (contexts || []).join("\n"),
            embed_model: cfg.embed_model,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          setHeatmapData(data.scores || []);
        } else {
          console.warn("Heatmap fetch failed:", resp.status);
        }
      } catch (err) {
        console.warn("Heatmap analysis error:", err);
      }
    })();
  }, [answer, cfg.heatmap, cfg.embed_model, contexts, base]);

  const seeder = useRef<EventSource | null>(null);
  const [seeding, setSeeding] = useState(false);

  const onApplyAnalyze = () => {
    setContextsOpen(false);
    reset();
    start();
  };

  const onSeedNow = async () => {
    if (seeding) return;

    setLog("");
    setSeeding(true);

    const sep = base.includes("?") ? "&" : "?";
    const urlSSE = `${base}/admin/reseed_stream${sep}usecase=${encodeURIComponent(
      usecase.id
    )}&embed_model=${encodeURIComponent(cfg.embed_model)}`;

    try {
      const es = new EventSource(urlSSE);
      seeder.current = es;

      const append = (line: string) =>
        setLog((prev) => (prev ? prev + "\n" + line : line));

      es.addEventListener("open", () => append("[reseed] connected"));
      es.addEventListener("line", (ev: MessageEvent) => append(ev.data));
      es.addEventListener("progress", (ev: MessageEvent) => {
        try {
          const { note } = JSON.parse(ev.data);
          append(`[progress] ${note ?? ""}`);
        } catch {
          append("[progress]");
        }
      });

      es.addEventListener("done", () => {
        append("[reseed] done • starting analyze…");
        setSeeding(false);

        try {
          es.close();
        } catch {}

        setContextsOpen(true);
        setToast({ message: "✅ Reseed completed successfully", type: "success" });
        reset();
        start();
      });

      es.addEventListener("error", () => {
        append("[reseed] error");
        setSeeding(false);
        setToast({ message: "❌ Reseed failed", type: "error" });

        try {
          es.close();
        } catch {}
      });
    } catch {
      setLog("[reseed] failed to connect");
      setSeeding(false);
      setToast({ message: "❌ Reseed connection failed", type: "error" });
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${base}/admin/models`);
        if (resp.ok) {
          const data = await resp.json();
          setLlmModels((prev) => data.llm_models ?? prev);
          setEmbedChoices((prev) => data.embed_models ?? prev);
        }
      } catch (err) {
        console.warn("Failed to fetch /admin/models:", err);
      }
    })();
  }, [base]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4 space-y-6">
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
        onExplain={start}
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