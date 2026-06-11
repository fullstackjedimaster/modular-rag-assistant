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
  sans?: string;
  mono?: string;
};

function applyTheme(theme: HostTheme) {
  const root = document.documentElement;

  for (const [key, value] of Object.entries(theme)) {
    if (!value || typeof value !== "string") continue;
    root.style.setProperty(`--${key}`, value);
  }
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