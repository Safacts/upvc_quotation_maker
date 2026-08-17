/**
 * Deterministic UPVC bill-of-quantities calculator.
 *
 * Dimensions are millimetres. Length outputs are millimetres, area outputs
 * are square metres, and counts are pieces. The calculator is deliberately
 * pure so it can be used by an API route, a report, or a worker without a DB
 * connection. `bom_config.rules` can override/extend the built-in profile
 * rules without allowing arbitrary JavaScript expressions.
 */

export type BomUnit = "mm" | "m" | "sqm" | "piece" | "set";

export interface BomRule {
  material: string;
  component?: string;
  unit?: BomUnit;
  /** Supported tokens: width, height, perimeter, area, panels, panelWidth, units. */
  formula?: string;
  quantity?: number;
  wastePercent?: number;
}

export interface BomWindow {
  id?: string;
  code?: string;
  description?: string;
  width: number;
  height: number;
  units?: number;
  bom_config?: {
    profile?: { system?: string; type?: string; color?: string; panels?: number; leaves?: number; tracks?: number };
    glass?: { type?: string; thickness?: string | number };
    hardware?: { name: string; quantity?: string | number }[];
    rules?: BomRule[];
  };
}

export interface BomLine {
  material: string;
  component: string;
  unit: BomUnit;
  quantity: number;
  /** Length before wastage, when the line is a cuttable profile. */
  lengthMm?: number;
  sourceId?: string;
  sourceDescription?: string;
  metadata?: Record<string, string | number>;
}

export interface QuotationBom {
  lines: BomLine[];
  totals: { lineCount: number; profileLengthMm: number; glassSqm: number; pieces: number };
}

const finite = (value: unknown, fallback = 0): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const positiveInt = (value: unknown, fallback: number): number => Math.max(1, Math.round(finite(value, fallback)));

function profileType(item: BomWindow): string {
  return String(item.bom_config?.profile?.type || item.bom_config?.profile?.system || "casement").toLowerCase();
}

function add(lines: BomLine[], line: BomLine): void {
  if (line.quantity <= 0 || !Number.isFinite(line.quantity)) return;
  lines.push({ ...line, quantity: Math.round(line.quantity * 1000) / 1000 });
}

function defaultWindowLines(item: BomWindow): BomLine[] {
  const width = Math.max(0, finite(item.width));
  const height = Math.max(0, finite(item.height));
  const units = Math.max(0, finite(item.units, 1));
  const type = profileType(item);
  const profile = item.bom_config?.profile || {};
  const panels = positiveInt(profile.panels ?? profile.leaves ?? profile.tracks, type === "sliding" ? 2 : 1);
  const perimeter = 2 * (width + height);
  const panelWidth = width / panels;
  const lines: BomLine[] = [];
  const source = { sourceId: item.id, sourceDescription: item.description };

  add(lines, { ...source, material: profile.system || "uPVC profile", component: "outer frame", unit: "mm", quantity: units, lengthMm: perimeter });
  if (type === "sliding") {
    add(lines, { ...source, material: profile.system || "uPVC profile", component: "sliding sash", unit: "mm", quantity: panels * units, lengthMm: 2 * (panelWidth + height) });
    add(lines, { ...source, material: profile.system || "uPVC profile", component: "interlock", unit: "mm", quantity: Math.max(0, panels - 1) * units, lengthMm: height });
    add(lines, { ...source, material: profile.system || "uPVC profile", component: "glazing bead", unit: "mm", quantity: panels * units, lengthMm: 2 * (panelWidth + height) });
  } else if (type === "fixed") {
    add(lines, { ...source, material: profile.system || "uPVC profile", component: "glazing bead", unit: "mm", quantity: units, lengthMm: perimeter });
  } else {
    add(lines, { ...source, material: profile.system || "uPVC profile", component: "sash", unit: "mm", quantity: panels * units, lengthMm: 2 * (panelWidth + height) });
    add(lines, { ...source, material: profile.system || "uPVC profile", component: "glazing bead", unit: "mm", quantity: panels * units, lengthMm: 2 * (panelWidth + height) });
  }

  const glass = item.bom_config?.glass;
  add(lines, { ...source, material: glass?.type || item.description || "glass", component: "glass", unit: "sqm", quantity: (width * height * units) / 1_000_000, metadata: { thicknessMm: finite(glass?.thickness) } });
  for (const hardware of item.bom_config?.hardware || []) {
    add(lines, { ...source, material: hardware.name, component: "hardware", unit: "piece", quantity: finite(hardware.quantity, 1) * units });
  }
  return lines;
}

function evaluateFormula(formula: string, values: Record<string, number>): number {
  // A tiny arithmetic evaluator: numbers, named dimensions, + - * / and parentheses.
  const tokens = formula.replace(/\s+/g, "").match(/[A-Za-z]+|\d+(?:\.\d+)?|[()+\-*/]/g) || [];
  if (tokens.join("") !== formula.replace(/\s+/g, "")) throw new Error("Invalid BOM formula");
  let i = 0;
  const primary = (): number => {
    const token = tokens[i++];
    if (token === "(") { const value = expr(); if (tokens[i++] !== ")") throw new Error("Unbalanced BOM formula"); return value; }
    if (token === "-") return -primary();
    if (!token) throw new Error("Incomplete BOM formula");
    const value = values[token] ?? Number(token);
    if (!Number.isFinite(value)) throw new Error(`Unknown BOM token: ${token}`);
    return value;
  };
  const term = (): number => { let value = primary(); while (tokens[i] === "*" || tokens[i] === "/") { const op = tokens[i++]; const rhs = primary(); if (op === "/" && rhs === 0) throw new Error("Division by zero"); value = op === "*" ? value * rhs : value / rhs; } return value; };
  const expr = (): number => { let value = term(); while (tokens[i] === "+" || tokens[i] === "-") { const op = tokens[i++]; const rhs = term(); value = op === "+" ? value + rhs : value - rhs; } return value; };
  const result = expr();
  if (i !== tokens.length || !Number.isFinite(result)) throw new Error("Invalid BOM formula");
  return result;
}

export function calculateWindowBom(item: BomWindow): BomLine[] {
  const lines = defaultWindowLines(item);
  const width = Math.max(0, finite(item.width));
  const height = Math.max(0, finite(item.height));
  const units = Math.max(0, finite(item.units, 1));
  const panels = positiveInt(item.bom_config?.profile?.panels ?? item.bom_config?.profile?.leaves ?? item.bom_config?.profile?.tracks, 1);
  const values = { width, height, perimeter: 2 * (width + height), area: width * height / 1_000_000, panels, panelWidth: width / panels, units };
  for (const rule of item.bom_config?.rules || []) {
    const raw = rule.formula ? evaluateFormula(rule.formula, values) : finite(rule.quantity, 0);
    const waste = Math.max(0, finite(rule.wastePercent)) / 100;
    add(lines, { material: rule.material, component: rule.component || "custom", unit: rule.unit || "piece", quantity: raw * units * (1 + waste), lengthMm: rule.unit === "mm" ? raw : undefined, sourceId: item.id, sourceDescription: item.description });
  }
  return lines;
}

export function explodeQuotation(items: BomWindow[]): QuotationBom {
  const lines = items.flatMap(calculateWindowBom);
  return { lines, totals: { lineCount: lines.length, profileLengthMm: lines.reduce((s, l) => s + (l.unit === "mm" ? (l.lengthMm || 0) * l.quantity : 0), 0), glassSqm: lines.reduce((s, l) => s + (l.unit === "sqm" ? l.quantity : 0), 0), pieces: lines.reduce((s, l) => s + (l.unit === "piece" || l.unit === "set" ? l.quantity : 0), 0) } };
}

export const calculateBOM = explodeQuotation;
