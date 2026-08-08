/**
 * pricing.ts — THE SINGLE SOURCE OF TRUTH FOR uPVC QUOTATION MATH.
 *
 * ============================================================================
 *  READ THIS BEFORE YOU TOUCH ANY MONEY CALCULATION ANYWHERE IN THIS REPO.
 * ============================================================================
 *
 * Before 08-08-2026 the core formula `(w / 304.8) * (h / 304.8)` was copy-pasted
 * into FOUR places:
 *   1. app/api/portal_stats/route.ts:92
 *   2. app/dashboard/DashboardPage.tsx:38   (stats/table)
 *   3. app/dashboard/DashboardPage.tsx:483  (item detail modal)
 *   4. lib/models.dart:150                  (Flutter app — authoritative for the PDF)
 *
 * Those copies had ALREADY DRIFTED:
 *   - models.dart applies GST only when `include_gst` is true, at `gst_percentage`.
 *   - DashboardPage.tsx hard-coded a flat 18% IGST on EVERY quote unconditionally.
 *   - portal_stats/route.ts applied NO GST at all.
 * Three surfaces, three different grand totals for the same quotation.
 *
 * Every TypeScript money calculation MUST now come from this file. If you need a
 * new total, add a function HERE and import it — do not inline arithmetic.
 *
 * ---------------------------------------------------------------------------
 * DART PARITY CONTRACT
 * ---------------------------------------------------------------------------
 * `lib/models.dart` is the authoritative implementation because it renders the
 * customer-facing PDF. This file is a deliberate mirror of it. The multiplication
 * ORDER is reproduced exactly — `sqft * units * rate`, NOT `sqft * rate * units` —
 * because IEEE-754 float multiplication is not associative and a different order
 * can shift the result by a paisa. A one-paisa mismatch between the mobile PDF and
 * the web dashboard is a trust-killer.
 *
 * Dart reference (lib/models.dart):
 *   double get sft      => (width / 304.8) * (height / 304.8);
 *   double get totalSft => sft * units;
 *   double get total    => totalSft * rate;
 *   double get igst     => includeGst ? (actualAmount + transport) * (gstPercentage / 100.0) : 0.0;
 *   double get grandTotal => actualAmount + transport + igst;
 *
 * If you change ANY function in this file you MUST change lib/models.dart in the
 * same commit, and re-run the parity fixtures at the bottom of this file.
 */

/**
 * Millimetres per linear foot. uPVC fabricators enter dimensions in mm; rates are
 * quoted per square foot. 304.8 mm = 12 inches = 1 foot (exact, by definition).
 */
export const MM_PER_FOOT = 304.8;

/** Shape of a measured (area-priced) line item, as stored in `measured_items`. */
export interface MeasuredItemLike {
  width?: number | string | null;
  height?: number | string | null;
  units?: number | string | null;
  rate?: number | string | null;
}

/** Shape of an unmeasured (per-unit-priced) line item, as stored in `unmeasured_items`. */
export interface UnmeasuredItemLike {
  units?: number | string | null;
  rate?: number | string | null;
}

/** Shape of the `quotations` row fields that participate in the money math. */
export interface QuotationLike {
  transport_cost?: number | string | null;
  include_gst?: boolean | null;
  gst_percentage?: number | string | null;
}

export interface QuotationTotals {
  /** Sum of every measured line total. */
  totalMeasured: number;
  /** Sum of every unmeasured line total. */
  totalUnmeasured: number;
  /** totalMeasured + totalUnmeasured. Dart calls this `actualAmount`. */
  subtotal: number;
  /** Transport / freight charge from the quotation row. */
  transport: number;
  /** subtotal + transport. The taxable base, and the pre-GST money figure. */
  netTotal: number;
  /** The GST rate actually applied, as a percentage (0 when include_gst is false). */
  gstPercentage: number;
  /** The rupee value of GST. Dart calls this `igst`. */
  gstAmount: number;
  /** netTotal + gstAmount. Dart calls this `grandTotal`. */
  grandTotal: number;
  /** Total square footage across all measured items (for reporting, not billing). */
  totalSqft: number;
}

/**
 * Coerce a Supabase value to a finite number.
 *
 * PostgREST returns `numeric` columns as JSON strings, so `width` can arrive as
 * `1200`, `"1200"`, `"1200.50"`, `null` or `undefined` depending on the column
 * type and the driver. `Number(null)` is 0 and `Number("")` is 0, but
 * `Number("abc")` is NaN and NaN silently poisons every downstream total — a
 * single bad row would render the whole dashboard as "₹NaN". We clamp to a
 * fallback instead so one corrupt row cannot take down a report.
 */
function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Area of one unit in square feet, from millimetre dimensions.
 *
 * Mirrors `MeasuredItem.sft` in lib/models.dart. Keep the two divisions separate
 * (`(w / 304.8) * (h / 304.8)`) rather than the algebraically-equal
 * `(w * h) / 92903.04` — the two differ in the last float bit and Dart uses the
 * former.
 */
export function sqft(widthMm: unknown, heightMm: unknown): number {
  return (num(widthMm) / MM_PER_FOOT) * (num(heightMm) / MM_PER_FOOT);
}

/**
 * Total square footage for a measured line (area x units).
 * Mirrors `MeasuredItem.totalSft`.
 */
export function measuredLineSqft(item: MeasuredItemLike): number {
  return sqft(item?.width, item?.height) * num(item?.units, 1);
}

/**
 * Rupee value of one measured line item.
 * Mirrors `MeasuredItem.total` — order is `sqft * units * rate`.
 */
export function measuredLineTotal(item: MeasuredItemLike): number {
  return measuredLineSqft(item) * num(item?.rate);
}

/**
 * Rupee value of one unmeasured line item.
 * Mirrors `UnmeasuredItem.total` — order is `units * rate`.
 */
export function unmeasuredLineTotal(item: UnmeasuredItemLike): number {
  return num(item?.units, 1) * num(item?.rate);
}

export interface QuotationTotalsOptions {
  /**
   * Force a GST rate regardless of the row's `include_gst` / `gst_percentage`.
   *
   * ONLY for legacy surfaces that predate per-quote GST flags. Leave undefined to
   * get the authoritative, Dart-matching, PDF-matching behaviour. Passing a value
   * here means your screen can disagree with the customer's PDF — you had better
   * have a reason, and it had better be written down.
   */
  forceGstPercentage?: number;
}

/**
 * Compute every money figure for a quotation from its raw rows.
 *
 * This is the ONLY function allowed to produce a grand total in TypeScript.
 *
 * @param quotation      The `quotations` row (transport_cost / include_gst / gst_percentage).
 * @param measuredItems  Rows from `measured_items` belonging to this quotation.
 * @param unmeasuredItems Rows from `unmeasured_items` belonging to this quotation.
 */
export function quotationTotals(
  quotation: QuotationLike | null | undefined,
  measuredItems: MeasuredItemLike[] | null | undefined,
  unmeasuredItems: UnmeasuredItemLike[] | null | undefined,
  options: QuotationTotalsOptions = {},
): QuotationTotals {
  const measured = Array.isArray(measuredItems) ? measuredItems : [];
  const unmeasured = Array.isArray(unmeasuredItems) ? unmeasuredItems : [];

  let totalMeasured = 0;
  let totalSqft = 0;
  for (const item of measured) {
    totalSqft += measuredLineSqft(item);
    totalMeasured += measuredLineTotal(item);
  }

  let totalUnmeasured = 0;
  for (const item of unmeasured) {
    totalUnmeasured += unmeasuredLineTotal(item);
  }

  const subtotal = totalMeasured + totalUnmeasured;
  const transport = num(quotation?.transport_cost);
  const netTotal = subtotal + transport;

  // Dart: igst = includeGst ? (actualAmount + transport) * (gstPercentage / 100.0) : 0.0
  let gstPercentage: number;
  if (options.forceGstPercentage !== undefined) {
    gstPercentage = num(options.forceGstPercentage);
  } else {
    gstPercentage = quotation?.include_gst ? num(quotation?.gst_percentage) : 0;
  }
  const gstAmount = netTotal * (gstPercentage / 100);
  const grandTotal = netTotal + gstAmount;

  return {
    totalMeasured,
    totalUnmeasured,
    subtotal,
    transport,
    netTotal,
    gstPercentage,
    gstAmount,
    grandTotal,
    totalSqft,
  };
}

/**
 * Fixtures for the Dart <-> TypeScript parity test (owned by Bugsy).
 *
 * Import these in a Vitest suite and assert `quotationTotals(...)` matches, then
 * port the SAME table to a Dart test against `QuotationData`. Both languages must
 * agree to the last representable digit, not just to two decimal places — a
 * rounding difference that only shows up on large quotes is worse than an obvious
 * one, because it ships.
 *
 * Expected values below are intentionally NOT hard-coded: they are computed by
 * this module and are meant to be snapshotted by the test, then compared against
 * Dart output. Hard-coding them here would make this file its own oracle.
 */
export const PRICING_PARITY_FIXTURES: Array<{
  name: string;
  quotation: QuotationLike;
  measured: MeasuredItemLike[];
  unmeasured: UnmeasuredItemLike[];
}> = [
  {
    name: "empty quotation",
    quotation: { transport_cost: 0, include_gst: false, gst_percentage: 0 },
    measured: [],
    unmeasured: [],
  },
  {
    name: "single measured item, no gst",
    quotation: { transport_cost: 0, include_gst: false, gst_percentage: 0 },
    measured: [{ width: 1200, height: 1500, units: 1, rate: 450 }],
    unmeasured: [],
  },
  {
    name: "measured item x2 units with 18% gst and transport",
    quotation: { transport_cost: 2500, include_gst: true, gst_percentage: 18 },
    measured: [{ width: 1200, height: 1500, units: 2, rate: 450 }],
    unmeasured: [],
  },
  {
    name: "numeric columns arriving as PostgREST strings",
    quotation: { transport_cost: "2500", include_gst: true, gst_percentage: "18" },
    measured: [{ width: "1200", height: "1500", units: "2", rate: "450" }],
    unmeasured: [{ units: "3", rate: "1250.75" }],
  },
  {
    name: "zero dimensions",
    quotation: { transport_cost: 0, include_gst: true, gst_percentage: 18 },
    measured: [{ width: 0, height: 0, units: 1, rate: 450 }],
    unmeasured: [],
  },
  {
    name: "fractional millimetres",
    quotation: { transport_cost: 0, include_gst: true, gst_percentage: 18 },
    measured: [{ width: 1234.5, height: 987.25, units: 3, rate: 512.33 }],
    unmeasured: [],
  },
  {
    name: "missing units defaults to 1",
    quotation: { transport_cost: 0, include_gst: false, gst_percentage: 0 },
    measured: [{ width: 900, height: 2100, rate: 380 }],
    unmeasured: [{ rate: 500 }],
  },
  {
    name: "null and undefined fields survive",
    quotation: { transport_cost: null, include_gst: null, gst_percentage: null },
    measured: [{ width: null, height: undefined, units: null, rate: null }],
    unmeasured: [{ units: null, rate: null }],
  },
  {
    name: "corrupt non-numeric rate must not produce NaN",
    quotation: { transport_cost: "abc", include_gst: true, gst_percentage: "xyz" },
    measured: [{ width: "1200", height: "1500", units: "2", rate: "not-a-number" }],
    unmeasured: [],
  },
  {
    name: "large multi-line quotation",
    quotation: { transport_cost: 12500, include_gst: true, gst_percentage: 18 },
    measured: [
      { width: 1200, height: 1500, units: 4, rate: 450 },
      { width: 2400, height: 2100, units: 2, rate: 615.5 },
      { width: 600, height: 600, units: 12, rate: 380 },
      { width: 3000, height: 1200, units: 1, rate: 725.25 },
    ],
    unmeasured: [
      { units: 4, rate: 1250 },
      { units: 10, rate: 85.5 },
    ],
  },
];
