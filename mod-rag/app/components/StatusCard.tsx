"use client"

import { useEffect, useState } from "react"
// NOTE: getStatusLabel lives in your main lib now
import { getStatusLabel, type FaultProfile } from "@/app/lib/api"

type PanelStatusResponse = {
    mac: string
    status?: string | null
    voltage?: string | null
    current?: string | null
    power?: string | null
    temperature?: string | null
}

export const StatusCard = ({ mac }: { mac: string }) => {
    const [panel, setPanel] = useState<PanelStatusResponse | null>(null)

    useEffect(() => {
        let alive = true

        const load = async () => {
            try {
                const res = await fetch(`/api/status/${encodeURIComponent(mac)}`)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const data: PanelStatusResponse = await res.json()
                if (alive) setPanel(data)
            } catch {
                if (alive) setPanel(null)
            }
        }

        load()
        const timer = setInterval(load, 2000)
        return () => {
            alive = false
            clearInterval(timer)
        }
    }, [mac])

    // Map the single status string → one-hot FaultProfile for getStatusLabel()
    const raw = (panel?.status || "normal").replace(/\s+/g, "_").toUpperCase()
    const profile: FaultProfile = { [raw]: 1 }

    const state = getStatusLabel(profile) // "normal" | "degraded" | "faulted"
    const statusColor =
        state === "normal" ? "text-green-600" :
            state === "degraded" ? "text-yellow-500" :
                state === "faulted" ? "text-red-500" : "text-gray-400"

    return (
        <div className="text-lg font-semibold">
            Status for {mac}: <span className={statusColor}>{state.toUpperCase()}</span>
        </div>
    )
}
