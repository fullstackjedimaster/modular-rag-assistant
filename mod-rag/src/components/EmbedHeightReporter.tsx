"use client";

import { useEffect } from "react";

const DEFAULT_CONTENT_ROOT_ID = "mod-rag-embed-content";
const MAX_HEIGHT = 5000;
const CHANGE_THRESHOLD = 2;
const SETTLE_DELAYS_MS = [0, 50, 150, 350, 750];

type EmbedHeightReporterProps = {
    contentRootId?: string;
};

function getFrameId(): string {
    return new URLSearchParams(window.location.search).get("frameId") || "";
}

function measureContentHeight(root: HTMLElement): number {
    const rect = root.getBoundingClientRect();

    return Math.min(
        MAX_HEIGHT,
        Math.max(1, Math.ceil(Math.max(rect.height, root.offsetHeight))),
    );
}

export default function EmbedHeightReporter({
    contentRootId = DEFAULT_CONTENT_ROOT_ID,
}: EmbedHeightReporterProps) {
    useEffect(() => {
        const root = document.getElementById(contentRootId);

        if (!(root instanceof HTMLElement)) {
            console.warn(
                `[EmbedHeightReporter] Missing #${contentRootId}; height reporting disabled.`,
            );
            return;
        }

        const rootElement = root;
        const frameId = getFrameId();
        let animationFrameId = 0;
        let lastHeight = 0;
        let disposed = false;
        const settleTimers = new Set<number>();

        function postMeasuredHeight(): void {
            if (disposed) return;

            window.cancelAnimationFrame(animationFrameId);
            animationFrameId = window.requestAnimationFrame(() => {
                if (disposed) return;

                const height = measureContentHeight(rootElement);

                if (
                    lastHeight > 0 &&
                    Math.abs(height - lastHeight) < CHANGE_THRESHOLD
                ) {
                    return;
                }

                lastHeight = height;
                window.parent.postMessage(
                    { type: "EMBED_HEIGHT", frameId, height },
                    "*",
                );
            });
        }

        function scheduleSettledMeasurements(): void {
            for (const delay of SETTLE_DELAYS_MS) {
                const timerId = window.setTimeout(() => {
                    settleTimers.delete(timerId);
                    postMeasuredHeight();
                }, delay);
                settleTimers.add(timerId);
            }
        }

        scheduleSettledMeasurements();

        const resizeObserver = new ResizeObserver(scheduleSettledMeasurements);
        resizeObserver.observe(rootElement);

        const mutationObserver = new MutationObserver(scheduleSettledMeasurements);
        mutationObserver.observe(rootElement, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        const onResize = () => scheduleSettledMeasurements();
        const onLayoutEnd = () => scheduleSettledMeasurements();

        window.addEventListener("resize", onResize);
        document.addEventListener("transitionend", onLayoutEnd, true);
        document.addEventListener("animationend", onLayoutEnd, true);

        return () => {
            disposed = true;
            window.cancelAnimationFrame(animationFrameId);
            for (const timerId of settleTimers) window.clearTimeout(timerId);
            settleTimers.clear();
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener("resize", onResize);
            document.removeEventListener("transitionend", onLayoutEnd, true);
            document.removeEventListener("animationend", onLayoutEnd, true);
        };
    }, [contentRootId]);

    return null;
}
