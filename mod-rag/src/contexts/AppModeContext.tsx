// app/contexts/AppModeContext.tsx
"use client";

import {
  createContext,
  useContext,
  useMemo,
} from "react";
import { usePathname } from "next/navigation";

type AppMode = "normal" | "demo";

type AppModeContextValue = {
  mode: AppMode;
  isDemo: boolean;
  isReadOnly: boolean;
  disablePolling: boolean;
};

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const mode: AppMode =
    pathname?.startsWith("/demo") ? "demo" : "normal";

  const value = useMemo(
    () => ({
      mode,
      isDemo: mode === "demo",
      isReadOnly: mode === "demo",
      disablePolling: mode === "demo",
    }),
    [mode]
  );

  return (
    <AppModeContext.Provider value={value}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const ctx = useContext(AppModeContext);

  if (!ctx) {
    throw new Error("useAppMode must be used inside AppModeProvider");
  }

  return ctx;
}