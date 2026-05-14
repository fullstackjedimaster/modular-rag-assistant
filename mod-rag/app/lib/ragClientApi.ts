// app/lib/ragClientApi.ts
export type RagClientRow = {
    id: string;
    name: string;
    host_url: string;
}

export type RagClientFull = {
    id: string;
    name: string;
    host_url: string;
    collection:string;
    llm_model: string;
    embed_model: string;
    prompt: string;
    chaining_mode: PromptChainingMode;
    content_docs:ContentDoc[];
    telemetry_messages: TelemetryMessage[];
};

export type RagClientStatus = {
    connected: boolean;
    detail?: string;
    last_seen_at?: string;
};

export type ContentDoc = {
    id: string;
    doc_name: string;
    file_path: string;
};

export type TelemetryMessage = {
    id: string;
    message_name: string;
    message_value: string;
};

export type PromptChainingMode = "append" | "replace" | "none";


export type CreateRagClientIn = { name: string; host_url: string };
export type UpdateRagClientIn = { name: string; host_url: string };

function apiBase(): string {
    const v = (process.env.NEXT_PUBLIC_AI_RAG_API_BASE || "").replace(/\/+$/, "");
    if (typeof window !== "undefined") console.log("AI_RAG_API_BASE =", v);
    return v;

}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const base = apiBase();
    const url = `${base}${path}`;

    const resp = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
        },
        cache: "no-store",
    });

    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status} ${resp.statusText}${text ? `\n${text}` : ""}`);
    }

    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
        return (await resp.json()) as T;
    }
    return (await resp.text()) as unknown as T;
}

// List configured clients
export async function listRagClients(): Promise<RagClientRow[]> {
    return apiFetch<RagClientRow[]>("/api/rag-clients");
}

// Full single client (nested context/docs/messages/prompts)
export async function getRagClient(id: string): Promise<RagClientFull> {
    return apiFetch<RagClientFull>(`/api/rag-clients/${id}`);
}

// Create
export async function createRagClient(body: CreateRagClientIn): Promise<{ id: string }> {
    return apiFetch<{ id: string }>(`/api/rag-clients`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

// Update
export async function updateRagClient(id: string, body: UpdateRagClientIn): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-clients/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

// Delete
export async function deleteRagClient(id: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-clients/${id}`, { method: "DELETE" });
}

// Status map by ID
export async function getRagClientStatuses(ids: string[]): Promise<Record<string, RagClientStatus>> {
    const q = ids.map((x) => `id=${encodeURIComponent(String(x))}`).join("&");
    return apiFetch<Record<string, RagClientStatus>>(`/api/rag-clients/status?${q}`);
}

// Trigger dock injection / connect
export async function connectRagClient(id: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-clients/${id}/connect`, { method: "POST" });
}

// Disconnect
export async function disconnectRagClient(id: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-clients/${id}/disconnect`, { method: "POST" });
}
