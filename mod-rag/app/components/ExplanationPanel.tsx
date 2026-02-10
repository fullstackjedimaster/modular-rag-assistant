// /ai-ui/src/components/ExplanationPanel.tsx
import { useCallback, useEffect, useMemo, useRef } from "react";
import GroupBox from "@/app/components/GroupBox";
import SaliencyHeatmap from "@/app/components/SaliencyHeatmap";


export type Telemetry = Record<string, string | number | undefined>;

export type ProgressInfo = {
    elapsed: number;
    chars: number;
    approx_tokens: number;
    rate_cps: number;
    status?: string;
    note?: string;
    done?: boolean;
};

export type UseCaseContext = {
    id: string;
    label: string;
    description: string;
    collection: string;
    prompt_template: string;
    telemetry_keys: string[];
    llm_model: string;
    embed_model: string;
    groupbox_title: string;
    default_query: string;
};

export type ExplanationPanelProps = {
    usecase: UseCaseContext;
    query: string;
    setQuery: (v: string) => void;
    telemetry: Telemetry;
    streaming: boolean;
    banner: string;
    answer: string;
    progress: ProgressInfo | null;
    error: string | null;
    onExplain: () => void;
    onCancel: () => void;
    onReset: () => void;
    contexts?: string[];
    contextsOpen?: boolean;
    heatmapData?: { idx: number; sentence: string; score: number }[] | null; // ✅ NEW
};


export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({
                                                                      usecase,
                                                                      query,
                                                                      setQuery,
                                                                      telemetry,
                                                                      streaming,
                                                                      banner,
                                                                      answer,
                                                                      progress,
                                                                      error,
                                                                      onExplain,
                                                                      onCancel,
                                                                      onReset,
                                                                      contexts,
                                                                      contextsOpen = false,
                                                                      heatmapData,
                                                                  }) => {
    const copyAnswer = useCallback(async () => {
        if (!answer) return;
        try {
            await navigator.clipboard.writeText(answer);
        } catch {
            // no-op
        }
    }, [answer]);

    const statusColor = useMemo(() => {
        const s = (progress?.status || "").toLowerCase();
        if (s.includes("error") || s.includes("stall")) return "text-red-500";
        if (s.includes("done")) return "text-green-600";
        if (s.includes("stream")) return "text-blue-600";
        if (s.includes("connect")) return "text-amber-600";
        return "text-gray-600";
    }, [progress?.status]);

    // Auto-open the contexts drawer when instructed and contexts are present
    const contextsRef = useRef<HTMLDetailsElement>(null);
    useEffect(() => {
        if (contextsOpen && contexts && contexts.length && contextsRef.current) {
            contextsRef.current.open = true;
        }
    }, [contextsOpen, contexts?.length, contexts]);

    return (
        <GroupBox title={usecase.groupbox_title}>
            <div className="space-y-4 mb-4">
                {usecase.telemetry_keys.length > 0 && (
                    <div className="text-xs dark:text-gray-300 font-mono">
                        {usecase.telemetry_keys.map((key) => (
                            <div key={key}>
                                {key}: {telemetry?.[key] ?? "—"}
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-2">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !streaming) onExplain();
                        }}
                        className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-black dark:text-white"
                        placeholder={`Ask about ${usecase.label.toLowerCase()}…`}
                        aria-label="Query input"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onExplain}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-60"
                        disabled={streaming}
                        aria-label="Explain"
                    >
                        {streaming ? "⏳ Working…" : "🔍 Explain"}
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-black dark:text-white rounded disabled:opacity-60"
                        disabled={!streaming}
                        aria-label="Cancel"
                    >
                        ✖ Cancel
                    </button>
                    <button
                        onClick={onReset}
                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-black dark:text-white rounded"
                        aria-label="Reset"
                    >
                        ⟲ Reset
                    </button>
                </div>

                {/* Progress HUD */}
                <div
                    className={`text-xs font-mono ${statusColor}`}
                    aria-live="polite"
                    aria-atomic="true"
                    role="status"
                >
                    {progress
                        ? `⏱ ${progress.elapsed.toFixed(2)}s • chars=${progress.chars} • ~tok=${progress.approx_tokens} • rate=${progress.rate_cps.toFixed(
                            1
                        )}c/s${progress.status ? " • " + progress.status : ""}${progress.note ? " • " + progress.note : ""}${
                            progress.done ? " • done" : ""
                        }`
                        : "idle"}
                    {error ? ` • error: ${error}` : ""}
                </div>

                {/* Streaming banner + contexts */}
                {(banner || (contexts && contexts.length)) && (
                    <div className="text-xs space-y-2">
                        {banner && (
                            <pre className="whitespace-pre-wrap text-gray-500 dark:text-gray-400">
                {banner}
              </pre>
                        )}
                        {contexts && contexts.length > 0 && (
                            <details ref={contextsRef}>
                                <summary className="cursor-pointer text-gray-500 dark:text-gray-400">
                                    Retrieved contexts ({contexts.length})
                                </summary>
                                <div className="mt-2 space-y-2">
                                    {contexts.map((c, i) => (
                                        <pre
                                            key={i}
                                            className="text-[11px] whitespace-pre-wrap rounded border border-gray-200 dark:border-gray-700 p-2"
                                        >
                      {c}
                    </pre>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                )}

                {/* Answer box */}
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Answer
                    </h4>
                    <button
                        onClick={copyAnswer}
                        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                        disabled={!answer}
                    >
                        Copy
                    </button>
                </div>
                <div className="rounded border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 p-3 font-sans text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap min-h-[96px]">
                    {answer || (streaming ? "…" : "—")}
                </div>
                {/* === Context Support Heatmap === */}
                {heatmapData && heatmapData.length > 0 && (
                    <div className="mt-4">
                        <SaliencyHeatmap title="Context Support Heatmap" sentences={heatmapData} />
                    </div>
                )}

            </div>
        </GroupBox>
    );
};
