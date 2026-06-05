// daq-ui/src/components/EmbedTokenListener.tsx
"use client";

import { useEffect } from "react";
import { setEmbedToken } from "@/lib/embedTokenStore";

function looksLikeJwt(t: string): boolean {
    const s = (t || "").trim().replace(/^Bearer\s+/i, "");
    if (!s) return false;
    if (/\s/.test(s)) return false;
    return (s.match(/\./g) || []).length === 2;
}

export default function EmbedTokenListener() {
    useEffect(() => {
        // Accept token via URL query param when embedded (portfolio iframe)
        try {
            const params = new URLSearchParams(window.location.search);
            const embedded = params.get("embed") === "1" || params.get("dock") === "1";
            const qpRaw = (params.get("embed_token") || "").trim();

            if (embedded && looksLikeJwt(qpRaw)) {
                setEmbedToken(qpRaw);

                // Optional: strip embed_token from URL after storing
                try {
                    const u = new URL(window.location.href);
                    u.searchParams.delete("embed_token");
                    window.history.replaceState({}, "", u.toString());
                } catch {
                    // ignore
                }
            }
        } catch {
            // ignore
        }

        function handleMessage(ev: MessageEvent) {
            // @ts-expect-error cuz
            const data: never = ev.data;
            if (!data || typeof data !== "object") return;

            // Current portfolio format
            // @ts-expect-error cuz
            if (data.kind === "portfolio-embed-token" && typeof data.token === "string") {
                // @ts-expect-error cuz
                const t = data.token;
                if (looksLikeJwt(t)) setEmbedToken(t);
                return;
            }

            // Alternative common format (if you ever send this)
            // @ts-expect-error cuz
            if ((data.type === "SET_EMBED_TOKEN" || data.type === "EMBED_TOKEN") && typeof data.token === "string") {
                // @ts-expect-error cuz
                const t = data.token;
                if (looksLikeJwt(t)) setEmbedToken(t);
            }
        }

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    return null;
}
