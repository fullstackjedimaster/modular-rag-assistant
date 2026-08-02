import "@/src/app/globals.css";

import type { ReactNode } from "react";

import EmbedHeightBoundary from "@/src/components/EmbedHeightBoundary";
import EmbedTokenListener from "@/src/components/EmbedTokenListener";
import { AppModeProvider } from "@/src/contexts/AppModeContext";

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <EmbedTokenListener />
                <AppModeProvider>
                    <EmbedHeightBoundary>{children}</EmbedHeightBoundary>
                </AppModeProvider>
            </body>
        </html>
    );
}
