"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SmartExplainer } from "@/app/components/SmartExplainer";
import { parseDockMessage } from "@/app/lib/messages";
import {
    getRagClient,
    type RagClientFull,
    type TelemetryMessage,
} from "@/app/lib/ragClientApi";

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

function assert(condition: unknown, msg: string): asserts condition {
    if (!condition) throw new Error(`[dock] ${msg}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRagClientId(value: string | undefined | null): value is RagClientId {
    return (
        typeof value === "string" &&
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
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

function pickRequiredAttrs(attrs: Attrs, allow: string[]) {
    const out: Record<string, string | number | boolean> = {};

    for (const key of allow) {
        const v = attrs[key];

        assert(
            v !== null && v !== undefined,
            `missing required attr "${key}" in TARGET_SELECTED.attrs.`
        );

        const t = typeof v;

        assert(
            t === "string" || t === "number" || t === "boolean",
            `attr "${key}" must be string|number|boolean, got ${t}.`
        );

        out[key] = v;
    }

    return out;
}

export default function DockInner() {
    const params = useSearchParams();

    const forcedClient =
        params.get("ragClientId") || params.get("rag_client_id") || undefined;

    const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
    const [attrs, setAttrs] = useState<Attrs>({});
    const [dockError, setDockError] = useState<string | null>(null);

    const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
    const [sessionExp, setSessionExp] = useState<number | undefined>(undefined);

    const [ragClientId, setRagClientId] = useState<string | undefined>(forcedClient);
    const [clientLabel, setClientLabel] = useState<string | undefined>(undefined);
    const [clientHostUrl, setClientHostUrl] = useState<string | undefined>(
        undefined
    );

    const [client, setClient] = useState<RagClientFull | null>(null);
    const [loaded, setLoaded] = useState(false);

    const activeClientId = useMemo<RagClientId | null>(() => {
        return isRagClientId(ragClientId) ? ragClientId : null;
    }, [ragClientId]);

    useEffect(() => {
        if (forcedClient) {
            setRagClientId(forcedClient);
        }
    }, [forcedClient]);

    useEffect(() => {
        let cancelled = false;

        async function loadClient() {
            setLoaded(false);
            setClient(null);

            if (!ragClientId) {
                setLoaded(true);
                return;
            }

            if (!activeClientId) {
                setDockError(`Invalid RAG client id: ${ragClientId}`);
                setLoaded(true);
                return;
            }

            try {
                const loadedClient = await getRagClient(activeClientId);

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
    }, [ragClientId, activeClientId]);

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
                    return;
                }

                const msg = parseDockMessage(ev.data);

                if (msg.type === "RAG_CLIENT_SELECTED") {
                    setRagClientId(msg.client);
                    setClientLabel(msg.label);
                    setClientHostUrl(msg.hostUrl);
                    setDockError(null);
                    return;
                }

                if (msg.type === "TARGET_SELECTED") {
                    const nextSubjectId =
                        "id" in msg && typeof msg.id === "string"
                            ? msg.id
                            : "subject_id" in msg && typeof msg.subject_id === "string"
                              ? msg.subject_id
                              : undefined;

                    assert(nextSubjectId, "TARGET_SELECTED missing id/subject_id.");

                    const a = (msg.attrs ?? {}) as Attrs;

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

                if (text.includes("invalid message type")) return;

                setDockError(text || "Unknown dock error.");
            }
        };

        window.addEventListener("message", onMsg);

        return () => {
            window.removeEventListener("message", onMsg);
        };
    }, []);

    const forwardedAttrs = useMemo(() => {
        if (!loaded || !client) return {};
        if (!subjectId) return {};

        const allow = requireAllowlist(client.telemetry_messages);

        if (allow.length === 0) {
            return {};
        }

        return pickRequiredAttrs(attrs, allow);
    }, [attrs, loaded, client, subjectId]);

    if (!loaded) {
        return <div className="p-3 text-sm text-gray-500">Loading dock...</div>;
    }

    return (
        <div className="m-0 bg-transparent p-3">
            {dockError && (
                <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {dockError}
                </div>
            )}

            <div className="mb-3 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm">
                <div>
                    <span className="font-medium text-gray-800">Client:</span>{" "}
                    {ragClientId ?? "waiting..."}
                </div>

                {clientLabel && (
                    <div>
                        <span className="font-medium text-gray-800">Project:</span>{" "}
                        {clientLabel}
                    </div>
                )}

                {clientHostUrl && (
                    <div className="truncate">
                        <span className="font-medium text-gray-800">Host:</span>{" "}
                        {clientHostUrl}
                    </div>
                )}

                <div>
                    <span className="font-medium text-gray-800">RAG config:</span>{" "}
                    {client?.name ?? "waiting..."}
                </div>

                <div>
                    <span className="font-medium text-gray-800">Collection:</span>{" "}
                    {client?.collection ?? "waiting..."}
                </div>

                <div>
                    <span className="font-medium text-gray-800">Selected target:</span>{" "}
                    {subjectId ?? "none"}
                </div>

                <div>
                    <span className="font-medium text-gray-800">Session:</span>{" "}
                    {sessionToken ? "received" : "waiting..."}
                    {sessionExp ? ` · exp ${sessionExp}` : ""}
                </div>
            </div>

            {!ragClientId && (
                <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Waiting for a RAG client selection...
                </div>
            )}

            {ragClientId && !client && (
                <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Waiting for explainer configuration...
                </div>
            )}

            {client && !subjectId && (
                <div className="mb-3 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Waiting for a selection from the target demo...
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
                <div className="rounded border border-gray-200 bg-white px-3 py-4 text-sm text-gray-600 shadow-sm">
                    The dock is loaded, but no RAG client configuration has been resolved yet.
                </div>
            )}
        </div>
    );
}