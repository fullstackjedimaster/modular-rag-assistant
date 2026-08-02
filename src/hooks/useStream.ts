// /ai-ui/src/hooks/useStream.ts
"use client";

import {useCallback, useEffect, useRef, useState} from "react";

export type ProgressInfo = {
    elapsed: number;
    chars: number;
    approx_tokens: number;
    rate_cps: number;
    status?: string;
    note?: string;
    done?: boolean;
};

export type ToastType = "info" | "success" | "error";

export type UseStreamOptions = {
    url: string;
    /** Prefer SSE; if server falls back to text/plain, the hook auto-fetches. */
    forceSSE?: boolean;
    /** How long (ms) without any bytes before declaring a stall. */
    stallMs?: number;        // default 15000
    /** HUD heartbeat interval while waiting for data. */
    heartbeatMs?: number;    // default 2000
    /**
     * Notification sink for user feedback (e.g., toast/snackbar).
     * The hook will call this when notable events happen.
     */
    onNotifyAction?: (message: string, type?: ToastType) => void;
    /**
     * Control which events produce notifications.
     * By default, stalls & errors notify; done/cancel do not.
     */
    notifyOn?: {
        stall?: boolean;   // default true
        error?: boolean;   // default true
        done?: boolean;    // default false
        cancel?: boolean;  // default false
    };
};

type UseStreamReturn = {
    streaming: boolean;
    banner: string;
    answer: string;
    error: string | null;
    progress: ProgressInfo | null;
    contexts: string[] | undefined;
    start: () => void;
    cancel: () => void;
    reset: () => void;
};

const toMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
};


export function useStream(opts: UseStreamOptions): UseStreamReturn {
   const {
        url,
        forceSSE = false,
        stallMs = 15000,
        heartbeatMs = 2000,
        onNotifyAction,
        notifyOn,
    } = opts;

    const notifyFlags = {
        stall: notifyOn?.stall ?? true,
        error: notifyOn?.error ?? true,
        done: notifyOn?.done ?? false,
        cancel: notifyOn?.cancel ?? false,
    };

    const [streaming, setStreaming] = useState(false);
    const [banner, setBanner] = useState("");
    const [answer, setAnswer] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ProgressInfo | null>(null);
    const [contexts, setContexts] = useState<string[] | undefined>(undefined);

    const abortRef = useRef<AbortController | null>(null);
    const stallTimer = useRef<number | null>(null);
    const heartbeatTimer = useRef<number | null>(null);
    const t0Ref = useRef<number>(0);
    const charsRef = useRef<number>(0);

    const clearTimers = () => {
        if (stallTimer.current != null) {
            window.clearTimeout(stallTimer.current);
            stallTimer.current = null;
        }
        if (heartbeatTimer.current != null) {
            window.clearInterval(heartbeatTimer.current);
            heartbeatTimer.current = null;
        }
    };

    const updateProgress = (patch: Partial<ProgressInfo>) => {
        const now = performance.now();
        const elapsed = (now - t0Ref.current) / 1000;
        const chars = patch.chars !== undefined ? patch.chars : charsRef.current;
        const approx_tokens = Math.max(1, Math.round(chars / 4));
        const rate_cps = chars / Math.max(0.05, elapsed);

        setProgress((prev) => ({
            elapsed,
            chars,
            approx_tokens,
            rate_cps,
            status: patch.status ?? prev?.status,
            note: patch.note ?? prev?.note,
            done: patch.done ?? prev?.done,
        }));
    };

    const onDataActivity = () => {
        if (stallTimer.current != null) window.clearTimeout(stallTimer.current);
        stallTimer.current = window.setTimeout(() => {
            const msg = "Stream stalled (no data received)";
            setError("stream stalled");
            updateProgress({ status: "stalled", note: "no data", done: true });
            setStreaming(false);
            if (notifyFlags.stall) onNotifyAction?.(`⚠️ ${msg}`, "error");
        }, stallMs);
    };

    const start = useCallback(() => {
        // reset
        setError(null);
        setAnswer("");
        setBanner("");
        setContexts(undefined);
        setProgress(null);

        // cancel any previous run
        if (abortRef.current) {
            try { abortRef.current.abort(); } catch {}
        }
        clearTimers();

        const ac = new AbortController();
        abortRef.current = ac;

        t0Ref.current = performance.now();
        charsRef.current = 0;
        setStreaming(true);
        setBanner("connecting…");
        updateProgress({ status: "connecting" });

        // Keep HUD alive while waiting
        heartbeatTimer.current = window.setInterval(() => {
            if (!streaming) return;
            updateProgress({ status: "waiting…" });
        }, heartbeatMs);

        onDataActivity();

        // Try SSE first
        if (forceSSE) {
            let es: EventSource | null = null;
            try {
                es = new EventSource(url, { withCredentials: false });
            } catch {
                // fall through to fetch
            }

            if (es) {
                es.addEventListener("open", () => {
                    setBanner("connected  …");
                    updateProgress({ status: "connected" });
                    onDataActivity();
                });

                es.addEventListener("error", () => {
                    // fallback to fetch
                    try { es?.close(); } catch {}
                    doFetchStream(ac.signal);
                });

                es.addEventListener("contexts", (ev: MessageEvent) => {
                    onDataActivity();
                    try {
                        const payload = JSON.parse(ev.data);
                        const arr = payload?.contexts ?? [];
                        setContexts(Array.isArray(arr) ? arr : []);
                        setBanner(`retrieved ${arr?.length ?? 0} chunks`);
                        updateProgress({ status: "retrieved contexts" });
                    } catch {}
                });

                es.addEventListener("progress", (ev: MessageEvent) => {
                    onDataActivity();
                    try {
                        const payload = JSON.parse(ev.data);
                        const note = typeof payload?.note === "string" ? payload.note : undefined;
                        updateProgress({ status: "progress", note });
                    } catch {
                        updateProgress({ status: "progress" });
                    }
                });

                es.addEventListener("token", (ev: MessageEvent) => {
                    onDataActivity();
                    const t = ev.data ?? "";
                    setAnswer((prev) => {
                        const next = prev + t;
                        charsRef.current = next.length;
                        updateProgress({ status: "streaming", chars: charsRef.current });
                        return next;
                    });
                });

                es.addEventListener("done", () => {
                    onDataActivity();
                    updateProgress({ status: "done", done: true });
                    setStreaming(false);
                    clearTimers();
                    if (notifyFlags.done) onNotifyAction?.("✅ Generation completed", "success");
                    try { es?.close(); } catch {}
                });

                // Bind abort → close
                const abortListener = () => {
                    try { es?.close(); } catch {}
                    updateProgress({ status: "canceled", note: "by user", done: true });
                    setStreaming(false);
                    clearTimers();
                    if (notifyFlags.cancel) onNotifyAction?.("ℹ️ Generation canceled", "info");
                };
                ac.signal.addEventListener("abort", abortListener, { once: true });
                return;
            }
        }

        // Fallback: fetch streaming text/plain
        doFetchStream(ac.signal);

        async function doFetchStream(signal: AbortSignal) {
            try {
                const res = await fetch(url, {
                    method: "GET",
                    headers: {
                        Accept: "text/plain",
                        Cache: "no-cache",
                        },
                    signal,
                });
                if (!res.ok || !res.body) {
                    throw new Error(`HTTP ${res.status}`);
                }
                setBanner("connected (fetch) …");
                updateProgress({ status: "connected" });
                onDataActivity();

                const reader = res.body.getReader();
                const dec = new TextDecoder();

                let buf = "";
                const CONTEXTS_PREFIX = "[[CONTEXTS]] ";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    onDataActivity();

                    const chunk = dec.decode(value, { stream: true });
                    buf += chunk;

                    // contexts header line, once
                    if (buf.startsWith(CONTEXTS_PREFIX)) {
                        const nl = buf.indexOf("\n");
                        if (nl !== -1) {
                            const jsonLine = buf.slice(CONTEXTS_PREFIX.length, nl).trim();
                            try {
                                const arr = JSON.parse(jsonLine);
                                setContexts(Array.isArray(arr) ? arr : []);
                                setBanner(`retrieved ${Array.isArray(arr) ? arr.length : 0} chunks`);
                                updateProgress({ status: "retrieved contexts" });
                            } catch {}
                            buf = buf.slice(nl + 1);
                        }
                    }

                    // stream remainder as answer text
                    setAnswer((prev) => {
                        const next = prev + buf;
                        charsRef.current = next.length;
                        buf = "";
                        updateProgress({ status: "streaming", chars: charsRef.current });
                        return next;
                    });
                }

                updateProgress({ status: "done", done: true });
                setStreaming(false);
                clearTimers();
                if (notifyFlags.done) onNotifyAction?.("✅ Generation completed", "success");
            } catch (e: unknown) {
                if (signal.aborted) {
                    updateProgress({ status: "canceled", note: "by user", done: true });
                    if (notifyFlags.cancel) onNotifyAction?.("ℹ️ Generation canceled", "info");
                } else {
                    const msg = toMessage(e);
                    setError(msg);
                    updateProgress({ status: "error", note: msg, done: true });
                    if (notifyFlags.error) onNotifyAction?.(`❌ ${msg}`, "error");
                }
                setStreaming(false);
                clearTimers();
            }
        }
    }, [url, forceSSE, stallMs, heartbeatMs, onNotifyAction, notifyFlags.done, notifyFlags.cancel, notifyFlags.error, notifyFlags.stall]); // eslint-disable-line react-hooks/exhaustive-deps

    const cancel = useCallback(() => {
        if (abortRef.current) {
            try { abortRef.current.abort(); } catch {}
        }
    }, []);

    const reset = useCallback(() => {
        if (abortRef.current) {
            try { abortRef.current.abort(); } catch {}
        }
        clearTimers();
        setStreaming(false);
        setBanner("");
        setAnswer("");
        setError(null);
        setProgress(null);
        setContexts(undefined);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortRef.current) {
                try { abortRef.current.abort(); } catch {}
            }
            clearTimers();
        };
    }, []);

    return { streaming, banner, answer, error, progress, contexts, start, cancel, reset };
}
