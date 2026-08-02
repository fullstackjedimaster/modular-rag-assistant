"use client";

import { useEffect } from "react";

type EmbedHeightReporterProps = {
    contentRootId: string;
};

const MAX_HEIGHT = 5000;
const CHANGE_THRESHOLD = 2;
const SETTLE_DELAYS_MS = [0, 50, 150, 350];
const DOCK_RESIZE_EVENT = "rag-dock-resize";

function parentOrigin(): string {
    const configured = new URLSearchParams(window.location.search).get(
        "embedParentOrigin",
    );

    if (configured) {
        try {
            return new URL(configured).origin;
        } catch {
            // Fall through to document.referrer.
        }
    }

    if (document.referrer) {
        try {
            return new URL(document.referrer).origin;
        } catch {
            // Fall through to wildcard for local development.
        }
    }

    return "*";
}

function measure(root: HTMLElement): number {
    const rect = root.getBoundingClientRect();

    return Math.min(
        MAX_HEIGHT,
        Math.max(1, Math.ceil(Math.max(rect.height, root.offsetHeight))),
    );
}

export default function EmbedHeightReporter({
    contentRootId,
}: EmbedHeightReporterProps) {
    useEffect(() => {
        if (window.parent === window) {
            return;
        }

        const root = document.getElementById(contentRootId);

        if (!(root instanceof HTMLElement)) {
            console.warn(
                `[EmbedHeightReporter] Missing #${contentRootId}; height reporting disabled.`,
            );
            return;
        }

        const targetOrigin = parentOrigin();
        let frame = 0;
        let lastHeight = 0;
        let disposed = false;
        const timers = new Set<number>();

        function report(): void {
            if (disposed) return;

            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                if (disposed) return;

                const height = measure(root);
                if (
                    lastHeight > 0 &&
                    Math.abs(height - lastHeight) < CHANGE_THRESHOLD
                ) {
                    return;
                }

                lastHeight = height;
                window.parent.postMessage(
                    { type: "EMBED_HEIGHT", height },
                    targetOrigin,
                );
            });
        }

        function schedule(): void {
            for (const delay of SETTLE_DELAYS_MS) {
                const timer = window.setTimeout(() => {
                    timers.delete(timer);
                    report();
                }, delay);
                timers.add(timer);
            }
        }

        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";

        const resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(root);

        // The dock adapter changes a descendant iframe's inline height.
        // Attribute observation and the explicit event make that resize
        // propagate through any number of nested embedding layers.
        const mutationObserver = new MutationObserver(schedule);
        mutationObserver.observe(root, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["class", "style"],
        });

        window.addEventListener("resize", schedule);
        window.addEventListener(DOCK_RESIZE_EVENT, schedule);
        window.addEventListener("load", schedule);

        schedule();

        return () => {
            disposed = true;
            window.cancelAnimationFrame(frame);
            for (const timer of timers) window.clearTimeout(timer);
            timers.clear();
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener("resize", schedule);
            window.removeEventListener(DOCK_RESIZE_EVENT, schedule);
            window.removeEventListener("load", schedule);
        };
    }, [contentRootId]);

    return null;
}
