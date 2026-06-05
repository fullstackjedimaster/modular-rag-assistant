export type DemoTarget = {
  key: string;
  label: string;
  description: string;
  targetUrl: string;
  ragClientId: string;
  defaultUsecaseId?: string;
  dockable: boolean;
};

export const DEMO_TARGETS: DemoTarget[] = [
  {
    key: "mesh-daq",
    label: "Wireless Mesh DAQ",
    description:
      "Real-time telemetry dashboard with docked SmartExplainer fault analysis.",
    targetUrl: "https://mesh-daq.fullstackjedi.dev",
    ragClientId: "iot-wireless-mesh-daq",
    defaultUsecaseId: "mesh",
    dockable: true,
  },
  {
    key: "entity-client",
    label: "Entity Client",
    description:
      "Dynamic JSON-driven form generator with docked AI explanation context.",
    targetUrl: "https://entity-client.fullstackjedi.dev",
    ragClientId: "entity-client",
    defaultUsecaseId: "crud-client",
    dockable: true,
  },
];
