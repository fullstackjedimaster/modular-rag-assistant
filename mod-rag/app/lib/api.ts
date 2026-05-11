// /mesh-daq/mesh-daq-ui/src/lib/api.ts
import { Fault  } from "@/app/lib/faults/types"
import type { HallucinationReport, SaliencyMap, TokenIGSaliency } from "./types";
import settings from "@/app/lib/settings";

const BASE = settings.AI_RAG_API_BASE

interface Panel {
    mac: string
    x: number
    y: number
    height: number
    width: number
}

interface PanelStatusResponse {
    mac: string
    status: string
    voltage: string | undefined
    current: string | undefined
    power: string | undefined
    temperature: string | undefined
}


export type FaultProfile = Record<string, number>

export async function getFaults(): Promise<Fault[]> {
    const res = await fetch("/api/faults/stream")
    return res.json()
}

export async function getProfile(): Promise<Record<string, FaultProfile>> {
    const res = await fetch("/api/faults/profile")
    return res.json()
}

export function getStatusLabel(profile: FaultProfile): string {
    const criticalFaults = Object.entries(profile).filter(
        ([k, v]) =>
            ["OPEN_CIRCUIT", "SNAPPED_DIODE", "DEAD_PANEL"].includes(k) && v > 0
    )
    if (criticalFaults.length) return "faulted"

    const warnings = Object.entries(profile).filter(
        ([k, v]) =>
            ["POWER_DROP", "LOW_VOLTAGE", "LOW_POWER"].includes(k) && v > 0
    )
    if (warnings.length) return "degraded"

    return "normal"
}

export async function askGPT(question: string): Promise<string> {
    const res = await fetch(`/api/rag/explain?q=${encodeURIComponent(question)}`)
    const json = await res.json()
    return json.answer
}

export async function fetchFaultExplanationStream(query: string): Promise<string> {
    const res = await fetch(`/api/explain-fault?q=${encodeURIComponent(query)}`)

    if (!res.ok || !res.body) {
        throw new Error("Failed to connect to fault explanation service.")
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder("utf-8")
    let result = ""

    while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
            result += decoder.decode(value, { stream: true })
        }
    }

    return result
}

export async function getPanelStatus(mac: string): Promise<PanelStatusResponse> {

    const res = await fetch(`/api/status/${encodeURIComponent(mac)}`)
    if (!res.ok) {
        console.error(`Failed to fetch status for ${mac}:`, res.status)
        throw new Error("Panel status fetch failed")
    }

    return res.json()
    // return  {mac:mac, status: 'normal', voltage: '5.0', current: '7.0', power: '10.0', temperature: '10.0'}
}

export async function getLayout(): Promise<Panel[]> {

    const res = await fetch(`/api/layout`)

    if (!res.ok) {
        console.error("Failed to fetch layout:", res.status)
        throw new Error("Layout fetch failed")
    }

    const data = await res.json()

    if (Array.isArray(data)) {
        return data
    } else {
        console.warn("Layout response was not an array:", data)
        return []
    }
}



export async function checkHallucination(
    answer: string,
    contexts: string[],
    useNLI = true,
    useLLMJudge = false,
    judgeProvider?: "heuristic" | "openai" | "ollama"
): Promise<HallucinationReport> {
    const r = await fetch(`${BASE}/eval/hallucination`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, contexts, use_nli: useNLI, use_llm_judge: useLLMJudge, judge_provider: judgeProvider }),
    });
    if (!r.ok) throw new Error(`hallucination eval failed: ${r.status}`);
    return r.json();
}

export async function getSaliency(answer: string, context: string): Promise<SaliencyMap> {
    const r = await fetch(`${BASE}/eval/saliency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, context }),
    });
    if (!r.ok) throw new Error(`saliency eval failed: ${r.status}`);
    return r.json();
}

export async function getTokenIG(answer: string, context?: string, model_name?: string): Promise<TokenIGSaliency> {
    const r = await fetch(`${BASE}/eval/token-saliency/ig`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, context: context ?? null, model_name }),
    });
    if (!r.ok) throw new Error(`IG saliency failed: ${r.status}`);
    return r.json();
}
