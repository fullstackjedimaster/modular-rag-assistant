// app/lib/hostContextApi.ts
import {settings} from "@/src/lib/settings";

export type ContentDocRow = {
    id: string;
    doc_name: string;
    file_path: string;
};

export type ContextMessageRow = {
    name: string;
    value: string;
};

function apiBase(): string {
    return (settings.AI_RAG_API_BASE || "").replace(/\/+$/, "");
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
    if (ct.includes("application/json")) return (await resp.json()) as T;
    return (await resp.text()) as unknown as T;
}

// -------------------------
// Content Docs (DB rows)
// -------------------------

export async function listContentDocs(hostId: string): Promise<ContentDocRow[]> {
    return apiFetch<ContentDocRow[]>(`/api/rag-hosts/${hostId}/content-docs`);
}

export async function addContentDoc(
    hostId: string,
    body: { doc_name: string; file_path: string }
): Promise<{ id: string }> {
    return apiFetch<{ id: string }>(`/api/rag-hosts/${hostId}/content-docs`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function updateContentDoc(
    hostId: string,
    docId: string,
    body: { doc_name: string; file_path: string }
): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-hosts/${hostId}/content-docs/${docId}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

export async function deleteContentDoc(hostId: string, docId: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-hosts/${hostId}/content-docs/${docId}`, {
        method: "DELETE",
    });
}

// -------------------------
// Context Messages
// -------------------------

export async function getContextMessages(hostId: number): Promise<ContextMessageRow[]> {
    const res = await apiFetch<{ rows: ContextMessageRow[] }>(`/api/rag-hosts/${hostId}/context-messages`);
    return res.rows || [];
}

export async function saveContextMessages(hostId: number, rows: ContextMessageRow[]): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-hosts/${hostId}/context-messages`, {
        method: "PUT",
        body: JSON.stringify({ rows }),
    });
}

// -------------------------
// System Prompt
// -------------------------

export async function getSystemPrompt(hostId: string): Promise<string> {
    const res = await apiFetch<{ text: string }>(`/api/rag-hosts/${hostId}/system-prompt`);
    return res.text || "";
}

export async function saveSystemPrompt(hostId: string, text: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-hosts/${hostId}/system-prompt`, {
        method: "PUT",
        body: JSON.stringify({ text }),
    });
}
