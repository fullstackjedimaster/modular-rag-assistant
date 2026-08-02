(function () {
    "use strict";

    if (window.RagDock) return;

    var script = document.currentScript;
    if (!script) return;

    var targetSelector = script.dataset.target || "#rag-dock";
    var mount = document.querySelector(targetSelector);
    if (!mount) {
        console.error("[RagDock] Missing mount element: " + targetSelector);
        return;
    }

    var scriptUrl = new URL(script.src, window.location.href);
    var dockUrl = new URL(script.dataset.dockUrl || "/dock", scriptUrl.origin);
    var dockOrigin = dockUrl.origin;
    var app = script.dataset.app || "host-app";
    var density = script.dataset.density || "compact";
    var parentOrigin = "";

    try {
        var configuredParent = new URLSearchParams(window.location.search).get("embedParentOrigin");
        parentOrigin = configuredParent
            ? new URL(configuredParent).origin
            : document.referrer
                ? new URL(document.referrer).origin
                : "";
    } catch (_) {
        parentOrigin = "";
    }

    var iframe = null;
    var ready = false;
    var currentClientId = "";
    var currentTarget = null;

    function postToParent(message) {
        if (window.parent === window || !parentOrigin) return;
        window.parent.postMessage(message, parentOrigin);
    }

    function postToDock(message) {
        if (!ready || !iframe || !iframe.contentWindow) return;
        iframe.contentWindow.postMessage(message, dockOrigin);
    }

    function collectTheme() {
        var styles = window.getComputedStyle(mount);
        var vars = {};
        for (var index = 0; index < styles.length; index += 1) {
            var name = styles.item(index);
            if (!name || name.indexOf("--") !== 0) continue;
            var value = styles.getPropertyValue(name).trim();
            if (value) vars[name] = value;
        }
        return { type: "HOST_THEME", vars: vars, app: app, density: density };
    }

    function syncDock() {
        postToDock(collectTheme());
        if (currentTarget) postToDock(currentTarget);
    }

    function connect(ragClientId) {
        ragClientId = String(ragClientId || "").trim();
        if (!ragClientId) throw new Error("ragClientId is required");
        if (ragClientId === currentClientId && iframe) return;

        currentClientId = ragClientId;
        ready = false;
        mount.replaceChildren();

        var src = new URL(dockUrl.toString());
        src.searchParams.set("ragClientId", ragClientId);
        src.searchParams.set("hostOrigin", window.location.origin);

        iframe = document.createElement("iframe");
        iframe.src = src.toString();
        iframe.title = "AI explanation dock";
        iframe.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        );
        iframe.style.display = "block";
        iframe.style.width = "100%";
        iframe.style.height = "240px";
        iframe.style.border = "0";
        iframe.style.background = "transparent";
        mount.appendChild(iframe);
    }

    function disconnect() {
        currentClientId = "";
        ready = false;
        iframe = null;
        mount.replaceChildren();
        window.dispatchEvent(new CustomEvent("rag-dock-resize"));
    }

    function select(target) {
        if (!target || typeof target.id !== "string") return;
        currentTarget = {
            type: "TARGET_SELECTED",
            id: target.id,
            attrs: target.attrs || {},
            source: target.source || app,
        };
        postToDock(currentTarget);
        postToParent(currentTarget);
    }

    function onMessage(event) {
        var message = event.data;
        if (!message || typeof message !== "object") return;

        if (event.source === window && event.origin === window.location.origin) {
            if (message.type === "TARGET_SELECTED") select(message);
            return;
        }

        if (event.source === window.parent) {
            if (!parentOrigin || event.origin !== parentOrigin) return;
            if (message.type === "RAG_HOST_DISCOVER") {
                postToParent({ type: "RAG_HOST_READY" });
            } else if (message.type === "RAG_DOCK_CONNECT") {
                connect(message.ragClientId);
            } else if (message.type === "RAG_DOCK_DISCONNECT") {
                disconnect();
            }
            return;
        }

        if (!iframe || event.source !== iframe.contentWindow || event.origin !== dockOrigin) {
            return;
        }

        if (message.type === "DOCK_READY") {
            ready = true;
            syncDock();
            return;
        }

        if (message.type === "DOCK_RESIZE" && Number.isFinite(message.height)) {
            var height = Math.max(1, Math.min(5000, Math.ceil(message.height)));
            iframe.style.height = height + "px";
            window.dispatchEvent(
                new CustomEvent("rag-dock-resize", { detail: { height: height } })
            );
        }
    }

    window.addEventListener("message", onMessage);

    window.RagDock = {
        connect: connect,
        disconnect: disconnect,
        select: select,
        refreshTheme: syncDock,
        destroy: function () {
            disconnect();
            window.removeEventListener("message", onMessage);
            delete window.RagDock;
        },
    };

    postToParent({ type: "RAG_HOST_READY" });
})();
