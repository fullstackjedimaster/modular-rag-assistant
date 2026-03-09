"use client";

import ErudaLoader from "@/app/components/debug/ErudaLoader";
import { useDebugFlags } from "@/app/components/debug/useDebugFlags";

export default function DebugToolsWrapper() {
  const { eruda } = useDebugFlags();
  return <ErudaLoader enabled={eruda} />;
}
