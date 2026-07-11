"use client";

import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
} from "react";

import GroupBox from "@/src/components/GroupBox";
import HallucinationBadgeRow from "@/src/components/HallucinationBadgeRow";
import SaliencyHeatmap from "@/src/components/SaliencyHeatmap";

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

export type HeatmapSentence = {
    idx: number;
    sentence: string;
    score: number;
};

export type ExplanationPanelProps = {
    query: string;
    setQueryAction: (value: string) => void;
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
    heatmapData?: HeatmapSentence[] | null;
    hallucinationMetrics?: HallucinationMetrics | null;
    evaluationStatus?: string | null;
};

function useAnimatedEllipsis(
    active: boolean,
    maxDots = 4,
    intervalMs = 450,
): string {
    const [dotCount, setDotCount] = useState(1);

    useEffect(() => {
        if (!active) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setDotCount((current) =>
                current >= maxDots ? 1 : current + 1,
            );
        }, intervalMs);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [active, intervalMs, maxDots]);

    return active ? ".".repeat(dotCount) : "";
}

function getProgressStatusClass(status?: string): string {
    const normalized = (status ?? "").toLowerCase();

    if (
        normalized.includes("error") ||
        normalized.includes("failed")
    ) {
        return "rag-status-bad";
    }

    if (
        normalized.includes("done") ||
        normalized.includes("ready") ||
        normalized.includes("complete")
    ) {
        return "rag-status-good";
    }

    if (
        normalized.includes("stream") ||
        normalized.includes("running") ||
        normalized.includes("loading")
    ) {
        return "rag-status-info";
    }

    if (
        normalized.includes("connect") ||
        normalized.includes("waiting") ||
        normalized.includes("stall")
    ) {
        return "rag-status-warn";
    }

    return "rag-status-muted";
}

function finiteNumber(value: number, fallback = 0): number {
    return Number.isFinite(value) ? value : fallback;
}

export function ExplanationPanel({
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
    contexts = [],
    contextsOpen = false,
    heatmapData,
    hallucinationMetrics,
    evaluationStatus,
}: ExplanationPanelProps) {
    const contextsRef = useRef<HTMLDetailsElement>(null);

    const animationActive = streaming && !error;
    const animatedDots = useAnimatedEllipsis(animationActive);

    const hasStartedOutput =
        answer.trim().length > 0 ||
        finiteNumber(progress?.chars ?? 0) > 0;

    const liveActivityLabel = useMemo(() => {
        if (animationActive) {
            return hasStartedOutput
                ? `Streaming${animatedDots}`
                : `Waiting${animatedDots}`;
        }

        if (error) {
            return "Error";
        }

        if (progress?.done) {
            return "Done";
        }

        const serverStatus = progress?.status?.trim();

        return serverStatus || "Idle";
    }, [
        animatedDots,
        animationActive,
        error,
        hasStartedOutput,
        progress?.done,
        progress?.status,
    ]);

    const statusColor = useMemo(
        () =>
            getProgressStatusClass(
                error ? "error" : liveActivityLabel,
            ),
        [error, liveActivityLabel],
    );

    const evaluationStatusColor = useMemo(
        () =>
            getProgressStatusClass(
                evaluationStatus ?? undefined,
            ),
        [evaluationStatus],
    );

    useEffect(() => {
        const details = contextsRef.current;

        if (!details) {
            return;
        }

        details.open =
            contextsOpen && contexts.length > 0;
    }, [contextsOpen, contexts.length]);

    const progressText = useMemo(() => {
        if (!progress) {
            return liveActivityLabel;
        }

        const elapsed = finiteNumber(
            progress.elapsed,
        ).toFixed(2);

        const chars = Math.max(
            0,
            finiteNumber(progress.chars),
        );

        const tokens = Math.max(
            0,
            finiteNumber(progress.approx_tokens),
        );

        const rate = Math.max(
            0,
            finiteNumber(progress.rate_cps),
        ).toFixed(1);

        const parts = [
            `${elapsed}s`,
            `chars=${chars}`,
            `~tok=${tokens}`,
            `rate=${rate}c/s`,
            liveActivityLabel,
        ];

        if (progress.note) {
            parts.push(progress.note);
        }

        return parts.join(" | ");
    }, [liveActivityLabel, progress]);

    function handleQueryKeyDown(
        event: KeyboardEvent<HTMLInputElement>,
    ): void {
        if (
            event.key !== "Enter" ||
            event.nativeEvent.isComposing
        ) {
            return;
        }

        event.preventDefault();

        if (!streaming && query.trim()) {
            onExplainAction();
        }
    }

    const hasContexts = contexts.length > 0;
    const hasHeatmap = Boolean(heatmapData?.length);

    const answerText =
        answer ||
        (streaming
            ? `${hasStartedOutput ? "Streaming" : "Waiting"}${animatedDots}`
            : "No answer yet.");

    return (
        <GroupBox
            title="AI Explanation"
            variant="flash"
        >
            <div className="explanation-panel">
                <div className="explain-command-row">
                    <input
                        type="text"
                        value={query}
                        onChange={(event) =>
                            setQueryAction(
                                event.target.value,
                            )
                        }
                        onKeyDown={handleQueryKeyDown}
                        placeholder="Ask for an explanation..."
                        aria-label="Explanation query"
                        className="explain-query-input"
                    />

                    <div className="explain-actions">
                        <button
                            type="button"
                            onClick={onExplainAction}
                            disabled={
                                streaming ||
                                !query.trim()
                            }
                            aria-label="Explain"
                        >
                            {streaming
                                ? `Working${animatedDots}`
                                : "Explain"}
                        </button>

                        <button
                            type="button"
                            onClick={onCancelAction}
                            disabled={!streaming}
                            aria-label="Cancel explanation"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={onResetAction}
                            aria-label="Reset explanation"
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
                    {error
                        ? ` | error: ${error}`
                        : ""}
                </div>

                {evaluationStatus && (
                    <div
                        className={`explain-status-line ${evaluationStatusColor}`}
                        aria-live="polite"
                    >
                        eval: {evaluationStatus}
                    </div>
                )}

                {(banner || hasContexts) && (
                    <div className="explain-support-area">
                        {banner && (
                            <pre className="explain-pre explain-banner">
                                {banner}
                            </pre>
                        )}

                        {hasContexts && (
                            <details
                                ref={contextsRef}
                                className="explain-contexts"
                            >
                                <summary>
                                    Retrieved contexts (
                                    {contexts.length})
                                </summary>

                                <div className="explain-context-list">
                                    {contexts.map(
                                        (
                                            context,
                                            index,
                                        ) => (
                                            <pre
                                                key={`${index}-${context.slice(
                                                    0,
                                                    32,
                                                )}`}
                                                className="explain-pre explain-context-pre"
                                            >
                                                {
                                                    context
                                                }
                                            </pre>
                                        ),
                                    )}
                                </div>
                            </details>
                        )}
                    </div>
                )}

                <section
                    className="explain-answer-section"
                    aria-labelledby="explain-answer-title"
                >
                    <div className="explain-answer-head">
                        <h4 id="explain-answer-title">
                            Answer
                        </h4>

                        {hallucinationMetrics && (
                            <HallucinationBadgeRow
                                coverage={
                                    hallucinationMetrics.coverage
                                }
                                contradictionRisk={
                                    hallucinationMetrics.contradictionRisk
                                }
                                faithfulness={
                                    hallucinationMetrics.faithfulness
                                }
                            />
                        )}
                    </div>

                    <div
                        className="explain-answer-scroll"
                        tabIndex={0}
                        aria-label="Scrollable explanation answer"
                    >
                        <div className="explain-answer-box">
                            {answerText}
                        </div>
                    </div>
                </section>

                {hasHeatmap && heatmapData && (
                    <section
                        className="explain-heatmap-section"
                        aria-label="Context support heatmap"
                    >
                        <div
                            className="explain-heatmap-scroll"
                            tabIndex={0}
                            aria-label="Scrollable context support heatmap"
                        >
                            <SaliencyHeatmap
                                title="Context Support Heatmap"
                                sentences={
                                    heatmapData
                                }
                            />
                        </div>
                    </section>
                )}
            </div>
        </GroupBox>
    );
}