"use client";

import { useEffect } from "react";

export type ToastProps = {
    message: string;
    type?: "info" | "success" | "error";

    /** Next.js RSC rule: function props must end with "Action". */
    onCloseAction: () => void;
};

const AUTO_DISMISS_MS = 4000;

export default function Toast({
    message,
    type = "info",
    onCloseAction,
}: ToastProps) {
    useEffect(() => {
        const timerId = window.setTimeout(
            onCloseAction,
            AUTO_DISMISS_MS,
        );

        return () => {
            window.clearTimeout(timerId);
        };
    }, [onCloseAction]);

    const colors =
        type === "success"
            ? "bg-green-600 text-white"
            : type === "error"
              ? "bg-red-600 text-white"
              : "bg-gray-800 text-white";

    return (
        <div
            className={`fixed bottom-4 right-4 z-50 rounded px-4 py-2 shadow-lg ${colors}`}
            role="alert"
            aria-live="assertive"
        >
            {message}
        </div>
    );
}