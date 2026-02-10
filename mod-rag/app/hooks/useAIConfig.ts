import { useState } from "react";
import { AiConfig } from "@/app/types/aiConfig";

export function useAIConfig(initial: Partial<AiConfig> = {}) {
    const [cfg, setCfg] = useState<AiConfig>({
        provider: "ollama",
        local_model: "phi3:mini",
        num_predict: 128,
        temperature: 0.3,
        top_p: 1.0,
        num_thread: 2,
        num_ctx: 4096,
        embed_provider: "baai",
        embed_model: "BAAI/bge-small-en-v1.5",
        reseed_on_change: false,
        top_k: 5,
        min_similarity: 0.35,
        chunk_size: 512,
        chunk_overlap: 64,
        hallucination_check: false,
        heatmap: false,
        deterministic_seed: null,

        // NEW defaults
        nli_enabled: true,
        llm_judge_enabled: false,
        judge_provider: "heuristic",
        ig_model: "distilroberta-base",

        ...initial,
    });

    function onChange<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
        setCfg((prev) => ({ ...prev, [key]: value }));
    }

    return { cfg, onChange, setCfg };
}
