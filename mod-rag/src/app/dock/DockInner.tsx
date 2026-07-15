"use client";

import React, {
    useEffect,
    useMemo,
    useState,
} from "react";
import { useSearchParams } from "next/navigation";

import { SmartExplainer } from "@/src/components/SmartExplainer";
import {
    getRagClient,
    type RagClientFull,
    type TelemetryMessage,
} from "@/src/lib/ragClientApi";

type AttrValue =
    | string
    | number
    | boolean
    | null
    | undefined;

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

type RagDockReadyMessage = {
    type: "RAG_DOCK_READY";
    frameId?: string;
};

type RagDockResizeMessage = {
    type: "RAG_DOCK_RESIZE";
    frameId?: string;
    height: number;
};

const CONTENT_ROOT_ID = "rag-dock-content";

const HEIGHT_PADDING = 12;
const HEIGHT_CHANGE_THRESHOLD = 2;
const HEIGHT_POLL_INTERVAL_MS = 1000;
const HEIGHT_SETTLE_DELAYS_MS = [
    0,
    50,
    150,
    350,
];

function assert(
    condition: unknown,
    message: string,
): asserts condition {
    if (!condition) {
        throw new Error(`[dock] ${message}`);
    }
}

function isObject(
    value: unknown,
): value is Record<string, unknown> {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function isRagClientId(
    value: string | undefined | null,
): value is RagClientId {
    return (
        typeof value === "string" &&
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            value,
        )
    );
}

function isRawTargetSelectedMessage(
    value: unknown,
): value is RawTargetSelectedMessage {
    if (!isObject(value)) {
        return false;
    }

    return (
        value.type === "TARGET_SELECTED" &&
        (
            typeof value.id === "string" ||
            typeof value.subject_id === "string"
        )
    );
}

function isRawRagSessionMessage(
    value: unknown,
): value is RawRagSessionMessage {
    return (
        isObject(value) &&
        value.type === "RAG_SESSION" &&
        typeof value.token === "string"
    );
}

function isRawRagClientSelectedMessage(
    value: unknown,
): value is RawRagClientSelectedMessage {
    return (
        isObject(value) &&
        value.type === "RAG_CLIENT_SELECTED" &&
        typeof value.ragClientId === "string"
    );
}

function telemetryKey(
    message: TelemetryMessage,
): string | null {
    const key = message?.message_name;

    if (typeof key !== "string") {
        return null;
    }

    const trimmed = key.trim();

    return trimmed.length > 0
        ? trimmed
        : null;
}

function requireAllowlist(
    telemetryMessages?: TelemetryMessage[],
): string[] {
    const messages = telemetryMessages || [];

    if (messages.length === 0) {
        return [];
    }

    const keys = messages
        .map(telemetryKey)
        .filter(
            (key): key is string =>
                Boolean(key),
        );

    assert(
        keys.length === messages.length,
        "telemetry_messages contains an invalid message_name.",
    );

    return keys;
}

function pickAllowedAttrs(
    attrs: Attrs,
    allow: string[],
): Record<
    string,
    string | number | boolean
> {
    const output: Record<
        string,
        string | number | boolean
    > = {};

    for (const key of allow) {
        const value = attrs[key];

        if (
            value === null ||
            value === undefined
        ) {
            continue;
        }

        const valueType = typeof value;

        assert(
            valueType === "string" ||
                valueType === "number" ||
                valueType === "boolean",
            `attr "${key}" must be string|number|boolean, got ${valueType}.`,
        );

        output[key] = value;
    }

    return output;
}

function getFrameId(): string {
    return (
        new URLSearchParams(
            window.location.search,
        ).get("frameId") || ""
    );
}

function measureDockHeight(
    root: HTMLElement,
): number {
    const rect =
        root.getBoundingClientRect();

    /*
     * Measure only the explicit dock content element.
     *
     * Do not use body/html scrollHeight here. Those measurements
     * can incorporate the iframe viewport and create an endless
     * resize feedback loop on mobile.
     */
    return Math.ceil(
        Math.max(
            rect.height,
            root.offsetHeight,
        ) + HEIGHT_PADDING,
    );
}

export default function DockInner() {
    const params = useSearchParams();

    const forcedRagClientId =
        params.get("ragClientId") ||
        undefined;

    const [subjectId, setSubjectId] =
        useState<string | undefined>();

    const [attrs, setAttrs] =
        useState<Attrs>({});

    const [dockError, setDockError] =
        useState<string | null>(null);

    const [sessionToken, setSessionToken] =
        useState<string | undefined>();

    const [sessionExp, setSessionExp] =
        useState<number | undefined>();

    const [ragClientId, setRagClientId] =
        useState<string | undefined>(
            forcedRagClientId,
        );

    const [clientLabel, setClientLabel] =
        useState<string | undefined>();

    const [clientHostUrl, setClientHostUrl] =
        useState<string | undefined>();

    const [client, setClient] =
        useState<RagClientFull | null>(null);

    const [loaded, setLoaded] =
        useState(false);

    const activeRagClientId =
        useMemo<RagClientId | null>(() => {
            return isRagClientId(ragClientId)
                ? ragClientId
                : null;
        }, [ragClientId]);

    useEffect(() => {
        if (forcedRagClientId) {
            setRagClientId(
                forcedRagClientId,
            );
        }
    }, [forcedRagClientId]);

    useEffect(() => {
        let cancelled = false;

        async function loadClient(): Promise<void> {
            setLoaded(false);
            setClient(null);

            if (!ragClientId) {
                setLoaded(true);
                return;
            }

            if (!activeRagClientId) {
                setDockError(
                    `Invalid ragClientId: ${ragClientId}`,
                );
                setLoaded(true);
                return;
            }

            try {
                const loadedClient =
                    await getRagClient(
                        activeRagClientId,
                    );

                if (cancelled) {
                    return;
                }

                setClient(loadedClient);

                setClientLabel(
                    (previous) =>
                        previous ||
                        loadedClient.name,
                );

                setClientHostUrl(
                    (previous) =>
                        previous ||
                        loadedClient.host_url,
                );

                setDockError(null);
            } catch (error: unknown) {
                if (cancelled) {
                    return;
                }

                setClient(null);

                setDockError(
                    error instanceof Error
                        ? error.message
                        : String(error),
                );
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
    }, [
        ragClientId,
        activeRagClientId,
    ]);

    /*
     * Signal readiness only after this RAG document has mounted.
     * DockHost uses this handshake instead of trusting iframe onLoad.
     */
    useEffect(() => {
        const message: RagDockReadyMessage = {
            type: "RAG_DOCK_READY",
            frameId: getFrameId(),
        };

        window.parent.postMessage(
            message,
            "*",
        );
    }, []);

    useEffect(() => {
        function onMessage(
            event: MessageEvent<unknown>,
        ): void {
            try {
                if (
                    isRawRagSessionMessage(
                        event.data,
                    )
                ) {
                    setSessionToken(
                        event.data.token,
                    );

                    setSessionExp(
                        typeof event.data.exp ===
                            "number"
                            ? event.data.exp
                            : undefined,
                    );

                    setDockError(null);
                    return;
                }

                if (
                    isRawRagClientSelectedMessage(
                        event.data,
                    )
                ) {
                    setRagClientId(
                        event.data.ragClientId,
                    );

                    setClientLabel(
                        event.data.label,
                    );

                    setClientHostUrl(
                        event.data.hostUrl,
                    );

                    setDockError(null);
                    return;
                }

                if (
                    isRawTargetSelectedMessage(
                        event.data,
                    )
                ) {
                    const nextSubjectId =
                        event.data.id ??
                        event.data.subject_id;

                    assert(
                        nextSubjectId,
                        "TARGET_SELECTED missing id/subject_id.",
                    );

                    const nextAttrs =
                        (event.data.attrs ??
                            {}) as Attrs;

                    assert(
                        isObject(nextAttrs),
                        "TARGET_SELECTED.attrs must be an object when provided.",
                    );

                    setSubjectId(
                        nextSubjectId,
                    );

                    setAttrs(nextAttrs);
                    setDockError(null);
                }
            } catch (error: unknown) {
                const text =
                    error instanceof Error
                        ? error.message
                        : String(error || "");

                setDockError(
                    text ||
                        "Unknown dock error.",
                );
            }
        }

        window.addEventListener(
            "message",
            onMessage,
        );

        return () => {
            window.removeEventListener(
                "message",
                onMessage,
            );
        };
    }, []);

    useEffect(() => {
        const root =
            document.getElementById(
                CONTENT_ROOT_ID,
            );

        if (!(root instanceof HTMLElement)) {
            console.warn(
                `[DockInner] Missing #${CONTENT_ROOT_ID}; dock height reporting disabled.`,
            );

            return;
        }

        /*
         * Capture the narrowed element so TypeScript retains
         * HTMLElement rather than HTMLElement | null inside
         * nested callbacks.
         */
        const rootElement = root;
        const frameId = getFrameId();

        let animationFrameId = 0;
        let lastHeight = 0;
        let disposed = false;

        const settleTimerIds =
            new Set<number>();

        function reportHeight(): void {
            if (disposed) {
                return;
            }

            window.cancelAnimationFrame(
                animationFrameId,
            );

            animationFrameId =
                window.requestAnimationFrame(
                    () => {
                        if (disposed) {
                            return;
                        }

                        const height =
                            measureDockHeight(
                                rootElement,
                            );

                        if (height <= 0) {
                            return;
                        }

                        if (
                            lastHeight > 0 &&
                            Math.abs(
                                height -
                                    lastHeight,
                            ) <
                                HEIGHT_CHANGE_THRESHOLD
                        ) {
                            return;
                        }

                        lastHeight = height;

                        const message:
                            RagDockResizeMessage = {
                                type:
                                    "RAG_DOCK_RESIZE",
                                frameId,
                                height,
                            };

                        window.parent.postMessage(
                            message,
                            "*",
                        );
                    },
                );
        }

        function scheduleReports(): void {
            for (
                const delay of
                HEIGHT_SETTLE_DELAYS_MS
            ) {
                const timerId =
                    window.setTimeout(() => {
                        settleTimerIds.delete(
                            timerId,
                        );

                        reportHeight();
                    }, delay);

                settleTimerIds.add(timerId);
            }
        }

        scheduleReports();

        const resizeObserver =
            new ResizeObserver(() => {
                scheduleReports();
            });

        resizeObserver.observe(
            rootElement,
        );

        const mutationObserver =
            new MutationObserver(() => {
                scheduleReports();
            });

        mutationObserver.observe(
            rootElement,
            {
                childList: true,
                subtree: true,
                characterData: true,
            },
        );

        const onWindowResize = (): void => {
            scheduleReports();
        };

        const onLayoutEnd = (): void => {
            scheduleReports();
        };

        window.addEventListener(
            "resize",
            onWindowResize,
        );

        document.addEventListener(
            "transitionend",
            onLayoutEnd,
            true,
        );

        document.addEventListener(
            "animationend",
            onLayoutEnd,
            true,
        );

        /*
         * Slow fallback only. ResizeObserver and MutationObserver
         * handle normal layout updates.
         */
        const intervalId =
            window.setInterval(
                reportHeight,
                HEIGHT_POLL_INTERVAL_MS,
            );

        return () => {
            disposed = true;

            window.cancelAnimationFrame(
                animationFrameId,
            );

            for (
                const timerId of
                settleTimerIds
            ) {
                window.clearTimeout(
                    timerId,
                );
            }

            settleTimerIds.clear();

            resizeObserver.disconnect();
            mutationObserver.disconnect();

            window.removeEventListener(
                "resize",
                onWindowResize,
            );

            document.removeEventListener(
                "transitionend",
                onLayoutEnd,
                true,
            );

            document.removeEventListener(
                "animationend",
                onLayoutEnd,
                true,
            );

            window.clearInterval(
                intervalId,
            );
        };
    }, []);

    const forwardedAttrs = useMemo(() => {
        if (
            !loaded ||
            !client ||
            !subjectId
        ) {
            return {};
        }

        const allow = requireAllowlist(
            client.telemetry_messages,
        );

        if (allow.length === 0) {
            return {};
        }

        return pickAllowedAttrs(
            attrs,
            allow,
        );
    }, [
        attrs,
        loaded,
        client,
        subjectId,
    ]);


     return (
        <main
            id={CONTENT_ROOT_ID}
            className="m-0 block h-auto min-h-0 w-full bg-transparent p-0"
            style={{
                overflow: "visible",
            }}
        >
            {!loaded ? (
                <div className="p-2 text-sm">
                    Loading AI explanation...
                </div>
            ) : (
                <>
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
                            The dock is loaded, but no RAG client configuration has
                            been resolved yet.
                        </div>
                    )}
                </>
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