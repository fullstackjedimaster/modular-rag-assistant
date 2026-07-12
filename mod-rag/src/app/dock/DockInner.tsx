"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SmartExplainer } from "@/src/components/SmartExplainer";
import {
    getRagClient,
    type RagClientFull,
    type TelemetryMessage,
} from "@/src/lib/ragClientApi";

type AttrValue = string | number | boolean | null | undefined;
type Attrs = Record<string, AttrValue>;
type RagClientId = RagClientFull["id"];

type RawTargetSelectedMessage = {
    type: "TARGET_SELECTED";
    id?: string;
    subject_id?: string;
    attrs?: Attrs;
    source?: string;
};

type RawRagSessionMessage = {
    type: "RAG_SESSION";
    token: string;
    exp?: number;
};

type RawRagClientSelectedMessage = {
    type: "RAG_CLIENT_SELECTED";
    ragClientId: string;
    label?: string;
    hostUrl?: string;
};

function assert(condition: unknown, msg: string): asserts condition {
    if (!condition) throw new Error(`[dock] ${msg}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRagClientId(value: string | undefined | null): value is RagClientId {
    return (
        typeof value === "string" &&
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            value
        )
    );
}

function isRawTargetSelectedMessage(value: unknown): value is RawTargetSelectedMessage {
    if (!isObject(value)) return false;

    return (
        value.type === "TARGET_SELECTED" &&
        (typeof value.id === "string" || typeof value.subject_id === "string")
    );
}

function isRawRagSessionMessage(value: unknown): value is RawRagSessionMessage {
    if (!isObject(value)) return false;

    return value.type === "RAG_SESSION" && typeof value.token === "string";
}

function isRawRagClientSelectedMessage(value: unknown): value is RawRagClientSelectedMessage {
    if (!isObject(value)) return false;

    return value.type === "RAG_CLIENT_SELECTED" && typeof value.ragClientId === "string";
}

function telemetryKey(message: TelemetryMessage): string | null {
    const key = message?.message_name;

    if (typeof key !== "string") return null;

    const trimmed = key.trim();

    return trimmed.length > 0 ? trimmed : null;
}

function requireAllowlist(telemetryMessages?: TelemetryMessage[]): string[] {
    const messages = telemetryMessages || [];

    if (messages.length === 0) {
        return [];
    }

    const keys = messages
        .map(telemetryKey)
        .filter((key): key is string => Boolean(key));

    assert(
        keys.length === messages.length,
        "telemetry_messages contains an invalid message_name."
    );

    return keys;
}

function pickAllowedAttrs(attrs: Attrs, allow: string[]) {
    const out: Record<string, string | number | boolean> = {};

    for (const key of allow) {
        const v = attrs[key];

        if (v === null || v === undefined) {
            continue;
        }

        const t = typeof v;

        assert(
            t === "string" || t === "number" || t === "boolean",
            `attr "${key}" must be string|number|boolean, got ${t}.`
        );

        out[key] = v;
    }

    return out;
}

function postDockHeight(): void {
    if (typeof window === "undefined") {
        return;
    }

    const root =
        document.querySelector<HTMLElement>(".smart-explainer") ??
        document.body;

    const rootRect = root.getBoundingClientRect();

    /*
     * Measure the actual explainer content rather than the iframe viewport.
     * clientHeight must not be included because it can lock the measurement
     * to the old iframe height.
     */
    const contentHeight = Math.max(
        rootRect.bottom,
        root.scrollHeight,
        root.offsetHeight,
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
    );

    const height = Math.ceil(contentHeight + 16);

    window.parent.postMessage(
        {
            type: "RAG_DOCK_RESIZE",
            height,
        },
        "*",
    );
}

export default function DockInner() {
    const params = useSearchParams();

    const forcedRagClientId = params.get("ragClientId") || undefined;

    const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
    const [attrs, setAttrs] = useState<Attrs>({});
    const [dockError, setDockError] = useState<string | null>(null);

    const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
    const [sessionExp, setSessionExp] = useState<number | undefined>(undefined);

    const [ragClientId, setRagClientId] = useState<string | undefined>(
        forcedRagClientId
    );

    const [clientLabel, setClientLabel] = useState<string | undefined>(undefined);
    const [clientHostUrl, setClientHostUrl] = useState<string | undefined>(undefined);

    const [client, setClient] = useState<RagClientFull | null>(null);
    const [loaded, setLoaded] = useState(false);

    const activeRagClientId = useMemo<RagClientId | null>(() => {
        return isRagClientId(ragClientId) ? ragClientId : null;
    }, [ragClientId]);

    useEffect(() => {
        if (forcedRagClientId) {
            setRagClientId(forcedRagClientId);
        }
    }, [forcedRagClientId]);

    useEffect(() => {
        let cancelled = false;

        async function loadClient() {
            setLoaded(false);
            setClient(null);

            if (!ragClientId) {
                setLoaded(true);
                return;
            }

            if (!activeRagClientId) {
                setDockError(`Invalid ragClientId: ${ragClientId}`);
                setLoaded(true);
                return;
            }

            try {
                const loadedClient = await getRagClient(activeRagClientId);

                if (cancelled) return;

                setClient(loadedClient);
                setClientLabel((prev) => prev || loadedClient.name);
                setClientHostUrl((prev) => prev || loadedClient.host_url);
                setDockError(null);
            } catch (err: unknown) {
                if (cancelled) return;

                setClient(null);
                setDockError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelled) {
                    setLoaded(true);
                }
            }
        }

        void loadClient();

        return () => {
            cancelled = true;
        };
    }, [ragClientId, activeRagClientId]);

    useEffect(() => {
        const onMsg = (ev: MessageEvent<unknown>) => {
            try {
                if (isRawRagSessionMessage(ev.data)) {
                    setSessionToken(ev.data.token);
                    setSessionExp(
                        typeof ev.data.exp === "number" ? ev.data.exp : undefined
                    );
                    setDockError(null);
                    return;
                }

                if (isRawRagClientSelectedMessage(ev.data)) {
                    setRagClientId(ev.data.ragClientId);
                    setClientLabel(ev.data.label);
                    setClientHostUrl(ev.data.hostUrl);
                    setDockError(null);
                    return;
                }

                if (isRawTargetSelectedMessage(ev.data)) {
                    const nextSubjectId = ev.data.id ?? ev.data.subject_id;

                    assert(nextSubjectId, "TARGET_SELECTED missing id/subject_id.");

                    const a = (ev.data.attrs ?? {}) as Attrs;

                    assert(
                        a && typeof a === "object",
                        "TARGET_SELECTED.attrs must be an object when provided."
                    );

                    setSubjectId(nextSubjectId);
                    setAttrs(a);
                    setDockError(null);
                }
            } catch (err: unknown) {
                const text = err instanceof Error ? err.message : String(err || "");
                setDockError(text || "Unknown dock error.");
            }
        };

        window.addEventListener("message", onMsg);

        return () => {
            window.removeEventListener("message", onMsg);
        };
    }, []);

   useEffect(() => {
    let animationFrameId = 0;

    const reportHeight = () => {
        window.cancelAnimationFrame(animationFrameId);

        animationFrameId = window.requestAnimationFrame(() => {
            postDockHeight();
        });
    };

    reportHeight();

    const resizeObserver = new ResizeObserver(reportHeight);

    resizeObserver.observe(document.documentElement);
    resizeObserver.observe(document.body);

    const explainer =
        document.querySelector<HTMLElement>(".smart-explainer");

    if (explainer) {
        resizeObserver.observe(explainer);
    }

    const mutationObserver = new MutationObserver(reportHeight);

    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
    });

    window.addEventListener("load", reportHeight);
    window.addEventListener("resize", reportHeight);

    const intervalId = window.setInterval(
        reportHeight,
        500,
    );

    return () => {
        window.cancelAnimationFrame(animationFrameId);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        window.removeEventListener("load", reportHeight);
        window.removeEventListener("resize", reportHeight);
        window.clearInterval(intervalId);
    };
}, []);

    useEffect(() => {
        postDockHeight();
    }, [loaded, dockError, client, subjectId, attrs, sessionToken, sessionExp]);

    const forwardedAttrs = useMemo(() => {
        if (!loaded || !client) return {};
        if (!subjectId) return {};

        const allow = requireAllowlist(client.telemetry_messages);

        if (allow.length === 0) {
            return {};
        }

        return pickAllowedAttrs(attrs, allow);
    }, [attrs, loaded, client, subjectId]);

    if (!loaded) {
        return <div className="p-2 text-sm">Loading AI explanation...</div>;
    }

    return (
        <main className="m-0 w-full overflow-hidden bg-transparent p-0">
            {dockError && (
                <div className="mb-2 border border-red-700 bg-red-100 px-2 py-1 text-xs text-red-800">
                    {dockError}
                </div>
            )}

            {!ragClientId && (
                <div className="mb-2 border border-yellow-700 bg-yellow-100 px-2 py-1 text-xs">
                    Waiting for a RAG client selection...
                </div>
            )}

            {ragClientId && !client && (
                <div className="mb-2 border border-yellow-700 bg-yellow-100 px-2 py-1 text-xs">
                    Waiting for explainer configuration...
                </div>
            )}

            {client && !subjectId && (
                <div className="mb-2 border border-gray-500 bg-gray-100 px-2 py-1 text-xs">
                    Waiting for a panel selection...
                </div>
            )}

            {client ? (
                <SmartExplainer
                    subjectId={subjectId}
                    attrs={forwardedAttrs}
                    collection={client.collection}
                    llm_model={client.llm_model}
                    embed_model={client.embed_model}
                    prompt={client.prompt}
                    chaining_mode={client.chaining_mode}
                    telemetry_messages={client.telemetry_messages}
                    showControls={false}
                    showPanel={true}
                />
            ) : (
                <div className="border border-gray-500 bg-white px-2 py-3 text-sm">
                    The dock is loaded, but no RAG client configuration has been resolved yet.
                </div>
            )}

            <div className="hidden">
                {clientLabel}
                {clientHostUrl}
                {sessionToken}
                {sessionExp}
            </div>
        </main>
    );
}