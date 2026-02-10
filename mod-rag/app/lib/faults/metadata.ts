// ai-core/faults/metadata.ts

import { FaultMetadata } from "./types.js"

export const FAULTS_METADATA: Record<string, FaultMetadata> = {
  OPEN_CIRCUIT: {
    label: "Open Circuit",
    threshold: 0.02,
    unit: "proj_power_ratio",
    color: "#FF6B6B",
    priority: 3,
  },
  SNAPPED_DIODE: {
    label: "Snapped Diode",
    threshold: 3.5,
    unit: "vo_percentage_window",
    color: "#F7B801",
    priority: 2,
  },
  POWER_DROP: {
    label: "Power Drop",
    threshold: 95,
    unit: "percent_loss",
    color: "#6A5ACD",
    priority: 1,
  },
  DEAD_PANEL: {
    label: "Dead Panel",
    threshold: 1.5,
    unit: "avg_voltage",
    color: "#CCCCCC",
    priority: 4,
  },
  LOW_VOLTAGE: {
    label: "Low Voltage",
    threshold: 20,
    unit: "voltage",
    color: "#00CED1",
    priority: 0,
  },
  LOW_POWER: {
    label: "Low Power",
    threshold: 10,
    unit: "power",
    color: "#008B8B",
    priority: 0,
  },
  NORMAL: {
    label: "Normal",
    color: "#00FF00",
    priority: 0,
  },
}
