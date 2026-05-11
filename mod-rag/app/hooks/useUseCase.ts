"use client";

import { useEffect, useState } from "react";
import {settings} from "@/app/lib/settings";

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
  usecases?: UseCaseMap;
};

type AISelectUsecaseMsg = {
  type: "AI_SELECT_USECASE";
  projectKey: string;
};

function postToParent(msg: AISelectUsecaseMsg): void {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;

  try {
    window.parent.postMessage(msg, "*");
  } catch {
    // no-op
  }
}

export function useUseCase() {
  const [allUsecases, setAllUsecases] = useState<UseCaseMap>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [loaded, setLoaded] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function loadUsecases() {
      try {
        const base = (settings.AI_CORE_BASE || "/config").replace(/\/+$/, "");
        const url = `${base}/usecases.json?t=${Date.now()}`;

        const response = await fetch(url, {
          cache: "no-store",
          headers: {
            pragma: "no-cache",
            "cache-control": "no-cache, no-store, must-revalidate",
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load usecases.json: ${response.status}`);
        }

        const json = (await response.json()) as UsecasesJson;

        if (cancelled) return;

        const map = json.usecases || {};
        const def = json.default || Object.keys(map)[0] || "";

        setAllUsecases(map);
        setSelectedId(def);
        setLoaded(true);
      } catch (error) {
        console.error("Failed to load usecases:", error);

        if (!cancelled) {
          setAllUsecases({});
          setSelectedId("");
          setLoaded(true);
        }
      }
    }

    void loadUsecases();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !selectedId) return;

    const cfg = allUsecases[selectedId];
    const projectKey = (cfg?.projectKey || cfg?.id || selectedId).trim();

    if (!projectKey) return;

    postToParent({
      type: "AI_SELECT_USECASE",
      projectKey,
    });
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