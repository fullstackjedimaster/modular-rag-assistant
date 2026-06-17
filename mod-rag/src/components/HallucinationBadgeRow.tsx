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

    const chip = (
        label: string,
        val: string,
        intent: "good" | "warn" | "bad"
    ) => {
        return (
            <span className={`hallucination-chip hallucination-${intent}`}>
                {label}: {val}
            </span>
        );
    };

    return (
        <div className="hallucination-row">
            {chip("Faithfulness", pct(faithfulness), faithfulness >= 0.8 ? "good" : faithfulness >= 0.6 ? "warn" : "bad")}
            {chip("Coverage", pct(coverage), coverage >= 0.8 ? "good" : coverage >= 0.6 ? "warn" : "bad")}
            {chip("Contradiction", pct(contradictionRisk), contradictionRisk <= 0.1 ? "good" : contradictionRisk <= 0.25 ? "warn" : "bad")}
        </div>
    );
}