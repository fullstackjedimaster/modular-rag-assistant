import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import DebugToolsWrapper from "@/src/components/debug/DebugToolsWrapper";

export const metadata: Metadata = {
  title: "Modular RAG Assistant",
  description: "Modular RAG Assistant",
};

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="en">
      <body className="bg-white text-gray-900 antialiased">
      <Suspense fallback={null}>
        <DebugToolsWrapper />
      </Suspense>

      {children}
      </body>
      </html>
  );
}