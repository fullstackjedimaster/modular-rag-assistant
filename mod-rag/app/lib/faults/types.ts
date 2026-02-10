// lib/types.ts

export interface Fault {
  graph_key: string;
  category: string;
  freezetime: number;
  extras?: Record<string, unknown>;
}

export interface FaultProfile {
  [category: string]: number;

}

export interface FaultMetadata {
  label: string;
  threshold?: number;
  unit?: string;
  color?: string;
  priority?: number;
}


