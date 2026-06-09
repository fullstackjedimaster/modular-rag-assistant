// app/layout.tsx
import { AppModeProvider } from "@/src/contexts/AppModeContext";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppModeProvider>
          {children}
        </AppModeProvider>
      </body>
    </html>
  );
}