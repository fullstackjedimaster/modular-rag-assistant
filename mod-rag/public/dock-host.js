(function () {
    "use strict";

    if (window.RagDock) return;

    const script = document.currentScript;
    if (!script) return;

    const targetSelector =
        script.dataset.target || "#rag-dock";

    const mount = document.querySelector(
        targetSelector,
    );

    if (!mount) {
        console.error(
            "[RagDock] Missing mount element: " +
                targetSelector,
        );
        return;
    }

    const scriptUrl = new URL(
        script.src,
        window.location.href,
    );

    const dockUrl = new URL(
        script.dataset.dockUrl || "/dock",
        scriptUrl.origin,
    );

    const dockOrigin = dockUrl.origin;
    const app = script.dataset.app || "host-app";
    const density =
        script.dataset.density || "compact";

    let parentOrigin = "";

    try {
        const configuredParent =
            new URLSearchParams(
                window.location.search,
            ).get("embedParentOrigin");

        parentOrigin = configuredParent
            ? new URL(configuredParent).origin
            : document.referrer
              ? new URL(document.referrer).origin
              : "";
    } catch (_) {
        parentOrigin = "";
    }

    let iframe = null;
    let dockReady = false;
    let currentHostId = "";
    let currentTarget = null;

    function getRetainedTarget() {
        const retained =
            window.__FSJ_RAG_SELECTED_TARGET__;

        if (
            !retained ||
            retained.type !== "TARGET_SELECTED" ||
            typeof retained.id !== "string" ||
            !retained.id
        ) {
            return null;
        }

        return {
            type: "TARGET_SELECTED",
            id: retained.id,
            attrs: retained.attrs || {},
            source: retained.source || app,
        };
    }

    /*
     * Recover any target Entity Client published before
     * this script finished loading.
     */
    currentTarget = getRetainedTarget();

    function postToParent(message) {
        if (
            window.parent === window ||
            !parentOrigin
        ) {
            return;
        }

        window.parent.postMessage(
            message,
            parentOrigin,
        );
    }

    function postToDock(message) {
        if (
            !dockReady ||
            !iframe ||
            !iframe.contentWindow
        ) {
            return;
        }

        iframe.contentWindow.postMessage(
            message,
            dockOrigin,
        );
    }

    function collectTheme() {
        const styles =
            window.getComputedStyle(mount);

        const vars = {};

        for (
            let index = 0;
            index < styles.length;
            index += 1
        ) {
            const name = styles.item(index);

            if (
                !name ||
                name.indexOf("--") !== 0
            ) {
                continue;
            }

            const value = styles
                .getPropertyValue(name)
                .trim();

            if (value) {
                vars[name] = value;
            }
        }

        return {
            type: "HOST_THEME",
            vars: vars,
            app: app,
            density: density,
        };
    }

    function syncDock() {
        /*
         * The host may have published its first target after
         * this script loaded but before the dock iframe became
         * ready. Recover it again here.
         */
        const retained = getRetainedTarget();

        if (retained) {
            currentTarget = retained;
        }

        postToDock(collectTheme());

        if (currentTarget) {
            postToDock(currentTarget);
        }
    }

    function announceResize(height) {
        window.dispatchEvent(
            new CustomEvent("rag-dock-resize", {
                detail: {
                    height: height,
                },
            }),
        );
    }

    function connect(ragHostId) {
        const nextHostId = String(
            ragHostId || "",
        ).trim();

        if (!nextHostId) {
            throw new Error(
                "ragHostId is required",
            );
        }

        if (
            nextHostId === currentHostId &&
            iframe
        ) {
            /*
             * The same assistant is already mounted. Replay
             * the latest target instead of doing nothing.
             */
            syncDock();
            return;
        }

        currentHostId = nextHostId;
        dockReady = false;

        /*
         * Capture the latest host target immediately before
         * constructing the assistant iframe.
         */
        const retained = getRetainedTarget();

        if (retained) {
            currentTarget = retained;
        }

        mount.replaceChildren();

        const src = new URL(dockUrl.toString());

        src.searchParams.set(
            "ragHostId",
            nextHostId,
        );

        src.searchParams.set(
            "hostOrigin",
            window.location.origin,
        );

        iframe =
            document.createElement("iframe");

        iframe.src = src.toString();
        iframe.title = "AI explanation assistant";

        iframe.setAttribute(
            "sandbox",
            [
                "allow-scripts",
                "allow-same-origin",
                "allow-forms",
                "allow-popups",
                "allow-downloads",
            ].join(" "),
        );

        iframe.style.display = "block";
        iframe.style.width = "100%";
        iframe.style.height = "240px";
        iframe.style.border = "0";
        iframe.style.background =
            "transparent";

        mount.appendChild(iframe);
        announceResize(240);
    }

    function disconnect() {
        currentHostId = "";
        dockReady = false;
        iframe = null;

        mount.replaceChildren();
        announceResize(0);
    }

    function select(target) {
        if (
            !target ||
            typeof target.id !== "string" ||
            !target.id
        ) {
            return;
        }

        currentTarget = {
            type: "TARGET_SELECTED",
            id: target.id,
            attrs: target.attrs || {},
            source: target.source || app,
        };

        /*
         * Retain every new target so a later assistant mount
         * or reconnect can replay it.
         */
        window.__FSJ_RAG_SELECTED_TARGET__ =
            currentTarget;

        postToDock(currentTarget);
        postToParent(currentTarget);
    }

    function onMessage(event) {
        const message = event.data;

        if (
            !message ||
            typeof message !== "object"
        ) {
            return;
        }

        /*
         * Messages published by Entity Client itself.
         */
        if (
            event.source === window &&
            event.origin ===
                window.location.origin
        ) {
            if (
                message.type ===
                "TARGET_SELECTED"
            ) {
                select(message);
            }

            return;
        }

        /*
         * Commands sent by the Modular RAG dashboard in the
         * parent Portfolio frame.
         */
        if (event.source === window.parent) {
            if (
                !parentOrigin ||
                event.origin !== parentOrigin
            ) {
                return;
            }

            if (
                message.type ===
                "RAG_HOST_DISCOVER"
            ) {
                postToParent({
                    type: "RAG_HOST_READY",
                });
            } else if (
                message.type ===
                "RAG_DOCK_CONNECT"
            ) {
                connect(message.ragHostId);
            } else if (
                message.type ===
                "RAG_DOCK_DISCONNECT"
            ) {
                disconnect();
            }

            return;
        }

        /*
         * Messages sent by the nested assistant iframe.
         */
        if (
            !iframe ||
            event.source !==
                iframe.contentWindow ||
            event.origin !== dockOrigin
        ) {
            return;
        }

        if (message.type === "DOCK_READY") {
            dockReady = true;

            /*
             * Theme and retained target are both replayed here.
             */
            syncDock();
            return;
        }

        if (
            message.type === "DOCK_RESIZE" &&
            Number.isFinite(message.height)
        ) {
            const height = Math.max(
                1,
                Math.min(
                    5000,
                    Math.ceil(message.height),
                ),
            );

            iframe.style.height =
                height + "px";

            announceResize(height);
        }
    }

    window.addEventListener(
        "message",
        onMessage,
    );

    window.RagDock = {
        connect: connect,
        disconnect: disconnect,
        select: select,
        refreshTheme: syncDock,

        destroy: function () {
            disconnect();

            window.removeEventListener(
                "message",
                onMessage,
            );

            delete window.RagDock;
        },
    };

    /*
     * Tell the parent dashboard the host loader is ready.
     * The dashboard can now attach the configured assistant.
     */
    postToParent({
        type: "RAG_HOST_READY",
    });
})();