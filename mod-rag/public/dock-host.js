(function () {
    "use strict";

    var script = document.currentScript;

    if (!script) {
        throw new Error("dock-host.js must run from a script element.");
    }

    var targetSelector = script.dataset.target;
    var app = script.dataset.app;
    var density = script.dataset.density;

    if (!targetSelector || !app || !density) {
        throw new Error(
            "dock-host.js requires data-target, data-app, and data-density.",
        );
    }

    var mount = document.querySelector(targetSelector);

    if (!mount) {
        throw new Error("Dock mount not found: " + targetSelector);
    }

    var dockUrl = new URL(script.dataset.dockUrl || "/dock", script.src);
    var dockOrigin = dockUrl.origin;
    var iframe = null;
    var ready = false;
    var selectedTarget = null;
    var lastHeight = 0;

    function collectTheme() {
        var styles = window.getComputedStyle(mount);
        var vars = {};

        for (var index = 0; index < styles.length; index += 1) {
            var name = styles.item(index);

            if (name.indexOf("--") === 0) {
                vars[name] = styles.getPropertyValue(name).trim();
            }
        }

        return {
            type: "HOST_THEME",
            vars: vars,
            app: app,
            density: density,
        };
    }

    function postToDock(message) {
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(message, dockOrigin);
        }
    }

    function syncDock() {
        postToDock(collectTheme());

        if (selectedTarget) {
            postToDock(selectedTarget);
        }
    }

    function createFrame(ragClientId) {
        var src = new URL(dockUrl.toString());
        src.searchParams.set("ragClientId", ragClientId);

        iframe = document.createElement("iframe");
        iframe.src = src.toString();
        iframe.title = "AI explanation dock";
        iframe.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads",
        );
        iframe.style.display = "block";
        iframe.style.width = "100%";
        iframe.style.height = "600px";
        iframe.style.border = "0";
        iframe.style.background = "transparent";

        mount.replaceChildren(iframe);
        ready = false;
        lastHeight = 600;
    }

    function connect(ragClientId) {
        if (typeof ragClientId !== "string" || !ragClientId.trim()) {
            throw new Error("RagDock.connect requires a ragClientId.");
        }

        createFrame(ragClientId.trim());
    }

    function disconnect() {
        ready = false;
        iframe = null;
        lastHeight = 0;
        mount.replaceChildren();
    }

    function select(target) {
        if (
            !target ||
            typeof target.id !== "string" ||
            typeof target.source !== "string" ||
            !target.attrs ||
            typeof target.attrs !== "object"
        ) {
            throw new Error("RagDock.select requires id, attrs, and source.");
        }

        selectedTarget = {
            type: "TARGET_SELECTED",
            id: target.id,
            attrs: target.attrs,
            source: target.source,
        };

        if (ready) {
            postToDock(selectedTarget);
        }

        if (window.parent !== window) {
            window.parent.postMessage(selectedTarget, dockOrigin);
        }
    }

    function refreshTheme() {
        if (ready) {
            postToDock(collectTheme());
        }
    }

    function applyHeight(height) {
        if (!iframe || typeof height !== "number" || !Number.isFinite(height)) {
            return;
        }

        var nextHeight = Math.max(240, Math.min(5000, Math.ceil(height)));

        if (nextHeight === lastHeight) {
            return;
        }

        lastHeight = nextHeight;
        iframe.style.height = nextHeight + "px";
    }

    function isLocalCommand(event) {
        return event.source === window && event.origin === window.location.origin;
    }

    function isControllerCommand(event) {
        return event.source === window.parent && event.origin === dockOrigin;
    }

    function onMessage(event) {
        var message = event.data;

        if (!message || typeof message.type !== "string") {
            return;
        }

        if (
            iframe &&
            event.source === iframe.contentWindow &&
            event.origin === dockOrigin
        ) {
            if (message.type === "DOCK_READY") {
                ready = true;
                syncDock();
                return;
            }

            if (message.type === "DOCK_RESIZE") {
                applyHeight(message.height);
            }

            return;
        }

        if (!isLocalCommand(event) && !isControllerCommand(event)) {
            return;
        }

        if (message.type === "RAG_HOST_DISCOVER" && isControllerCommand(event)) {
            window.parent.postMessage({ type: "RAG_HOST_READY" }, dockOrigin);
            return;
        }

        if (message.type === "RAG_DOCK_CONNECT") {
            connect(message.ragClientId);
            return;
        }

        if (message.type === "RAG_DOCK_DISCONNECT") {
            disconnect();
            return;
        }

        if (message.type === "TARGET_SELECTED" && isLocalCommand(event)) {
            select(message);
        }
    }

    window.addEventListener("message", onMessage);

    window.RagDock = Object.freeze({
        connect: connect,
        disconnect: disconnect,
        select: select,
        refreshTheme: refreshTheme,
        destroy: function () {
            window.removeEventListener("message", onMessage);
            disconnect();
            delete window.RagDock;
        },
    });

    var initialRagClientId = script.dataset.ragClientId;

    if (initialRagClientId) {
        connect(initialRagClientId);
    }

})();
