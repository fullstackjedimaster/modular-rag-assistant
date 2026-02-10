// ai-ui/src/components/HallucinationBadgeRow.tsx
"use client";

export default function HallucinationBadgeRow({
                                                  coverage,
                                                  contradictionRisk,
                                                  faithfulness,
                                              }: {
    coverage: number;
    contradictionRisk: number;
    faithfulness: number;
}) {
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const chip = (label: string, val: string, intent: "good" | "warn" | "bad") => {
        const cls =
            intent === "good"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : intent === "warn"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
        return <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{label}: {val}</span>;
    };

    return (
        <div className="flex flex-wrap gap-2 items-center">
            {chip("Faithfulness", pct(faithfulness), faithfulness >= 0.8 ? "good" : faithfulness >= 0.6 ? "warn" : "bad")}
            {chip("Coverage", pct(coverage), coverage >= 0.8 ? "good" : coverage >= 0.6 ? "warn" : "bad")}
            {chip("Contradiction", pct(contradictionRisk), contradictionRisk <= 0.1 ? "good" : contradictionRisk <= 0.25 ? "warn" : "bad")}
        </div>
    );
}
