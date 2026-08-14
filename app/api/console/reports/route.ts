import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGetAllPaged, supabaseRpc } from "@/lib/supabase";
import {
  quotationTotals,
  measuredLineSqft,
  measuredLineTotal,
  unmeasuredLineTotal,
} from "@/lib/pricing";
import { formatZodError } from "@/lib/console-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/reports — the five commercial reports for the console.
 *
 * ============================================================================
 *  TENANT BOUNDARY
 * ============================================================================
 * Every query below writes `client_id: "eq." + clientId` LITERALLY, where
 * `clientId` came from `requireConsoleSession()` — i.e. from the HttpOnly
 * session cookie. It is never read from the query string. The service-role key
 * bypasses RLS, so that filter IS the isolation boundary; it is spelled out on
 * each call rather than folded into a shared object so that a reviewer (and the
 * static audit in tests/client-isolation.test.ts, which greps for the literal
 * text) can see the scope ON the query. Same reasoning as quotations/route.ts.
 *
 * NO CORS. `consoleJson()` emits none — a tenant's full sales register must not
 * be readable by any page the user happens to have open in another tab.
 *
 * ============================================================================
 *  WHY THE RPC IS TRIED FIRST, AND WHY THERE IS STILL A FALLBACK
 * ============================================================================
 * Migration 010 defines `search_quotations` over the `quotation_money` view,
 * which is proven bit-exact against `src/lib/pricing.ts` (80/80 fixtures,
 * 188/188 live rows, 08-08-2026). When it is applied, the money math is pushed
 * into Postgres and no line items cross the wire. It was NOT yet applied as of
 * 08-08-2026, so — exactly like quotations/route.ts — we try the RPC and fall
 * through to a bounded PostgREST scan on failure. Both paths produce the same
 * numbers because the fallback computes them with the same `pricing.ts` the RPC
 * was proven against.
 *
 * `product_movement` is the one exception: it aggregates LINE ITEMS, which the
 * RPC does not return, so it always takes the PostgREST path.
 *
 * ============================================================================
 *  MONEY
 * ============================================================================
 * No arithmetic in this file invents a total. Every rupee figure originates in
 * `quotationTotals()` / `measuredLineTotal()` / `unmeasuredLineTotal()` from
 * src/lib/pricing.ts, or is a plain sum of those. See the header of that file
 * for why inline `(w/304.8)*(h/304.8)` is forbidden.
 */

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * Reports run inside a Vercel function with a 10s wall clock. A report is by
 * definition a whole-range scan, so it cannot be paged for the user — it is
 * capped instead, and when the cap bites we SAY SO (`truncated: true`) rather
 * than presenting a partial total as if it were the whole picture.
 */
const MAX_ROWS = 5000;
const PAGE_SIZE = 500;

/** Default window when the caller supplies no dates: the last 30 days. */
const DEFAULT_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Query validation
// ---------------------------------------------------------------------------

/**
 * These mirror the `text()` / `numberish()` helpers in console-schemas.ts but
 * are declared inline: those helpers are module-private there, and reports have
 * no write schema to share, so importing would mean widening that file's public
 * surface for a single consumer.
 */
const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length <= max, { message: `Must be ${max} characters or fewer` });

/** The closed set of reports. Anything else is a 400, never a silent empty grid. */
export const REPORT_TYPES = [
  "sales_register",
  "customer_ledger",
  "product_movement",
  "win_loss",
  "gst_summary",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Canonical quotation statuses — same closed set as console-schemas.ts. */
const STATUSES = ["draft", "sent", "won", "lost"] as const;

/**
 * A date is only accepted as `YYYY-MM-DD`. It is concatenated into a PostgREST
 * filter (`created_at.gte.<value>`), so free text here would both break the
 * expression and hand the caller a filter-injection primitive. Empty means
 * "unset" and triggers the 30-day default.
 */
const dateParam = text(10).refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
  message: "Date must be YYYY-MM-DD",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reportQuerySchema = z.object({
  type: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim().toLowerCase())
    .pipe(z.enum(REPORT_TYPES)),
  from: dateParam.optional().default(""),
  to: dateParam.optional().default(""),
  // Unknown statuses are DROPPED rather than rejected: a stale bookmark holding
  // `status=accepted` (a signup_requests value that never applied to
  // quotations) should still render the report, not 400.
  status: z
    .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return [] as string[];
      const raw = Array.isArray(v) ? v : v.split(",");
      return raw
        .map((s) => s.trim().toLowerCase())
        .filter((s) => (STATUSES as readonly string[]).includes(s));
    }),
  customer_id: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    })
    .refine((v) => v === null || UUID_RE.test(v), { message: "customer_id must be a uuid" }),
});

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/**
 * Round a rupee figure to paise for OUTPUT ONLY.
 *
 * Never round an intermediate — sums are accumulated at full float64 precision
 * and rounded once at the edge. This also makes the RPC path and the PostgREST
 * path byte-identical in the response: migration 010 already returns
 * `round(...,2)`, so rounding here means the caller cannot tell which path ran.
 */
function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** Percentage, guarded against a zero denominator on an empty range. */
function pct(part: number, whole: number): number {
  return whole > 0 ? r2((part / whole) * 100) : 0;
}

/**
 * Normalise a status for comparison.
 *
 * The live table holds BOTH 'Draft' and 'draft' (verified 08-08-2026). A
 * case-sensitive bucket would report two different draft counts on two
 * different screens. Every status comparison in this file goes through here.
 */
function normStatus(v: unknown): string {
  return (v ?? "draft").toString().trim().toLowerCase();
}

/**
 * Case-insensitive status filter values for PostgREST `in.(...)`, which is
 * case-SENSITIVE and would otherwise silently drop the legacy 'Draft' rows.
 */
function statusFilterValues(statuses: string[]): string[] {
  const out = new Set<string>();
  for (const s of statuses) {
    const lower = s.toLowerCase();
    out.add(lower);
    out.add(lower.charAt(0).toUpperCase() + lower.slice(1));
    out.add(lower.toUpperCase());
  }
  return [...out];
}

/** `YYYY-MM-DD` for a Date, in UTC — the same form PostgREST compares against. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the reporting window.
 *
 * `from` is INCLUSIVE (gte), `to` is EXCLUSIVE (lt) — identical semantics to
 * quotations/route.ts and to `get_quote_stats`, so a figure on the report and
 * the same figure on the grid always describe the same set of rows.
 */
function resolveRange(from: string, to: string): { from: string; to: string } {
  if (from && to) return { from, to };
  const now = new Date();
  if (!from && !to) {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - DEFAULT_WINDOW_DAYS);
    // `to` is exclusive, so tomorrow's date includes everything up to now.
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + 1);
    return { from: isoDay(start), to: isoDay(end) };
  }
  if (from && !to) {
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + 1);
    return { from, to: isoDay(end) };
  }
  // `to` only — walk the default window back from it.
  const end = new Date(`${to}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - DEFAULT_WINDOW_DAYS);
  return { from: isoDay(start), to };
}

/**
 * Build the PostgREST date predicate.
 *
 * Two conditions on ONE column cannot be expressed as two keys in the same
 * query object (the second would overwrite the first), so the `and=(...)` form
 * is used whenever both bounds are present — same trick as quotations/route.ts.
 */
function dateFilters(
  column: string,
  from: string,
  to: string,
): Record<string, string> {
  if (from && to) return { and: `(${column}.gte.${from},${column}.lt.${to})` };
  if (from) return { [column]: "gte." + from };
  if (to) return { [column]: "lt." + to };
  return {};
}

// ---------------------------------------------------------------------------
// Quotation loading — RPC first, PostgREST fallback
// ---------------------------------------------------------------------------

/**
 * The one row shape every quotations-based report consumes, so neither the RPC
 * path nor the PostgREST path can produce a report that looks different.
 * `measured_items` / `unmeasured_items` are populated only on the PostgREST
 * path (the RPC does not return line items) and are used solely by
 * `product_movement`, which therefore never takes the RPC path.
 */
type ReportQuotation = {
  id: string;
  quote_no: string;
  date: string;
  customer_name: string;
  customer_id: string | null;
  status: string;
  created_at: string;
  net_total: number;
  gst_amount: number;
  grand_total: number;
  total_sqft: number;
  measured_items: any[];
  unmeasured_items: any[];
};

type QuotationLoad = { rows: ReportQuotation[]; truncated: boolean; source: string };

/**
 * Try `search_quotations` (migration 010), paging until the filtered set is
 * exhausted or MAX_ROWS is reached.
 *
 * Returns `null` — not an empty array — when the RPC is unavailable, so the
 * caller can tell "migration not applied" apart from "no rows in range" and
 * fall back instead of reporting a spurious zero.
 */
async function loadViaRpc(
  clientId: string,
  from: string,
  to: string,
  statuses: string[],
  customerId: string | null,
): Promise<QuotationLoad | null> {
  const rows: ReportQuotation[] = [];
  let page = 1;
  let total = Infinity;

  try {
    while (rows.length < MAX_ROWS && rows.length < total) {
      const chunk = await supabaseRpc("search_quotations", {
        p_cid: clientId, // tenant scope: from the session cookie, never the query
        p_q: null,
        p_status: statuses.length ? statuses : null,
        p_from: from || null,
        p_to: to || null,
        p_customer_id: customerId,
        p_sort: "created_at",
        p_dir: "asc",
        p_page: page,
        p_page_size: PAGE_SIZE,
      });

      // A non-array body means the function did not run as expected; treat it
      // as unavailable rather than as an empty result set.
      if (!Array.isArray(chunk)) return null;
      if (chunk.length === 0) break;

      if (total === Infinity) {
        total = Number(chunk[0]?.total_count);
        if (!Number.isFinite(total)) total = chunk.length;
      }

      for (const r of chunk) {
        rows.push({
          id: r.id,
          quote_no: r.quote_no || "",
          date: r.quote_date || "",
          customer_name: r.customer_name || "",
          customer_id: r.customer_id || null,
          status: normStatus(r.status),
          created_at: r.created_at,
          net_total: Number(r.net_total) || 0,
          gst_amount: Number(r.gst_amount) || 0,
          grand_total: Number(r.grand_total) || 0,
          total_sqft: Number(r.total_sqft) || 0,
          measured_items: [],
          unmeasured_items: [],
        });
      }

      if (chunk.length < PAGE_SIZE) break;
      page += 1;
    }
  } catch {
    // RPC not available (migration 010 not applied) — caller falls back.
    return null;
  }

  return {
    rows: rows.slice(0, MAX_ROWS),
    truncated: Number.isFinite(total) && total > rows.length,
    source: "rpc",
  };
}

/** Columns the fallback needs. `address` is deliberately excluded — heavy, unused. */
const REPORT_SELECT =
  "id,quote_no,date,customer_name,customer_id,status,transport_cost,include_gst," +
  "gst_percentage,created_at," +
  "measured_items(code,description,width,height,units,rate)," +
  "unmeasured_items(description,units,rate)";

/**
 * Bounded PostgREST scan of the range, with money computed by `pricing.ts`.
 *
 * @param withItems Keep the raw line items on each row. Only `product_movement`
 *                  needs them; dropping them everywhere else keeps a 5000-row
 *                  report from holding every child row in function memory.
 */
async function loadViaRest(
  clientId: string,
  from: string,
  to: string,
  statuses: string[],
  customerId: string | null,
  withItems: boolean,
): Promise<QuotationLoad> {
  const filters: Record<string, string> = { ...dateFilters("created_at", from, to) };
  if (statuses.length) {
    filters.status = "in.(" + statusFilterValues(statuses).join(",") + ")";
  }
  if (customerId) filters.customer_id = "eq." + customerId;

  const { rows, truncated } = await supaGetAllPaged(
    "quotations",
    {
      client_id: "eq." + clientId, // tenant scope: from the session cookie
      ...filters,
      select: REPORT_SELECT,
      // `id` is a TIEBREAKER, not decoration. Offset paging re-runs the query
      // per page; without a deterministic second key, rows sharing a
      // `created_at` swap between pages — one is counted twice, another lost.
      order: "created_at.asc,id.asc",
    },
    PAGE_SIZE,
    MAX_ROWS,
  );

  const mapped: ReportQuotation[] = (Array.isArray(rows) ? rows : []).map((q: any) => {
    // ONE money implementation for every surface. See src/lib/pricing.ts.
    const t = quotationTotals(q, q.measured_items, q.unmeasured_items);
    return {
      id: q.id,
      quote_no: q.quote_no || "",
      date: q.date || "",
      customer_name: q.customer_name || "",
      customer_id: q.customer_id || null,
      status: normStatus(q.status),
      created_at: q.created_at,
      net_total: t.netTotal,
      gst_amount: t.gstAmount,
      grand_total: t.grandTotal,
      total_sqft: t.totalSqft,
      measured_items: withItems ? q.measured_items || [] : [],
      unmeasured_items: withItems ? q.unmeasured_items || [] : [],
    };
  });

  return { rows: mapped, truncated, source: "postgrest" };
}

/** RPC first, PostgREST fallback. Identical output contract either way. */
async function loadQuotations(
  clientId: string,
  from: string,
  to: string,
  statuses: string[],
  customerId: string | null,
  withItems: boolean,
): Promise<QuotationLoad> {
  if (!withItems) {
    const viaRpc = await loadViaRpc(clientId, from, to, statuses, customerId);
    if (viaRpc) return viaRpc;
  }
  return loadViaRest(clientId, from, to, statuses, customerId, withItems);
}

// ---------------------------------------------------------------------------
// Report builders
// ---------------------------------------------------------------------------

/** 1. Sales register — one line per quotation, oldest first. */
function buildSalesRegister(quotes: ReportQuotation[]) {
  // Sort on the printed `date` (what the customer sees on the PDF), falling
  // back to `created_at` for the legacy rows that never had one set.
  const sorted = [...quotes].sort((a, b) =>
    (a.date || a.created_at || "").localeCompare(b.date || b.created_at || ""),
  );

  let totalNet = 0;
  let totalGst = 0;
  let totalGrand = 0;
  let wonCount = 0;
  let wonNet = 0;

  const rows = sorted.map((q) => {
    totalNet += q.net_total;
    totalGst += q.gst_amount;
    totalGrand += q.grand_total;
    if (q.status === "won") {
      wonCount += 1;
      wonNet += q.net_total;
    }
    return {
      date: q.date || (q.created_at || "").slice(0, 10),
      quote_no: q.quote_no,
      customer_name: q.customer_name,
      status: q.status,
      net_total: r2(q.net_total),
      gst_amount: r2(q.gst_amount),
      grand_total: r2(q.grand_total),
    };
  });

  return {
    rows,
    summary: {
      count: rows.length,
      total_net: r2(totalNet),
      total_gst: r2(totalGst),
      total_grand: r2(totalGrand),
      won_count: wonCount,
      won_net: r2(wonNet),
    },
  };
}

/**
 * 2. Customer ledger — grouped by `customer_name`.
 *
 * GROUPED BY NAME, NOT BY `customer_id`, ON PURPOSE. `customer_name` on a
 * quotation is an immutable historical snapshot of what was printed on the PDF
 * (see console-schemas.ts), and `customer_id` is nullable — 47 live quotations
 * predate the `customers` table. Grouping on the id would bucket every one of
 * those under a single "null" customer and make the ledger useless for exactly
 * the history a fabricator wants to look up.
 */
function buildCustomerLedger(quotes: ReportQuotation[]) {
  type Group = {
    customer_name: string;
    quote_count: number;
    total_net: number;
    total_grand: number;
    won_count: number;
    last_quote_date: string;
  };
  const groups = new Map<string, Group>();

  for (const q of quotes) {
    // Case/whitespace-insensitive key so "KPR uPVC" and "kpr upvc " are one
    // customer, while the DISPLAY name keeps the original casing.
    const name = q.customer_name || "(unnamed)";
    const key = name.trim().toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = {
        customer_name: name,
        quote_count: 0,
        total_net: 0,
        total_grand: 0,
        won_count: 0,
        last_quote_date: "",
      };
      groups.set(key, g);
    }
    g.quote_count += 1;
    g.total_net += q.net_total;
    g.total_grand += q.grand_total;
    if (q.status === "won") g.won_count += 1;
    const d = q.date || (q.created_at || "").slice(0, 10);
    if (d > g.last_quote_date) g.last_quote_date = d;
  }

  let totalGrand = 0;
  const rows = [...groups.values()]
    .map((g) => {
      totalGrand += g.total_grand;
      return {
        customer_name: g.customer_name,
        quote_count: g.quote_count,
        total_net: r2(g.total_net),
        total_grand: r2(g.total_grand),
        won_count: g.won_count,
        win_rate_pct: pct(g.won_count, g.quote_count),
        last_quote_date: g.last_quote_date,
      };
    })
    .sort((a, b) => b.total_grand - a.total_grand);

  return {
    rows,
    summary: {
      unique_customers: rows.length,
      total_grand: r2(totalGrand),
    },
  };
}

/**
 * 3. Product movement — aggregates LINE ITEMS across the range.
 *
 * There is no product FK on a line item: a measured line carries a free-text
 * `code` + `description` typed at quotation time, so `code||description` is the
 * only stable identity available. Keying on `code` alone would merge two
 * genuinely different windows that share a fabricator's shorthand.
 *
 * `times_quoted` counts QUOTATIONS containing the product, not lines — the same
 * window appearing three times on one quotation is one quote, and inflating it
 * would make a single large order look like repeat demand.
 */
function buildProductMovement(quotes: ReportQuotation[]) {
  type Agg = {
    key: string;
    kind: "measured" | "unmeasured";
    code: string;
    description: string;
    times_quoted: number;
    total_qty: number;
    total_sqft: number;
    total_revenue: number;
  };
  const agg = new Map<string, Agg>();

  const touch = (
    key: string,
    kind: "measured" | "unmeasured",
    code: string,
    description: string,
  ): Agg => {
    let a = agg.get(key);
    if (!a) {
      a = {
        key,
        kind,
        code,
        description,
        times_quoted: 0,
        total_qty: 0,
        total_sqft: 0,
        total_revenue: 0,
      };
      agg.set(key, a);
    }
    return a;
  };

  for (const q of quotes) {
    // Per-quotation set, so `times_quoted` increments at most once per quote.
    const seen = new Set<string>();

    for (const item of q.measured_items || []) {
      const code = (item?.code ?? "").toString().trim();
      const description = (item?.description ?? "").toString().trim();
      const key = "m:" + code + "||" + description;
      const a = touch(key, "measured", code, description);
      const units = Number(item?.units);
      a.total_qty += Number.isFinite(units) ? units : 1;
      // Money and area from pricing.ts ONLY — never inline (w/304.8)*(h/304.8).
      a.total_sqft += measuredLineSqft(item);
      a.total_revenue += measuredLineTotal(item);
      if (!seen.has(key)) {
        seen.add(key);
        a.times_quoted += 1;
      }
    }

    for (const item of q.unmeasured_items || []) {
      // Unmeasured lines (hardware, mesh, labour) carry no code column at all,
      // so the description is the whole identity.
      const description = (item?.description ?? "").toString().trim();
      const key = "u:" + description;
      const a = touch(key, "unmeasured", "", description);
      const units = Number(item?.units);
      a.total_qty += Number.isFinite(units) ? units : 1;
      a.total_revenue += unmeasuredLineTotal(item);
      if (!seen.has(key)) {
        seen.add(key);
        a.times_quoted += 1;
      }
    }
  }

  let totalRevenue = 0;
  const rows = [...agg.values()]
    .map((a) => {
      totalRevenue += a.total_revenue;
      return {
        kind: a.kind,
        code: a.code,
        description: a.description,
        // What the UI shows in a single column, for either kind.
        label: a.kind === "measured" && a.code ? `${a.code} — ${a.description}` : a.description,
        times_quoted: a.times_quoted,
        total_qty: r2(a.total_qty),
        // Area is meaningless for unmeasured lines; 0 rather than a fake figure.
        total_sqft: r2(a.total_sqft),
        total_revenue: r2(a.total_revenue),
      };
    })
    .sort((a, b) => b.total_revenue - a.total_revenue);

  return {
    rows,
    summary: {
      unique_products: rows.length,
      total_revenue: r2(totalRevenue),
    },
  };
}

/**
 * 4. Win / loss — the status breakdown.
 *
 * Every canonical status is emitted even at zero count, so the report does not
 * silently change shape (and the chart does not change colours) between a month
 * with losses and a month without.
 */
function buildWinLoss(quotes: ReportQuotation[]) {
  const buckets: Record<string, { count: number; net: number; grand: number }> = {};
  for (const s of STATUSES) buckets[s] = { count: 0, net: 0, grand: 0 };

  let total = 0;
  let totalGrand = 0;

  for (const q of quotes) {
    // An unrecognised legacy status still gets a bucket rather than vanishing
    // from the totals — a row that is counted nowhere is a silently wrong report.
    if (!buckets[q.status]) buckets[q.status] = { count: 0, net: 0, grand: 0 };
    const b = buckets[q.status];
    b.count += 1;
    b.net += q.net_total;
    b.grand += q.grand_total;
    total += 1;
    totalGrand += q.grand_total;
  }

  const rows = Object.entries(buckets).map(([status, b]) => ({
    status,
    count: b.count,
    net_total: r2(b.net),
    grand_total: r2(b.grand),
    pct_of_count: pct(b.count, total),
    pct_of_value: pct(b.grand, totalGrand),
  }));

  const won = buckets.won || { count: 0, net: 0, grand: 0 };
  const lost = buckets.lost || { count: 0, net: 0, grand: 0 };
  const draft = buckets.draft || { count: 0, net: 0, grand: 0 };
  const sent = buckets.sent || { count: 0, net: 0, grand: 0 };

  return {
    rows,
    summary: {
      total,
      // Numerator and denominator describe the SAME scanned population — mixing
      // a scanned won count with a lifetime total understates the rate.
      win_rate_pct: pct(won.count, total),
      won_net: r2(won.net),
      lost_net: r2(lost.net),
      pending_net: r2(draft.net + sent.net),
    },
  };
}

/**
 * 5. GST summary — from `gst_invoices` (migration 004), not from quotations.
 *
 * A quotation's `gst_amount` is an ESTIMATE on an offer; a GST invoice is the
 * filed tax document with its own CGST/SGST/IGST split. They are different
 * numbers and this report must show the filed one.
 */
async function buildGstSummary(clientId: string, from: string, to: string) {
  const { rows, truncated } = await supaGetAllPaged(
    "gst_invoices",
    {
      client_id: "eq." + clientId, // tenant scope: from the session cookie
      ...dateFilters("invoice_date", from, to),
      select:
        "invoice_number,invoice_date,buyer_name,taxable_value," +
        "cgst_amount,sgst_amount,igst_amount,grand_total",
      order: "invoice_date.asc,invoice_number.asc",
    },
    PAGE_SIZE,
    MAX_ROWS,
  );

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalGrand = 0;

  // PostgREST serialises `numeric` columns as JSON STRINGS. `Number()` each one
  // — string concatenation instead of addition here would be a silent disaster.
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };

  const list = (Array.isArray(rows) ? rows : []).map((r: any) => {
    const taxable = n(r.taxable_value);
    const cgst = n(r.cgst_amount);
    const sgst = n(r.sgst_amount);
    const igst = n(r.igst_amount);
    const grand = n(r.grand_total);
    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    totalGrand += grand;
    return {
      invoice_number: r.invoice_number || "",
      invoice_date: r.invoice_date || "",
      buyer_name: r.buyer_name || "",
      taxable_value: r2(taxable),
      cgst_amount: r2(cgst),
      sgst_amount: r2(sgst),
      igst_amount: r2(igst),
      grand_total: r2(grand),
    };
  });

  return {
    rows: list,
    truncated,
    summary: {
      invoice_count: list.length,
      total_taxable: r2(totalTaxable),
      total_cgst: r2(totalCgst),
      total_sgst: r2(totalSgst),
      total_igst: r2(totalIgst),
      total_grand: r2(totalGrand),
    },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = reportQuerySchema.safeParse({
      type: url.searchParams.get("type") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      customer_id: url.searchParams.get("customer_id") ?? undefined,
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query", fields: formatZodError(parsed.error) }, 400);
    }
    const { type, status, customer_id } = parsed.data;
    const range = resolveRange(parsed.data.from, parsed.data.to);

    const base = {
      report: type as ReportType,
      from: range.from,
      to: range.to,
      generated_at: new Date().toISOString(),
    };

    // gst_invoices is a different table with a different date column — it never
    // touches the quotation loader.
    if (type === "gst_summary") {
      const out = await buildGstSummary(clientId, range.from, range.to);
      return consoleJson({
        ...base,
        source: "postgrest",
        truncated: out.truncated,
        rows: out.rows,
        summary: out.summary,
      });
    }

    // Only product_movement needs the line items; every other report is served
    // from per-quotation totals and can take the (cheaper) RPC path.
    const withItems = type === "product_movement";
    const { rows: quotes, truncated, source } = await loadQuotations(
      clientId,
      range.from,
      range.to,
      status,
      customer_id,
      withItems,
    );

    let built: { rows: any[]; summary: Record<string, unknown> };
    switch (type) {
      case "sales_register":
        built = buildSalesRegister(quotes);
        break;
      case "customer_ledger":
        built = buildCustomerLedger(quotes);
        break;
      case "product_movement":
        built = buildProductMovement(quotes);
        break;
      case "win_loss":
        built = buildWinLoss(quotes);
        break;
      default:
        // Unreachable: the zod enum already closed the set. Kept so a future
        // report type added to REPORT_TYPES fails loudly instead of returning
        // an empty report that looks like "no data in range".
        return consoleJson({ error: `Unsupported report type: ${type}` }, 400);
    }

    return consoleJson({
      ...base,
      source,
      // When the cap bites, the caller MUST tell the user their numbers cover
      // only the first MAX_ROWS quotations in the range. A partial total
      // presented as complete is worse than refusing to answer.
      truncated,
      scanned_count: quotes.length,
      rows: built.rows,
      summary: built.summary,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
