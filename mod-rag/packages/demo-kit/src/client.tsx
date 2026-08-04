"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getEmbedToken, setEmbedToken, subscribeEmbedToken } from "./token-store";

export type EmbedHeightReporterProps = {
  contentRootId?: string;
  minHeight?: number;
  maxHeight?: number;
  settleDelaysMs?: number[];
};

function trustedParentOrigin(): string {
  const configured = new URLSearchParams(window.location.search).get("embedParentOrigin");
  if (configured) {
    try { return new URL(configured).origin; } catch { /* fall through */ }
  }
  if (document.referrer) {
    try { return new URL(document.referrer).origin; } catch { /* no trusted origin */ }
  }
  return "";
}

export function useEmbedMode(): boolean {
  const query = typeof window === "undefined" ? false : new URLSearchParams(window.location.search).get("embed") === "1";
  return typeof window !== "undefined" && (query || window.parent !== window);
}

export function EmbedTokenListener(): null {
  useEffect(() => {
    if (window.parent === window) return;
    const origin = trustedParentOrigin();
    if (!origin) return;

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || event.origin !== origin) return;
      const data = event.data as { type?: unknown; token?: unknown };
      if (data?.type === "EMBED_TOKEN" && typeof data.token === "string") {
        setEmbedToken(data.token);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return null;
}

export function useEmbedToken(): string {
  return useSyncExternalStore(subscribeEmbedToken, getEmbedToken, () => "");
}

export function EmbedHeightReporter({
  contentRootId,
  minHeight = 1,
  maxHeight = 6000,
  settleDelaysMs = [0, 60, 180, 450, 900],
}: EmbedHeightReporterProps): null {
  useEffect(() => {
    if (window.parent === window) return;
    const origin = trustedParentOrigin();
    if (!origin) return;

    let last = 0;
    const root = contentRootId ? document.getElementById(contentRootId) : null;
    const measure = () => {
      const candidates = [
        root?.scrollHeight ?? 0,
        root?.getBoundingClientRect().height ?? 0,
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.getBoundingClientRect().height,
        document.body.getBoundingClientRect().height,
      ];
      const height = Math.max(minHeight, Math.min(maxHeight, Math.ceil(Math.max(...candidates))));
      if (Math.abs(height - last) < 2) return;
      last = height;
      window.parent.postMessage({ type: "EMBED_HEIGHT", height }, origin);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    if (root) observer.observe(root);

    const mutation = new MutationObserver(measure);
    mutation.observe(root ?? document.body, { childList: true, subtree: true, attributes: true });

    const timers = settleDelaysMs.map((delay) => window.setTimeout(measure, delay));
    window.addEventListener("load", measure);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      observer.disconnect();
      mutation.disconnect();
      timers.forEach(window.clearTimeout);
      window.removeEventListener("load", measure);
      window.removeEventListener("resize", measure);
    };
  }, [contentRootId, minHeight, maxHeight, settleDelaysMs]);
  return null;
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${b}${p}` : path;
}

export async function embedAwareFetch(
  input: string,
  init: RequestInit = {},
  apiBase = "",
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const token = getEmbedToken();
  if (token) headers.set("X-Embed-Token", token);
  return fetch(joinUrl(apiBase, input), {
    ...init,
    headers,
    credentials: init.credentials ?? "omit",
  });
}

export function useEmbedAwareFetch(apiBase = "") {
  const token = useEmbedToken();
  const apiFetch = async (input: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers ?? {});
    if (token) headers.set("X-Embed-Token", token);
    return fetch(joinUrl(apiBase, input), {
      ...init,
      headers,
      credentials: init.credentials ?? "omit",
    });
  };
  return { apiFetch, token };
}
