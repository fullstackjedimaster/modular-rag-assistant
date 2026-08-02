"use client";

type MetricIntent = "good" | "warn" | "bad";

type HallucinationBadgeRowProps = {
    coverage: number;
    contradictionRisk: number;
    faithfulness: number;
};

function clampMetric(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(1, Math.max(0, value));
}

function formatPercent(value: number): string {
    return `${Math.round(clampMetric(value) * 100)}%`;
}

function supportIntent(value: number): MetricIntent {
    const normalized = clampMetric(value);

    if (normalized >= 0.8) {
        return "good";
    }

    if (normalized >= 0.6) {
        return "warn";
    }

    return "bad";
}

function contradictionIntent(value: number): MetricIntent {
    const normalized = clampMetric(value);

    if (normalized <= 0.1) {
        return "good";
    }

    if (normalized <= 0.25) {
        return "warn";
    }

    return "bad";
}

function MetricChip({
    label,
    value,
    intent,
}: {
    label: string;
    value: number;
    intent: MetricIntent;
}) {
    return (
        <span
            className={`hallucination-chip hallucination-${intent}`}
            title={`${label}: ${formatPercent(value)}`}
        >
            {label}: {formatPercent(value)}
        </span>
    );
}

export default function HallucinationBadgeRow({
    coverage,
    contradictionRisk,
    faithfulness,
}: HallucinationBadgeRowProps) {
    return (
        <div
            className="hallucination-row"
            aria-label="Answer evaluation metrics"
        >
            <MetricChip
                label="Faithfulness"
                value={faithfulness}
                intent={supportIntent(faithfulness)}
            />

            <MetricChip
                label="Coverage"
                value={coverage}
                intent={supportIntent(coverage)}
            />

            <MetricChip
                label="Contradiction"
                value={contradictionRisk}
                intent={contradictionIntent(contradictionRisk)}
            />
        </div>
    );
}