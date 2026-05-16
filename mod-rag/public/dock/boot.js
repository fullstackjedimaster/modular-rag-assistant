/* Dock loader + height sync (idempotent, anti-creep) */
(function () {
    var scriptEl =
        document.currentScript ||
        (function () {
            var s = document.getElementsByTagName("script");
            return s[s.length - 1] || null;
        })();

    var origin = (scriptEl && scriptEl.dataset && scriptEl.dataset.origin) || "";
    origin = String(origin).trim().replace(/\/$/, "");

    var visible = (scriptEl && scriptEl.dataset && scriptEl.dataset.visible) || "1";
    var heightPx = (scriptEl && scriptEl.dataset && scriptEl.dataset.height) || "360";
    var ragClientId =
        (scriptEl && scriptEl.dataset && scriptEl.dataset.ragClientId) || "";

    if (!origin) {
        console.error("[dock/boot] Missing data-origin. Refusing to inject iframe.");
        return;
    }

    var frameId = scriptEl.dataset.frameId || "iframe-1";
    var containerId = "dock-wrapper-" + frameId;

    var wrapper = document.getElementById(containerId);
    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = containerId;
        wrapper.style.width = "100%";
        wrapper.style.maxWidth = "760px";
        wrapper.style.margin = "0 auto";
        wrapper.style.padding = "0";
        wrapper.style.border = "0";
        scriptEl.parentNode.insertBefore(wrapper, scriptEl.nextSibling);
    }

    var iframe = document.getElementById(frameId);
    if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.id = frameId;
        iframe.setAttribute("allow", "clipboard-write *; clipboard-read *");
        iframe.setAttribute("title", "AI Dock");
        iframe.style.display = visible === "1" ? "block" : "none";
        iframe.style.width = "100%";
        iframe.style.border = "0";
        iframe.style.overflow = "hidden";
        iframe.style.height = parseInt(heightPx, 10) + "px";
        wrapper.appendChild(iframe);
    }

    var lastApplied = parseInt(heightPx, 10) || 360;

    function applyHeight(h) {
        if (!iframe) return;

        var clamped = Math.max(160, Math.min(2400, Math.round(h)));

        if (Math.abs(clamped - lastApplied) < 8) return;

        lastApplied = clamped;
        iframe.style.height = clamped + "px";
    }

    function buildDockSrc(nextRagClientId) {
        var qs =
            "?frameId=" +
            encodeURIComponent(frameId) +
            "&dock=1";

        if (nextRagClientId) {
            qs += "&ragClientId=" + encodeURIComponent(nextRagClientId);
        }

        return origin.replace(/\/$/, "") + "/dock" + qs;
    }

    function setRagClientId(nextRagClientId) {
        ragClientId = String(nextRagClientId || "").trim();
        iframe.src = buildDockSrc(ragClientId);
    }

    iframe.src = buildDockSrc(ragClientId);

    window.addEventListener("message", function (ev) {
        var data = ev.data || {};

        if (data.type === "EMBED_HEIGHT") {
            if (data.frameId && data.frameId !== frameId) return;
            applyHeight(data.height);
            return;
        }

        if (data.type === "RAG_CLIENT_SELECTED") {
            if (typeof data.ragClientId !== "string" || !data.ragClientId.trim()) {
                console.error("[dock/boot] RAG_CLIENT_SELECTED missing ragClientId.", data);
                return;
            }

            setRagClientId(data.ragClientId);
        }
    });
})();