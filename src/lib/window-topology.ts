/**
 * Canonical, serialisable topology for a configurable window.
 * Dimensions are millimetres. The tree is intentionally UI-agnostic so the
 * same design can drive the 3D preview, BOQ calculation and persistence.
 */
export type WindowNodeKind = "window" | "frame" | "mullion" | "transom" | "panel" | "glass" | "hardware";

export interface WindowTopologyNode {
  id: string;
  kind: WindowNodeKind;
  label: string;
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
  quantity?: number;
  material?: string;
  opening?: boolean;
  children: WindowTopologyNode[];
}

export interface WindowTopology {
  version: 1;
  widthMm: number;
  heightMm: number;
  configuration: "sliding" | "casement" | "tilt_turn" | "fixed";
  profileSystem: string;
  root: WindowTopologyNode;
}

const n = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const id = (kind: string, index: number) => `${kind}-${index + 1}`;

export function createWindowTopology(input: {
  widthMm: number;
  heightMm: number;
  configuration?: WindowTopology["configuration"];
  profileSystem?: string;
  panelCount?: number;
}): WindowTopology {
  const widthMm = Math.max(1, n(input.widthMm));
  const heightMm = Math.max(1, n(input.heightMm));
  const configuration = input.configuration || "fixed";
  const profileSystem = input.profileSystem || "uPVC 60mm";
  const panelCount = Math.max(1, Math.min(6, Math.round(input.panelCount || (configuration === "sliding" ? Math.max(2, Math.ceil(widthMm / 1000)) : 1))));
  const panelWidth = widthMm / panelCount;
  const panelNodes: WindowTopologyNode[] = [];

  for (let i = 0; i < panelCount; i++) {
    const opening = configuration !== "fixed" && (configuration !== "sliding" || i === 0);
    panelNodes.push({
      id: id("panel", i), kind: "panel", label: `${opening ? "Opening" : "Fixed"} panel ${i + 1}`,
      widthMm: panelWidth, heightMm, quantity: 1, opening, material: profileSystem,
      children: [
        { id: id("glass", i), kind: "glass", label: `Glass ${i + 1}`, widthMm: panelWidth, heightMm, quantity: 1, material: "glass", children: [] },
        { id: id("bead", i), kind: "hardware", label: "Glazing bead", lengthMm: 2 * (panelWidth + heightMm), quantity: 1, material: profileSystem, children: [] },
      ],
    });
  }

  const frameChildren: WindowTopologyNode[] = [
    { id: "outer-frame", kind: "frame", label: "Outer frame", lengthMm: 2 * (widthMm + heightMm), quantity: 1, material: profileSystem, children: [] },
    ...panelNodes,
  ];
  for (let i = 1; i < panelCount; i++) {
    frameChildren.push({ id: id("mullion", i - 1), kind: "mullion", label: `Mullion ${i}`, lengthMm: heightMm, quantity: 1, material: profileSystem, children: [] });
  }
  if (heightMm > 1500 && configuration === "fixed") {
    frameChildren.push({ id: "transom-1", kind: "transom", label: "Centre transom", lengthMm: widthMm, quantity: 1, material: profileSystem, children: [] });
  }

  return {
    version: 1, widthMm, heightMm, configuration, profileSystem,
    root: { id: "window", kind: "window", label: `${configuration} window`, widthMm, heightMm, quantity: 1, children: frameChildren },
  };
}

export function flattenWindowTopology(topology: WindowTopology): WindowTopologyNode[] {
  const result: WindowTopologyNode[] = [];
  const visit = (node: WindowTopologyNode) => { result.push(node); node.children.forEach(visit); };
  visit(topology.root);
  return result;
}

export function topologyToBomWindows(topology: WindowTopology) {
  return [{
    id: topology.root.id, description: topology.root.label, width: topology.widthMm, height: topology.heightMm, units: 1,
    topology, bom_config: { profile: { system: topology.profileSystem, type: topology.configuration, panels: topology.root.children.filter((child) => child.kind === "panel").length } },
  }];
}
