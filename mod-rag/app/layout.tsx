import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import DebugToolsWrapper from "@/app/components/debug/DebugToolsWrapper";

export const metadata: Metadata = {
  title: "Modular RAG Assistant",
  description: "Modular RAG Assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <DebugToolsWrapper />
        </Suspense>

        {children}
      </body>
    </html>
  );
}
