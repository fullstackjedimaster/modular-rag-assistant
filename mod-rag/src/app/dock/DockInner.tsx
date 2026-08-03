"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SmartExplainer } from "@/src/components/SmartExplainer";
import {
    getRagClient,
    type RagClientFull,
} from "@/src/lib/ragClientApi";
import type {
    Attrs,
    DockReadyMessage,
    DockResizeMessage,
    HostThemeMessage,
    TargetSelectedMessage,
} from "@/src/lib/messages";

type ForwardedAttrs = Record<string, string | number | boolean>;

const SOLAR_TELEMETRY_KEYS = [
    "status", "voltage", "current", "power", "temperature", "irradiance",
    "expected_power", "performance_ratio", "environmental_state", "diagnostic_basis",
] as const;

function applyTheme(root: HTMLElement, message: HostThemeMessage): void {
    for (const [name, value] of Object.entries(message.vars)) {
        root.style.setProperty(name, value);
    }

    root.dataset.hostApp = message.app;
    root.dataset.hostDensity = message.density;
}

function selectTelemetryAttrs(
    attrs: Attrs,
    client: RagClientFull,
): ForwardedAttrs {
    const selected: ForwardedAttrs = {};

    const configuredKeys = client.telemetry_messages.map((message) => message.message_name);
    const keys = new Set<string>([...configuredKeys, ...SOLAR_TELEMETRY_KEYS]);

    for (const name of keys) {
        const value = attrs[name];
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            selected[name] = value;
        }
    }

    return selected;
}

export default function DockInner() {
    const searchParams = useSearchParams();
    const rootRef = useRef<HTMLElement>(null);
    const lastHeightRef = useRef(0);

    const ragClientId = searchParams.get("ragClientId");
    const hostOrigin = searchParams.get("hostOrigin") || "";

    const [client, setClient] = useState<RagClientFull | null>(null);
    const [target, setTarget] = useState<TargetSelectedMessage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!ragClientId) {
            setClient(null);
            setLoading(false);
            setError("Missing ragClientId.");
            return;
        }

        let cancelled = false;

        async function loadClient(clientId: string): Promise<void> {
            setLoading(true);
            setError("");

            try {
                const loadedClient = await getRagClient(clientId);

                if (!cancelled) {
                    setClient(loadedClient);
                }
            } catch (loadError: unknown) {
                if (!cancelled) {
                    setClient(null);
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : String(loadError),
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void loadClient(ragClientId);

        return () => {
            cancelled = true;
        };
    }, [ragClientId]);

    useEffect(() => {
        function onMessage(
            event: MessageEvent<HostThemeMessage | TargetSelectedMessage>,
        ): void {
            if (event.source !== window.parent) return;
            if (!hostOrigin || event.origin !== hostOrigin) return;

            const message = event.data;

            if (message.type === "HOST_THEME") {
                if (rootRef.current) {
                    applyTheme(rootRef.current, message);
                }
                return;
            }

            if (message.type === "TARGET_SELECTED") {
                setTarget(message);
            }
        }

        window.addEventListener("message", onMessage);

        const ready: DockReadyMessage = {
            type: "DOCK_READY",
        };

        if (hostOrigin) window.parent.postMessage(ready, hostOrigin);

        return () => window.removeEventListener("message", onMessage);
    }, [hostOrigin]);

    useEffect(() => {
        const rootElement = rootRef.current;

        if (!rootElement) {
            return;
        }

        function reportHeight(element: HTMLElement): void {
            const height = Math.ceil(
                element.getBoundingClientRect().height,
            );

            if (height === lastHeightRef.current) {
                return;
            }

            lastHeightRef.current = height;

            const message: DockResizeMessage = {
                type: "DOCK_RESIZE",
                height,
            };

            if (hostOrigin) window.parent.postMessage(message, hostOrigin);
        }

        const observer = new ResizeObserver(() => {
            reportHeight(rootElement);
        });

        observer.observe(rootElement);
        reportHeight(rootElement);

        return () => observer.disconnect();
    }, [hostOrigin]);

    const forwardedAttrs = useMemo(() => {
        return client && target
            ? selectTelemetryAttrs(target.attrs, client)
            : {};
    }, [client, target]);

    return (
        <main ref={rootRef} className="dock-content">
            {error ? (
                <div className="dock-notice dock-notice-error" role="alert">
                    {error}
                </div>
            ) : null}

            {loading ? (
                <div className="dock-notice">Loading AI explanation...</div>
            ) : !client ? (
                <div className="dock-notice dock-notice-error">
                    RAG client configuration could not be loaded.
                </div>
            ) : !target ? (
                <div className="dock-notice">
                    Waiting for a target selection...
                </div>
            ) : (
                <SmartExplainer
                    subjectId={target.id}
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
            )}
        </main>
    );
}
