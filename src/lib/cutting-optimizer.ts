/** First-fit-decreasing optimizer for fixed-length UPVC profile bars. */

export interface CutPiece { lengthMm: number; quantity?: number; material?: string; label?: string; sourceId?: string }
export interface PlannedCut { lengthMm: number; label?: string; sourceId?: string; kerfBeforeMm: number }
export interface CutBar { barNo: number; material: string; barLengthMm: number; cuts: PlannedCut[]; usedMm: number; wasteMm: number }
export interface CuttingPlan { bars: CutBar[]; barLengthMm: number; kerfMm: number; totalCutMm: number; totalWasteMm: number; utilizationPercent: number }

const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

export function optimizeCutting(pieces: CutPiece[], barLengthMm = 5800, kerfMm = 3): CuttingPlan {
  const barLength = Math.floor(num(barLengthMm, 5800));
  const kerf = Math.max(0, num(kerfMm, 3));
  if (barLength <= 0) throw new Error("Bar length must be positive");
  const expanded = pieces.flatMap((piece) => Array.from({ length: Math.max(0, Math.floor(num(piece.quantity, 1))) }, () => ({ ...piece, lengthMm: num(piece.lengthMm) })));
  if (expanded.some((p) => p.lengthMm <= 0 || p.lengthMm > barLength)) throw new Error("Every cut must be greater than zero and fit inside the bar");
  const grouped = new Map<string, typeof expanded>();
  for (const piece of expanded) { const key = piece.material || "uPVC profile"; const list = grouped.get(key) || []; list.push(piece); grouped.set(key, list); }
  const bars: CutBar[] = [];
  for (const [material, group] of grouped) {
    group.sort((a, b) => b.lengthMm - a.lengthMm);
    for (const piece of group) {
      const existing = bars.filter((bar) => bar.material === material).map((bar) => ({ bar, used: bar.usedMm + (bar.cuts.length ? kerf : 0) + piece.lengthMm })).filter((x) => x.used <= barLength).sort((a, b) => (a.bar.barLengthMm - a.used) - (b.bar.barLengthMm - b.used));
      const target = existing[0]?.bar;
      if (target) { const kerfBefore = target.cuts.length ? kerf : 0; target.cuts.push({ lengthMm: piece.lengthMm, label: piece.label, sourceId: piece.sourceId, kerfBeforeMm: kerfBefore }); target.usedMm += kerfBefore + piece.lengthMm; target.wasteMm = barLength - target.usedMm; }
      else { const bar: CutBar = { barNo: bars.length + 1, material, barLengthMm: barLength, cuts: [{ lengthMm: piece.lengthMm, label: piece.label, sourceId: piece.sourceId, kerfBeforeMm: 0 }], usedMm: piece.lengthMm, wasteMm: barLength - piece.lengthMm }; bars.push(bar); }
    }
  }
  const totalCutMm = expanded.reduce((s, p) => s + p.lengthMm, 0);
  const totalWasteMm = bars.reduce((s, b) => s + b.wasteMm, 0);
  return { bars, barLengthMm: barLength, kerfMm: kerf, totalCutMm, totalWasteMm, utilizationPercent: bars.length ? (totalCutMm / (bars.length * barLength)) * 100 : 0 };
}

export const optimizeCuts = optimizeCutting;
