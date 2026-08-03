import { FaultMetadata } from "./types.js";

export const FAULTS_METADATA: Record<string, FaultMetadata> = {
  DEAD_PANEL: { label: "Dead Panel", threshold: 1.5, unit: "volts", color: "#CCCCCC", priority: 4 },
  OPEN_CIRCUIT: { label: "Open Circuit", threshold: 0.02, unit: "expected_power_ratio", color: "#FF6B6B", priority: 3 },
  SHORT_CIRCUIT: { label: "Short Circuit", threshold: 2, unit: "volts_with_high_current", color: "#F10000", priority: 3 },
  OVER_TEMPERATURE: { label: "Over Temperature", threshold: 70, unit: "celsius", color: "#F97316", priority: 2 },
  GROSS_POWER_DROP: { label: "Gross Power Drop", threshold: 0.5, unit: "expected_power_ratio", color: "#7C3AED", priority: 2 },
  POSSIBLE_SHADING: { label: "Possible Shading", threshold: 0.75, unit: "expected_power_ratio", color: "#A855F7", priority: 1 },
  LOW_VOLTAGE: { label: "Low Voltage", threshold: 20, unit: "volts", color: "#00CED1", priority: 1 },
  LOW_IRRADIANCE: { label: "Low Irradiance", threshold: 100, unit: "watts_per_square_meter", color: "#64748B", priority: 0 },
  NORMAL: { label: "Normal", color: "#00FF00", priority: 0 },
  UNKNOWN: { label: "Unknown", color: "#111827", priority: 0 },
};
