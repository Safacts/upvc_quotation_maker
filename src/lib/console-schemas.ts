import { z } from "zod";

/**
 * console-schemas.ts — ONE validation definition, used by BOTH the browser form
 * and the API route that receives it.
 *
 * ============================================================================
 *  WHY SHARED (and not "validate on the client, trust on the server")
 * ============================================================================
 * If the form and the route own separate rules they WILL drift, and the drift is
 * always in the dangerous direction: the UI blocks something the API happily
 * accepts, so the only thing standing between a malformed row and the database
 * is a disabled button. Importing the same object in both places makes that
 * impossible by construction — Bugsy's dual-validation test (post the same
 * payload through the UI and directly at the API, assert identical outcomes)
 * passes for free.
 *
 * `client_id` DELIBERATELY DOES NOT APPEAR IN ANY SCHEMA HERE. It is derived
 * from the HttpOnly session cookie by `requireConsoleSession()`. If a schema
 * ever accepted it, a valid-looking payload could re-target another tenant and
 * the API would have no way to tell. Anything that arrives in the body is
 * untrusted input; the tenant is not input.
 */

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

/**
 * Numbers arrive as strings from three directions: HTML inputs (always strings),
 * URL query params, and PostgREST (`numeric` columns serialise as JSON strings).
 * `z.number()` alone rejects all three. `""` must map to the fallback rather
 * than to `Number("") === 0`, so an emptied field is "unset", not "zero".
 */
const numberish = (fallback: number) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
        return fallback;
      }
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : fallback;
    });

/** Trimmed string with a hard length cap so a runaway paste cannot bloat a row. */
const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length <= max, { message: `Must be ${max} characters or fewer` });

/** Same as `text` but must be non-empty after trimming. */
const requiredText = (max: number, label: string) =>
  text(max).refine((v) => v.length > 0, { message: `${label} is required` });

// ---------------------------------------------------------------------------
// Quotation status
// ---------------------------------------------------------------------------

/**
 * The canonical status set, verified against BOTH the code and the live table
 * (08-08-2026): `QuotationStatusX.value` in lib/models.dart lines 16-23, and
 * `SELECT DISTINCT status FROM quotations` which returns
 * `["Draft", "draft", "sent", "won"]` — note the legacy capitalised row.
 *
 * 'accepted' / 'rejected' / 'archived' DO NOT EXIST for quotations. Those belong
 * to `signup_requests.status`, a different table; an earlier comms.md note
 * conflated them. Filtering a grid on 'accepted' returns nothing, silently.
 *
 * Input is lower-cased before parsing so the legacy 'Draft' rows match.
 */
export const QUOTATION_STATUSES = ["draft", "sent", "won", "lost"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const quotationStatusSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ?? "draft").toString().trim().toLowerCase())
  .pipe(z.enum(QUOTATION_STATUSES));

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

/**
 * A measured (area-priced) line. Dimensions are millimetres; `rate` is per
 * square foot. `sqft` and the line amount are NEVER accepted from the client —
 * they are recomputed server-side from `src/lib/pricing.ts`. A client-supplied
 * total is a client-supplied price.
 *
 * Negative dimensions/rates are rejected rather than clamped: a negative rate
 * silently reduces a grand total, which is a fraud vector, not a typo to fix.
 */
export const measuredItemSchema = z.object({
  id: text(64).optional(),
  code: text(64),
  description: text(500),
  glass: text(200),
  width: numberish(0).refine((n) => n >= 0, { message: "Width cannot be negative" }),
  height: numberish(0).refine((n) => n >= 0, { message: "Height cannot be negative" }),
  units: numberish(1).refine((n) => n >= 0, { message: "Units cannot be negative" }),
  rate: numberish(0).refine((n) => n >= 0, { message: "Rate cannot be negative" }),
});
export type MeasuredItemInput = z.input<typeof measuredItemSchema>;
export type MeasuredItemParsed = z.output<typeof measuredItemSchema>;

/** An unmeasured (per-unit-priced) line: hardware, mesh, labour, etc. */
export const unmeasuredItemSchema = z.object({
  id: text(64).optional(),
  description: text(500),
  units: numberish(1).refine((n) => n >= 0, { message: "Units cannot be negative" }),
  rate: numberish(0).refine((n) => n >= 0, { message: "Rate cannot be negative" }),
});
export type UnmeasuredItemInput = z.input<typeof unmeasuredItemSchema>;
export type UnmeasuredItemParsed = z.output<typeof unmeasuredItemSchema>;

// ---------------------------------------------------------------------------
// Quotation
// ---------------------------------------------------------------------------

/**
 * Caps exist to bound a single Vercel function invocation (10s wall clock, fixed
 * memory). 200 lines is far past any real uPVC quotation — KPR's largest is
 * under 30 — while still refusing a payload that would time out mid-write and
 * leave a half-saved document.
 */
export const MAX_MEASURED_ITEMS = 200;
export const MAX_UNMEASURED_ITEMS = 200;

export const quotationWriteSchema = z.object({
  quote_no: text(64),
  // Free-text customer identity is an IMMUTABLE HISTORICAL SNAPSHOT of what was
  // printed on the PDF. It is deliberately NOT replaced by a join on
  // `customer_id` — if a customer later changes their phone number, last year's
  // quotation must still show the number that was actually on it.
  customer_name: requiredText(200, "Customer name"),
  contact_no: text(40),
  email: text(200),
  address: text(1000),
  reference: text(200),
  supplier_company: text(200),
  date: text(40),
  status: quotationStatusSchema,
  transport_cost: numberish(0).refine((n) => n >= 0, { message: "Transport cannot be negative" }),
  include_gst: z
    .union([z.boolean(), z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => v === true || v === "true" || v === 1 || v === "1"),
  gst_percentage: numberish(0).refine((n) => n >= 0 && n <= 100, {
    message: "GST must be between 0 and 100",
  }),
  // Optional link to the `customers` master. Nullable by design: 47 live
  // quotations predate the table and must stay valid without one.
  customer_id: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    })
    .refine(
      (v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
      { message: "customer_id must be a uuid" },
    ),
  measured_items: z.array(measuredItemSchema).max(MAX_MEASURED_ITEMS).default([]),
  unmeasured_items: z.array(unmeasuredItemSchema).max(MAX_UNMEASURED_ITEMS).default([]),
});
export type QuotationWriteInput = z.input<typeof quotationWriteSchema>;
export type QuotationWriteParsed = z.output<typeof quotationWriteSchema>;

// ---------------------------------------------------------------------------
// Grid query
// ---------------------------------------------------------------------------

/**
 * Sort columns are a CLOSED SET, not free text. The value reaches an `order=`
 * clause; an unvalidated column name there is an injection surface and, at
 * minimum, a 500 from PostgREST on every grid load.
 */
export const QUOTATION_SORT_COLUMNS = [
  "created_at",
  "date",
  "quote_no",
  "customer_name",
  "status",
] as const;
export type QuotationSortColumn = (typeof QUOTATION_SORT_COLUMNS)[number];

/** Page ceiling: bounds one function invocation. The grid virtualises anyway. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export const quotationQuerySchema = z.object({
  q: text(200).optional().default(""),
  status: z
    .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return [] as string[];
      const raw = Array.isArray(v) ? v : v.split(",");
      return raw
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is QuotationStatus =>
          (QUOTATION_STATUSES as readonly string[]).includes(s),
        );
    }),
  from: text(40).optional().default(""),
  to: text(40).optional().default(""),
  sort: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "created_at").toString().trim())
    .pipe(z.enum(QUOTATION_SORT_COLUMNS).catch("created_at")),
  dir: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => ((v ?? "desc").toString().trim().toLowerCase() === "asc" ? "asc" : "desc")),
  page: numberish(1).transform((n) => Math.max(1, Math.floor(n))),
  page_size: numberish(DEFAULT_PAGE_SIZE).transform((n) =>
    Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n))),
  ),
});
export type QuotationQueryParsed = z.output<typeof quotationQuerySchema>;

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------

/** Mirrors migration 007 exactly: NOT NULL DEFAULT '' on every text column. */
export const customerWriteSchema = z.object({
  name: requiredText(200, "Name"),
  phone: text(40),
  email: text(200),
  company: text(200),
  address: text(1000),
  gst_number: text(40),
});
export type CustomerWriteParsed = z.output<typeof customerWriteSchema>;

/** Mirrors migration 008. `category` is free text by design (Supa, 08-08-2026): */
/* KPR will invent categories we did not anticipate; an enum means a migration
   per category, so it is text + autocomplete from DISTINCT instead. */
export const productWriteSchema = z.object({
  name: requiredText(200, "Name"),
  category: text(100),
  description: text(1000),
  price: numberish(0).refine((n) => n >= 0, { message: "Price cannot be negative" }),
  unit: text(20),
});
export type ProductWriteParsed = z.output<typeof productWriteSchema>;

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

/**
 * Flatten a ZodError into `{ "measured_items.0.rate": "Rate cannot be negative" }`
 * so the split-view editor can highlight the exact offending CELL. A bare
 * "Validation failed" on a 30-line quotation makes the user hunt, which is
 * precisely the Tally experience KPR left.
 */
export function formatZodError(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
