// /ai-ui/src/components/Toast.tsx
"use client";

import { useEffect } from "react";

export type ToastProps = {
    message: string;
    type?: "info" | "success" | "error";
    /** Next.js RSC rule: function props must end with "Action" */
    onCloseAction: () => void;
};

export default function Toast({ message, type = "info", onCloseAction }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(onCloseAction, 4000); // auto-dismiss
        return () => clearTimeout(timer);
    }, [onCloseAction]);

    const colors =
        type === "success"
            ? "bg-green-600 text-white"
            : type === "error"
                ? "bg-red-600 text-white"
                : "bg-gray-800 text-white";

    return (
        <div
            className={`fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg ${colors} z-50`}
            role="alert"
        >
            {message}
        </div>
    );
}
