const STORAGE_KEY = "pf_embed_token";
const CHANGE_EVENT = "embed-token-changed";

export function getEmbedToken(): string {
    if (typeof window === "undefined") return "";

    try {
        return window.sessionStorage.getItem(STORAGE_KEY)?.trim() || "";
    } catch {
        return "";
    }
}

export function setEmbedToken(token: string): void {
    if (typeof window === "undefined") return;

    const value = token.trim();
    try {
        if (value) window.sessionStorage.setItem(STORAGE_KEY, value);
        else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage may be unavailable in a hardened browser context.
    }

    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearEmbedToken(): void {
    setEmbedToken("");
}

export const EMBED_TOKEN_CHANGE_EVENT = CHANGE_EVENT;
