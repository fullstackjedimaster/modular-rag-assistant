"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DEMO_TARGETS } from "@/app/lib/demoTargets";
import {
  parseSelectionMessage,
  type RagClientSelectedMsg,
} from "@/app/lib/messages";
import PostMessageTap from "@/app/components/debug/PostMessageTap";
import { useDebugFlags } from "@/app/components/debug/useDebugFlags";
import { debugPostMessage } from "@/app/lib/debugPostMessage";

function DebugTapMount() {
  const { msgdebug } = useDebugFlags();
  return <PostMessageTap enabled={msgdebug} label="mod-rag-host" />;
}

export default function HomePage() {
  const [selectedKey, setSelectedKey] = useState<string>(DEMO_TARGETS[0]?.key ?? "");
  const targetFrameRef = useRef<HTMLIFrameElement | null>(null);
  const dockFrameRef = useRef<HTMLIFrameElement | null>(null);

  const selectedTarget = useMemo(
    () => DEMO_TARGETS.find((t) => t.key === selectedKey) ?? DEMO_TARGETS[0],
    [selectedKey]
  );

  const dockUrl = useMemo(() => {
    if (!selectedTarget) return "/dock";

    const params = new URLSearchParams({
      client: selectedTarget.ragClientId,
      collapsed: "1",
    });

    if (selectedTarget.defaultUsecaseId) {
      params.set("usecase", selectedTarget.defaultUsecaseId);
    }

    return `/dock?${params.toString()}`;
  }, [selectedTarget]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent<unknown>) => {
      const targetWindow = targetFrameRef.current?.contentWindow;
      const dockWindow = dockFrameRef.current?.contentWindow;

      if (!targetWindow || !dockWindow) return;
      if (ev.source !== targetWindow) return;

      try {
        const msg = parseSelectionMessage(ev.data);
        debugPostMessage(dockWindow, msg, "*", "host relay TARGET_SELECTED -> dock");
      } catch {
        // Ignore unrelated messages from the target iframe.
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const dockWindow = dockFrameRef.current?.contentWindow;
    if (!dockWindow || !selectedTarget) return;

    const msg: RagClientSelectedMsg = {
      type: "RAG_CLIENT_SELECTED",
      client: selectedTarget.ragClientId,
      hostUrl: selectedTarget.targetUrl,
      label: selectedTarget.label,
      defaultUsecase: selectedTarget.defaultUsecaseId ?? null,
    };

    debugPostMessage(dockWindow, msg, "*", "host -> dock RAG_CLIENT_SELECTED");
  }, [selectedTarget]);

  if (!selectedTarget) {
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900">
        <div className="mx-auto max-w-5xl p-6">
          <h1 className="text-2xl font-bold">Modular RAG Assistant Demo</h1>
          <p className="mt-2 text-sm text-red-600">No demo targets are configured.</p>

          <Suspense fallback={null}>
            <DebugTapMount />
          </Suspense>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900">
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Modular RAG Assistant Demo</h1>
              <p className="max-w-3xl text-sm text-gray-600">
                Select a dockable project demo, then explore it side-by-side with the
                SmartExplainer controller. The host relays runtime target selections from the
                target app into the dock automatically.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/clients"
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                Manage RAG Clients
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm">
            <label
              htmlFor="demo-target"
              className="mb-2 block text-sm font-medium text-gray-800"
            >
              Select Project Demo
            </label>

            <select
              id="demo-target"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 md:max-w-md"
            >
              {DEMO_TARGETS.filter((t) => t.dockable).map((target) => (
                <option key={target.key} value={target.key}>
                  {target.label}
                </option>
              ))}
            </select>

            <p className="mt-3 text-sm text-gray-600">{selectedTarget.description}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900">{selectedTarget.label}</h2>
              <p className="text-xs text-gray-500">{selectedTarget.targetUrl}</p>
            </div>

            <div className="h-[72vh] min-h-[560px]">
              <iframe
                ref={targetFrameRef}
                title={`${selectedTarget.label} target demo`}
                src={selectedTarget.targetUrl}
                className="h-full w-full border-0"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900">
                SmartExplainer Controller
              </h2>
              <p className="text-xs text-gray-500">
                Project: {selectedTarget.label} · Client: {selectedTarget.ragClientId}
              </p>
            </div>

            <div className="h-[72vh] min-h-[560px]">
              <iframe
                ref={dockFrameRef}
                title="SmartExplainer controller"
                src={dockUrl}
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </section>
      </div>

      <Suspense fallback={null}>
        <DebugTapMount />
      </Suspense>
    </main>
  );
}
