"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type DebugFlags = {
  eruda: boolean;
  msgdebug: boolean;
};

function isTruthy(value: string | null): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function useDebugFlags(): DebugFlags {
  const params = useSearchParams();

  return useMemo(() => {
    return {
      eruda: isTruthy(params.get("eruda")),
      msgdebug: isTruthy(params.get("msgdebug")),
    };
  }, [params]);
}
