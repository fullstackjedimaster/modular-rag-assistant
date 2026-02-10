// app/lib/clientContextApi.ts
export type ContentDocRow = {
    id: number;
    doc_name: string;
    file_path: string;
};

export type ContextMessageRow = {
    name: string;
    value: string;
};

function apiBase(): string {
    return (process.env.NEXT_PUBLIC_AI_RAG_API_BASE || "").replace(/\/+$/, "");
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

export async function listContentDocs(clientId: number): Promise<ContentDocRow[]> {
    return apiFetch<ContentDocRow[]>(`/api/rag-clients/${clientId}/content-docs`);
}

export async function addContentDoc(
    clientId: number,
    body: { doc_name: string; file_path: string }
): Promise<{ id: number }> {
    return apiFetch<{ id: number }>(`/api/rag-clients/${clientId}/content-docs`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function updateContentDoc(
    clientId: number,
    docId: number,
    body: { doc_name: string; file_path: string }
): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-clients/${clientId}/content-docs/${docId}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

export async function deleteContentDoc(clientId: number, docId: number): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-clients/${clientId}/content-docs/${docId}`, {
        method: "DELETE",
    });
}

// -------------------------
// Context Messages
// -------------------------

export async function getContextMessages(clientId: number): Promise<ContextMessageRow[]> {
    const res = await apiFetch<{ rows: ContextMessageRow[] }>(`/api/rag-clients/${clientId}/context-messages`);
    return res.rows || [];
}

export async function saveContextMessages(clientId: number, rows: ContextMessageRow[]): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-clients/${clientId}/context-messages`, {
        method: "PUT",
        body: JSON.stringify({ rows }),
    });
}

// -------------------------
// System Prompt
// -------------------------

export async function getSystemPrompt(clientId: number): Promise<string> {
    const res = await apiFetch<{ text: string }>(`/api/rag-clients/${clientId}/system-prompt`);
    return res.text || "";
}

export async function saveSystemPrompt(clientId: number, text: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(`/api/rag-clients/${clientId}/system-prompt`, {
        method: "PUT",
        body: JSON.stringify({ text }),
    });
}
