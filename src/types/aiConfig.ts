export type Provider = "ollama" | "openai";
export type EmbedProvider = "baai" | "openai" | "intfloat" | "local";
export type JudgeProvider = "heuristic" | "openai" | "ollama";

export type AiConfig = {
    // LLM
    provider: Provider;
    local_model: string;
    num_predict: number;
    temperature: number;
    top_p: number;
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

    // Diagnostics (existing)
    hallucination_check?: boolean;
    heatmap?: boolean;
    deterministic_seed?: number | null;

    // Diagnostics (new)
    nli_enabled?: boolean;              // NEW
    llm_judge_enabled?: boolean;        // NEW
    judge_provider?: JudgeProvider;     // NEW
    ig_model?: string;                  // NEW
};
