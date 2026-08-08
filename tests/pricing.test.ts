/**
 * TEST 1 — PRICING FORMULA (src/lib/pricing.ts)
 *
 * This is the highest-value test in the repo. Every rupee the customer sees on
 * a PDF, a dashboard, or an invoice flows through `quotationTotals`. A silent
 * drift here is not a cosmetic bug — it is an invoice that does not match the
 * quotation, which is the kind of thing that loses a client.
 *
 * Expected values in this file are HAND-COMPUTED, not produced by importing the
 * module. A test that asks the implementation what the answer should be proves
 * nothing. Where a value depends on IEEE-754 ordering, the test asserts the
 * exact float the Dart reference produces, using the same operation order.
 *
 * DART PARITY: `lib/models.dart` is authoritative because it renders the PDF.
 *   double get sft        => (width / 304.8) * (height / 304.8);
 *   double get totalSft   => sft * units;
 *   double get total      => totalSft * rate;
 *   double get igst       => includeGst ? (actualAmount + transport) * (gstPercentage / 100.0) : 0.0;
 *   double get grandTotal => actualAmount + transport + igst;
 * Dart `double` and JS `number` are both IEEE-754 binary64, so identical
 * operations in identical order MUST yield bit-identical results.
 */
import { describe, it, expect } from "vitest";
import {
  MM_PER_FOOT,
  sqft,
  measuredLineSqft,
  measuredLineTotal,
  unmeasuredLineTotal,
  quotationTotals,
  PRICING_PARITY_FIXTURES,
} from "@/lib/pricing";

describe("MM_PER_FOOT", () => {
  it("is exactly 304.8 (12 inches, by definition)", () => {
    // If someone "simplifies" this to 305 or 304, every quote in the system
    // shifts by ~0.26%. On a ₹5,00,000 quote that is ₹1,300 of silent error.
    expect(MM_PER_FOOT).toBe(304.8);
  });
});

describe("sqft() — mm to square feet", () => {
  it("converts a 1 ft x 1 ft opening to exactly 1 sqft", () => {
    expect(sqft(304.8, 304.8)).toBe(1);
  });

  it("preserves Dart's operation order: (w/304.8) * (h/304.8)", () => {
    // The algebraically-identical `(w * h) / 92903.04` differs in the last bit
    // for some inputs. This assertion locks in the Dart-matching order.
    const w = 1234.5;
    const h = 987.25;
    expect(sqft(w, h)).toBe((w / MM_PER_FOOT) * (h / MM_PER_FOOT));
  });

  it("returns 0 for a zero dimension instead of NaN", () => {
    expect(sqft(0, 1500)).toBe(0);
    expect(sqft(1200, 0)).toBe(0);
  });

  it("coerces PostgREST numeric-as-string values", () => {
    // PostgREST serialises `numeric` columns as JSON strings. If this coercion
    // breaks, string concatenation ("1200" * ...) or NaN leaks into totals.
    expect(sqft("304.8", "304.8")).toBe(1);
  });

  it("treats null / undefined / empty string as 0, never NaN", () => {
    expect(sqft(null, 1500)).toBe(0);
    expect(sqft(undefined, 1500)).toBe(0);
    expect(sqft("", 1500)).toBe(0);
  });

  it("clamps a corrupt non-numeric dimension to 0 rather than poisoning the total", () => {
    // One bad row must not render an entire dashboard as "₹NaN".
    expect(sqft("not-a-number", 1500)).toBe(0);
    expect(Number.isNaN(sqft("abc", "def"))).toBe(false);
  });

  it("handles Infinity as a corrupt value, not as a real number", () => {
    expect(sqft(Infinity, 1500)).toBe(0);
  });
});

describe("measuredLineSqft() / measuredLineTotal()", () => {
  it("multiplies area by units", () => {
    // 1ft x 1ft x 5 units = 5 sqft
    expect(measuredLineSqft({ width: 304.8, height: 304.8, units: 5 })).toBe(5);
  });

  it("defaults a missing units field to 1, NOT to 0", () => {
    // A `units: 0` default would zero out real money. A missing unit count on a
    // real line item means "one of them".
    expect(measuredLineSqft({ width: 304.8, height: 304.8 })).toBe(1);
    expect(measuredLineTotal({ width: 304.8, height: 304.8, rate: 450 })).toBe(450);
  });

  it("treats an explicit units: 0 as zero (deleted/void line)", () => {
    expect(measuredLineTotal({ width: 304.8, height: 304.8, units: 0, rate: 450 })).toBe(0);
  });

  it("computes a real 1200mm x 1500mm @ ₹450/sqft window correctly", () => {
    // (1200/304.8) * (1500/304.8) = 3.937007874... * 4.921259842... = 19.3750387500775 sqft
    // NOTE: this is 19.3750387..., NOT a clean 19.375. Anyone "tidying up" the
    // expectation to 19.375 is asserting a number the formula never produces.
    // 19.3750387500775 sqft * ₹450 = ₹8718.767437534876
    const total = measuredLineTotal({ width: 1200, height: 1500, units: 1, rate: 450 });
    expect(total).toBeCloseTo(8718.767437534876, 9);
  });

  it("preserves Dart's multiplication order sqft * units * rate", () => {
    // NOT `sqft * rate * units`. Float multiplication is not associative;
    // reordering can shift the result by a paisa, and a paisa mismatch between
    // the mobile PDF and the web dashboard destroys trust.
    const item = { width: 1234.5, height: 987.25, units: 3, rate: 512.33 };
    const dartOrder = ((1234.5 / MM_PER_FOOT) * (987.25 / MM_PER_FOOT)) * 3 * 512.33;
    expect(measuredLineTotal(item)).toBe(dartOrder);
  });

  it("handles a corrupt rate without producing NaN", () => {
    expect(measuredLineTotal({ width: 1200, height: 1500, units: 2, rate: "junk" })).toBe(0);
  });
});

describe("unmeasuredLineTotal()", () => {
  it("is units * rate", () => {
    expect(unmeasuredLineTotal({ units: 3, rate: 1250.75 })).toBe(3752.25);
  });

  it("defaults missing units to 1", () => {
    expect(unmeasuredLineTotal({ rate: 500 })).toBe(500);
  });

  it("returns 0 for an all-null line", () => {
    expect(unmeasuredLineTotal({ units: null, rate: null })).toBe(0);
  });
});

describe("quotationTotals() — the only sanctioned grand total", () => {
  it("returns all-zero for an empty quotation without throwing", () => {
    const t = quotationTotals({ transport_cost: 0, include_gst: false, gst_percentage: 0 }, [], []);
    expect(t.subtotal).toBe(0);
    expect(t.grandTotal).toBe(0);
    expect(t.gstAmount).toBe(0);
    expect(t.totalSqft).toBe(0);
  });

  it("survives null/undefined quotation and item arrays", () => {
    // Defensive: a route that fetches a deleted quote gets null back. It must
    // render ₹0, not crash the whole dashboard.
    const t = quotationTotals(null, null, null);
    expect(t.grandTotal).toBe(0);
    expect(t.subtotal).toBe(0);
  });

  it("applies NO gst when include_gst is false, even if gst_percentage is set", () => {
    // Regression guard: a stale gst_percentage left on the row must not silently
    // add 18% to a quote the user explicitly marked as non-GST.
    const t = quotationTotals(
      { transport_cost: 0, include_gst: false, gst_percentage: 18 },
      [{ width: 1200, height: 1500, units: 1, rate: 450 }],
      [],
    );
    expect(t.gstPercentage).toBe(0);
    expect(t.gstAmount).toBe(0);
    expect(t.grandTotal).toBeCloseTo(8718.767437534876, 9);
  });

  it("taxes transport as part of the base, matching Dart's igst formula", () => {
    // Dart: igst = (actualAmount + transport) * (gst/100).
    // A common wrong implementation taxes only the goods and leaves transport
    // untaxed — that under-collects GST and is a compliance problem.
    const t = quotationTotals(
      { transport_cost: 2500, include_gst: true, gst_percentage: 18 },
      [{ width: 1200, height: 1500, units: 2, rate: 450 }],
      [],
    );
    // 19.3750387500775 sqft * 2 units * 450 = 17437.534875069752
    // + 2500 transport = 19937.534875069752 taxable base
    expect(t.subtotal).toBeCloseTo(17437.534875069752, 9);
    expect(t.transport).toBe(2500);
    expect(t.netTotal).toBeCloseTo(19937.534875069752, 9);
    expect(t.gstAmount).toBeCloseTo(3588.7562775125552, 9); // base * 18/100
    expect(t.grandTotal).toBeCloseTo(23526.291152582307, 9);

    // The compliance point: GST is charged on goods + transport, not goods
    // alone. Assert the wrong-but-plausible alternative is NOT what we produce.
    const gstOnGoodsOnly = t.subtotal * 0.18;
    expect(t.gstAmount).not.toBeCloseTo(gstOnGoodsOnly, 2);
  });

  it("produces identical results whether values arrive as numbers or PostgREST strings", () => {
    // Same quote, two serialisations. If these diverge, the dashboard and the
    // API disagree depending on which driver fetched the row.
    const asNumbers = quotationTotals(
      { transport_cost: 2500, include_gst: true, gst_percentage: 18 },
      [{ width: 1200, height: 1500, units: 2, rate: 450 }],
      [{ units: 3, rate: 1250.75 }],
    );
    const asStrings = quotationTotals(
      { transport_cost: "2500", include_gst: true, gst_percentage: "18" },
      [{ width: "1200", height: "1500", units: "2", rate: "450" }],
      [{ units: "3", rate: "1250.75" }],
    );
    expect(asStrings).toEqual(asNumbers);
  });

  it("sums a multi-line quotation across measured and unmeasured items", () => {
    const t = quotationTotals(
      { transport_cost: 12500, include_gst: true, gst_percentage: 18 },
      [
        { width: 1200, height: 1500, units: 4, rate: 450 },
        { width: 600, height: 600, units: 12, rate: 380 },
      ],
      [
        { units: 4, rate: 1250 },
        { units: 10, rate: 85.5 },
      ],
    );
    // line 1: 19.3750387500775 sqft * 4 * 450 = 34875.069750139504
    // line 2: (600/304.8)^2 = 3.8750077500155 sqft ; * 12 * 380 = 17670.03534007068
    // totalMeasured = 52545.105090210185
    expect(t.totalMeasured).toBeCloseTo(52545.105090210185, 9);
    expect(t.totalUnmeasured).toBe(4 * 1250 + 10 * 85.5); // 5855
    expect(t.subtotal).toBeCloseTo(58400.105090210185, 9);
    expect(t.grandTotal).toBeCloseTo(83662.12400644802, 9);
  });

  it("never returns NaN for any field, even with fully corrupt input", () => {
    // The single most damaging failure mode: one bad row turning every KPI on
    // the dashboard into "₹NaN".
    const t = quotationTotals(
      { transport_cost: "abc", include_gst: true, gst_percentage: "xyz" },
      [{ width: "1200", height: "1500", units: "2", rate: "not-a-number" }],
      [],
    );
    for (const [key, value] of Object.entries(t)) {
      expect(Number.isFinite(value), `${key} must be finite, got ${value}`).toBe(true);
    }
    expect(t.grandTotal).toBe(0);
  });

  it("honours forceGstPercentage for legacy surfaces only", () => {
    // The escape hatch exists for screens that predate per-quote GST flags.
    // It must override the row, and it must be explicit — never a default.
    const t = quotationTotals(
      { transport_cost: 0, include_gst: false, gst_percentage: 0 },
      [{ width: 304.8, height: 304.8, units: 1, rate: 1000 }],
      [],
      { forceGstPercentage: 18 },
    );
    expect(t.gstPercentage).toBe(18);
    expect(t.gstAmount).toBeCloseTo(180, 9);
    expect(t.grandTotal).toBeCloseTo(1180, 9);
  });

  it("does NOT hard-code 18% — the old DashboardPage.tsx bug", () => {
    // DashboardPage.tsx:51 used `const igst = (subtotal + transport) * 0.18;`
    // unconditionally. That charged phantom GST on every non-GST quote.
    const t = quotationTotals(
      { transport_cost: 1000, include_gst: false },
      [{ width: 304.8, height: 304.8, units: 1, rate: 1000 }],
      [],
    );
    expect(t.grandTotal).toBe(2000); // 1000 goods + 1000 transport, NO gst
    expect(t.grandTotal).not.toBeCloseTo(2360, 2); // what the buggy 18% gave
  });

  it("supports a non-18% gst rate (some fittings are 12%)", () => {
    const t = quotationTotals(
      { transport_cost: 0, include_gst: true, gst_percentage: 12 },
      [{ width: 304.8, height: 304.8, units: 1, rate: 1000 }],
      [],
    );
    expect(t.gstAmount).toBeCloseTo(120, 9);
  });
});

describe("PRICING_PARITY_FIXTURES — Dart <-> TypeScript contract", () => {
  it("exposes fixtures for the Dart-side parity test to consume", () => {
    // These same inputs must be run through `QuotationData` in a Dart test.
    // If the fixture list shrinks, the Dart test silently covers less.
    expect(PRICING_PARITY_FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(PRICING_PARITY_FIXTURES.map((f) => [f.name, f] as const))(
    "fixture %s computes finite, non-negative-where-expected totals",
    (_name, fixture) => {
      const t = quotationTotals(fixture.quotation, fixture.measured, fixture.unmeasured);
      for (const [key, value] of Object.entries(t)) {
        expect(Number.isFinite(value), `${key} must be finite`).toBe(true);
      }
      // grandTotal must never be less than netTotal when gst >= 0
      expect(t.grandTotal).toBeGreaterThanOrEqual(t.netTotal - 1e-9);
    },
  );

  it("is deterministic — same fixture, same result, every run", () => {
    // Guards against anyone introducing Date.now(), Math.random() or a locale
    // dependency into the money path.
    for (const f of PRICING_PARITY_FIXTURES) {
      const a = quotationTotals(f.quotation, f.measured, f.unmeasured);
      const b = quotationTotals(f.quotation, f.measured, f.unmeasured);
      expect(a).toEqual(b);
    }
  });
});
