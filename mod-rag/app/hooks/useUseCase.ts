"use client";

import { useEffect, useState } from "react";

export type UseCaseConfig = {
  id: string;
  projectKey?: string;
  label: string;
  description: string;
  collection: string;
  prompt_template: string;
  telemetry_keys: string[];
  llm_model: string;
  embed_model: string;
  groupbox_title: string;
  default_query: string;
};

export type UseCaseMap = Record<string, UseCaseConfig>;

type UsecasesJson = {
  default?: string;
  usecases: UseCaseMap;
};

type AISelectUsecaseMsg = {
  type: "AI_SELECT_USECASE";
  projectKey: string;
};

function postToParent(msg: AISelectUsecaseMsg) {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  try {
    window.parent.postMessage(msg, "*");
  } catch {
    // no-op
  }
}

export function useUsecase() {
  const [allUsecases, setAllUsecases] = useState<UseCaseMap>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const base = (process.env.NEXT_PUBLIC_CONFIG_BASE || "/config").replace(/\/+$/, "");
    const url = `${base}/usecases.json?t=${Date.now()}`;

    fetch(url, {
      cache: "no-store",
      headers: {
        pragma: "no-cache",
        "cache-control": "no-cache, no-store, must-revalidate",
      },
    })
      .then((r) => r.json())
      .then((json: UsecasesJson) => {
        if (cancelled) return;

        const map = json.usecases || {};
        const def = json.default || Object.keys(map)[0] || "";

        setAllUsecases(map);
        setSelectedId(def);
        setLoaded(true);
      })
      .catch((e) => {
        console.error("Failed to load usecases:", e);
        if (!cancelled) {
          setAllUsecases({});
          setSelectedId("");
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !selectedId) return;
    const cfg = allUsecases[selectedId];
    const projectKey = (cfg?.projectKey || cfg?.id || selectedId).trim();
    if (!projectKey) return;
    postToParent({ type: "AI_SELECT_USECASE", projectKey });
  }, [loaded, selectedId, allUsecases]);

  const selected = selectedId ? allUsecases[selectedId] : undefined;

  return {
    allUsecases,
    selectedId,
    selected,
    setSelectedId,
    loaded,
  };
}
