"use client";

import ErudaLoader from "@/src/components/debug/ErudaLoader";
import { useDebugFlags } from "@/src/components/debug/useDebugFlags";

export default function DebugToolsWrapper() {
  const { eruda } = useDebugFlags();
  return <ErudaLoader enabled={eruda} />;
}
