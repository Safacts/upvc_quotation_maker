/**
 * profile-catalog.ts — Tenant-owned profile/RI/glass code master
 * Seed from Eva Aadisheshu BOQ + Cutting reports (read-only)
 * Codes verified 05-09-2026 in C:\Users\aadi\.playwright-mcp\*.pdf
 * Do not copy supplier geometry without validation; codes/prices are tenant-owned.
 * Extended 07-09-2026: Added casement/fixed/ventilator profiles + hardware mappings
 */

export type ProfileEntry = {
  code: string;
  name: string;
  stockMm: number;
  color: string;
  system: string; // e.g. "PROMINANCE INVENTA 3T"
  kind: "profile" | "ri" | "hardware" | "glass";
  // Hardware-specific fields
  hardwareTier?: "basic" | "standard" | "premium";
  unitCost?: number; // Rs per set/unit
  qtyPerWindow?: number; // default quantity per window
};

export const PROMINANCE_INVENTA_3T: ProfileEntry[] = [
  // --- SLIDING SERIES (from Eva Aadisheshu BOQ) ---
  { code: "PA62-UB-03", name: "62MM SLIDING SINGLE GLASS BEAD 24MM DGU", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PAM116", name: "ALUMINIUM GUIDE RAIL", stockMm: 3000, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PC50-UB-01", name: "50MM CASEMENT SINGLE GLASS BEAD", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PS62-UF-02", name: "112MM 3 TRACK SLIDING FRAME", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PS62-UO-05", name: "SL INTERLOCK WINDOW PROFILE", stockMm: 6000, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PS62-US-03", name: "62MM SLIDING SASH 24MM DGU", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },

  // --- CASEMENT / FIXED SERIES (tenant-owned codes mapped to PROMINANCE system) ---
  { code: "PF60-FR-01", name: "60MM CASEMENT/FIXED FRAME", stockMm: 6000, color: "WHITE", system: "PROMINANCE INVENTA CASEMENT SERIES", kind: "profile" },
  { code: "PS60-SH-01", name: "60MM CASEMENT SASH", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA CASEMENT SERIES", kind: "profile" },
  { code: "PM60-ML-01", name: "60MM MULLION / TRANSOM", stockMm: 6000, color: "WHITE", system: "PROMINANCE INVENTA CASEMENT SERIES", kind: "profile" },
  { code: "PB50-BD-01", name: "50MM CASEMENT GLAZING BEAD", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA CASEMENT SERIES", kind: "profile" },

  // --- FRENCH DOOR SERIES ---
  { code: "PF70-FR-01", name: "70MM FRENCH DOOR FRAME", stockMm: 6000, color: "WHITE", system: "PROMINANCE INVENTA DOOR SERIES", kind: "profile" },
  { code: "PS70-SH-01", name: "70MM FRENCH DOOR SASH", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA DOOR SERIES", kind: "profile" },
  { code: "PM70-ML-01", name: "70MM DOOR MULLION", stockMm: 6000, color: "WHITE", system: "PROMINANCE INVENTA DOOR SERIES", kind: "profile" },

  // --- VENTILATOR SERIES ---
  { code: "PF60-VT-01", name: "60MM VENTILATOR FRAME", stockMm: 6000, color: "WHITE", system: "PROMINANCE INVENTA VENTILATOR SERIES", kind: "profile" },
  { code: "PS60-VT-01", name: "60MM VENTILATOR SASH/LOUVER", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA VENTILATOR SERIES", kind: "profile" },

  // --- REINFORCEMENT (RI) ---
  { code: "RI-33x36-1.2", name: "RI-33MM X 36MM X 27.5MM-1.2MM (Sash RI)", stockMm: 5800, color: "GI", system: "PROMINANCE INVENTA", kind: "ri" },
  { code: "RI-14.5x30.5-1.2", name: "RI-14.5MM X 30.5MM-1.2MM (Frame/Track RI)", stockMm: 5800, color: "GI", system: "PROMINANCE INVENTA", kind: "ri" },

  // --- HARDWARE KITS (data-driven by tier) ---
  // Sliding hardware
  { code: "HW-SL-BASIC", name: "Sliding Roller + Lock Kit (Basic)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "basic", unitCost: 750, qtyPerWindow: 2 },
  { code: "HW-SL-STD", name: "Sliding Roller + Lock Kit (Standard)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "standard", unitCost: 1150, qtyPerWindow: 2 },
  { code: "HW-SL-PREM", name: "Sliding Roller + Lock Kit (Premium)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "premium", unitCost: 1850, qtyPerWindow: 2 },

  // Casement hardware
  { code: "HW-CS-BASIC", name: "Casement Handle+Hinge+Espag Kit (Basic)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "basic", unitCost: 750, qtyPerWindow: 1 },
  { code: "HW-CS-STD", name: "Casement Handle+Hinge+Espag Kit (Standard)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "standard", unitCost: 1150, qtyPerWindow: 1 },
  { code: "HW-CS-PREM", name: "Casement Handle+Hinge+Espag Kit (Premium)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "premium", unitCost: 1850, qtyPerWindow: 1 },

  // French door hardware (double)
  { code: "HW-FD-BASIC", name: "French Door Handle+Hinge+Espag Kit (Basic)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "basic", unitCost: 1500, qtyPerWindow: 2 },
  { code: "HW-FD-STD", name: "French Door Handle+Hinge+Espag Kit (Standard)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "standard", unitCost: 2300, qtyPerWindow: 2 },
  { code: "HW-FD-PREM", name: "French Door Handle+Hinge+Espag Kit (Premium)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "premium", unitCost: 3700, qtyPerWindow: 2 },

  // Ventilator hardware
  { code: "HW-VT-BASIC", name: "Ventilator Friction Stay + Handle (Basic)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "basic", unitCost: 450, qtyPerWindow: 1 },
  { code: "HW-VT-STD", name: "Ventilator Friction Stay + Handle (Standard)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "standard", unitCost: 680, qtyPerWindow: 1 },
  { code: "HW-VT-PREM", name: "Ventilator Friction Stay + Handle (Premium)", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA HARDWARE", kind: "hardware", hardwareTier: "premium", unitCost: 950, qtyPerWindow: 1 },

  // Mesh (separate line item)
  { code: "MESH-SS", name: "SS Insect Mesh", stockMm: 1, color: "SS", system: "PROMINANCE INVENTA MESH", kind: "hardware", unitCost: 650, qtyPerWindow: 1 },
  { code: "MESH-FIBER", name: "Fiber Insect Mesh", stockMm: 1, color: "BLACK", system: "PROMINANCE INVENTA MESH", kind: "hardware", unitCost: 380, qtyPerWindow: 1 },

  // Gasket / Bead accessories (per meter or per set)
  { code: "EPDM-GSK", name: "EPDM Gasket (per meter)", stockMm: 1, color: "BLACK", system: "PROMINANCE INVENTA ACCESSORIES", kind: "profile", unitCost: 45, qtyPerWindow: 1 },
  { code: "WOOLPILE", name: "Woolpile (per meter)", stockMm: 1, color: "GREY", system: "PROMINANCE INVENTA ACCESSORIES", kind: "profile", unitCost: 35, qtyPerWindow: 1 },
];

export function getProfileByCode(code: string): ProfileEntry | undefined {
  return PROMINANCE_INVENTA_3T.find(p => p.code === code);
}

export function getProfilesBySystem(system: string): ProfileEntry[] {
  return PROMINANCE_INVENTA_3T.filter(p => p.system === system);
}

export function getProfilesByKind(kind: ProfileEntry["kind"]): ProfileEntry[] {
  return PROMINANCE_INVENTA_3T.filter(p => p.kind === kind);
}

export function getHardwareByTier(tier: "basic" | "standard" | "premium", windowType: string): ProfileEntry[] {
  const prefixes: Record<string, string> = {
    sliding: "HW-SL",
    casement: "HW-CS",
    casement_single: "HW-CS",
    casement_double: "HW-CS",
    casement_fixed_combo: "HW-CS",
    french: "HW-FD",
    ventilator: "HW-VT",
    tilt_turn: "HW-CS",
    fixed: "HW-CS",
  };
  const prefix = prefixes[windowType] || "HW-CS";
  return PROMINANCE_INVENTA_3T.filter(p => p.kind === "hardware" && p.hardwareTier === tier && p.code.startsWith(prefix));
}

export function getMeshEntry(meshType?: string): ProfileEntry | undefined {
  if (!meshType || meshType.toLowerCase().includes("ss") || meshType.toLowerCase().includes("stainless")) {
    return PROMINANCE_INVENTA_3T.find(p => p.code === "MESH-SS");
  }
  return PROMINANCE_INVENTA_3T.find(p => p.code === "MESH-FIBER");
}

export function getReinforcementForProfile(profileCode: string): ProfileEntry | undefined {
  // Sash profiles use RI-33x36, Frame/Mullion/Interlock use RI-14.5x30.5
  const sashCodes = ["PS62-US-03", "PS60-SH-01", "PS70-SH-01", "PS60-VT-01"];
  const frameCodes = ["PS62-UF-02", "PS62-UO-05", "PF60-FR-01", "PM60-ML-01", "PF70-FR-01", "PM70-ML-01", "PF60-VT-01", "PAM116"];
  
  if (sashCodes.includes(profileCode)) {
    return PROMINANCE_INVENTA_3T.find(p => p.code === "RI-33x36-1.2");
  }
  if (frameCodes.includes(profileCode)) {
    return PROMINANCE_INVENTA_3T.find(p => p.code === "RI-14.5x30.5-1.2");
  }
  // Default to frame RI
  return PROMINANCE_INVENTA_3T.find(p => p.code === "RI-14.5x30.5-1.2");
}

export function getBeadForProfile(profileCode: string): ProfileEntry | undefined {
  const beadMap: Record<string, string> = {
    "PS62-US-03": "PA62-UB-03",
    "PS60-SH-01": "PB50-BD-01",
    "PS70-SH-01": "PB50-BD-01",
    "PF60-FR-01": "PB50-BD-01",
    "PF70-FR-01": "PB50-BD-01",
    "PF60-VT-01": "PB50-BD-01",
  };
  const beadCode = beadMap[profileCode];
  if (beadCode) return PROMINANCE_INVENTA_3T.find(p => p.code === beadCode);
  return PROMINANCE_INVENTA_3T.find(p => p.code === "PB50-BD-01");
}

export function getAllSystems(): string[] {
  return Array.from(new Set(PROMINANCE_INVENTA_3T.map(p => p.system)));
}

export function getProfileStockMm(code: string): number {
  const entry = getProfileByCode(code);
  return entry?.stockMm || 6000;
}