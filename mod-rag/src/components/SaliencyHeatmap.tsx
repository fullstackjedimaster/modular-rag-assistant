// ai-ui/src/components/SaliencyHeatmap.tsx
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
    const max = useMemo(() => (sentences.length ? Math.max(...sentences.map(s => s.score)) : 1), [sentences]);

    return (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-3">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">{title}</div>
            <div className="space-y-1">
                {sentences.map((s) => {
                    const pct = max > 0 ? Math.round((s.score / max) * 100) : 0;
                    return (
                        <div key={s.idx} className="flex items-start gap-2">
                            <div className="h-4 rounded-md flex-none" style={{ width: `${Math.max(4, pct)}%`, background: `linear-gradient(90deg, rgba(59,130,246,0.15), rgba(59,130,246,0.55))` }} />
                            <div className="text-xs text-gray-800 dark:text-gray-200">{s.sentence}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
