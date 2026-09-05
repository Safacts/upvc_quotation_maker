/**
 * profile-catalog.ts — Tenant-owned profile/RI/glass code master
 * Seed from Eva Aadisheshu BOQ + Cutting reports (read-only)
 * Codes verified 05-09-2026 in C:\Users\aadi\.playwright-mcp\*.pdf
 * Do not copy supplier geometry without validation; codes/prices are tenant-owned.
 */

export type ProfileEntry = {
  code: string;
  name: string;
  stockMm: number;
  color: string;
  system: string; // e.g. "PROMINANCE INVENTA 3T"
  kind: "profile" | "ri" | "hardware" | "glass";
};

export const PROMINANCE_INVENTA_3T: ProfileEntry[] = [
  { code: "PA62-UB-03", name: "62MM SLIDING SINGLE GLASS BEAD 24MM DGU", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PAM116", name: "ALUMINIUM GUIDE RAIL", stockMm: 3000, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PC50-UB-01", name: "50MM CASEMENT SINGLE GLASS BEAD", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PS62-UF-02", name: "112MM 3 TRACK SLIDING FRAME", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PS62-UO-05", name: "SL INTERLOCK WINDOW PROFILE", stockMm: 6000, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  { code: "PS62-US-03", name: "62MM SLIDING SASH 24MM DGU", stockMm: 5800, color: "WHITE", system: "PROMINANCE INVENTA SLIDING SERIES", kind: "profile" },
  // RI mirrors — from cutting report designation
  { code: "RI-33x36-1.2", name: "RI-33MM X 36MM X 27.5MM-1.2MM (Sash RI)", stockMm: 5800, color: "GI", system: "PROMINANCE INVENTA", kind: "ri" },
  { code: "RI-14.5x30.5-1.2", name: "RI-14.5MM X 30.5MM-1.2MM (Track RI)", stockMm: 5800, color: "GI", system: "PROMINANCE INVENTA", kind: "ri" },
];

export function getProfileByCode(code: string): ProfileEntry | undefined {
  return PROMINANCE_INVENTA_3T.find(p => p.code === code);
}
