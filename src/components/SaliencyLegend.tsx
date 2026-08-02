// ai-ui/src/components/SaliencyLegend.tsx
"use client";

export default function SaliencyLegend() {
    return (
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
            <div className="flex items-center gap-1">
                <span className="inline-block h-3 w-8 rounded-sm" style={{ background: "linear-gradient(90deg, rgba(59,130,246,0.15), rgba(59,130,246,0.55))" }} />
                <span>Sentence support</span>
            </div>
            <div className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm border border-gray-400" />
                <span>Token heat (darker = higher)</span>
            </div>
        </div>
    );
}
