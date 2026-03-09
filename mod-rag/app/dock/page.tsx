"use client";

import React, { Suspense } from "react";
import DockInner from "./DockInner";

export default function DockPage() {
  return (
    <Suspense fallback={<div className="p-3 text-sm text-gray-500">Loading dock…</div>}>
      <DockInner />
    </Suspense>
  );
}
