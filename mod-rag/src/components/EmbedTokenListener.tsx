"use host";

import { useEffect } from "react";
import { setEmbedToken } from "@/src/lib/embedTokenStore";

type EmbedTokenMessage = {
    type: "EMBED_TOKEN";
    token: string;
};

function parentOrigin(): string {
    const configured = new URLSearchParams(window.location.search).get(
        "embedParentOrigin",
    );

    if (configured) {
        try {
            return new URL(configured).origin;
        } catch {
            // Fall through to document.referrer.
        }
    }

    if (document.referrer) {
        try {
            return new URL(document.referrer).origin;
        } catch {
            // No trusted parent origin is available.
        }
    }

    return "";
}

function isEmbedTokenMessage(value: unknown): value is EmbedTokenMessage {
    if (!value || typeof value !== "object") return false;

    const message = value as Partial<EmbedTokenMessage>;
    return message.type === "EMBED_TOKEN" && typeof message.token === "string";
}

export default function EmbedTokenListener() {
    useEffect(() => {
        if (window.parent === window) return;

        const trustedParentOrigin = parentOrigin();
        if (!trustedParentOrigin) return;

        function onMessage(event: MessageEvent<unknown>): void {
            if (event.source !== window.parent) return;
            if (event.origin !== trustedParentOrigin) return;
            if (!isEmbedTokenMessage(event.data)) return;

            setEmbedToken(event.data.token);
        }

        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    return null;
}
