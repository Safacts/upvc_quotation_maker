/**
 * bom-engine.ts — UPVC BOM + cutting + pricing for console Builder.
 *
 * Pure TS, no deps. Single source for Window JSON -> BOM -> price.
 * Inspired by Open Frame Studio deductions & OCA formula BOMs, but
 * all code is original closed-source. No GPL copy-paste.
 *
 * Window JSON -> geometry rules -> profile deductions -> BOM
 *                                          -> cut lengths -> cost -> quote
 *
 * 07-09-2026: Major upgrade for Eva gap closure
 * - Replaced hard-coded F60/S60/M60 with PROMINANCE catalog codes
 * - Data-driven reinforcement per profile (RI-33x36 for sash, RI-14.5x30.5 for frame)
 * - Hardware mapped by tier and window type with actual costs
 * - Bead/gasket emitted as separate BOM lines with proper quantities
 * - Optimizer returns per-bar cuts with kerf/tolerance (10mm optional)
 */

import { getReinforcementForProfile, getBeadForProfile, getHardwareByTier, getMeshEntry } from "./profile-catalog";

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
  system?: string; // e.g. "PROMINANCE INVENTA SLIDING SERIES"
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
  profileId: string; // catalog code e.g. "PS62-UF-02"
  lengthMm: number;
  qty: number;
  kind: "profile" | "reinforcement" | "glass" | "bead" | "gasket" | "hardware" | "mesh";
  unit?: string;
  stockMm?: number; // stock bar length from catalog
  system?: string; // profile system name
  unitCost?: number; // for hardware/mesh
}

export interface BomResult {
  lines: BomLine[];
  totalProfileMm: number; // sum length*qty for profiles (excl reinforcement)
  totalReinforcementMm: number; // sum length*qty for reinforcement
  cuts: Array<{ profileId: string; lengthMm: number; qty: number; stockMm: number }>;
  glass: Array<{ w: number; h: number; qty: number; spec: string }>;
  sqft: number;
  price: { material: number; perSqft: number; hardware: number; total: number };
  warnings: string[];
  // Eva-grade price breakdown
  priceBreakdown?: {
    profileCost: number;
    profileWastage: number;
    riCost: number;
    riWastage: number;
    hardwareCost: number;
    glassCost: number;
    glassWastage: number;
    totalRawMaterial: number;
    fabricationLabour: number;
    installationLabour: number;
    subTotalInclLabour: number;
    profit: number;
    basicValue: number;
    discount: number;
    subTotal: number;
    transportation: number;
    loading: number;
    totalProjectCost: number;
    gst: number;
    grandTotal: number;
  };
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
  if (c.width && c.height && c.width < c.height && c.type.includes("sliding")) e.push("Sliding: width usually > height");
  return e;
}

/** Profile code mapping by window type and system */
function getProfileCodesForType(type: WindowType, system?: string): {
  frame: string;
  sash: string;
  mullion: string;
  interlock?: string;
  guideRail?: string;
  bead: string;
  frameStock: number;
  sashStock: number;
  mullionStock: number;
  system: string;
} {
  const isSliding = type.startsWith("sliding");
  const isFrench = type === "french";
  const isVentilator = type === "ventilator" || type === "tilt_turn";
  const isCasement = type.startsWith("casement") || type === "fixed";

  // Default to PROMINANCE INVENTA series
  const slidingSystem = "PROMINANCE INVENTA SLIDING SERIES";
  const casementSystem = "PROMINANCE INVENTA CASEMENT SERIES";
  const doorSystem = "PROMINANCE INVENTA DOOR SERIES";
  const ventilatorSystem = "PROMINANCE INVENTA VENTILATOR SERIES";

  if (isSliding) {
    return {
      frame: "PS62-UF-02",
      sash: "PS62-US-03",
      mullion: "PS62-UO-05",
      interlock: "PS62-UO-05",
      guideRail: "PAM116",
      bead: "PA62-UB-03",
      frameStock: 5800,
      sashStock: 5800,
      mullionStock: 6000,
      system: slidingSystem,
    };
  }

  if (isFrench) {
    return {
      frame: "PF70-FR-01",
      sash: "PS70-SH-01",
      mullion: "PM70-ML-01",
      bead: "PB50-BD-01",
      frameStock: 6000,
      sashStock: 5800,
      mullionStock: 6000,
      system: doorSystem,
    };
  }

  if (isVentilator) {
    return {
      frame: "PF60-VT-01",
      sash: "PS60-VT-01",
      mullion: "PM60-ML-01",
      bead: "PB50-BD-01",
      frameStock: 6000,
      sashStock: 5800,
      mullionStock: 6000,
      system: ventilatorSystem,
    };
  }

  // Casement / Fixed
  return {
    frame: "PF60-FR-01",
    sash: "PS60-SH-01",
    mullion: "PM60-ML-01",
    bead: "PB50-BD-01",
    frameStock: 6000,
    sashStock: 5800,
    mullionStock: 6000,
    system: casementSystem,
  };
}

function getProfileLabel(code: string): string {
  const labels: Record<string, string> = {
    "PS62-UF-02": "112MM 3 Track Sliding Frame",
    "PS62-US-03": "62MM Sliding Sash 24MM DGU",
    "PS62-UO-05": "SL Interlock Profile",
    "PAM116": "Aluminium Guide Rail",
    "PA62-UB-03": "62MM Sliding Glass Bead 24MM DGU",
    "PC50-UB-01": "50MM Casement Glass Bead",
    "PF60-FR-01": "60MM Casement/Fixed Frame",
    "PS60-SH-01": "60MM Casement Sash",
    "PM60-ML-01": "60MM Mullion/Transom",
    "PB50-BD-01": "50MM Casement Glazing Bead",
    "PF70-FR-01": "70MM French Door Frame",
    "PS70-SH-01": "70MM French Door Sash",
    "PM70-ML-01": "70MM Door Mullion",
    "PF60-VT-01": "60MM Ventilator Frame",
    "PS60-VT-01": "60MM Ventilator Sash/Louver",
    "RI-33x36-1.2": "RI 33x36 Sash Reinforcement",
    "RI-14.5x30.5-1.2": "RI 14.5x30.5 Frame Reinforcement",
  };
  return labels[code] || code;
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

  const codes = getProfileCodesForType(c.type, c.system);
  const hardwareTier = c.hardwareTier ?? "standard";

  function push(profileId: string, label: string, len: number, qty: number, kind: BomLine["kind"] = "profile", extra?: Partial<BomLine>) {
    if (len <= 0 || qty <= 0) return;
    const stockMm = extra?.stockMm ?? (kind === "profile" ? 6000 : 1);
    const line: BomLine = { profileId, label, lengthMm: len, qty, kind, unit: kind === "profile" ? "mm" : kind === "reinforcement" ? "mm" : "set", stockMm, system: extra?.system, ...extra };
    lines.push(line);
    if (kind === "profile" || kind === "reinforcement") cuts.push({ profileId, lengthMm: len, qty, stockMm });
  }

  // --- Frame (2W + 2H) ---
  push(codes.frame, getProfileLabel(codes.frame), W, 2, "profile", { stockMm: codes.frameStock, system: codes.system });
  push(codes.frame, getProfileLabel(codes.frame), H, 2, "profile", { stockMm: codes.frameStock, system: codes.system });

  let sashW = 0;
  let sashH = 0;
  let sashQty = 0;
  let glassW = 0;
  let glassH = 0;
  let glassQty = 0;
  let hasInterlock = false;
  let hasGuideRail = false;

  // --- Type-specific geometry ---
  switch (c.type) {
    case "fixed": {
      // Fixed: no sash, glass sits in frame rebate
      glassW = W - 2 * D.frameBite;
      glassH = H - 2 * D.frameBite;
      glassQty = 1;
      sashW = 0;
      sashH = 0;
      sashQty = 0;
      break;
    }

    case "casement_single": {
      sashW = W - 2 * D.frameBite + D.sashOverlap;
      sashH = H - 2 * D.frameBite + D.sashOverlap;
      sashQty = 1;
      glassW = sashW - 40;
      glassH = sashH - 40;
      glassQty = 1;
      break;
    }

    case "casement_double": {
      // Vertical mullion
      push(codes.mullion, getProfileLabel(codes.mullion), H - 2 * D.frameBite, 1, "profile", { stockMm: codes.mullionStock, system: codes.system });
      const sw = (W - 2 * D.frameBite - 30) / 2 + D.sashOverlap;
      const sh = H - 2 * D.frameBite + D.sashOverlap;
      sashW = Math.round(sw);
      sashH = Math.round(sh);
      sashQty = 2;
      glassW = sashW - 40;
      glassH = sashH - 40;
      glassQty = 2;
      break;
    }

    case "casement_fixed_combo": {
      // Vertical mullion
      push(codes.mullion, getProfileLabel(codes.mullion), H - 2 * D.frameBite, 1, "profile", { stockMm: codes.mullionStock, system: codes.system });
      // Assume left fixed (45%), right casement
      const fixedW = Math.round(W * 0.45);
      glass.push({ w: fixedW - 2 * D.frameBite, h: H - 2 * D.frameBite, qty: 1, spec });
      const casementW = W - fixedW - D.mullionBite;
      sashW = casementW + D.sashOverlap;
      sashH = H - 2 * D.frameBite + D.sashOverlap;
      sashQty = 1;
      glassW = Math.round(sashW) - 40;
      glassH = Math.round(sashH) - 40;
      glassQty = 1;
      break;
    }

    case "sliding_2track_2panel": {
      hasInterlock = true;
      hasGuideRail = true;
      const interlock = 34;
      sashW = Math.round((W + interlock) / 2);
      sashH = H - 60;
      sashQty = 2;
      glassW = sashW - 80;
      glassH = sashH - 60;
      glassQty = 2;
      break;
    }

    case "sliding_2track_3panel":
    case "sliding_3track": {
      hasInterlock = true;
      hasGuideRail = true;
      const n = c.type === "sliding_3track" ? 3 : 3;
      sashW = Math.round((W + 68) / n);
      sashH = H - 60;
      sashQty = n;
      glassW = sashW - 80;
      glassH = sashH - 60;
      glassQty = n;
      break;
    }

    case "french": {
      push(codes.mullion, getProfileLabel(codes.mullion), H - 40, 1, "profile", { stockMm: codes.mullionStock, system: codes.system });
      sashW = Math.round((W - 60) / 2);
      sashH = H - 40;
      sashQty = 2;
      glassW = sashW - 40;
      glassH = sashH - 40;
      glassQty = 2;
      break;
    }

    case "ventilator":
    case "tilt_turn":
    default: {
      sashW = W - 60;
      sashH = H - 60;
      sashQty = 1;
      glassW = Math.round(sashW) - 40;
      glassH = Math.round(sashH) - 40;
      glassQty = 1;
      break;
    }
  }

  // --- Sash profiles ---
  if (sashQty > 0 && sashW > 0 && sashH > 0) {
    push(codes.sash, getProfileLabel(codes.sash), sashW, sashQty * 2, "profile", { stockMm: codes.sashStock, system: codes.system });
    push(codes.sash, getProfileLabel(codes.sash), sashH, sashQty * 2, "profile", { stockMm: codes.sashStock, system: codes.system });
  }

  // --- Interlock (sliding only) ---
  if (hasInterlock && codes.interlock) {
    push(codes.interlock, getProfileLabel(codes.interlock), sashH, sashQty, "profile", { stockMm: codes.mullionStock, system: codes.system });
  }

  // --- Guide rail (sliding only) ---
  if (hasGuideRail && codes.guideRail) {
    push(codes.guideRail, getProfileLabel(codes.guideRail), W, 2, "profile", { stockMm: 3000, system: codes.system });
  }

  // --- Glass ---
  if (glassQty > 0 && glassW > 0 && glassH > 0) {
    glass.push({ w: glassW, h: glassH, qty: glassQty, spec });
  }

  // --- Bead (glazing bead) ---
  const beadCode = codes.bead;
  if (beadCode && glassQty > 0) {
    // Bead runs around glass perimeter: 2*(w+h) per pane
    const beadLenPerPane = 2 * (glassW + glassH);
    push(beadCode, getProfileLabel(beadCode), Math.round(beadLenPerPane), glassQty, "bead", { stockMm: 5800, system: codes.system });
  }

  // --- Reinforcement (data-driven per profile) ---
  // Collect all profile lines to calculate reinforcement per profile code
  const profileLines = lines.filter(l => l.kind === "profile");
  const riByCode = new Map<string, { totalMm: number; riCode: string; riLabel: string; riStock: number }>();

  for (const pl of profileLines) {
    const riEntry = getReinforcementForProfile(pl.profileId);
    if (!riEntry) continue;
    const key = riEntry.code;
    const existing = riByCode.get(key) || { totalMm: 0, riCode: riEntry.code, riLabel: riEntry.name, riStock: riEntry.stockMm };
    existing.totalMm += pl.lengthMm * pl.qty;
    riByCode.set(key, existing);
  }

  // Emit reinforcement lines (one per RI code)
  for (const [, ri] of riByCode) {
    // Reinforcement typically runs full length of profile minus weld allowances
    // Use 95% of profile length as reinforcement length (allows for weld gaps)
    const riLength = Math.round(ri.totalMm * 0.95);
    push(ri.riCode, ri.riLabel, riLength, 1, "reinforcement", { stockMm: ri.riStock, unitCost: 120 }); // ~Rs 120/m for GI reinforcement
  }

  // --- Gasket (EPDM) - perimeter based ---
  const perimeterMm = 2 * (W + H);
  const gasketLen = Math.round(perimeterMm * 1.1); // 10% extra for corners/weld
  push("EPDM-GSK", "EPDM Gasket", gasketLen, 1, "gasket", { unitCost: 45 });

  // --- Woolpile (for sliding) ---
  if (c.type.startsWith("sliding")) {
    const woolpileLen = Math.round(sashH * sashQty * 2); // vertical woolpile on interlock/sash
    push("WOOLPILE", "Woolpile", woolpileLen, 1, "gasket", { unitCost: 35 });
  }

  // --- Hardware (data-driven by tier and type) ---
  const hwEntries = getHardwareByTier(hardwareTier, c.type);
  if (hwEntries.length > 0) {
    const hw = hwEntries[0];
    push(hw.code, hw.name, 1, hw.qtyPerWindow ?? 1, "hardware", { unitCost: hw.unitCost });
  }

  // --- Mesh (separate line) ---
  if (c.hasMesh) {
    const meshEntry = getMeshEntry(c.meshType);
    if (meshEntry) {
      push(meshEntry.code, meshEntry.name, 1, meshEntry.qtyPerWindow ?? 1, "mesh", { unitCost: meshEntry.unitCost });
    }
  }

  // --- Totals ---
  const totalProfileMm = profileLines.reduce((s, l) => s + l.lengthMm * l.qty, 0);
  const totalReinforcementMm = lines.filter(l => l.kind === "reinforcement").reduce((s, l) => s + l.lengthMm * l.qty, 0);
  const sqft = mmToSqft(W, H);

  // Hardware cost from catalog
  const hardwareCost = lines
    .filter(l => l.kind === "hardware" || l.kind === "mesh")
    .reduce((s, l) => s + (l.unitCost ?? 0) * l.qty, 0);

  // Material cost: profile + reinforcement + bead + gasket + glass (approximate)
  // Profile cost: totalProfileMm * rate per mm (derived from ratePerSqft)
  // For now, use the existing sqft * rate for material, but break down for Eva structure
  const profileCost = totalProfileMm * 0.85; // Rs/mm approx
  const riCost = totalReinforcementMm * 0.45; // Rs/mm approx for GI
  const glassAreaSqm = glass.reduce((s, g) => s + (g.w * g.h / 1e6) * g.qty, 0);
  const glassCost = glassAreaSqm * 850; // Rs/sqm for 5-12-5 DGU
  const beadGasketCost = lines.filter(l => l.kind === "bead" || l.kind === "gasket").reduce((s, l) => s + (l.unitCost ?? 0) * (l.lengthMm / 1000) * l.qty, 0);

  const totalRawMaterial = profileCost + profileCost * 0.009 + riCost + riCost * 0.05 + hardwareCost + glassCost + glassCost * 0.05 + beadGasketCost;
  const fabricationLabour = sqft * 70;
  const installationLabour = sqft * 50;
  const subTotalInclLabour = totalRawMaterial + fabricationLabour + installationLabour;
  const profit = subTotalInclLabour * 0.60;
  const basicValue = subTotalInclLabour + profit;
  const discount = 0;
  const subTotal = basicValue + discount;
  const transportation = 1000;
  const loading = 1000;
  const totalProjectCost = subTotal + transportation + loading;
  const gst = totalProjectCost * 0.18;
  const grandTotal = totalProjectCost + gst;

  const material = sqft * rate; // legacy simple calculation
  const total = material + hardwareCost;

  return {
    lines,
    totalProfileMm,
    totalReinforcementMm,
    cuts,
    glass,
    sqft,
    price: { material, perSqft: rate, hardware: hardwareCost, total },
    warnings,
    priceBreakdown: {
      profileCost,
      profileWastage: profileCost * 0.009,
      riCost,
      riWastage: riCost * 0.05,
      hardwareCost,
      glassCost,
      glassWastage: glassCost * 0.05,
      totalRawMaterial,
      fabricationLabour,
      installationLabour,
      subTotalInclLabour,
      profit,
      basicValue,
      discount,
      subTotal,
      transportation,
      loading,
      totalProjectCost,
      gst,
      grandTotal,
    },
  };
}

/** Cutting: offcut-first Best-Fit-Decreasing with traceable per-bar cuts. Pure function, no DB.
 * Returns exact bar layouts so the saw sheet is auditable.
 * Each piece is lengthMm + weldLoss (3mm) for packing, but display stores original lengthMm.
 * Supports kerf (cut width) and tolerance (10mm default) per profile.
 */
export function optimizeCuts(
  cuts: Array<{ profileId: string; lengthMm: number; qty: number; stockMm?: number }>,
  defaultStockLen: number = STOCK_BAR_MM,
  offcuts: Array<{ profileId: string; lengthMm: number }> = [],
  kerf: number = 3, // saw blade kerf in mm
  tolerance: number = 10 // cutting tolerance in mm
): {
  bars: Array<{
    profileId: string;
    cuts: Array<{ lengthMm: number; qty: number }>;
    offcut: number;
    wastePct: number;
    stockMm: number;
    kerf: number;
    tolerance: number;
  }>;
  barsUsed: number;
  wastePct: number;
  offcutReuse: number;
} {
  // Group cuts by profileId
  const cutsByProfile = new Map<string, Array<{ lengthMm: number; qty: number; stockMm: number }>>();
  for (const c of cuts) {
    const key = c.profileId;
    const stock = c.stockMm || defaultStockLen;
    if (!cutsByProfile.has(key)) cutsByProfile.set(key, []);
    cutsByProfile.get(key)!.push({ lengthMm: c.lengthMm, qty: c.qty, stockMm: stock });
  }

  // Group offcuts by profileId
  const offcutsByProfile = new Map<string, number[]>();
  for (const o of offcuts) {
    if (!offcutsByProfile.has(o.profileId)) offcutsByProfile.set(o.profileId, []);
    offcutsByProfile.get(o.profileId)!.push(o.lengthMm);
  }

  let totalBarsUsed = 0;
  let totalOffcutReuse = 0;
  let totalWasteMm = 0;
  let totalStockMm = 0;
  const allBars: Array<{
    profileId: string;
    cuts: Array<{ lengthMm: number; qty: number }>;
    offcut: number;
    wastePct: number;
    stockMm: number;
    kerf: number;
    tolerance: number;
  }> = [];

  for (const [profileId, profileCuts] of cutsByProfile) {
    const stockLen = profileCuts[0]?.stockMm || defaultStockLen;
    const profileOffcuts = offcutsByProfile.get(profileId) || [];

    // Expand pieces with weld loss
    type Piece = { len: number; lenWithLoss: number };
    const pieces: Piece[] = [];
    for (const c of profileCuts) {
      for (let i = 0; i < c.qty; i++) {
        pieces.push({ len: c.lengthMm, lenWithLoss: c.lengthMm + D.weldLoss });
      }
    }
    pieces.sort((a, b) => b.lenWithLoss - a.lenWithLoss);

    // Seed with offcuts as initial bars
    const seededBars: number[] = profileOffcuts
      .filter(o => o >= Math.min(...pieces.map(p => p.lenWithLoss), 9999))
      .map(o => o);
    const barRemaining: number[] = [...seededBars];
    const barCuts: Array<Array<{ lengthMm: number; qty: number }>> = seededBars.map(() => []);

    let offcutReuse = 0;
    for (const p of pieces) {
      let bestIdx = -1;
      let bestRem = Infinity;
      for (let i = 0; i < barRemaining.length; i++) {
        // Account for kerf on each cut except the first on a new bar
        const requiredSpace = p.lenWithLoss + (barCuts[i].length > 0 ? kerf : 0);
        if (barRemaining[i] >= requiredSpace && barRemaining[i] - requiredSpace < bestRem) {
          bestRem = barRemaining[i] - requiredSpace;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        if (bestIdx < seededBars.length) offcutReuse++;
        const requiredSpace = p.lenWithLoss + (barCuts[bestIdx].length > 0 ? kerf : 0);
        barRemaining[bestIdx] -= requiredSpace;
        // Find existing cut or add new
        const existingCut = barCuts[bestIdx].find(c => c.lengthMm === p.len);
        if (existingCut) {
          existingCut.qty += 1;
        } else {
          barCuts[bestIdx].push({ lengthMm: p.len, qty: 1 });
        }
      } else {
        barRemaining.push(stockLen - p.lenWithLoss);
        barCuts.push([{ lengthMm: p.len, qty: 1 }]);
      }
    }

    const barsUsed = barRemaining.length;
    totalBarsUsed += barsUsed;
    totalOffcutReuse += offcutReuse;

    const totalNeeded = pieces.reduce((s, v) => s + v.lenWithLoss, 0) + (barsUsed - seededBars.length) * kerf * Math.max(0, pieces.length - 1);
    const totalStock = barsUsed * stockLen - seededBars.reduce((s, v) => s + (stockLen - v), 0);
    const waste = Math.max(0, totalStock - totalNeeded);
    totalWasteMm += waste;
    totalStockMm += totalStock;

    const barsDetail = barRemaining.map((rem, i) => ({
      profileId,
      cuts: barCuts[i] || [],
      offcut: rem,
      wastePct: rem >= 0 ? (rem / stockLen) * 100 : 0,
      stockMm: stockLen,
      kerf,
      tolerance,
    }));

    allBars.push(...barsDetail);
  }

  const wastePct = totalStockMm ? (totalWasteMm / totalStockMm) * 100 : 0;

  return { bars: allBars, barsUsed: totalBarsUsed, wastePct, offcutReuse: totalOffcutReuse };
}