"use client";

import { useEffect } from "react";

const SNAP = 8;
const MAX_HEIGHT = 5000;

function getFrameId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("frameId") || "";
}

export default function EmbedHeightReporter() {
    useEffect(() => {
        const frameId = getFrameId();

        function getHeight() {
            const body = document.body;
            const html = document.documentElement;

            const rawHeight = Math.max(
                body.scrollHeight,
                body.offsetHeight,
                html.scrollHeight,
                html.offsetHeight
            );

            return Math.min(
                MAX_HEIGHT,
                Math.ceil(rawHeight / SNAP) * SNAP
            );
        }

        function postHeight() {
            window.parent.postMessage(
                {
                    type: "EMBED_HEIGHT",
                    frameId,
                    height: getHeight(),
                },
                "*"
            );
        }

        postHeight();

        const resizeObserver = new ResizeObserver(postHeight);
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
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener("load", postHeight);
            window.removeEventListener("resize", postHeight);
            window.clearInterval(interval);
        };
    }, []);

    return null;
}