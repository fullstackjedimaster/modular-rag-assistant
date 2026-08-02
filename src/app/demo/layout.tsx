// mod-rag/src/app/demo/layout.tsx
import type { ReactNode } from "react";

type DemoLayoutProps = {
    children: ReactNode;
};

export default function DemoLayout({
    children,
}: DemoLayoutProps) {
    /*
     * This layout is nested beneath app/layout.tsx.
     * Do not render another <html>, <body>, AppModeProvider, or
     * EmbedHeightReporter here.
     */
    return children;
}