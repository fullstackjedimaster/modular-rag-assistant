"use client";

import { useEffect, useMemo, useRef } from "react";
import GroupBox from "@/src/components/GroupBox";
import SaliencyHeatmap from "@/src/components/SaliencyHeatmap";
import HallucinationBadgeRow from "@/src/components/HallucinationBadgeRow";

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

export type HallucinationMetrics = {
  coverage: number;
  contradictionRisk: number;
  faithfulness: number;
};

export type ExplanationPanelProps = {
  query: string;
  setQueryAction: (v: string) => void;
  telemetry: Telemetry;
  streaming: boolean;
  banner: string;
  answer: string;
  progress: ProgressInfo | null;
  error: string | null;
  onExplainAction: () => void;
  onCancelAction: () => void;
  onResetAction: () => void;
  contexts?: string[];
  contextsOpen?: boolean;
  heatmapData?: { idx: number; sentence: string; score: number }[] | null;
  hallucinationMetrics?: HallucinationMetrics | null;
};

export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({
                                                                    query,
                                                                    setQueryAction,
                                                                    streaming,
                                                                    banner,
                                                                    answer,
                                                                    progress,
                                                                    error,
                                                                    onExplainAction,
                                                                    onCancelAction,
                                                                    onResetAction,
                                                                    contexts,
                                                                    contextsOpen = false,
                                                                    heatmapData,
                                                                    hallucinationMetrics,
                                                                  }) => {
  const statusColor = useMemo(() => {
    const s = (progress?.status || "").toLowerCase();

    if (s.includes("error") || s.includes("stall")) return "text-red-500";
    if (s.includes("done")) return "text-green-600";
    if (s.includes("stream")) return "text-blue-600";
    if (s.includes("connect")) return "text-amber-600";

    return "text-gray-600";
  }, [progress?.status]);

  const contextsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (contextsOpen && contexts && contexts.length && contextsRef.current) {
      contextsRef.current.open = true;
    }
  }, [contextsOpen, contexts]);

  return (
      <GroupBox title="AI Explanation">
        <div className="explanation-panel">
          <div className="flex gap-2">
            <input
                type="text"
                value={query}
                onChange={(e) => setQueryAction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !streaming) onExplainAction();
                }}
                placeholder="Ask for an explanation..."
                aria-label="Query input"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={onExplainAction} disabled={streaming} aria-label="Explain">
              {streaming ? "Working..." : "Explain"}
            </button>

            <button onClick={onCancelAction} disabled={!streaming} aria-label="Cancel">
              Cancel
            </button>

            <button onClick={onResetAction} aria-label="Reset">
              Reset
            </button>
          </div>

          <div
              className={`font-mono text-xs ${statusColor}`}
              aria-live="polite"
              aria-atomic="true"
              role="status"
          >
            {progress
                ? `${progress.elapsed.toFixed(2)}s | chars=${progress.chars} | ~tok=${
                    progress.approx_tokens
                } | rate=${progress.rate_cps.toFixed(1)}c/s${
                    progress.status ? " | " + progress.status : ""
                }${progress.note ? " | " + progress.note : ""}${
                    progress.done ? " | done" : ""
                }`
                : "idle"}

            {error ? ` | error: ${error}` : ""}
          </div>

          {(banner || (contexts && contexts.length > 0)) && (
              <div className="space-y-2 text-xs">
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
                                className="whitespace-pre-wrap rounded border border-gray-200 p-2 text-[11px] dark:border-gray-700"
                            >
                      {c}
                    </pre>
                        ))}
                      </div>
                    </details>
                )}
              </div>
          )}

          <div className="flex items-center justify-between">
            <h4>Answer</h4>
          </div>

          {hallucinationMetrics && (
              <div className="mb-2">
                <HallucinationBadgeRow
                    coverage={hallucinationMetrics.coverage}
                    contradictionRisk={hallucinationMetrics.contradictionRisk}
                    faithfulness={hallucinationMetrics.faithfulness}
                />
              </div>
          )}

          <div className="min-h-[96px] whitespace-pre-wrap rounded border border-gray-200 bg-white/70 p-3 font-sans text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100">
            {answer || (streaming ? "Working..." : "")}
          </div>

          {heatmapData && heatmapData.length > 0 && (
              <div className="mt-4">
                <SaliencyHeatmap
                    title="Context Support Heatmap"
                    sentences={heatmapData}
                />
              </div>
          )}
        </div>
      </GroupBox>
  );
};