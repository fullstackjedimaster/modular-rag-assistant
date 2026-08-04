// app/lib/ragHostApi.tS

import { settings } from "@/src/lib/settings";

export type RagHostRow = {
    id: string;
    name: string;
    host_url: string;
}

export type RagHostFull = {
    id: string;
    name: string;
    host_url: string;
    collection:string;
    llm_model: string;
    embed_model: string;
    prompt: string;
    chaining_mode: PromptChainingMode;
    telemetry_messages: TelemetryMessage[];
};

export type RagHostStatus = {
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
};

export type PromptChainingMode = "append" | "replace" | "none";


export type CreateRagHostIn = { name: string; host_url: string };
export type UpdateRagHostIn = { name: string; host_url: string };

function apiBase(): string {
    const v = (settings.AI_RAG_API_BASE || "").replace(/\/+$/, "");

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

// List configured hosts
export async function listRagHosts(): Promise<RagHostRow[]> {
    return apiFetch<RagHostRow[]>("/api/rag-hosts");
}

// Full single host (nested context/docs/messages/prompts)
export async function getRagHost(id: string): Promise<RagHostFull> {
    return apiFetch<RagHostFull>(`/api/rag-hosts/${id}`);
}

// Create
export async function createRagHost(body: CreateRagHostIn): Promise<{ id: string }> {
    return apiFetch<{ id: string }>(`/api/rag-hosts`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

// Update
export async function updateRagHost(id: string, body: UpdateRagHostIn): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-hosts/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

// Delete
export async function deleteRagHost(id: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-hosts/${id}`, { method: "DELETE" });
}

// Status map by ID
export async function getRagHostStatuses(ids: string[]): Promise<Record<string, RagHostStatus>> {
    const q = ids.map((x) => `id=${encodeURIComponent(String(x))}`).join("&");
    return apiFetch<Record<string, RagHostStatus>>(`/api/rag-hosts/status?${q}`);
}

// Trigger dock injection / connect
export async function connectRagHost(id: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-hosts/${id}/connect`, { method: "POST" });
}

// Disconnect
export async function disconnectRagHost(id: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-hosts/${id}/disconnect`, { method: "POST" });
}
