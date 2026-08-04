"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SmartExplainer } from "@/src/components/SmartExplainer";
import {
    getRagHost,
    type RagHostFull,
} from "@/src/lib/ragHostApi";
import type {
    Attrs,
    DockReadyMessage,
    DockResizeMessage,
    HostThemeMessage,
    TargetSelectedMessage,
} from "@/src/lib/messages";

type ForwardedAttrs = Record<string, string | number | boolean>;

function applyTheme(root: HTMLElement, message: HostThemeMessage): void {
    for (const [name, value] of Object.entries(message.vars)) {
        root.style.setProperty(name, value);
    }

    root.dataset.hostApp = message.app;
    root.dataset.hostDensity = message.density;
}

function selectTelemetryAttrs(
    attrs: Attrs,
    host: RagHostFull,
): ForwardedAttrs {
    const selected: ForwardedAttrs = {};

    for (const telemetryMessage of host.telemetry_messages) {
        const name = telemetryMessage.message_name;
        const value = attrs[name];

        if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
        ) {
            selected[name] = value;
        }
    }

    return selected;
}

export default function DockInner() {
    const searchParams = useSearchParams();
    const rootRef = useRef<HTMLElement>(null);
    const lastHeightRef = useRef(0);

    const ragHostId = searchParams.get("ragHostId");
    const hostOrigin = searchParams.get("hostOrigin") || "";

    const [host, setHost] = useState<RagHostFull | null>(null);
    const [target, setTarget] = useState<TargetSelectedMessage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!ragHostId) {
            setHost(null);
            setLoading(false);
            setError("Missing ragHostId.");
            return;
        }

        let cancelled = false;

        async function loadHost(hostId: string): Promise<void> {
            setLoading(true);
            setError("");

            try {
                const loadedHost = await getRagHost(hostId);

                if (!cancelled) {
                    setHost(loadedHost);
                }
            } catch (loadError: unknown) {
                if (!cancelled) {
                    setHost(null);
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

        void loadHost(ragHostId);

        return () => {
            cancelled = true;
        };
    }, [ragHostId]);

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
        return host && target
            ? selectTelemetryAttrs(target.attrs, host)
            : {};
    }, [host, target]);

    return (
        <main ref={rootRef} className="dock-content">
            {error ? (
                <div className="dock-notice dock-notice-error" role="alert">
                    {error}
                </div>
            ) : null}

            {loading ? (
                <div className="dock-notice">Loading AI explanation...</div>
            ) : !host ? (
                <div className="dock-notice dock-notice-error">
                    RAG host configuration could not be loaded.
                </div>
            ) : !target ? (
                <div className="dock-notice">
                    Waiting for a target selection...
                </div>
            ) : (
                <SmartExplainer
                    subjectId={target.id}
                    attrs={forwardedAttrs}
                    collection={host.collection}
                    llm_model={host.llm_model}
                    embed_model={host.embed_model}
                    prompt={host.prompt}
                    chaining_mode={host.chaining_mode}
                    telemetry_messages={host.telemetry_messages}
                    showControls={false}
                    showPanel={true}
                />
            )}
        </main>
    );
}
