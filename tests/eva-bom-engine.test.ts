import { describe, expect, it } from "vitest";
import { buildBom, optimizeCuts } from "../src/lib/bom-engine";

describe("Eva BOM engine", () => {
  it("uses catalog profile codes and emits traceable reinforcement", () => {
    const bom = buildBom({ type: "sliding_2track_2panel", width: 1800, height: 1500, hasMesh: true });
    expect(bom.lines.length).toBeGreaterThan(0);
    expect(bom.lines.some((line) => line.profileId === "PS62-UF-02")).toBe(true);
    expect(bom.lines.some((line) => line.kind === "reinforcement")).toBe(true);
    expect(bom.priceBreakdown?.grandTotal).toBeGreaterThan(0);
    expect(bom.cuts.every((cut) => cut.stockMm > 0)).toBe(true);
  });

  it("never reuses an offcut belonging to another profile", () => {
    const result = optimizeCuts(
      [{ profileId: "PS62-UF-02", lengthMm: 1000, qty: 1, stockMm: 5800 }],
      6000,
      [{ profileId: "PS62-US-03", lengthMm: 5000 }],
    );
    expect(result.offcutReuse).toBe(0);
    expect(result.barsUsed).toBe(1);
  });
});
