"use client";

import { useEffect, useState } from "react";
import {
  getRagClient,
  type RagClientFull,
  type PromptChainingMode,
} from "@/app/lib/ragClientApi";

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
  chaining_mode: PromptChainingMode;
  groupbox_title: string;
  default_query: string;
};

export type UseCaseMap = Record<string, UseCaseConfig>;

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

function ragClientToUseCase(client: RagClientFull): UseCaseConfig {
  return {
    id: client.id,
    projectKey: client.id,
    label: client.name,
    description: client.host_url || client.name,
    collection: client.collection,
    prompt_template: client.prompt,
    telemetry_keys: client.telemetry_messages.map((m) => m.message_name),
    llm_model: client.llm_model,
    embed_model: client.embed_model,
    chaining_mode: client.chaining_mode,
    groupbox_title: client.name,
    default_query: "",
  };
}

export function useUseCase(ragClientId?: string) {
  const [allUsecases, setAllUsecases] = useState<UseCaseMap>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [loaded, setLoaded] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function loadUsecaseFromRagClient() {
      setLoaded(false);

      if (!ragClientId) {
        setAllUsecases({});
        setSelectedId("");
        setLoaded(true);
        return;
      }

      try {
        const client = await getRagClient(ragClientId);

        if (cancelled) return;

        const usecase = ragClientToUseCase(client);

        setAllUsecases({
          [usecase.id]: usecase,
        });

        setSelectedId(usecase.id);
        setLoaded(true);
      } catch (error) {
        console.error("Failed to load RAG client as usecase:", error);

        if (!cancelled) {
          setAllUsecases({});
          setSelectedId("");
          setLoaded(true);
        }
      }
    }

    void loadUsecaseFromRagClient();

    return () => {
      cancelled = true;
    };
  }, [ragClientId]);

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