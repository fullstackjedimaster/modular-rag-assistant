"use client";

import { useMemo } from "react";
import type { SentenceScore } from "@/src/lib/types";

type SaliencyHeatmapProps = {
    title?: string;
    sentences: SentenceScore[];
};

function normalizeScore(score: number): number {
    if (!Number.isFinite(score)) {
        return 0;
    }

    return Math.max(0, score);
}

export default function SaliencyHeatmap({
    title = "Context Relevance",
    sentences,
}: SaliencyHeatmapProps) {
    const normalizedSentences = useMemo(
        () =>
            sentences.map((sentence) => ({
                ...sentence,
                score: normalizeScore(sentence.score),
            })),
        [sentences],
    );

    const maxScore = useMemo(() => {
        if (normalizedSentences.length === 0) {
            return 0;
        }

        return Math.max(
            ...normalizedSentences.map((sentence) => sentence.score),
        );
    }, [normalizedSentences]);

    return (
        <div className="saliency-card">
            <div className="saliency-title">{title}</div>

            {normalizedSentences.length > 0 ? (
                <div className="saliency-list">
                    {normalizedSentences.map((sentence, index) => {
                        const relativeScore =
                            maxScore > 0
                                ? (sentence.score / maxScore) * 100
                                : 0;

                        const widthPercent =
                            sentence.score > 0
                                ? Math.min(
                                      100,
                                      Math.max(4, Math.round(relativeScore)),
                                  )
                                : 0;

                        return (
                            <div
                                key={`${sentence.idx}-${index}`}
                                className="saliency-row"
                            >
                                <div
                                    className="saliency-meter-shell"
                                    role="meter"
                                    aria-label={`Support for sentence ${
                                        index + 1
                                    }`}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={widthPercent}
                                >
                                    <div
                                        className="saliency-meter-fill"
                                        style={{
                                            width: `${widthPercent}%`,
                                        }}
                                    />
                                </div>

                                <div className="saliency-sentence">
                                    {sentence.sentence}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="saliency-empty">
                    No support data available.
                </div>
            )}
        </div>
    );
}