"use client";

import { useEffect, useRef, useState } from "react";

export type UseCaseConfig = {
    id: string;                   // Logical id (e.g., "mesh")
    projectKey?: string;          // Portfolio key (defaults to id)
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
    default?: string;   // default id
    usecases: UseCaseMap;
};

type AISelectUsecaseMsg = {
    type: "AI_SELECT_USECASE";
    projectKey: string;
};

function postToParent(msg: AISelectUsecaseMsg) {
    if (typeof window === "undefined") return;
    if (window.parent === window) return; // standalone: do nothing
    try {
        window.parent.postMessage(msg, "*");
    } catch {
        /* no-op */
    }
}

export function useUsecase() {
    const [allUsecases, setAllUsecases] = useState<UseCaseMap>({});
    const [selectedId, setSelectedId] = useState<string>("mesh");
    const [loaded, setLoaded] = useState(false);

    // Avoid duplicate initial posts in Strict Mode
    const didInitialPostRef = useRef(false);

    // ...
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
                setAllUsecases(map);

                const def = json.default || "mesh";
                setSelectedId(def);
                setLoaded(true);

                if (!didInitialPostRef.current) {
                    didInitialPostRef.current = true;
                    const cfg = map[def];
                    const projectKey = (cfg?.projectKey || cfg?.id || def).trim();
                    if (projectKey) {
                        postToParent({ type: "AI_SELECT_USECASE", projectKey });
                    }
                }
            })
            .catch((e) => {
                console.error("Failed to load usecases:", e);
            });

        return () => {
            cancelled = true;
        };
    }, []);
// ...

    // Notify parent when user changes use case
    useEffect(() => {
        if (!loaded || !selectedId) return;
        const cfg = allUsecases[selectedId];
        const projectKey = (cfg?.projectKey || cfg?.id || selectedId).trim();
        if (!projectKey) return;
        postToParent({ type: "AI_SELECT_USECASE", projectKey });
    }, [loaded, selectedId, allUsecases]);

    const selected = allUsecases[selectedId];

    return {
        allUsecases,
        selectedId,
        selected,
        setSelectedId,
        loaded,
    };
}
