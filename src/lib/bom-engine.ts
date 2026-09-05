/**
 * bom-engine.ts — UPVC BOM + cutting + pricing for console Builder.
 *
 * Pure TS, no deps. Single source for Window JSON -> BOM -> price.
 * Inspired by Open Frame Studio deductions & OCA formula BOMs, but
 * all code is original closed-source. No GPL copy-paste.
 *
 * Window JSON -> geometry rules -> profile deductions -> BOM
 *                                          -> cut lengths -> cost -> quote
 */

export type WindowType =
  | "fixed"
  | "casement_single"
  | "casement_double"
  | "casement_fixed_combo"
  | "sliding_2track_2panel"
  | "sliding_2track_3panel"
  | "sliding_3track"
  | "french"
  | "ventilator"
  | "tilt_turn";

export interface WindowConfig {
  type: WindowType;
  width: number; // mm
  height: number; // mm
  system?: string; // e.g. "60mm"
  frameProfile?: string;
  sashProfile?: string;
  mullionProfile?: string;
  colour?: string;
  glassSpec?: string; // e.g. "5-12-5"
  hasMesh?: boolean;
  meshType?: string;
  hardwareTier?: "basic" | "standard" | "premium";
  ratePerSqft?: number; // Rs per sft for quick price
}

export interface BomLine {
  label: string; // e.g. "Frame 60mm"
  profileId: string; // F60, S60, M60
  lengthMm: number;
  qty: number;
  kind: "profile" | "reinforcement" | "glass" | "bead" | "gasket" | "hardware";
  unit?: string;
}

export interface BomResult {
  lines: BomLine[];
  totalProfileMm: number; // sum length*qty for profiles
  cuts: Array<{ profileId: string; lengthMm: number; qty: number }>;
  glass: Array<{ w: number; h: number; qty: number; spec: string }>;
  sqft: number;
  price: { material: number; perSqft: number; hardware: number; total: number };
  warnings: string[];
}

/** Indian UPVC: 6m stock bar is universal. */
export const STOCK_BAR_MM = 6000;

/** Deduction constants tuned for 60mm system (IS 17953 profile family). Keep as vars so tuning is one-place. */
const D = {
  frameBite: 30, // frame rebate overlap per side
  sashOverlap: 8,
  mullionBite: 30,
  weldLoss: 3, // per cut, 45° mitre loss
  gasketPerM: 1,
};

function mmToSqft(w: number, h: number): number {
  return (w / 304.8) * (h / 304.8);
}

export function validateWindow(c: WindowConfig): string[] {
  const e: string[] = [];
  if (!c.width || c.width < 300 || c.width > 6000) e.push("Width must be 300-6000 mm");
  if (!c.height || c.height < 300 || c.height > 3000) e.push("Height must be 300-3000 mm");
  if (c.width && c.height && c.width < c.height && (c.type.includes("sliding"))) e.push("Sliding: width usually > height");
  return e;
}

export function buildBom(c: WindowConfig): BomResult {
  const warnings = validateWindow(c);
  const W = Math.round(c.width);
  const H = Math.round(c.height);
  const rate = c.ratePerSqft ?? 520;
  const lines: BomLine[] = [];
  const cuts: BomResult["cuts"] = [];
  const glass: BomResult["glass"] = [];
  const spec = c.glassSpec || "5mm";

  function push(profileId: string, label: string, len: number, qty: number, kind: BomLine["kind"] = "profile") {
    if (len <= 0 || qty <= 0) return;
    lines.push({ profileId, label, lengthMm: len, qty, kind });
    if (kind === "profile") cuts.push({ profileId, lengthMm: len, qty });
  }

  // Common frame: 2W + 2H (45° mitre, weldLoss accounted in cutting optimizer not here)
  // Steel reinforcement mirrors frame/sash where used.
  switch (c.type) {
    case "fixed": {
      push("F60", "Frame 60mm", W, 2);
      push("F60", "Frame 60mm", H, 2);
      // glass = opening - 2*frameBite
      glass.push({ w: W - 2 * D.frameBite, h: H - 2 * D.frameBite, qty: 1, spec });
      push("G60", "Glazing bead", W - 2 * D.frameBite + 20, 2, "bead");
      push("G60", "Glazing bead", H - 2 * D.frameBite + 20, 2, "bead");
      break;
    }
    case "casement_single": {
      push("F60", "Frame 60mm", W, 2);
      push("F60", "Frame 60mm", H, 2);
      // sash inset
      const sw = W - 2 * D.frameBite + D.sashOverlap;
      const sh = H - 2 * D.frameBite + D.sashOverlap;
      push("S60", "Sash 60mm", sw, 2);
      push("S60", "Sash 60mm", sh, 2);
      glass.push({ w: sw - 40, h: sh - 40, qty: 1, spec });
      push("G60", "Glazing bead", sw - 40, 2, "bead");
      push("G60", "Glazing bead", sh - 40, 2, "bead");
      break;
    }
    case "casement_double": {
      push("F60", "Frame 60mm", W, 2);
      push("F60", "Frame 60mm", H, 2);
      // mullion vertical
      push("M60", "Mullion 60mm", H - 2 * D.frameBite, 1);
      const sashW = (W - 2 * D.frameBite - 30) / 2 + D.sashOverlap;
      const sashH = H - 2 * D.frameBite + D.sashOverlap;
      push("S60", "Sash 60mm", Math.round(sashW), 4);
      push("S60", "Sash 60mm", Math.round(sashH), 4);
      glass.push({ w: Math.round(sashW) - 40, h: Math.round(sashH) - 40, qty: 2, spec });
      break;
    }
    case "casement_fixed_combo": {
      push("F60", "Frame 60mm", W, 2);
      push("F60", "Frame 60mm", H, 2);
      push("M60", "Mullion 60mm", H - 2 * D.frameBite, 1);
      // assume left fixed, right casement
      const fixedW = Math.round(W * 0.45);
      glass.push({ w: fixedW - 2 * D.frameBite, h: H - 2 * D.frameBite, qty: 1, spec });
      const sw = W - fixedW - D.mullionBite;
      const sashW = sw + D.sashOverlap;
      const sashH = H - 2 * D.frameBite + D.sashOverlap;
      push("S60", "Sash 60mm", Math.round(sashW), 2);
      push("S60", "Sash 60mm", Math.round(sashH), 2);
      glass.push({ w: Math.round(sashW) - 40, h: Math.round(sashH) - 40, qty: 1, spec });
      break;
    }
    case "sliding_2track_2panel": {
      push("SF60", "Sliding Frame 2T", W, 2);
      push("SF60", "Sliding Frame 2T", H, 2);
      const interlock = 34;
      const sashW = (W + interlock) / 2;
      const sashH = H - 60;
      push("SS60", "Sliding Sash", Math.round(sashW), 4);
      push("SS60", "Sliding Sash", Math.round(sashH), 4);
      push("M_S", "Interlock", Math.round(sashH), 2, "profile");
      glass.push({ w: Math.round(sashW) - 80, h: Math.round(sashH) - 60, qty: 2, spec });
      break;
    }
    case "sliding_2track_3panel":
    case "sliding_3track": {
      push("SF60", "Sliding Frame", W, 2);
      push("SF60", "Sliding Frame", H, 2);
      const n = c.type === "sliding_3track" ? 3 : 3;
      const sashW = (W + 68) / n;
      const sashH = H - 60;
      push("SS60", "Sliding Sash", Math.round(sashW), n * 2);
      push("SS60", "Sliding Sash", Math.round(sashH), n * 2);
      glass.push({ w: Math.round(sashW) - 80, h: Math.round(sashH) - 60, qty: n, spec });
      break;
    }
    case "french": {
      push("F70", "Frame 70mm", W, 2);
      push("F70", "Frame 70mm", H, 2);
      push("M70", "Mullion 70mm", H - 40, 1);
      const sw = (W - 60) / 2;
      const sh = H - 40;
      push("S70", "Sash 70mm", Math.round(sw), 4);
      push("S70", "Sash 70mm", Math.round(sh), 4);
      glass.push({ w: Math.round(sw) - 40, h: Math.round(sh) - 40, qty: 2, spec });
      break;
    }
    case "ventilator":
    case "tilt_turn":
    default: {
      push("F60", "Frame 60mm", W, 2);
      push("F60", "Frame 60mm", H, 2);
      const sw = W - 60; const sh = H - 60;
      push("S60", "Sash 60mm", Math.round(sw), 2);
      push("S60", "Sash 60mm", Math.round(sh), 2);
      glass.push({ w: Math.round(sw) - 40, h: Math.round(sh) - 40, qty: 1, spec });
      break;
    }
  }

  // Reinforcement mirrors profiles (approx 95%)
  const profLen = lines.filter(l => l.kind === "profile").reduce((s, l) => s + l.lengthMm * l.qty, 0);
  lines.push({ profileId: "R15", label: "Steel reinforcement 1.5mm", lengthMm: Math.round(profLen * 0.38) / 1, qty: 1, kind: "reinforcement", unit: "mm" });
  // Gasket ~ perimeter
  lines.push({ profileId: "EPDM", label: "EPDM gasket", lengthMm: Math.round((W + H) * 2 * 0.85), qty: 1, kind: "gasket", unit: "mm" });

  // Hardware kit
  const hwQty = c.type.includes("sliding") ? 2 : c.type === "casement_double" ? 2 : 1;
  lines.push({ profileId: "HW", label: c.type.includes("sliding") ? "Roller + lock kit" : "Handle+hinge+espag kit", lengthMm: 1, qty: hwQty, kind: "hardware", unit: "set" });
  if (c.hasMesh) lines.push({ profileId: "MESH", label: c.meshType || "Sliding mesh", lengthMm: 1, qty: hwQty, kind: "hardware", unit: "set" });

  const totalProfileMm = lines.filter(l => l.kind === "profile").reduce((s, l) => s + l.lengthMm * l.qty, 0);
  const sqft = mmToSqft(W, H);
  const hardware = hwQty * (c.hardwareTier === "premium" ? 1850 : c.hardwareTier === "basic" ? 750 : 1150) + (c.hasMesh ? hwQty * 650 : 0);
  const material = sqft * rate;
  const total = material + hardware;

  return { lines, totalProfileMm, cuts, glass, sqft, price: { material, perSqft: rate, hardware, total }, warnings };
}

/** Cutting: offcut-first Best-Fit-Decreasing with traceable per-bar cuts. Pure function, no DB.
 * Now returns exact bar layouts so the saw sheet is auditable — fixes Eva gap where bars had empty cuts[].
 * Each piece is lengthMm + weldLoss (3mm) for packing, but display stores original lengthMm.
 */
export function optimizeCuts(
  cuts: Array<{ profileId: string; lengthMm: number; qty: number }>,
  stockLen: number = STOCK_BAR_MM,
  offcuts: number[] = []
): { bars: Array<{ cuts: number[]; offcut: number; wastePct: number }>; barsUsed: number; wastePct: number; offcutReuse: number } {
  type Piece = { len: number; lenWithLoss: number };
  const pieces: Piece[] = [];
  for (const c of cuts) for (let i = 0; i < c.qty; i++) pieces.push({ len: c.lengthMm, lenWithLoss: c.lengthMm + D.weldLoss });
  pieces.sort((a, b) => b.lenWithLoss - a.lenWithLoss);

  // Seed with offcuts as initial bars
  const seededBars: number[] = offcuts.filter(o => o >= Math.min(...pieces.map(p => p.lenWithLoss), 9999)).map(o => o);
  const barRemaining: number[] = [...seededBars];
  const barCuts: number[][] = seededBars.map(() => []);

  let offcutReuse = 0;
  for (const p of pieces) {
    let bestIdx = -1; let bestRem = Infinity;
    for (let i = 0; i < barRemaining.length; i++) {
      if (barRemaining[i] >= p.lenWithLoss && barRemaining[i] - p.lenWithLoss < bestRem) { bestRem = barRemaining[i] - p.lenWithLoss; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      if (bestIdx < seededBars.length) offcutReuse++;
      barRemaining[bestIdx] -= p.lenWithLoss;
      barCuts[bestIdx].push(p.len);
    } else {
      barRemaining.push(stockLen - p.lenWithLoss);
      barCuts.push([p.len]);
    }
  }
  const barsUsed = barRemaining.length;
  const totalNeeded = pieces.reduce((s, v) => s + v.lenWithLoss, 0);
  const totalStock = barsUsed * stockLen - seededBars.reduce((s, v) => s + (stockLen - v), 0);
  const waste = Math.max(0, totalStock - totalNeeded);
  const wastePct = totalStock ? (waste / totalStock) * 100 : 0;
  const barsDetail = barRemaining.map((rem, i) => ({ cuts: barCuts[i] || [], offcut: rem, wastePct: rem >= 0 ? (rem / stockLen) * 100 : 0 }));
  return { bars: barsDetail, barsUsed, wastePct, offcutReuse };
}
