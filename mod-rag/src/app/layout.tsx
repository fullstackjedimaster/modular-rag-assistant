// mod-rag/src/app/layout.tsx
import "@/src/app/globals.css";

import type { ReactNode } from "react";

import EmbedHeightBoundary from "@/src/components/EmbedHeightBoundary";
import { AppModeProvider } from "@/src/contexts/AppModeContext";

type RootLayoutProps = {
    children: ReactNode;
};

export default function RootLayout({
    children,
}: RootLayoutProps) {
    return (
        <html lang="en">
            <body>
                <AppModeProvider>
                    <EmbedHeightBoundary>
                        {children}
                    </EmbedHeightBoundary>
                </AppModeProvider>
            </body>
        </html>
    );
}