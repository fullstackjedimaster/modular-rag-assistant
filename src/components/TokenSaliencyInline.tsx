// ai-ui/src/components/TokenSaliencyInline.tsx
"use client";

import { useMemo, useState } from "react";

type Item = { token: string; score: number };

function Tooltip({ text }: { text: string }) {
    return (
        <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white shadow">
            {text}
        </div>
    );
}

export default function TokenSaliencyInline({
                                                tokens,
                                                className = "",
                                            }: {
    tokens: Item[];
    className?: string;
}) {
    const max = useMemo(() => (tokens.length ? Math.max(...tokens.map(t => t.score)) : 1), [tokens]);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    return (
        <div className={`relative leading-7 ${className}`}>
            {tokens.map((t, i) => {
                // light → dark via score; avoid setting explicit color values beyond alpha gradient
                const alpha = max > 0 ? t.score / max : 0;
                const bg = `rgba(59,130,246,${0.12 + 0.28 * alpha})`;
                const showTip = hoverIdx === i;
                const clean = t.token.replace(/^▁/g, ""); // sentencepiece underscore
                const display = clean === "" ? " " : clean;

                return (
                    <span
                        key={i}
                        className="relative rounded-sm"
                        style={{ background: alpha > 0.02 ? bg : "transparent", padding: "0 1px", marginRight: 1 }}
                        onMouseEnter={() => setHoverIdx(i)}
                        onMouseLeave={() => setHoverIdx(null)}
                    >
            {display}
                        {showTip && <Tooltip text={`${(t.score * 100).toFixed(0)}% support`} />}
          </span>
                );
            })}
        </div>
    );
}
