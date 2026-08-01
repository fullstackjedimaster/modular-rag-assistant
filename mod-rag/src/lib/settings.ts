function required(name: string, value: string | undefined): string {
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

export const settings = {
    AI_RAG_API_BASE: required(
        "NEXT_PUBLIC_AI_RAG_API_BASE",
        process.env.NEXT_PUBLIC_AI_RAG_API_BASE,
    ),
    AI_CORE_BASE: required(
        "NEXT_PUBLIC_AI_CORE_BASE",
        process.env.NEXT_PUBLIC_AI_CORE_BASE,
    ),
    EMBED_LOCK_ENABLED:
        process.env.NEXT_PUBLIC_EMBED_LOCK_ENABLED,
} as const;

export default settings;
