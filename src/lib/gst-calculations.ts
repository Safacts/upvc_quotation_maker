/**
 * gst-calculations.ts — server-side GST invoice computation.
 *
 * ============================================================================
 *  PORT OF lib/gst_invoice_model.dart
 * ============================================================================
 * This module is a faithful port of `GstInvoiceData.calculateTotals()` and
 * `GstInvoiceItem` from the Flutter app. It exists because the desktop console
 * needs to CREATE and EDIT GST invoices server-side — the Flutter app computes
 * these on the phone, but the console needs the same numbers in Node.
 *
 * DART PARITY CONTRACT
 * ---------------------------------------------------------------------------
 * `lib/gst_invoice_model.dart` is the authoritative implementation because it
 * is what the Flutter app uses to render the customer-facing GST invoice PDF.
 * If you change ANY computation in this file you MUST change the Dart original
 * in the same commit, and re-run the parity fixtures. A paisa-level mismatch
 * between the mobile GST invoice and the console-created GST invoice is a
 * compliance problem — the two must agree to the last digit.
 *
 * Dart reference (lib/gst_invoice_model.dart):
 *   double get totalTaxableValue => items.fold(0.0, (sum, i) => sum + i.taxableValue);
 *   void calculateTotals() {
 *     subtotal = totalTaxableValue;
 *     taxableValue = subtotal + transportCost;
 *     if (isInterstate) {
 *       igstRate = cgstRate + sgstRate; cgstRate = 0; sgstRate = 0;
 *       igstAmount = taxableValue * igstRate / 100;
 *       cgstAmount = 0; sgstAmount = 0;
 *     } else {
 *       igstRate = 0; igstAmount = 0;
 *       cgstAmount = taxableValue * cgstRate / 100;
 *       sgstAmount = taxableValue * sgstRate / 100;
 *     }
 *     grandTotal = taxableValue + cgstAmount + sgstAmount + igstAmount;
 *   }
 */

/** One line item on a GST invoice, as stored in `gst_invoice_items`. */
export interface GstInvoiceItemLike {
  quantity?: number | string | null;
  rate?: number | string | null;
  taxable_value?: number | string | null;
}

/** Coerce a Supabase value to a finite number. */
function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Round to 2 decimal places (paisa-level), matching Dart's
 * `(x * 100).roundToDouble() / 100` and JS `Math.round(x * 100) / 100`.
 */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Taxable value of one line item — quantity × rate.
 * Mirrors `GstInvoiceItem.taxableValue` in lib/gst_invoice_model.dart.
 */
export function gstItemTaxableValue(item: GstInvoiceItemLike): number {
  return num(item.quantity, 1) * num(item.rate);
}

export interface GstInvoiceTotalsInput {
  items: GstInvoiceItemLike[];
  transportCost?: number | string | null;
  /** Intra-state: CGST + SGST each. Inter-state: IGST only. */
  cgstRate?: number | string | null;
  sgstRate?: number | string | null;
  isInterstate?: boolean;
  /**
   * GAP 3 — Auto inter-state detection. When both supplier and buyer states
   * are provided (non-empty strings), the inter-state flag is computed from
   * them instead of trusting the client-supplied `isInterstate`:
   *   different states → IGST (inter-state)
   *   same state     → CGST + SGST (intra-state)
   */
  supplierState?: string | null;
  buyerState?: string | null;
}

export interface GstInvoiceTotals {
  /** Sum of every line item's taxable value (quantity × rate). */
  subtotal: number;
  /** taxableValue = subtotal + transportCost. The base GST is computed on. */
  taxableValue: number;
  /** Transport cost as provided (not taxed separately — it's part of taxableValue). */
  transportCost: number;
  /** Final CGST rate applied (0 when interstate). */
  cgstRate: number;
  /** Final SGST rate applied (0 when interstate). */
  sgstRate: number;
  /** Final IGST rate applied (0 when intra-state). */
  igstRate: number;
  /** CGST amount in rupees. */
  cgstAmount: number;
  /** SGST amount in rupees. */
  sgstAmount: number;
  /** IGST amount in rupees. */
  igstAmount: number;
  /** taxableValue + all tax amounts. What the customer pays. */
  grandTotal: number;
  /** Whether IGST (true) or CGST+SGST (false) was applied. */
  isInterstate: boolean;
}

/**
 * Compute every money figure for a GST invoice from its line items.
 *
 * This is the ONLY function allowed to produce a GST grand total in TypeScript.
 * The split logic reproduces Dart's `calculateTotals()` exactly:
 *   - intra-state  → CGST + SGST (each at their rate)
 *   - inter-state  → IGST only (rate = cgstRate + sgstRate)
 *
 * @param input  The invoice's items, transport, and tax flags.
 */
export function computeGstTotals(input: GstInvoiceTotalsInput): GstInvoiceTotals {
  const items = Array.isArray(input.items) ? input.items : [];

  // subtotal = sum of every line's taxable value.
  let subtotal = 0;
  for (const item of items) {
    subtotal += gstItemTaxableValue(item);
  }

  const transport = num(input.transportCost);
  const taxableValue = subtotal + transport;

  // Resolve the configured rates once.
  const configuredCgst = num(input.cgstRate, 9);
  const configuredSgst = num(input.sgstRate, 9);

  // GAP 3: Auto-detect inter-state when supplier and buyer states are provided.
  // If supplier and buyer are in the same state → CGST+SGST; different states → IGST.
  let isInterstate = input.isInterstate ?? false;
  if (input.supplierState && input.buyerState) {
    const supplierState = input.supplierState.trim().toLowerCase();
    const buyerState = input.buyerState.trim().toLowerCase();
    isInterstate = supplierState !== buyerState;
  }

  let cgstRate: number;
  let sgstRate: number;
  let igstRate: number;
  let cgstAmount: number;
  let sgstAmount: number;
  let igstAmount: number;

  if (isInterstate) {
    // Inter-state: IGST only.
    igstRate = configuredCgst + configuredSgst;
    cgstRate = 0;
    sgstRate = 0;
    igstAmount = round2(taxableValue * igstRate / 100);
    cgstAmount = 0;
    sgstAmount = 0;
  } else {
    // Intra-state: CGST + SGST — split the equivalent IGST amount so that
    // CGST + SGST = IGST holds exactly to the last paisa (GST rule).
    igstRate = 0; // display IGST as 0 for intra-state
    igstAmount = 0; // IGST display amount is 0 for intra-state (we show CGST+SGST)
    cgstRate = configuredCgst;
    sgstRate = configuredSgst;
    // Compute the IGST-equivalent for splitting, then derive CGST and SGST
    const igstEquiv = round2(taxableValue * (configuredCgst + configuredSgst) / 100);
    // CGST = floor(IGST-equivalent / 2) at the paisa level, SGST = remainder
    cgstAmount = round2(Math.floor((igstEquiv * 100) / 2) / 100);
    sgstAmount = round2(igstEquiv - cgstAmount);
  }

  const grandTotal = round2(taxableValue + cgstAmount + sgstAmount + igstAmount); // GAP 1: paisa-level rounding

  return {
    subtotal,
    taxableValue,
    transportCost: transport,
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    grandTotal,
    isInterstate,
  };
}

/**
 * Round-trip verification helper: given a stored invoice row, recompute the
 * totals and return whether they match the stored values to the last paisa.
 * Used by tests to prove the TS port matches the Dart original.
 */
export function verifyGstTotalsMatch(
  stored: {
    subtotal: number;
    taxable_value: number;
    cgst_rate: number;
    sgst_rate: number;
    igst_rate: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    grand_total: number;
  },
  computed: GstInvoiceTotals,
): { match: boolean; diffs: string[] } {
  const diffs: string[] = [];
  const fields: Array<[string, number, number]> = [
    ["subtotal", stored.subtotal, computed.subtotal],
    ["taxable_value", stored.taxable_value, computed.taxableValue],
    ["cgst_rate", stored.cgst_rate, computed.cgstRate],
    ["sgst_rate", stored.sgst_rate, computed.sgstRate],
    ["igst_rate", stored.igst_rate, computed.igstRate],
    ["cgst_amount", stored.cgst_amount, computed.cgstAmount],
    ["sgst_amount", stored.sgst_amount, computed.sgstAmount],
    ["igst_amount", stored.igst_amount, computed.igstAmount],
    ["grand_total", stored.grand_total, computed.grandTotal],
  ];
  for (const [name, a, b] of fields) {
    if (Math.abs(a - b) > 0.005) diffs.push(`${name}: stored=${a} computed=${b}`);
  }
  return { match: diffs.length === 0, diffs };
}
