"use client";

import { useEffect } from "react";

const SNAP = 4;
const MAX_HEIGHT = 5000;

function getFrameId() {
    return new URLSearchParams(window.location.search).get("frameId") || "";
}

export default function EmbedHeightReporter() {
    useEffect(() => {
        const frameId = getFrameId();
        let animationFrame = 0;
        let lastHeight = 0;

        function measureHeight() {
            const body = document.body;
            const html = document.documentElement;
            const bodyRect = body.getBoundingClientRect();

            const rawHeight = Math.max(
                bodyRect.bottom,
                body.scrollHeight,
                body.offsetHeight,
                html.scrollHeight,
                html.offsetHeight
            );

            return Math.min(MAX_HEIGHT, Math.ceil(rawHeight / SNAP) * SNAP);
        }

        function postHeight() {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = window.requestAnimationFrame(() => {
                const height = measureHeight();
                if (Math.abs(height - lastHeight) < SNAP) return;
                lastHeight = height;

                window.parent.postMessage(
                    { type: "EMBED_HEIGHT", frameId, height },
                    "*"
                );
            });
        }

        document.documentElement.style.overflowX = "hidden";
        document.body.style.overflowX = "hidden";

        postHeight();

        const resizeObserver = new ResizeObserver(postHeight);
        resizeObserver.observe(document.documentElement);
        resizeObserver.observe(document.body);

        const mutationObserver = new MutationObserver(postHeight);
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
        });

        window.addEventListener("load", postHeight);
        window.addEventListener("resize", postHeight);
        const interval = window.setInterval(postHeight, 1000);

        return () => {
            window.cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener("load", postHeight);
            window.removeEventListener("resize", postHeight);
            window.clearInterval(interval);
        };
    }, []);

    return null;
}
