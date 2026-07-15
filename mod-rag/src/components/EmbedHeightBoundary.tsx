"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import EmbedHeightReporter from "@/src/components/EmbedHeightReporter";

type EmbedHeightBoundaryProps = {
    children: ReactNode;
};

export default function EmbedHeightBoundary({
    children,
}: EmbedHeightBoundaryProps) {
    const pathname = usePathname();

    /*
     * /dock is a nested iframe with its own RAG_DOCK_RESIZE protocol.
     * Mounting the generic EMBED_HEIGHT reporter there would create
     * two competing resize systems.
     */
    const isDockRoute =
        pathname === "/dock" ||
        pathname.startsWith("/dock/");

    if (isDockRoute) {
        return <>{children}</>;
    }

    return (
        <>
            <div id="mod-rag-embed-content">
                {children}
            </div>

            <EmbedHeightReporter />
        </>
    );
}