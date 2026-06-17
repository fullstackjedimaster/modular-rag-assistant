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
    evaluationStatus?: string | null;
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
                                                                      evaluationStatus,
                                                                  }) => {
    const statusColor = useMemo(() => {
        const s = (progress?.status || "").toLowerCase();

        if (s.includes("error") || s.includes("stall")) return "rag-status-bad";
        if (s.includes("done")) return "rag-status-good";
        if (s.includes("stream")) return "rag-status-info";
        if (s.includes("connect")) return "rag-status-warn";

        return "rag-status-muted";
    }, [progress?.status]);

    const evalStatusColor = useMemo(() => {
        const s = (evaluationStatus || "").toLowerCase();

        if (s.includes("failed") || s.includes("error")) return "rag-status-bad";
        if (s.includes("ready") || s.includes("complete")) return "rag-status-good";
        if (s.includes("running") || s.includes("loading")) return "rag-status-info";

        return "rag-status-muted";
    }, [evaluationStatus]);

    const contextsRef = useRef<HTMLDetailsElement>(null);

    useEffect(() => {
        if (contextsOpen && contexts && contexts.length && contextsRef.current) {
            contextsRef.current.open = true;
        }
    }, [contextsOpen, contexts]);

    const progressText = progress
        ? `${progress.elapsed.toFixed(2)}s | chars=${progress.chars} | ~tok=${
            progress.approx_tokens
        } | rate=${progress.rate_cps.toFixed(1)}c/s${
            progress.status ? " | " + progress.status : ""
        }${progress.note ? " | " + progress.note : ""}${
            progress.done ? " | done" : ""
        }`
        : "idle";

    return (
        <GroupBox title="AI Explanation" variant="flash">
            <div className="explanation-panel">
                <div className="explain-command-row">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQueryAction(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !streaming) onExplainAction();
                        }}
                        placeholder="Ask for an explanation..."
                        aria-label="Query input"
                        className="explain-query-input"
                    />

                    <div className="explain-actions">
                        <button
                            onClick={onExplainAction}
                            disabled={streaming}
                            aria-label="Explain"
                            type="button"
                        >
                            {streaming ? "Working..." : "Explain"}
                        </button>

                        <button
                            onClick={onCancelAction}
                            disabled={!streaming}
                            aria-label="Cancel"
                            type="button"
                        >
                            Cancel
                        </button>

                        <button
                            onClick={onResetAction}
                            aria-label="Reset"
                            type="button"
                        >
                            Reset
                        </button>
                    </div>
                </div>

                <div
                    className={`explain-status-line ${statusColor}`}
                    aria-live="polite"
                    aria-atomic="true"
                    role="status"
                >
                    {progressText}
                    {error ? ` | error: ${error}` : ""}
                </div>

                {evaluationStatus && (
                    <div className={`explain-status-line ${evalStatusColor}`}>
                        eval: {evaluationStatus}
                    </div>
                )}

                {(banner || (contexts && contexts.length > 0)) && (
                    <div className="explain-support-area">
                        {banner && (
                            <pre className="explain-pre explain-banner">
                                {banner}
                            </pre>
                        )}

                        {contexts && contexts.length > 0 && (
                            <details ref={contextsRef} className="explain-contexts">
                                <summary>
                                    Retrieved contexts ({contexts.length})
                                </summary>

                                <div className="explain-context-list">
                                    {contexts.map((c, i) => (
                                        <pre
                                            key={i}
                                            className="explain-pre explain-context-pre"
                                        >
                                            {c}
                                        </pre>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                )}

                <div className="explain-answer-head">
                    <h4>Answer</h4>

                    {hallucinationMetrics && (
                        <HallucinationBadgeRow
                            coverage={hallucinationMetrics.coverage}
                            contradictionRisk={hallucinationMetrics.contradictionRisk}
                            faithfulness={hallucinationMetrics.faithfulness}
                        />
                    )}
                </div>

                <div className="explain-answer-box">
                    {answer || (streaming ? "Working..." : "")}
                </div>

                {heatmapData && heatmapData.length > 0 && (
                    <div className="explain-heatmap-wrap">
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