/**
 * TEST — GST CALCULATIONS (src/lib/gst-calculations.ts)
 *
 * Verifies the TypeScript port of `GstInvoiceData.calculateTotals()` from
 * lib/gst_invoice_model.dart produces identical results to the Dart original.
 * A mismatch here is a compliance problem — the mobile GST invoice and the
 * console-created GST invoice must agree to the last paisa.
 */
import { describe, it, expect } from "vitest";
import { computeGstTotals, gstItemTaxableValue } from "@/lib/gst-calculations";

describe("gstItemTaxableValue()", () => {
  it("is quantity × rate", () => {
    expect(gstItemTaxableValue({ quantity: 10, rate: 500 })).toBe(5000);
  });

  it("defaults missing quantity to 1", () => {
    expect(gstItemTaxableValue({ rate: 500 })).toBe(500);
  });

  it("coerces PostgREST numeric strings", () => {
    expect(gstItemTaxableValue({ quantity: "10", rate: "500.5" })).toBe(5005);
  });
});

describe("computeGstTotals() — intra-state (CGST + SGST)", () => {
  it("splits 18% into 9% CGST + 9% SGST with no transport", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expect(t.subtotal).toBe(10000);
    expect(t.taxableValue).toBe(10000);
    expect(t.cgstRate).toBe(9);
    expect(t.sgstRate).toBe(9);
    expect(t.igstRate).toBe(0);
    expect(t.cgstAmount).toBe(900); // 10000 * 9/100
    expect(t.sgstAmount).toBe(900);
    expect(t.igstAmount).toBe(0);
    expect(t.grandTotal).toBe(11800); // 10000 + 900 + 900
  });

  it("taxes transport as part of the base, matching Dart", () => {
    // Dart: taxableValue = subtotal + transportCost; cgst = taxableValue * rate/100
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 500,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expect(t.subtotal).toBe(10000);
    expect(t.taxableValue).toBe(10500);
    expect(t.cgstAmount).toBeCloseTo(945, 9); // 10500 * 9/100
    expect(t.sgstAmount).toBeCloseTo(945, 9);
    expect(t.grandTotal).toBeCloseTo(12390, 9); // 10500 + 945 + 945
  });

  it("handles multiple line items", () => {
    const t = computeGstTotals({
      items: [
        { quantity: 10, rate: 1000 },
        { quantity: 5, rate: 2000 },
        { quantity: 2, rate: 500 },
      ],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    // subtotal = 10000 + 10000 + 1000 = 21000
    expect(t.subtotal).toBe(21000);
    expect(t.cgstAmount).toBe(1890); // 21000 * 9/100
    expect(t.sgstAmount).toBe(1890);
    expect(t.grandTotal).toBe(24780); // 21000 + 1890 + 1890
  });
});

describe("computeGstTotals() — inter-state (IGST only)", () => {
  it("collapses CGST+SGST into IGST at the combined rate", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: true,
    });
    expect(t.subtotal).toBe(10000);
    expect(t.cgstRate).toBe(0);
    expect(t.sgstRate).toBe(0);
    expect(t.igstRate).toBe(18); // 9 + 9
    expect(t.cgstAmount).toBe(0);
    expect(t.sgstAmount).toBe(0);
    expect(t.igstAmount).toBe(1800); // 10000 * 18/100
    expect(t.grandTotal).toBe(11800);
  });

  it("taxes transport under IGST too", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 1000,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: true,
    });
    expect(t.taxableValue).toBe(11000);
    expect(t.igstAmount).toBeCloseTo(1980, 9); // 11000 * 18/100
    expect(t.grandTotal).toBeCloseTo(12980, 9);
  });
});

describe("computeGstTotals() — edge cases", () => {
  it("handles empty items", () => {
    const t = computeGstTotals({
      items: [],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expect(t.subtotal).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it("handles zero rates (NIL GST)", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 0,
      cgstRate: 0,
      sgstRate: 0,
      isInterstate: false,
    });
    expect(t.cgstAmount).toBe(0);
    expect(t.sgstAmount).toBe(0);
    expect(t.grandTotal).toBe(10000);
  });

  it("defaults rates to 9/9 when omitted", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
    });
    expect(t.cgstRate).toBe(9);
    expect(t.sgstRate).toBe(9);
    expect(t.cgstAmount).toBe(900);
  });
});

describe("computeGstTotals() — paisa-level rounding (GAP 1)", () => {
  it("rounds fractional tax amounts to the nearest paisa", () => {
    // taxableValue = 111.11, cgst 9% = 9.9999 → rounds to 10.00
    // taxableValue = 111.11, sgst 9% = 9.9999 → rounds to 10.00
    // grandTotal = 111.11 + 10.00 + 10.00 = 131.11
    const t = computeGstTotals({
      items: [{ quantity: 111.11, rate: 1 }],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expect(t.cgstAmount).toBe(10); // 111.11 * 9/100 = 9.9999 → 10.00
    expect(t.sgstAmount).toBe(10);
    expect(t.grandTotal).toBe(131.11);
  });

  it("rounds IGST amounts to the nearest paisa", () => {
    // taxableValue = 111.11, igst 18% = 19.9998 → rounds to 20.00
    // grandTotal = 111.11 + 20.00 = 131.11
    const t = computeGstTotals({
      items: [{ quantity: 111.11, rate: 1 }],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: true,
    });
    expect(t.igstAmount).toBe(20); // 111.11 * 18/100 = 19.9998 → 20.00
    expect(t.grandTotal).toBe(131.11);
  });

  it("produces exact paisa-aligned totals (no float drift)", () => {
    // taxableValue = 100.05
    // IGST-equivalent = round2(100.05 * 18/100) = round2(18.009) = 18.01
    // CGST = floor(18.01 * 100 / 2) / 100 = floor(900.5) / 100 = 9.00
    // SGST = 18.01 - 9.00 = 9.01  (remainder — CGST+SGST = IGST exactly)
    // grandTotal = 100.05 + 9.00 + 9.01 = 118.06
    const t = computeGstTotals({
      items: [{ quantity: 100.05, rate: 1 }],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: false,
    });
    expect(t.cgstAmount).toBe(9.0);
    expect(t.sgstAmount).toBe(9.01);
    expect(t.grandTotal).toBe(118.06);
  });
});

describe("computeGstTotals() — auto inter-state detection (GAP 3)", () => {
  it("detects IGST when supplier and buyer are in different states", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      supplierState: "Telangana",
      buyerState: "Maharashtra",
    });
    expect(t.isInterstate).toBe(true);
    expect(t.igstRate).toBe(18);
    expect(t.cgstRate).toBe(0);
    expect(t.sgstRate).toBe(0);
    expect(t.cgstAmount).toBe(0);
    expect(t.sgstAmount).toBe(0);
    expect(t.igstAmount).toBe(1800);
    expect(t.grandTotal).toBe(11800);
  });

  it("detects CGST+SGST when supplier and buyer are in the same state", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      supplierState: "Telangana",
      buyerState: "Telangana",
    });
    expect(t.isInterstate).toBe(false);
    expect(t.cgstRate).toBe(9);
    expect(t.sgstRate).toBe(9);
    expect(t.igstRate).toBe(0);
    expect(t.cgstAmount).toBe(900);
    expect(t.sgstAmount).toBe(900);
    expect(t.igstAmount).toBe(0);
    expect(t.grandTotal).toBe(11800);
  });

  it("case-insensitive state comparison", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      supplierState: "telangana",
      buyerState: "TELANGANA",
    });
    expect(t.isInterstate).toBe(false);
    expect(t.cgstAmount).toBe(900);
  });

  it("falls back to client-supplied isInterstate when states are not provided", () => {
    const t = computeGstTotals({
      items: [{ quantity: 10, rate: 1000 }],
      transportCost: 0,
      cgstRate: 9,
      sgstRate: 9,
      isInterstate: true,
    });
    expect(t.isInterstate).toBe(true);
    expect(t.igstAmount).toBe(1800);
  });
});
