
export const settings = {
    AI_RAG_API_BASE: "https://rag.fullstackjedi.dev",
    AI_CORE_BASE: "https://ai-core.fullstackjedi.dev",
    EMBED_LOCK_ENABLED:
        process.env.NEXT_PUBLIC_EMBED_LOCK_ENABLED || "false",
} as const;

export default settings;
