"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __POSTMESSAGE_TAP_INSTALLED__?: boolean;
    __POSTMESSAGE_TAP_ORIGINAL__?: Window["postMessage"];
  }
}

type PostMessageTapProps = {
  enabled?: boolean;
  label: string;
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
}

export default function PostMessageTap({
  enabled = false,
  label,
}: PostMessageTapProps) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (window.__POSTMESSAGE_TAP_INSTALLED__) return;

    window.__POSTMESSAGE_TAP_INSTALLED__ = true;

    const originalPostMessage = window.postMessage.bind(window);
    window.__POSTMESSAGE_TAP_ORIGINAL__ = window.postMessage;

    const patchedPostMessage: Window["postMessage"] = function (
      message: unknown,
      targetOriginOrOptions?: string | WindowPostMessageOptions,
      transfer?: Transferable[]
    ): void {
      console.groupCollapsed(
        `%c[postMessage:OUT][${label}]`,
        "color:#2563eb;font-weight:bold;"
      );
      console.log("targetOrigin/options:", targetOriginOrOptions);
      console.log("transfer:", transfer);
      console.log("message:", message);
      console.log("message.json:", safeJson(message));
      console.trace("stack");
      console.groupEnd();

      if (typeof targetOriginOrOptions === "string") {
        if (transfer) {
          originalPostMessage(message, targetOriginOrOptions, transfer);
          return;
        }

        originalPostMessage(message, targetOriginOrOptions);
        return;
      }

      originalPostMessage(message, targetOriginOrOptions);
    };

    window.postMessage = patchedPostMessage;

    const onMessage = (ev: MessageEvent) => {
      console.groupCollapsed(
        `%c[postMessage:IN][${label}]`,
        "color:#16a34a;font-weight:bold;"
      );
      console.log("origin:", ev.origin);
      console.log("source:", ev.source);
      console.log("data:", ev.data);
      console.log("data.json:", safeJson(ev.data));
      console.groupEnd();
    };

    window.addEventListener("message", onMessage);

    console.log(`[debug] PostMessageTap installed for ${label}`);

    return () => {
      window.removeEventListener("message", onMessage);

      if (window.__POSTMESSAGE_TAP_ORIGINAL__) {
        window.postMessage = window.__POSTMESSAGE_TAP_ORIGINAL__;
        delete window.__POSTMESSAGE_TAP_ORIGINAL__;
      }

      window.__POSTMESSAGE_TAP_INSTALLED__ = false;
    };
  }, [enabled, label]);

  return null;
}
