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

type HostCssVars = Record<string, string>;

type HostThemeMetadata = {
    app?: string;
    mode?: string;
    density?: string;
    theme?: string;
};

type RawHostCssVarsMessage = {
    type: "HOST_CSS_VARS";
    frameId?: string;
    vars: HostCssVars;
    host?: HostThemeMetadata;
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

const HEIGHT_CHANGE_THRESHOLD = 2;

const HEIGHT_SETTLE_DELAYS_MS = [
    0,
    50,
    150,
    350,
];

const CSS_CUSTOM_PROPERTY_PATTERN =
    /^--[a-zA-Z0-9_-]+$/;

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

function isHostThemeMetadata(
    value: unknown,
): value is HostThemeMetadata {
    if (value === undefined) {
        return true;
    }

    if (!isObject(value)) {
        return false;
    }

    const allowedKeys = [
        "app",
        "mode",
        "density",
        "theme",
    ];

    for (const key of allowedKeys) {
        const fieldValue = value[key];

        if (
            fieldValue !== undefined &&
            typeof fieldValue !== "string"
        ) {
            return false;
        }
    }

    return true;
}

function isHostCssVars(
    value: unknown,
): value is HostCssVars {
    if (!isObject(value)) {
        return false;
    }

    for (const [name, cssValue] of Object.entries(value)) {
        if (
            !CSS_CUSTOM_PROPERTY_PATTERN.test(name) ||
            typeof cssValue !== "string"
        ) {
            return false;
        }
    }

    return true;
}

function isRawHostCssVarsMessage(
    value: unknown,
): value is RawHostCssVarsMessage {
    if (
        !isObject(value) ||
        value.type !== "HOST_CSS_VARS"
    ) {
        return false;
    }

    if (
        value.frameId !== undefined &&
        typeof value.frameId !== "string"
    ) {
        return false;
    }

    return (
        isHostCssVars(value.vars) &&
        isHostThemeMetadata(value.host)
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
        ),
    );
}

function applyHostCssVars(
    root: HTMLElement,
    vars: HostCssVars,
): void {
    for (const [name, value] of Object.entries(vars)) {
        if (
            !CSS_CUSTOM_PROPERTY_PATTERN.test(name)
        ) {
            continue;
        }

        root.style.setProperty(
            name,
            value.trim(),
        );
    }
}

function applyHostMetadata(
    root: HTMLElement,
    host?: HostThemeMetadata,
): void {
    if (!host) {
        return;
    }

    if (host.app) {
        root.dataset.hostApp =
            host.app;
    } else {
        delete root.dataset.hostApp;
    }

    if (host.mode) {
        root.dataset.hostMode =
            host.mode;
    } else {
        delete root.dataset.hostMode;
    }

    if (host.density) {
        root.dataset.hostDensity =
            host.density;
    } else {
        delete root.dataset.hostDensity;
    }

    if (host.theme) {
        root.dataset.hostTheme =
            host.theme;
    } else {
        delete root.dataset.hostTheme;
    }
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
        const frameId = getFrameId();

        const message: RagDockReadyMessage = {
            type: "RAG_DOCK_READY",
            frameId:
                frameId || undefined,
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
            /*
             * Every dock-control message must come from the direct
             * parent that owns this iframe.
             */
            if (
                event.source !==
                window.parent
            ) {
                return;
            }

            try {
                if (
                    isRawHostCssVarsMessage(
                        event.data,
                    )
                ) {
                    const currentFrameId =
                        getFrameId();

                    if (
                        event.data.frameId &&
                        currentFrameId &&
                        event.data.frameId !==
                            currentFrameId
                    ) {
                        return;
                    }

                    const root =
                        document.getElementById(
                            CONTENT_ROOT_ID,
                        );

                    if (
                        !(
                            root instanceof
                            HTMLElement
                        )
                    ) {
                        throw new Error(
                            `Missing #${CONTENT_ROOT_ID}; host CSS variables could not be applied.`,
                        );
                    }

                    applyHostCssVars(
                        root,
                        event.data.vars,
                    );

                    applyHostMetadata(
                        root,
                        event.data.host,
                    );

                    setDockError(null);
                    return;
                }

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
                                frameId:
                                    frameId ||
                                    undefined,
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
                attributes: true,
                attributeFilter: [
                    "class",
                    "style",
                    "data-host-app",
                    "data-host-mode",
                    "data-host-density",
                    "data-host-theme",
                ],
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
                color: "var(--text, inherit)",
                fontFamily:
                    "var(--font-family, inherit)",
            }}
        >
            {!loaded ? (
                <div
                    className="p-2 text-sm"
                    style={{
                        color:
                            "var(--text, inherit)",
                    }}
                >
                    Loading AI explanation...
                </div>
            ) : (
                <>
                    {dockError && (
                        <div
                            className="mb-2 border px-2 py-1 text-xs"
                            role="alert"
                            style={{
                                borderColor:
                                    "var(--danger-border, #b91c1c)",
                                background:
                                    "var(--danger-bg, #fee2e2)",
                                color:
                                    "var(--danger-text, #991b1b)",
                            }}
                        >
                            {dockError}
                        </div>
                    )}

                    {!ragClientId && (
                        <div
                            className="mb-2 border px-2 py-1 text-xs"
                            style={{
                                borderColor:
                                    "var(--warning-border, #a16207)",
                                background:
                                    "var(--warning-bg, #fef9c3)",
                                color:
                                    "var(--warning-text, var(--text, #111827))",
                            }}
                        >
                            Waiting for a RAG client selection...
                        </div>
                    )}

                    {ragClientId && !client && (
                        <div
                            className="mb-2 border px-2 py-1 text-xs"
                            style={{
                                borderColor:
                                    "var(--warning-border, #a16207)",
                                background:
                                    "var(--warning-bg, #fef9c3)",
                                color:
                                    "var(--warning-text, var(--text, #111827))",
                            }}
                        >
                            Waiting for explainer configuration...
                        </div>
                    )}

                    {client && !subjectId && (
                        <div
                            className="mb-2 border px-2 py-1 text-xs"
                            style={{
                                borderColor:
                                    "var(--border, #6b7280)",
                                background:
                                    "var(--muted-bg, var(--card, #f3f4f6))",
                                color:
                                    "var(--muted-text, var(--text, #111827))",
                            }}
                        >
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
                        <div
                            className="border px-2 py-3 text-sm"
                            style={{
                                borderColor:
                                    "var(--border, #6b7280)",
                                background:
                                    "var(--card, #ffffff)",
                                color:
                                    "var(--text, #111827)",
                            }}
                        >
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