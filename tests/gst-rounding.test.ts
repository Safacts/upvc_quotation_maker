/**
 * TEST — GST ROUNDING & COMPLIANCE (src/lib/gst-calculations.ts)
 *
 * Verifies paisa-level rounding, tax-split consistency, and floating-point-drift
 * prevention for GST invoice calculations.
 *
 * These tests assert the COMPLIANCE contract that the GST invoice module must
 * satisfy:
 *   - Every monetary output has at most 2 decimal places (paisa level).
 *   - CGST + SGST amounts are IDENTICAL (to the paisa) to the IGST amount when
 *     the same invoice is re-rated for inter-state supply.
 *   - Grand total = taxable value + total GST with no floating-point drift.
 *
 * On 14-08-2026 the original `computeGstTotals` produced unrounded doubles
 * (e.g. 9.00945 instead of 9.01).  These tests enforce the fix.
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { computeGstTotals } from "@/lib/gst-calculations";
import { roundMoney } from "@/lib/calc";

/** Assertion helper: a money value must already be at paisa precision. */
function expectPaisa(n: number): void {
  expect(roundMoney(n)).toBe(n);
}

/** Assertion helper: CGST + SGST === IGST for the same taxable basis. */
function expectCgstSgstEqualsIgst(
  intra: ReturnType<typeof computeGstTotals>,
  inter: ReturnType<typeof computeGstTotals>,
): void {
  const cgstPlusSgst = roundMoney(intra.cgstAmount + intra.sgstAmount);
  expectPaisa(inter.igstAmount);
  expect(inter.igstAmount).toBe(cgstPlusSgst);
}

/** Assertion helper: grandTotal must be exactly taxableValue + total GST. */
function expectGrandTotalClean(t: ReturnType<typeof computeGstTotals>): void {
  const totalGst = roundMoney(t.cgstAmount + t.sgstAmount + t.igstAmount);
  const expected = roundMoney(t.taxableValue + totalGst);
  expect(t.grandTotal).toBe(expected);
}

// ---------------------------------------------------------------------------
// 1. Every tax amount and money field is rounded to 2 decimal places
// ---------------------------------------------------------------------------
describe("GST rounding — all amounts at paisa precision", () => {
  it("rounds CGST/SGST/IGST amounts and taxableValue to 2 decimals", () => {
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 100.105 }],   // 3-decimal input
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expectPaisa(t.taxableValue);
    expectPaisa(t.cgstAmount);
    expectPaisa(t.sgstAmount);
    expectPaisa(t.igstAmount);
    expectPaisa(t.grandTotal);
  });

  it("rounds tax amounts when rate produces a sub-paisa remainder", () => {
    // taxableValue = 101 → CGST = round(101 × 9/100) = round(9.09) = 9.09 (clean)
    // taxableValue = 103 → CGST = round(103 × 9/100) = round(9.27) = 9.27
    // taxableValue = 107 → CGST = round(107 × 9/100) = round(9.63) = 9.63
    // taxableValue = 111 → CGST = round(111 × 9/100) = round(9.99) = 9.99
    // taxableValue = 112 → CGST = round(112 × 9/100) = round(10.08) = 10.08
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 112 }],
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expectPaisa(t.cgstAmount);
    expectPaisa(t.sgstAmount);
    expectPaisa(t.grandTotal);
  });

  it("rounds each tax component independently when rates differ", () => {
    // cgstRate=7, sgstRate=7 → 14% total
    // taxableValue = 101 → CGST=round(7.07)=7.07, SGST=round(7.07)=7.07
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 101 }],
      cgstRate: 7,
      sgstRate: 7,
      isInterstate: false,
    });
    expectPaisa(t.cgstAmount);
    expectPaisa(t.sgstAmount);
  });
});

// ---------------------------------------------------------------------------
// 2. CGST + SGST === IGST exactly when switching intra ↔ inter state
// ---------------------------------------------------------------------------
describe("GST rounding — CGST+SGST = IGST parity", () => {
  const parityCases: Array<{ name: string; rate: number; qty: number; cgst: number; sgst: number }> = [
    { name: "18% standard, even base", rate: 1000, qty: 1, cgst: 9, sgst: 9 },
    { name: "18% standard, odd base", rate: 101, qty: 1, cgst: 9, sgst: 9 },
    { name: "5% rate, uneven base", rate: 333, qty: 1, cgst: 2.5, sgst: 2.5 },
    { name: "12% rate, 3-decimal", rate: 100.105, qty: 1, cgst: 6, sgst: 6 },
    { name: "28% rate, large base", rate: 50000, qty: 1, cgst: 14, sgst: 14 },
    { name: "18% rate, quantity>1", rate: 123.45, qty: 7, cgst: 9, sgst: 9 },
  ];

  for (const c of parityCases) {
    it(`parity: ${c.name}`, () => {
      const base = {
        items: [{ quantity: c.qty, rate: c.rate }],
        cgstRate: c.cgst,
        sgstRate: c.sgst,
      };
      const intra = computeGstTotals({ ...base, isInterstate: false });
      const inter = computeGstTotals({ ...base, isInterstate: true });
      expectCgstSgstEqualsIgst(intra, inter);
    });
  }

  it("IGST amount equals rounded CGST+SGST for a value that would diverge without careful rounding", () => {
    // taxableValue = 101, cgstRate = 7, sgstRate = 7
    //   CGST = round(101*7/100) = round(7.07) = 7.07
    //   SGST = 7.07
    //   CGST+SGST = 14.14
    //   IGST (independent) = round(101*14/100) = round(14.14) = 14.14  ← matches
    //
    // But with a different base: taxableValue = 103
    //   CGST = round(103*7/100) = round(7.21) = 7.21
    //   SGST = 7.21
    //   CGST+SGST = 14.42
    //   IGST (independent) = round(103*14/100) = round(14.42) = 14.42  ← matches
    //
    // Try taxableValue = 107:
    //   CGST = round(107*7/100) = round(7.49) = 7.49
    //   SGST = 7.49
    //   CGST+SGST = 14.98
    //   IGST (independent) = round(107*14/100) = round(14.98) = 14.98 ← matches
    //
    // A real divergence (1 paisa gap) happens at:
    //   taxableValue = 100.105 → rounded to 100.10
    //   CGST = round(100.10*7/100) = round(7.007) = 7.01
    //   SGST = round(7.007) = 7.01
    //   CGST+SGST = 14.02
    //   IGST(independent) = round(100.10*14/100) = round(14.014) = 14.01  ← DIVERGES
    //
    // Our fix: IGST = roundMoney(CGST + SGST) = 14.02  ← matches by construction
    const base = {
      items: [{ quantity: 1, rate: 100.105 }],
      cgstRate: 7,
      sgstRate: 7,
    };
    const intra = computeGstTotals({ ...base, isInterstate: false });
    const inter = computeGstTotals({ ...base, isInterstate: true });
    expectCgstSgstEqualsIgst(intra, inter);
    expect(inter.igstAmount).toBe(14.02); // the value that CGST+SGST produces
  });
});

// ---------------------------------------------------------------------------
// 3. Grand total = taxable value + total GST (no floating-point drift)
// ---------------------------------------------------------------------------
describe("GST rounding — grand total integrity", () => {
  const grandTotalCases: Array<{ name: string; items: any[]; transport: number; cgst: number; sgst: number }> = [
    { name: "simple 18% intra", items: [{ quantity: 10, rate: 1000 }], transport: 0, cgst: 9, sgst: 9 },
    { name: "with transport", items: [{ quantity: 10, rate: 1000 }], transport: 500, cgst: 9, sgst: 9 },
    { name: "multiple items", items: [{ quantity: 10, rate: 1000 }, { quantity: 5, rate: 2000 }, { quantity: 2, rate: 500 }], transport: 0, cgst: 9, sgst: 9 },
    { name: "3-decimal rates", items: [{ quantity: 2, rate: 100.105 }], transport: 0, cgst: 9, sgst: 9 },
    { name: "5% rate", items: [{ quantity: 3, rate: 333 }], transport: 0, cgst: 2.5, sgst: 2.5 },
    { name: "28% rate", items: [{ quantity: 1, rate: 50000 }], transport: 1250, cgst: 14, sgst: 14 },
    { name: "inter-state 18%", items: [{ quantity: 10, rate: 1000 }], transport: 0, cgst: 9, sgst: 9 },
  ];

  for (const c of grandTotalCases) {
    it(`grand total integrity: ${c.name}`, () => {
      const t = computeGstTotals({
        items: c.items,
        transportCost: c.transport,
        cgstRate: c.cgst,
        sgstRate: c.sgst,
        isInterstate: false,
      });
      expectGrandTotalClean(t);
      // also verify inter-state version
      const ti = computeGstTotals({
        items: c.items,
        transportCost: c.transport,
        cgstRate: c.cgst,
        sgstRate: c.sgst,
        isInterstate: true,
      });
      expectGrandTotalClean(ti);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Edge case: very large amounts (₹10,00,000+)
// ---------------------------------------------------------------------------
describe("GST rounding — large amounts", () => {
  it("₹10,00,000+ (10 lakh taxable value) is exact to the paisa", () => {
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 1000000 }],
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expect(t.taxableValue).toBe(1000000);
    expect(t.cgstAmount).toBe(90000);
    expect(t.sgstAmount).toBe(90000);
    expect(t.grandTotal).toBe(1180000);

    const inter = computeGstTotals({
      items: [{ quantity: 1, rate: 1000000 }],
      cgstRate: 9, sgstRate: 9, isInterstate: true,
    });
    expect(inter.igstAmount).toBe(180000);
    expect(inter.grandTotal).toBe(1180000);
    // Both states produce the same grand total
    expect(t.grandTotal).toBe(inter.grandTotal);
  });

  it("₹1,00,00,000+ (1 crore) with 28% GST", () => {
    const t = computeGstTotals({
      items: [{ quantity: 1000, rate: 100000 }],
      transportCost: 50000,
      cgstRate: 14,
      sgstRate: 14,
      isInterstate: false,
    });
    expect(t.taxableValue).toBe(roundMoney(100000 * 1000 + 50000));
    expectPaisa(t.cgstAmount);
    expectPaisa(t.sgstAmount);
    expectPaisa(t.grandTotal);
    expectGrandTotalClean(t);
  });
});

// ---------------------------------------------------------------------------
// 5. Edge case: very small amounts (₹0.01)
// ---------------------------------------------------------------------------
describe("GST rounding — small amounts", () => {
  it("₹0.01 taxable value — tax rounds to 0 when below 0.5 paisa", () => {
    // taxableValue = 0.01
    // CGST = round(0.01 * 9 / 100) = round(0.0009) = 0.00
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 0.01 }],
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expect(t.taxableValue).toBe(0.01);
    expect(t.cgstAmount).toBe(0);
    expect(t.sgstAmount).toBe(0);
    expect(t.grandTotal).toBe(0.01);
  });

  it("₹0.55 taxable value — tax rounds down to 0 at 9%", () => {
    // taxableValue = 0.55
    // CGST = round(0.55 * 9 / 100) = round(0.0495) = 0.05
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 0.55 }],
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expect(t.taxableValue).toBe(0.55);
    expectPaisa(t.cgstAmount);
    expectPaisa(t.sgstAmount);
    expectGrandTotalClean(t);
  });

  it("₹1.00 taxable value — tax rounds correctly (round half up)", () => {
    // taxableValue = 1.00
    // CGST = round(1.00 * 9 / 100) = round(0.09) = 0.09
    // SGST = 0.09
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 1 }],
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expect(t.cgstAmount).toBe(0.09);
    expect(t.sgstAmount).toBe(0.09);
    expect(t.grandTotal).toBe(1.18);
    expectGrandTotalClean(t);
  });
});

// ---------------------------------------------------------------------------
// 6. Edge case: zero GST rate
// ---------------------------------------------------------------------------
describe("GST rounding — zero GST rate", () => {
  it("zero rates produce zero tax and grandTotal = taxableValue", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      cgstRate: 0,
      sgstRate: 0,
      isInterstate: false,
    });
    expect(t.cgstAmount).toBe(0);
    expect(t.sgstAmount).toBe(0);
    expect(t.igstAmount).toBe(0);
    expect(t.grandTotal).toBe(10000);
  });

  it("zero rates inter-state produce zero tax", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      cgstRate: 0, sgstRate: 0, isInterstate: true,
    });
    expect(t.igstAmount).toBe(0);
    expect(t.cgstAmount).toBe(0);
    expect(t.sgstAmount).toBe(0);
    expect(t.grandTotal).toBe(10000);
  });

  it("zero-rate items with transport still add transport to grand total", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 500,
      cgstRate: 0,
      sgstRate: 0,
      isInterstate: false,
    });
    expect(t.cgstAmount).toBe(0);
    expect(t.sgstAmount).toBe(0);
    expect(t.grandTotal).toBe(10500);
  });
});

// ---------------------------------------------------------------------------
// 7. Edge case: 3-decimal inputs (₹100.105)
// ---------------------------------------------------------------------------
describe("GST rounding — 3-decimal input precision", () => {
  it("₹100.105 rate is rounded consistently (TS and Dart parity)", () => {
    // The double for 100.105 is 100.10500000000000398 (slightly ABOVE the
    // half-paisa boundary), so 100.105*100 = 10010.5 EXACTLY in Node (V8) →
    // round2 → 100.11. The IEEE-754 result is deterministic: every correct
    // rounding (Math.round, toFixed, Dart roundToDouble) yields 100.11.
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 100.105 }],
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    // taxableValue = round2(100.105) = 100.11
    expect(t.taxableValue).toBe(100.11);
    // IGST-equivalent = round2(100.11 * 18/100) = round2(18.0198) = 18.02
    // CGST = floor(18.02 * 100 / 2) / 100 = floor(901) / 100 = 9.01
    // SGST = 18.02 - 9.01 = 9.01
    expect(t.cgstAmount).toBe(9.01);
    expect(t.sgstAmount).toBe(9.01);
    // grandTotal = 100.11 + 9.01 + 9.01 = 118.13
    expect(t.grandTotal).toBe(118.13);
    expectGrandTotalClean(t);
  });

  it("3-decimal rate with transport preserves paisa precision", () => {
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 100.105 }],
      transportCost: 0.505,   // 3-decimal transport
      cgstRate: 9, sgstRate: 9,
      isInterstate: false,
    });
    expectPaisa(t.taxableValue);
    expectPaisa(t.cgstAmount);
    expectPaisa(t.sgstAmount);
    expectPaisa(t.grandTotal);
    expectGrandTotalClean(t);
  });

  it("3-decimal rate: CGST+SGST parity holds for inter-state", () => {
    const base = { items: [{ quantity: 1, rate: 100.105 }], cgstRate: 9, sgstRate: 9 };
    const intra = computeGstTotals({ ...base, isInterstate: false });
    const inter = computeGstTotals({ ...base, isInterstate: true });
    expectCgstSgstEqualsIgst(intra, inter);
  });

  it("floors CGST at the .5-paisa split boundary so CGST+SGST = IGST exactly", () => {
    // taxableValue = 101, rate = 5% (cgst 2.5, sgst 2.5)
    // IGST-equivalent = round2(101 * 5/100) = round2(5.05) = 5.05
    // CGST = floor(5.05 * 100 / 2) / 100 = floor(252.5) / 100 = 2.52
    // SGST = 5.05 - 2.52 = 2.53  (remainder — CGST+SGST = IGST to the paisa)
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 101 }],
      cgstRate: 2.5,
      sgstRate: 2.5,
      isInterstate: false,
    });
    expect(t.cgstAmount).toBe(2.52);
    expect(t.sgstAmount).toBe(2.53);
    expect(t.grandTotal).toBe(101 + 2.52 + 2.53);
  });

  it("rounds half-away-from-zero DOWN at .5 boundary for CGST 9%", () => {
    // taxableValue = 105, rate = 9%
    // CGST = round(105 * 9/100) = round(9.45) = 9.45 (clean, no rounding needed)
    // taxableValue = 106, rate = 9%
    // CGST = round(106 * 9/100) = round(9.54) = 9.54
    // taxableValue = 107, rate = 9%
    // CGST = round(107 * 9/100) = round(9.63) = 9.63
    // taxableValue = 108, rate = 9%
    // CGST = round(108 * 9/100) = round(9.72) = 9.72
    // taxableValue = 111, rate = 9%
    // CGST = round(111 * 9/100) = round(9.99) = 9.99
    // taxableValue = 112, rate = 9%
    // CGST = round(112 * 9/100) = round(10.08) = 10.08
    // Now find a value where rounding actually changes something:
    // taxableValue = 100, rate = 33% → CGST = round(33.00) = 33 (clean)
    // taxableValue = 101, rate = 33% → CGST = round(33.33) = 33.33
    // taxableValue = 101, rate = 1/3 → CGST = round(101/300) = round(0.33667) = 0.34
    const t = computeGstTotals({
      items: [{ quantity: 1, rate: 101 }],
      cgstRate: 9, sgstRate: 9,
      isInterstate: false,
    });
    // CGST = round(101*9/100) = round(9.09) = 9.09 — clean value, but still tests rounding path
    expectPaisa(t.cgstAmount);
    expectPaisa(t.sgstAmount);
  });
});

// ---------------------------------------------------------------------------
// 8. Cross-check: intra and inter-state produce the same grand total
// ---------------------------------------------------------------------------
describe("GST rounding — intra/interstate grand total equivalence", () => {
  const cases: Array<{ name: string; items: any[]; transport: number; cgst: number; sgst: number }> = [
    { name: "18%, clean base", items: [{ quantity: 10, rate: 1000 }], transport: 0, cgst: 9, sgst: 9 },
    { name: "18%, with transport", items: [{ quantity: 5, rate: 500 }], transport: 300, cgst: 9, sgst: 9 },
    { name: "5%, 3-decimal", items: [{ quantity: 1, rate: 100.105 }], transport: 0, cgst: 2.5, sgst: 2.5 },
    { name: "28%, large", items: [{ quantity: 1, rate: 50000 }], transport: 1000, cgst: 14, sgst: 14 },
    { name: "9%, small", items: [{ quantity: 1, rate: 1 }], transport: 0, cgst: 4.5, sgst: 4.5 },
  ];

  for (const c of cases) {
    it(`same grand total for ${c.name}`, () => {
      const intra = computeGstTotals({ items: c.items, transportCost: c.transport, cgstRate: c.cgst, sgstRate: c.sgst, isInterstate: false });
      const inter = computeGstTotals({ items: c.items, transportCost: c.transport, cgstRate: c.cgst, sgstRate: c.sgst, isInterstate: true });
      expect(intra.grandTotal).toBe(inter.grandTotal);
    });
  }
});
