// mod-rag/src/components/dock/HostThemeReceiver.tsx
"use client";

import { useEffect } from "react";

type HostTheme = {
    bg?: string;
    card?: string;
    border?: string;
    text?: string;
    muted?: string;
    accent?: string;
    ok?: string;
    err?: string;
    font?: string;
    mono?: string;
};

function applyTheme(theme: HostTheme) {
    const root = document.documentElement;

    if (theme.bg) root.style.setProperty("--bg", theme.bg);
    if (theme.card) root.style.setProperty("--card", theme.card);
    if (theme.border) root.style.setProperty("--border", theme.border);
    if (theme.text) root.style.setProperty("--text", theme.text);
    if (theme.muted) root.style.setProperty("--muted", theme.muted);
    if (theme.accent) root.style.setProperty("--accent", theme.accent);
    if (theme.ok) root.style.setProperty("--ok", theme.ok);
    if (theme.err) root.style.setProperty("--err", theme.err);
    if (theme.font) root.style.setProperty("--sans", theme.font);
    if (theme.mono) root.style.setProperty("--mono", theme.mono);
}

export default function HostThemeReceiver() {
    useEffect(() => {
        function onMessage(ev: MessageEvent) {
            const data = ev.data;

            if (!data || typeof data !== "object") return;
            if (data.type !== "RAG_HOST_THEME") return;
            if (!data.theme || typeof data.theme !== "object") return;

            applyTheme(data.theme);
        }

        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    return null;
}