"use host";

import { useEffect, useState } from "react";
import {
    EMBED_TOKEN_CHANGE_EVENT,
    getEmbedToken,
} from "@/src/lib/embedTokenStore";

export function useEmbedToken(): string {
    const [token, setToken] = useState("");

    useEffect(() => {
        const refresh = () => setToken(getEmbedToken());
        refresh();
        window.addEventListener(EMBED_TOKEN_CHANGE_EVENT, refresh);
        return () => window.removeEventListener(EMBED_TOKEN_CHANGE_EVENT, refresh);
    }, []);

    return token;
}
