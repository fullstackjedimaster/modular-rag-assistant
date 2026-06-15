// daq-ui/src/hooks/useEmbedToken.ts
"use client";

import { useEffect, useState } from "react";
import { getEmbedToken, setEmbedToken } from "@/src/lib/embedTokenStore";

export function useEmbedToken(): string {
    const [token, setTokenState] = useState<string>(() => getEmbedToken());

    useEffect(() => {
        function handleMessage(ev: MessageEvent) {
            const data = ev.data;

            if (
                data &&
                typeof data === "object" &&
                data.kind === "portfolio-embed-token" &&
                typeof data.token === "string"
            ) {
                setEmbedToken(data.token);
                setTokenState(data.token);
            }
        }

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    return token;
}