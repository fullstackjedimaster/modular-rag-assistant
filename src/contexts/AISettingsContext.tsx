// ai-ui/src/context/AISettingsContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type AISettings = {
    useNLI: boolean;
    setUseNLI: (v: boolean) => void;
    useLLMJudge: boolean;
    setUseLLMJudge: (v: boolean) => void;
    judgeProvider: "heuristic" | "openai" | "ollama";
    setJudgeProvider: (v: "heuristic" | "openai" | "ollama") => void;
    igModel: string;
    setIgModel: (v: string) => void;
};

const Ctx = createContext<AISettings | null>(null);

const KEY = "ai-settings-v1";

export function AISettingsProvider({ children }: { children: React.ReactNode }) {
    const [useNLI, setUseNLI] = useState(true);
    const [useLLMJudge, setUseLLMJudge] = useState(false);
    const [judgeProvider, setJudgeProvider] = useState<"heuristic" | "openai" | "ollama">("heuristic");
    const [igModel, setIgModel] = useState<string>("distilroberta-base");

    useEffect(() => {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                const s = JSON.parse(raw);
                if (typeof s.useNLI === "boolean") setUseNLI(s.useNLI);
                if (typeof s.useLLMJudge === "boolean") setUseLLMJudge(s.useLLMJudge);
                if (s.judgeProvider) setJudgeProvider(s.judgeProvider);
                if (s.igModel) setIgModel(s.igModel);
            }
        } catch {}
    }, []);

    useEffect(() => {
        const s = { useNLI, useLLMJudge, judgeProvider, igModel };
        localStorage.setItem(KEY, JSON.stringify(s));
    }, [useNLI, useLLMJudge, judgeProvider, igModel]);

    return (
        <Ctx.Provider value={{ useNLI, setUseNLI, useLLMJudge, setUseLLMJudge, judgeProvider, setJudgeProvider, igModel, setIgModel }}>
            {children}
        </Ctx.Provider>
    );
}

export function useAISettings() {
    const v = useContext(Ctx);
    if (!v) throw new Error("useAISettings must be used within AISettingsProvider");
    return v;
}
