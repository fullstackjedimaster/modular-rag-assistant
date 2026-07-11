"use client";

import {
    useEffect,
    useState,
} from "react";

interface Props {
    text: string;
    loading: boolean;
}

function useAnimatedEllipsis(
    active: boolean,
    maxDots = 4,
    intervalMs = 450,
): string {
    const [dotCount, setDotCount] = useState(1);

    useEffect(() => {
        if (!active) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setDotCount((current) =>
                current >= maxDots ? 1 : current + 1,
            );
        }, intervalMs);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [active, intervalMs, maxDots]);

    return active ? ".".repeat(dotCount) : "";
}

export const ResponseStream: React.FC<Props> = ({
    text,
    loading,
}) => {
    const dots = useAnimatedEllipsis(loading);
    const hasOutput = text.trim().length > 0;

    const statusLabel = hasOutput
        ? `Streaming${dots}`
        : `Waiting${dots}`;

    return (
        <div className="rounded bg-gray-100 p-4 text-sm whitespace-pre-wrap dark:bg-gray-800">
            {loading && (
                <div
                    className="mb-2 text-gray-500 dark:text-gray-400"
                    role="status"
                    aria-live="polite"
                >
                    {statusLabel}
                </div>
            )}

            {text}
        </div>
    );
};