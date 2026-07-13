"use client";

import { useEffect } from "react";

const SNAP = 4;
const MAX_HEIGHT = 5000;
const CHANGE_THRESHOLD = 2;
const POLL_INTERVAL_MS = 250;
const SETTLE_DELAYS_MS = [0, 50, 150, 350, 750];

function getFrameId(): string {
    return new URLSearchParams(window.location.search).get("frameId") || "";
}

function snapHeight(height: number): number {
    return Math.min(MAX_HEIGHT, Math.ceil(height / SNAP) * SNAP);
}

function measureDocumentHeight(): number {
    const body = document.body;
    const html = document.documentElement;
    const scrollingElement = document.scrollingElement;

    const bodyRect = body.getBoundingClientRect();
    const htmlRect = html.getBoundingClientRect();

    let deepestBottom = 0;

    for (const child of Array.from(body.children)) {
        const rect = child.getBoundingClientRect();
        deepestBottom = Math.max(deepestBottom, rect.bottom + window.scrollY);
    }

    const rawHeight = Math.max(
        bodyRect.bottom + window.scrollY,
        htmlRect.bottom + window.scrollY,
        deepestBottom,
        body.scrollHeight,
        body.offsetHeight,
        html.scrollHeight,
        html.offsetHeight,
        scrollingElement?.scrollHeight ?? 0,
    );

    return snapHeight(rawHeight);
}

export default function EmbedHeightReporter() {
    useEffect(() => {
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

                const height = measureDocumentHeight();

                if (lastHeight > 0 && Math.abs(height - lastHeight) < CHANGE_THRESHOLD) {
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

        document.documentElement.style.overflowX = "hidden";
        document.body.style.overflowX = "hidden";

        scheduleSettledMeasurements();

        const resizeObserver = new ResizeObserver(scheduleSettledMeasurements);
        resizeObserver.observe(document.documentElement);
        resizeObserver.observe(document.body);

        for (const child of Array.from(document.body.children)) {
            resizeObserver.observe(child);
        }

        const mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of Array.from(mutation.addedNodes)) {
                    if (node instanceof HTMLElement) {
                        resizeObserver.observe(node);
                    }
                }
            }

            scheduleSettledMeasurements();
        });

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
        });

        const onLoad = () => scheduleSettledMeasurements();
        const onResize = () => scheduleSettledMeasurements();
        const onTransitionEnd = () => scheduleSettledMeasurements();

        window.addEventListener("load", onLoad);
        window.addEventListener("resize", onResize);
        document.addEventListener("transitionend", onTransitionEnd, true);
        document.addEventListener("animationend", onTransitionEnd, true);

        const intervalId = window.setInterval(postMeasuredHeight, POLL_INTERVAL_MS);

        return () => {
            disposed = true;
            window.cancelAnimationFrame(animationFrameId);

            for (const timerId of settleTimers) {
                window.clearTimeout(timerId);
            }

            settleTimers.clear();
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener("load", onLoad);
            window.removeEventListener("resize", onResize);
            document.removeEventListener("transitionend", onTransitionEnd, true);
            document.removeEventListener("animationend", onTransitionEnd, true);
            window.clearInterval(intervalId);
        };
    }, []);

    return null;
}
