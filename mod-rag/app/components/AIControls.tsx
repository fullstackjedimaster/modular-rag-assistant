"use client";

import React, { useMemo } from "react";
import GroupBox from "@/app/components/GroupBox";

type Provider = "ollama" | "openai";
type EmbedProvider = "baai" | "openai" | "intfloat" | "local";

export type AIConfig = {
    // LLM
    provider: Provider;
    local_model: string;
    num_predict: number; // max tokens
    temperature: number;
    top_p: number;
    // provider-specific (Ollama)
    num_thread: number;
    num_ctx: number;

    // Retrieval
    top_k: number;
    min_similarity?: number | null;
    chunk_size?: number | null;
    chunk_overlap?: number | null;

    // Embeddings
    embed_provider?: EmbedProvider;
    embed_model: string;
    reseed_on_change: boolean;

    // Diagnostics
    hallucination_check?: boolean;
    heatmap?: boolean;
    deterministic_seed?: number | null;
};

export type AIControlsProps = {
    cfg: AIConfig;
    busy: boolean;
    log: string;

    /** Model lists by provider (to keep this presentational) */
    llmModels: Record<Provider, string[]>;
    embedChoices: string[];

    /** Handlers */
    onChange<K extends keyof AIConfig>(key: K, value: AIConfig[K]): void;
    onApplyAnalyze(): void;
    onSeedNow(): void;

    /**
     * Modular-assistant mode:
     * - collapse most panels by default
     * - show compact summaries in the headers
     */
    collapseByDefault?: boolean;

    /**
     * If true, the “Indexing/Seeding” and “Diagnostics” sections are collapsed too.
     * (In Modular Assistant you probably want this true.)
     */
    collapseEverything?: boolean;
};

function SummaryPill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] bg-white">
      {children}
    </span>
    );
}

function CollapsibleSection(props: {
    title: string;
    defaultOpen: boolean;
    summaryRight?: React.ReactNode;
    children: React.ReactNode;
}) {
    const { title, defaultOpen, summaryRight, children } = props;

    return (
        <details className="group" open={defaultOpen}>
            <summary className="cursor-pointer list-none select-none flex items-center justify-between gap-2 py-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{title}</span>
                    <span className="text-[10px] text-gray-500 group-open:hidden">(collapsed)</span>
                </div>
                {summaryRight ? <div className="flex flex-wrap gap-1 justify-end">{summaryRight}</div> : null}
            </summary>
            <div className="mt-2">{children}</div>
        </details>
    );
}

export default function AIControls({
                                       cfg,
                                       busy,
                                       log,
                                       llmModels,
                                       embedChoices,
                                       onChange,
                                       onApplyAnalyze,
                                       onSeedNow,
                                       collapseByDefault = true,
                                       collapseEverything = true,
                                   }: AIControlsProps) {
    const isOllama = cfg.provider === "ollama";

    const llmSummary = useMemo(() => {
        const p = cfg.provider === "ollama" ? "Ollama" : "OpenAI";
        return (
            <>
                <SummaryPill>{p}</SummaryPill>
                <SummaryPill>{cfg.local_model}</SummaryPill>
                <SummaryPill>t={cfg.temperature}</SummaryPill>
                <SummaryPill>max={cfg.num_predict}</SummaryPill>
            </>
        );
    }, [cfg.provider, cfg.local_model, cfg.temperature, cfg.num_predict]);

    const embedSummary = useMemo(() => {
        const p = (cfg.embed_provider || "baai").toUpperCase();
        return (
            <>
                <SummaryPill>{p}</SummaryPill>
                <SummaryPill>{cfg.embed_model}</SummaryPill>
                {cfg.reseed_on_change ? <SummaryPill>reseed</SummaryPill> : <SummaryPill>no-reseed</SummaryPill>}
            </>
        );
    }, [cfg.embed_provider, cfg.embed_model, cfg.reseed_on_change]);

    const ragSummary = useMemo(() => {
        return (
            <>
                <SummaryPill>top_k={cfg.top_k}</SummaryPill>
                <SummaryPill>min_sim={cfg.min_similarity ?? "—"}</SummaryPill>
                <SummaryPill>chunk={cfg.chunk_size ?? "—"}</SummaryPill>
            </>
        );
    }, [cfg.top_k, cfg.min_similarity, cfg.chunk_size]);

    const diagSummary = useMemo(() => {
        return (
            <>
                <SummaryPill>halluc={cfg.hallucination_check ? "on" : "off"}</SummaryPill>
                <SummaryPill>heatmap={cfg.heatmap ? "on" : "off"}</SummaryPill>
                <SummaryPill>seed={cfg.deterministic_seed ?? "rand"}</SummaryPill>
            </>
        );
    }, [cfg.hallucination_check, cfg.heatmap, cfg.deterministic_seed]);

    // Default open behavior:
    // - For Modular Assistant, keep everything collapsed unless user opens.
    const openLLM = !collapseByDefault;
    const openEmb = !collapseByDefault;
    const openRAG = !collapseByDefault;
    const openSeed = !collapseEverything ? true : false;
    const openDiag = !collapseEverything ? true : false;

    return (
        <div className="grid gap-3">
            {/* LLM + Embeddings (collapsed by default) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CollapsibleSection title="LLM Inference" defaultOpen={openLLM} summaryRight={llmSummary}>
                    <GroupBox title="LLM Inference">
                        <label className="block text-[10px] mb-1">Provider</label>
                        <select
                            className="w-full rounded-xl border p-2 mb-2 dark:bg-gray-900 dark:border-gray-700"
                            value={cfg.provider}
                            onChange={(e) => {
                                const provider = e.target.value as Provider;
                                const firstModel = llmModels[provider]?.[0] ?? "";
                                onChange("provider", provider);
                                if (firstModel) onChange("local_model", firstModel);
                            }}
                            disabled={busy}
                        >
                            <option value="ollama">Ollama</option>
                            <option value="openai">OpenAI</option>
                        </select>

                        <label className="block text-[10px] mb-1">Model</label>
                        <select
                            className="w-full rounded-xl border p-2 mb-2 dark:bg-gray-900 dark:border-gray-700"
                            value={cfg.local_model}
                            onChange={(e) => onChange("local_model", e.target.value)}
                            disabled={busy}
                        >
                            {(llmModels[cfg.provider] || []).map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] mb-1">Temperature</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={2}
                                    step={0.1}
                                    className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                    value={cfg.temperature}
                                    onChange={(e) => onChange("temperature", Number(e.target.value))}
                                    disabled={busy}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] mb-1">Top-p</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                    value={cfg.top_p}
                                    onChange={(e) => onChange("top_p", Number(e.target.value))}
                                    disabled={busy}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] mb-1">Max tokens</label>
                                <input
                                    type="number"
                                    min={16}
                                    max={8192}
                                    step={16}
                                    className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                    value={cfg.num_predict}
                                    onChange={(e) => onChange("num_predict", Number(e.target.value))}
                                    disabled={busy}
                                />
                            </div>

                            {isOllama && (
                                <>
                                    <div>
                                        <label className="block text-[10px] mb-1">Threads</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={128}
                                            className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                            value={cfg.num_thread}
                                            onChange={(e) => onChange("num_thread", Number(e.target.value))}
                                            disabled={busy}
                                            placeholder="0 = auto"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] mb-1">Context</label>
                                        <input
                                            type="number"
                                            min={512}
                                            max={16384}
                                            step={128}
                                            className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                            value={cfg.num_ctx}
                                            onChange={(e) => onChange("num_ctx", Number(e.target.value))}
                                            disabled={busy}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <details className="mt-2">
                            <summary className="text-xs cursor-pointer">System prompt (optional)</summary>
                            <textarea
                                className="mt-2 w-full h-20 rounded-xl border p-2 text-sm dark:bg-gray-900 dark:border-gray-700"
                                placeholder="(Optional) override system prompt for this usecase"
                                disabled={busy}
                            />
                        </details>
                    </GroupBox>
                </CollapsibleSection>

                <CollapsibleSection title="Embeddings" defaultOpen={openEmb} summaryRight={embedSummary}>
                    <GroupBox title="Embeddings">
                        <label className="block text-[10px] mb-1">Provider</label>
                        <select
                            className="w-full rounded-xl border p-2 mb-2 dark:bg-gray-900 dark:border-gray-700"
                            value={cfg.embed_provider ?? "baai"}
                            onChange={(e) => onChange("embed_provider", e.target.value as EmbedProvider)}
                            disabled={busy}
                        >
                            <option value="baai">BAAI</option>
                            <option value="openai">OpenAI</option>
                            <option value="intfloat">intfloat</option>
                            <option value="local">Local</option>
                        </select>

                        <label className="block text-[10px] mb-1">Model</label>
                        <select
                            className="w-full rounded-xl border p-2 mb-2 dark:bg-gray-900 dark:border-gray-700"
                            value={cfg.embed_model}
                            onChange={(e) => onChange("embed_model", e.target.value)}
                            disabled={busy}
                        >
                            {embedChoices.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>

                        <label className="inline-flex items-center gap-2 mt-2 text-[10px]">
                            <input
                                type="checkbox"
                                checked={!!cfg.reseed_on_change}
                                onChange={(e) => onChange("reseed_on_change", e.target.checked)}
                                disabled={busy}
                            />
                            Reseed if embedding model changed
                        </label>
                    </GroupBox>
                </CollapsibleSection>
            </div>

            {/* Retrieval + Seeding (collapsed by default) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CollapsibleSection title="Retrieval (RAG)" defaultOpen={openRAG} summaryRight={ragSummary}>
                    <GroupBox title="Retrieval (RAG)">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] mb-1">Top-K</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                    value={cfg.top_k}
                                    onChange={(e) => onChange("top_k", Number(e.target.value))}
                                    disabled={busy}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] mb-1">Min similarity</label>
                                <input
                                    type="number"
                                    step={0.01}
                                    min={0}
                                    max={1}
                                    className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                    value={cfg.min_similarity ?? ""}
                                    onChange={(e) => onChange("min_similarity", e.target.value === "" ? null : Number(e.target.value))}
                                    disabled={busy}
                                    placeholder="0.00–1.00"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] mb-1">Chunk size</label>
                                <input
                                    type="number"
                                    className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                    value={cfg.chunk_size ?? ""}
                                    onChange={(e) => onChange("chunk_size", e.target.value === "" ? null : Number(e.target.value))}
                                    disabled={busy}
                                    placeholder="e.g., 512"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] mb-1">Chunk overlap</label>
                                <input
                                    type="number"
                                    className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                    value={cfg.chunk_overlap ?? ""}
                                    onChange={(e) => onChange("chunk_overlap", e.target.value === "" ? null : Number(e.target.value))}
                                    disabled={busy}
                                    placeholder="e.g., 64"
                                />
                            </div>
                        </div>

                        <details className="mt-2">
                            <summary className="text-xs cursor-pointer">Source filters (optional)</summary>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <input className="rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700" placeholder="tag: faults" disabled={busy} />
                                <input className="rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700" placeholder="date range" disabled={busy} />
                            </div>
                        </details>
                    </GroupBox>
                </CollapsibleSection>

                <CollapsibleSection title="Indexing / Seeding" defaultOpen={openSeed} summaryRight={<SummaryPill>actions</SummaryPill>}>
                    <GroupBox title="Indexing / Seeding">
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={onSeedNow}
                                disabled={busy}
                                className="px-3 py-2 rounded-2xl border hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                            >
                                Seed Now
                            </button>
                            <button
                                onClick={onApplyAnalyze}
                                disabled={busy}
                                className="px-3 py-2 rounded-2xl border hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                                title="Apply config and re-run; reseeding occurs automatically if enabled"
                            >
                                Apply & Analyze
                            </button>
                        </div>

                        {log ? (
                            <details className="mt-2" open>
                                <summary className="text-xs cursor-pointer">Progress & Log</summary>
                                <pre className="mt-2 h-28 overflow-auto rounded-xl border p-2 text-[11px] dark:bg-gray-900 dark:border-gray-700">
                  {log}
                </pre>
                            </details>
                        ) : null}
                    </GroupBox>
                </CollapsibleSection>
            </div>

            <CollapsibleSection title="Diagnostics (Advanced)" defaultOpen={openDiag} summaryRight={diagSummary}>
                <GroupBox title="Diagnostics (Advanced)">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="rounded"
                                checked={!!cfg.hallucination_check}
                                onChange={(e) => onChange("hallucination_check", e.target.checked)}
                                disabled={busy}
                            />
                            Hallucination checks
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="rounded"
                                checked={!!cfg.heatmap}
                                onChange={(e) => onChange("heatmap", e.target.checked)}
                                disabled={busy}
                            />
                            Heatmap / saliency
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] mb-1">Deterministic seed</label>
                                <input
                                    type="number"
                                    className="w-full rounded-xl border p-2 dark:bg-gray-900 dark:border-gray-700"
                                    value={cfg.deterministic_seed ?? ""}
                                    onChange={(e) => onChange("deterministic_seed", e.target.value === "" ? null : Number(e.target.value))}
                                    disabled={busy}
                                    placeholder="blank = random"
                                />
                            </div>
                        </div>
                    </div>
                </GroupBox>
            </CollapsibleSection>
        </div>
    );
}
