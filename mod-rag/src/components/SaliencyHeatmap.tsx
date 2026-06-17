"use client";

import { useMemo } from "react";
import type { SentenceScore } from "@/src/lib/types";

export default function SaliencyHeatmap({
                                            title = "Context Relevance",
                                            sentences,
                                        }: {
    title?: string;
    sentences: SentenceScore[];
}) {
    const max = useMemo(
        () => (sentences.length ? Math.max(...sentences.map((s) => s.score)) : 1),
        [sentences]
    );

    return (
        <div className="saliency-card">
            <div className="saliency-title">{title}</div>

            <div className="saliency-list">
                {sentences.map((s) => {
                    const pct = max > 0 ? Math.round((s.score / max) * 100) : 0;

                    return (
                        <div key={s.idx} className="saliency-row">
                            <div className="saliency-meter-shell">
                                <div
                                    className="saliency-meter-fill"
                                    style={{ width: `${Math.max(4, pct)}%` }}
                                />
                            </div>

                            <div className="saliency-sentence">
                                {s.sentence}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}