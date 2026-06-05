// daq-ui/src/lib/embedTokenStore.ts
const LS_KEY = "meshdaq_embed_token";

export function getEmbedToken(): string {
    // 1) localStorage
    if (typeof window !== "undefined") {
        try {
            const v = window.localStorage.getItem(LS_KEY);
            if (v && v.trim()) return v.trim();
        } catch {
            // ignore
        }
    }

    // 2) env fallback (bundled at build time)
    const envToken = process.env.NEXT_PUBLIC_EMBED_TOKEN;
    if (envToken && envToken.trim()) return envToken.trim();

    return "";
}

export function setEmbedToken(token: string): void {
    if (typeof window === "undefined") return;
    try {
        if (!token || !token.trim()) {
            window.localStorage.removeItem(LS_KEY);
            return;
        }
        window.localStorage.setItem(LS_KEY, token.trim());
    } catch {
        // ignore
    }
}

export function clearEmbedToken(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(LS_KEY);
    } catch {
        // ignore
    }
}
