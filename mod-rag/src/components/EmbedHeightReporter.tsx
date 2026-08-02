"use client";

import { useEffect } from "react";

type EmbedHeightReporterProps = {
    contentRootId: string;
};

const MAX_HEIGHT = 5000;
const CHANGE_THRESHOLD = 2;
const SETTLE_DELAYS_MS = [0, 50, 150, 350];
const DOCK_RESIZE_EVENT = "rag-dock-resize";

function getParentOrigin(): string {
    const configured = new URLSearchParams(window.location.search).get(
        "embedParentOrigin",
    );

    if (configured) {
        try {
            return new URL(configured).origin;
        } catch {
            return "";
        }
    }

    if (!document.referrer) return "";

    try {
        return new URL(document.referrer).origin;
    } catch {
        return "";
    }
}

function measure(element: HTMLElement): number {
    const rectHeight = element.getBoundingClientRect().height;
    return Math.min(
        MAX_HEIGHT,
        Math.max(
            1,
            Math.ceil(Math.max(rectHeight, element.offsetHeight, element.scrollHeight)),
        ),
    );
}

export default function EmbedHeightReporter({
    contentRootId,
}: EmbedHeightReporterProps) {
    useEffect(() => {
        if (window.parent === window) return;

        const rootElement = document.getElementById(contentRootId);
        if (!(rootElement instanceof HTMLElement)) {
            console.warn(
                `[EmbedHeightReporter] Missing #${contentRootId}; height reporting disabled.`,
            );
            return;
        }

        const targetOrigin = getParentOrigin();
        if (!targetOrigin) {
            console.warn(
                "[EmbedHeightReporter] Parent origin is unavailable; height reporting disabled.",
            );
            return;
        }

        let animationFrame = 0;
        let lastHeight = 0;
        let disposed = false;
        const timers = new Set<number>();

        function report(): void {
            if (disposed) return;

            window.cancelAnimationFrame(animationFrame);
            animationFrame = window.requestAnimationFrame(() => {
                if (disposed) return;

                const height = measure(rootElement);
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

        const resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(rootElement);

        const mutationObserver = new MutationObserver(schedule);
        mutationObserver.observe(rootElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["class", "style"],
        });

        window.addEventListener("load", schedule);
        window.addEventListener("resize", schedule);
        window.addEventListener(DOCK_RESIZE_EVENT, schedule);

        schedule();

        return () => {
            disposed = true;
            window.cancelAnimationFrame(animationFrame);
            for (const timer of timers) window.clearTimeout(timer);
            timers.clear();
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener("load", schedule);
            window.removeEventListener("resize", schedule);
            window.removeEventListener(DOCK_RESIZE_EVENT, schedule);
        };
    }, [contentRootId]);

    return null;
}
