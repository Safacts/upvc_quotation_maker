/**
 * Cutting Optimizer V2 - Best-Fit-Decreasing with Offcut-First Reuse
 * Pure TypeScript implementation (no OR-Tools binary dependency)
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

/** A piece to be cut from a bar */
export interface CutPiece {
  lengthMm: number;
  quantity: number;
  label: string;
  profileType: string;
}

/** A reusable offcut from previous cutting operations */
export interface Offcut {
  id: string;
  lengthMm: number;
  profileType: string;
}

/** A single cut within a bar */
export interface CutEntry {
  lengthMm: number;
  quantity: number;
  label: string;
  offcutMm: number; // 0 if from new bar, >0 if from offcut
}

/** A bar in the cutting plan */
export interface CutBar {
  barNo: number;
  cuts: CutEntry[];
  usedMm: number;
  wasteMm: number;
}

/** Complete cutting plan with metrics */
export interface CuttingPlan {
  bars: CutBar[];
  totalBars: number;
  totalWasteMm: number;
  wastePercent: number;
  barsSaved: number;
  rsSaved: number;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_BAR_LENGTH_MM = 5800;
const DEFAULT_KERF_MM = 3;
const MIN_OFFCUT_REUSE_MM = 300; // Minimum offcut length to consider for reuse

// ============================================================================
// Helper Functions
// ============================================================================

/** Safe number conversion with fallback */
function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Generate a simple QR code data string (base64 encoded JSON) */
function generateQRData(barNo: number, profileType: string, cuts: CutEntry[]): string {
  const data = {
    barNo,
    profileType,
    cuts: cuts.map(c => ({
      length: c.lengthMm,
      qty: c.quantity,
      label: c.label,
      isOffcut: c.offcutMm > 0
    })),
    timestamp: Date.now()
  };
  return btoa(JSON.stringify(data));
}

/** Generate a printable label text for a bar */
function generateLabelText(barNo: number, profileType: string, cuts: CutEntry[], wasteMm: number): string {
  const cutsStr = cuts.map(c => {
    const qtyStr = c.quantity > 1 ? `x${c.quantity} ` : '';
    const offcutStr = c.offcutMm > 0 ? ` (offcut:${c.offcutMm})` : '';
    return `${qtyStr}${c.lengthMm}mm${offcutStr}`;
  }).join(' + ');
  
  return `Bar ${barNo} | ${profileType} | ${cutsStr} | Waste: ${wasteMm}mm`;
}

// ============================================================================
// Core Algorithm: Best-Fit-Decreasing with Offcut-First
// ============================================================================

/**
 * Main optimization function with offcut-first reuse and BFD bin packing
 * 
 * @param pieces - Array of pieces to cut
 * @param barLengthMm - Standard bar length (default 5800mm)
 * @param offcuts - Available offcuts for reuse
 * @param barRate - Cost per bar in Rs (for savings calculation)
 * @returns CuttingPlan with bars, waste metrics, and savings
 */
export function optimizeCutsWithOffcuts(
  pieces: CutPiece[],
  barLengthMm = DEFAULT_BAR_LENGTH_MM,
  offcuts: Offcut[] = [],
  barRate = 0
): CuttingPlan {
  const barLength = Math.floor(num(barLengthMm, DEFAULT_BAR_LENGTH_MM));
  const kerf = DEFAULT_KERF_MM;
  
  if (barLength <= 0) throw new Error("Bar length must be positive");
  
  // Validate pieces
  const validPieces = pieces.filter(p => 
    num(p.lengthMm) > 0 && 
    num(p.lengthMm) <= barLength && 
    num(p.quantity) > 0 &&
    p.profileType?.trim()
  );
  
  if (validPieces.length === 0) {
    return createEmptyPlan(barRate);
  }

  // Group pieces by profile type
  const piecesByProfile = new Map<string, CutPiece[]>();
  for (const piece of validPieces) {
    const list = piecesByProfile.get(piece.profileType) || [];
    list.push(piece);
    piecesByProfile.set(piece.profileType, list);
  }

  // Filter offcuts by profile type and minimum length
  const usableOffcuts = offcuts.filter(o => 
    num(o.lengthMm) >= MIN_OFFCUT_REUSE_MM && 
    o.profileType?.trim()
  );
  
  const offcutsByProfile = new Map<string, Offcut[]>();
  for (const offcut of usableOffcuts) {
    const list = offcutsByProfile.get(offcut.profileType) || [];
    list.push({ ...offcut, lengthMm: num(offcut.lengthMm) });
    offcutsByProfile.set(offcut.profileType, list);
  }

  // Sort offcuts by length descending (best fit first)
  for (const [_, list] of offcutsByProfile) {
    list.sort((a, b) => b.lengthMm - a.lengthMm);
  }

  const allBars: CutBar[] = [];
  let barsSaved = 0;
  let barNoCounter = 0;

  // Process each profile type independently
  for (const [profileType, profilePieces] of piecesByProfile) {
    const profileOffcuts = offcutsByProfile.get(profileType) || [];
    const usedOffcuts = new Set<string>();
    
    // Expand pieces into individual cuts, sorted by length descending (BFD)
    const expandedCuts: CutPiece[] = [];
    for (const piece of profilePieces) {
      const qty = Math.max(1, Math.floor(num(piece.quantity, 1)));
      for (let i = 0; i < qty; i++) {
        expandedCuts.push({ ...piece, quantity: 1 });
      }
    }
    expandedCuts.sort((a, b) => b.lengthMm - a.lengthMm);

    // Track remaining pieces after offcut reuse
    const remainingCuts: CutPiece[] = [];

    // ===== PHASE 1: Offcut-First Reuse =====
    for (const cut of expandedCuts) {
      let placed = false;
      
      // Find best-fit offcut (smallest offcut that fits)
      let bestOffcutIdx = -1;
      let bestOffcutWaste = Infinity;
      
      for (let i = 0; i < profileOffcuts.length; i++) {
        const offcut = profileOffcuts[i];
        if (usedOffcuts.has(offcut.id)) continue;
        if (offcut.lengthMm >= cut.lengthMm + kerf) {
          const waste = offcut.lengthMm - cut.lengthMm - kerf;
          if (waste < bestOffcutWaste) {
            bestOffcutWaste = waste;
            bestOffcutIdx = i;
          }
        }
      }
      
      if (bestOffcutIdx >= 0) {
        const offcut = profileOffcuts[bestOffcutIdx];
        usedOffcuts.add(offcut.id);
        barsSaved++;
        
        barNoCounter++;
        const wasteMm = offcut.lengthMm - cut.lengthMm - kerf;
        allBars.push({
          barNo: barNoCounter,
          cuts: [{
            lengthMm: cut.lengthMm,
            quantity: 1,
            label: cut.label,
            offcutMm: offcut.lengthMm
          }],
          usedMm: cut.lengthMm + kerf,
          wasteMm: Math.max(0, wasteMm)
        });
        placed = true;
      }
      
      if (!placed) {
        remainingCuts.push(cut);
      }
    }

    // ===== PHASE 2: Best-Fit-Decreasing (BFD) for Remaining Cuts =====
    // Current bars for this profile (for BFD)
    const profileBars: CutBar[] = allBars.filter(b => 
      b.cuts.some(c => c.label && profilePieces.some(p => p.label === c.label))
    ).filter(b => b.cuts[0]?.offcutMm === 0 || b.cuts[0]?.offcutMm === undefined);
    
    // Actually, let's maintain separate bar list for BFD
    const bfdBars: CutBar[] = [];

    for (const cut of remainingCuts) {
      // Find best-fit existing bar (bar with least waste after adding this cut)
      let bestBarIdx = -1;
      let bestBarWaste = Infinity;
      
      for (let i = 0; i < bfdBars.length; i++) {
        const bar = bfdBars[i];
        const additionalKerf = bar.cuts.length > 0 ? kerf : 0;
        const newUsed = bar.usedMm + additionalKerf + cut.lengthMm;
        
        if (newUsed <= barLength) {
          const waste = barLength - newUsed;
          if (waste < bestBarWaste) {
            bestBarWaste = waste;
            bestBarIdx = i;
          }
        }
      }
      
      if (bestBarIdx >= 0) {
        // Add to existing bar
        const bar = bfdBars[bestBarIdx];
        const additionalKerf = bar.cuts.length > 0 ? kerf : 0;
        bar.cuts.push({
          lengthMm: cut.lengthMm,
          quantity: 1,
          label: cut.label,
          offcutMm: 0
        });
        bar.usedMm += additionalKerf + cut.lengthMm;
        bar.wasteMm = barLength - bar.usedMm;
      } else {
        // Create new bar
        barNoCounter++;
        const newBar: CutBar = {
          barNo: barNoCounter,
          cuts: [{
            lengthMm: cut.lengthMm,
            quantity: 1,
            label: cut.label,
            offcutMm: 0
          }],
          usedMm: cut.lengthMm,
          wasteMm: barLength - cut.lengthMm
        };
        bfdBars.push(newBar);
      }
    }

    // Merge BFD bars into allBars (renumbering)
    for (const bar of bfdBars) {
      barNoCounter++;
      allBars.push({
        ...bar,
        barNo: barNoCounter
      });
    }
  }

  // ===== Calculate Metrics =====
  const totalBars = allBars.length;
  const totalWasteMm = allBars.reduce((sum, bar) => sum + bar.wasteMm, 0);
  const totalUsedMm = allBars.reduce((sum, bar) => sum + bar.usedMm, 0);
  const totalBarMm = totalBars * barLength;
  const wastePercent = totalBarMm > 0 ? (totalWasteMm / totalBarMm) * 100 : 0;
  const rsSaved = barsSaved * num(barRate, 0);

  return {
    bars: allBars,
    totalBars,
    totalWasteMm,
    wastePercent: Math.round(wastePercent * 100) / 100,
    barsSaved,
    rsSaved: Math.round(rsSaved * 100) / 100
  };
}

/** Create empty plan for edge cases */
function createEmptyPlan(barRate: number): CuttingPlan {
  return {
    bars: [],
    totalBars: 0,
    totalWasteMm: 0,
    wastePercent: 0,
    barsSaved: 0,
    rsSaved: 0
  };
}

// ============================================================================
// Output Generators
// ============================================================================

/**
 * Generate saw-operator sheet format
 * Example: "Bar 1: 1450+1450+offcut"
 *          "Bar 2: 2100+1800+1900"
 */
export function generateSawOperatorSheet(plan: CuttingPlan): string {
  if (plan.bars.length === 0) {
    return "No cuts required.";
  }

  const lines: string[] = [];
  lines.push("=".repeat(50));
  lines.push("SAW OPERATOR CUTTING SHEET");
  lines.push("=".repeat(50));
  lines.push("");

  for (const bar of plan.bars) {
    const cutParts = bar.cuts.map(cut => {
      const qtyStr = cut.quantity > 1 ? `${cut.quantity}x` : '';
      const labelStr = cut.label ? `(${cut.label})` : '';
      const offcutStr = cut.offcutMm > 0 ? ` [Offcut:${cut.offcutMm}mm]` : '';
      return `${qtyStr}${cut.lengthMm}mm${labelStr}${offcutStr}`;
    });
    
    const cutsStr = cutParts.join(' + ');
    lines.push(`Bar ${bar.barNo}: ${cutsStr} | Used: ${bar.usedMm}mm | Waste: ${bar.wasteMm}mm`);
  }

  lines.push("");
  lines.push("-".repeat(50));
  lines.push(`SUMMARY:`);
  lines.push(`Total Bars: ${plan.totalBars}`);
  lines.push(`Total Waste: ${plan.totalWasteMm}mm (${plan.wastePercent}%)`);
  lines.push(`Bars Saved (Offcuts): ${plan.barsSaved}`);
  lines.push(`Estimated Savings: ₹${plan.rsSaved.toLocaleString()}`);
  lines.push("=".repeat(50));

  return lines.join('\n');
}

/**
 * Generate printable labels with QR codes for each bar
 * Returns array of label objects with QR data and human-readable text
 */
export function generatePrintLabels(
  plan: CuttingPlan, 
  profileType: string
): Array<{ barNo: number; qrData: string; labelText: string }> {
  return plan.bars.map(bar => ({
    barNo: bar.barNo,
    qrData: generateQRData(bar.barNo, profileType, bar.cuts),
    labelText: generateLabelText(bar.barNo, profileType, bar.cuts, bar.wasteMm)
  }));
}

// ============================================================================
// Utility: Group cuts by length for label consolidation
// ============================================================================

/** Consolidate duplicate cuts in a bar for cleaner display */
export function consolidateBarCuts(bar: CutBar): CutBar {
  const consolidated = new Map<string, CutEntry>();
  
  for (const cut of bar.cuts) {
    const key = `${cut.lengthMm}|${cut.label}|${cut.offcutMm}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.quantity += cut.quantity;
    } else {
      consolidated.set(key, { ...cut });
    }
  }
  
  return {
    ...bar,
    cuts: Array.from(consolidated.values())
  };
}

// ============================================================================
// Export all public API
// ============================================================================

export { DEFAULT_BAR_LENGTH_MM, DEFAULT_KERF_MM, MIN_OFFCUT_REUSE_MM };