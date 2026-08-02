// ai-ui/src/lib/types.ts
export type SentenceScore = { sentence: string; score: number; idx: number };

export type HallucinationReport = {
    coverage: number;
    contradiction_risk: number;
    hallucination_estimate: number;
    faithfulness: number;
    per_context_saliency: {
        sentences: SentenceScore[];
        token_saliency: { token: string; score: number }[];
    }[];
    judge?: JudgePayload | null;
};


export type SaliencyMap = {
    sentence_scores: SentenceScore[];
    token_saliency: { token: string; score: number }[];
};


export type JudgePayload = {
    provider: "heuristic" | "openai" | "ollama" | string;
    verdict: "supported" | "partially_supported" | "unsupported" | "possibly_unsupported" | string;
    risk: number; // 0..1
    rationale: string;
};

export type TokenIGSaliency = {
    model: string;
    premise_used: boolean;
    tokens: string[];
    saliency: { token: string; score: number }[];
};
