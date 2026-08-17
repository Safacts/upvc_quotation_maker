import { describe, expect, it } from "vitest";
import { explodeQuotation } from "@/lib/bom-calculator";
import { optimizeCutting } from "@/lib/cutting-optimizer";

describe("UPVC BOM and cutting engine", () => {
  it("explodes a two-panel sliding window into dimensional BOQ lines", () => {
    const result = explodeQuotation([{ id: "q1", description: "Living", width: 1800, height: 1500, units: 2, bom_config: { profile: { system: "60mm", type: "sliding", panels: 2 }, glass: { type: "clear", thickness: 5 } } }]);
    expect(result.lines.find((line) => line.component === "outer frame")?.lengthMm).toBe(6600);
    expect(result.lines.find((line) => line.component === "sliding sash")?.quantity).toBe(4);
    expect(result.totals.glassSqm).toBe(5.4);
  });

  it("keeps profile materials separate and accounts for kerf", () => {
    const plan = optimizeCutting([
      { material: "60mm", lengthMm: 2900, quantity: 1 },
      { material: "60mm", lengthMm: 2800, quantity: 1 },
      { material: "70mm", lengthMm: 3000, quantity: 1 },
    ], 5800, 3);
    expect(plan.bars).toHaveLength(2);
    expect(plan.bars.every((bar) => bar.cuts.reduce((s, cut) => s + cut.kerfBeforeMm + cut.lengthMm, 0) <= 5800)).toBe(true);
    expect(plan.totalWasteMm).toBeGreaterThan(0);
  });
});
