// /src/lib/env.ts

function required(name: string, value?: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const settings = {
  AI_RAG_API_BASE:
    process.env.NEXT_PUBLIC_AI_RAG_API_BASE ||
     "https://rag.fullstackjedi.dev",


  AI_CORE_BASE:
     process.env.NEXT_PUBLIC_AI_CORE_BASE ||
     "https://ai-core.fullstackjedi.dev",

  DATABASE_URL:
   process.env.DATABASE_URL ||
     ""


} as const;

export default settings;