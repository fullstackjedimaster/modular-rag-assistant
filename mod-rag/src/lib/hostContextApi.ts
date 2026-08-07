import { settings } from "@/src/lib/settings";
import { getEmbedToken } from "@/src/lib/embedTokenStore";

export type ContentDocRow = {
    id: string;
    doc_name: string;
    file_path: string;
    created_at?: string;
    updated_at?: string;
};

export type ContextMessageRow = {
    id?: string;
    name: string;
};

function apiBase(): string {
    return (settings.AI_RAG_API_BASE || "").replace(/\/+$/, "");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase()}${path}`, {
        ...init,
        headers: (() => {
            const headers = new Headers(init?.headers || {});
            headers.set("Content-Type", "application/json");

            const embedToken = getEmbedToken();
            if (embedToken) {
                headers.set("X-Embed-Token", embedToken);
            }

            return headers;
        })(),
        cache: "no-store",
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
            `HTTP ${response.status} ${response.statusText}${text ? `\n${text}` : ""}`,
        );
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
}

export async function listContentDocs(hostId: string): Promise<ContentDocRow[]> {
    return apiFetch<ContentDocRow[]>(`/api/rag-hosts/${hostId}/content-docs`);
}

export async function addContentDoc(
    hostId: string,
    body: { doc_name: string; file_path: string },
): Promise<{ id: string }> {
    return apiFetch<{ id: string }>(`/api/rag-hosts/${hostId}/content-docs`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function updateContentDoc(
    hostId: string,
    docId: string,
    body: { doc_name: string; file_path: string },
): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(
        `/api/rag-hosts/${hostId}/content-docs/${docId}`,
        { method: "PUT", body: JSON.stringify(body) },
    );
}

export async function deleteContentDoc(
    hostId: string,
    docId: string,
): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(
        `/api/rag-hosts/${hostId}/content-docs/${docId}`,
        { method: "DELETE" },
    );
}

export async function getContextMessages(
    hostId: string,
): Promise<ContextMessageRow[]> {
    const result = await apiFetch<{ rows: ContextMessageRow[] }>(
        `/api/rag-hosts/${hostId}/context-messages`,
    );
    return result.rows || [];
}

export async function saveContextMessages(
    hostId: string,
    rows: ContextMessageRow[],
): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(
        `/api/rag-hosts/${hostId}/context-messages`,
        { method: "PUT", body: JSON.stringify({ rows }) },
    );
}

export async function getSystemPrompt(hostId: string): Promise<string> {
    const result = await apiFetch<{ text: string }>(
        `/api/rag-hosts/${hostId}/system-prompt`,
    );
    return result.text || "";
}

export async function saveSystemPrompt(
    hostId: string,
    text: string,
): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>(
        `/api/rag-hosts/${hostId}/system-prompt`,
        { method: "PUT", body: JSON.stringify({ text }) },
    );
}
