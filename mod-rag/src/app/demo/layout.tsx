// app/layout.tsx
import { AppModeProvider } from "@/src/contexts/AppModeContext";
import "@/src/app/globals.css";
import EmbedHeightReporter   from "@/src/components/EmbedHeightReporter";

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
      <EmbedHeightReporter />
        <AppModeProvider>
          {children}
        </AppModeProvider>
      </body>
    </html>
  );
}