"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    eruda?: {
      init: () => void;
      destroy?: () => void;
    };
    __ERUDA_LOADED__?: boolean;
  }
}

type ErudaLoaderProps = {
  enabled?: boolean;
};

export default function ErudaLoader({ enabled = false }: ErudaLoaderProps) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    if (window.__ERUDA_LOADED__) {
      return;
    }

    const existing = document.getElementById("eruda-script");
    if (existing) {
      window.__ERUDA_LOADED__ = true;
      return;
    }

    const script = document.createElement("script");
    script.id = "eruda-script";
    script.src = "https://cdn.jsdelivr.net/npm/eruda";
    script.async = true;

    script.onload = () => {
      try {
        if (!window.eruda) return;
        window.eruda.init();
        window.__ERUDA_LOADED__ = true;
        console.log("[debug] Eruda initialized.");
      } catch (err) {
        console.error("[debug] Failed to initialize Eruda:", err);
      }
    };

    script.onerror = () => {
      console.error("[debug] Failed to load Eruda script.");
    };

    document.body.appendChild(script);

    return () => {
      // Intentionally do not auto-destroy. Keeping it alive avoids re-init glitches
      // when React remounts components during navigation.
    };
  }, [enabled]);

  return null;
}
