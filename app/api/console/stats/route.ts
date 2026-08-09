import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGetAllPaged, supaCount } from "@/lib/supabase";
import { quotationTotals } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/stats — KPI block for the console Overview.
 *
 * The console's counterpart to `/api/portal_stats`, with two differences that
 * matter:
 *
 *   1. NO WILDCARD CORS. `portal_stats` sends `Access-Control-Allow-Origin: *`
 *      because the Flutter app calls it cross-context. This is same-origin only
 *      (see console-auth.ts) — a tenant's lifetime revenue must not be readable
 *      by any page the user happens to have open in another tab.
 *   2. It reports BOTH `net_total` (pre-GST) and `grand_total` sums instead of
 *      silently picking one. `portal_stats` returns only the pre-GST figure, so
 *      a console KPI built on it would disagree with the grand total printed on
 *      the customer's PDF — for exactly the reason this whole Phase 0 existed.
 *
 * WHY THIS AGGREGATES IN JS: `get_quote_stats` (migration 010) does this in one
 * query with no row transfer and is the correct implementation.
 *
 * STATUS (09-08-2026): migration 010 IS NOW APPLIED to both production and
 * staging — the "returns 404 PGRST202" note that used to live here was true on
 * 08-08 only and is no longer accurate. The bounded pager below is retained
 * deliberately as the fallback rather than cut over blind: it uses the same
 * `pricing.ts` the RPC was proven bit-exact against, so switching is a
 * behaviour-preserving change that still needs its own verification pass
 * against live data before it ships. Cutting over is a follow-up, not a
 * drive-by edit during a bug-fix pass.
 */

/**
 * Hard ceiling on rows aggregated per request. This runs inside a Vercel
 * function with a 10s wall clock. KPR is at ~23 quotations and the whole table
 * is 49, so nothing truncates in practice; the cap exists so growth degrades
 * into an honest partial answer instead of a timeout. When it IS hit we say so
 * — reporting a partial total as if it were complete is the worse failure.
 */
const MAX_SCANNED = 5000;
const PAGE_SIZE = 500;

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const { rows, truncated } = await supaGetAllPaged(
      "quotations",
      {
        client_id: "eq." + clientId,
        // Soft-deleted quotations must not reach the KPIs. Omitting this made
        // deleted quotes contribute to lifetime revenue and win-rate, so a
        // fabricator who deleted a cancelled ₹5L quote still saw it in their
        // totals. Matches the grid, the RPC, and `quotations_client_live_idx`.
        deleted: "eq.false",
        select:
          "id,quote_no,customer_name,contact_no,status,transport_cost,include_gst," +
          "gst_percentage,created_at,measured_items(width,height,units,rate)," +
          "unmeasured_items(units,rate)",
        // Deterministic tiebreaker — see the same note in the grid route. Without
        // `id`, rows sharing a created_at swap between pages and get double
        // counted.
        order: "created_at.desc,id.desc",
      },
      PAGE_SIZE,
      MAX_SCANNED,
    );

    const scannedCount = rows.length;
    let totalCount = scannedCount;
    if (truncated) {
      const exact = await supaCount("quotations", {
        client_id: "eq." + clientId,
        deleted: "eq.false",
      });
      if (exact >= 0) totalCount = exact;
    }

    const counts: Record<string, number> = { draft: 0, sent: 0, won: 0, lost: 0 };
    let totalNet = 0;
    let totalGrand = 0;
    let wonNet = 0;
    let totalGst = 0;
    let totalSqft = 0;
    let thisMonthNet = 0;
    let lastMonthNet = 0;

    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth();
    const prev = new Date(curY, curM - 1, 1);
    const prevY = prev.getFullYear();
    const prevM = prev.getMonth();

    // 8 week buckets, Monday-anchored. Built once as [start,end) pairs rather
    // than recomputed inside the row loop — the old portal_stats rebuilt eight
    // Date objects per quotation, which is O(8n) allocations for no reason.
    const weekStarts: Date[] = [];
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1));
    for (let i = 7; i >= 0; i--) {
      const d = new Date(monday);
      d.setDate(d.getDate() - i * 7);
      weekStarts.push(d);
    }
    const weeks = weekStarts.map((d) => ({
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      iso: d.toISOString().slice(0, 10),
      amount: 0,
      count: 0,
    }));

    const pending: Array<Record<string, unknown>> = [];

    for (const q of rows) {
      const t = quotationTotals(q, q.measured_items, q.unmeasured_items);
      // Lower-cased because the live table holds BOTH 'Draft' and 'draft'
      // (verified 08-08-2026). A case-sensitive bucket would report two
      // different draft counts on two different screens.
      const status = (q.status || "draft").toString().trim().toLowerCase();

      counts[status] = (counts[status] || 0) + 1;
      totalNet += t.netTotal;
      totalGrand += t.grandTotal;
      totalGst += t.gstAmount;
      totalSqft += t.totalSqft;
      if (status === "won") wonNet += t.netTotal;

      if (status === "sent" || status === "draft") {
        pending.push({
          id: q.id,
          quote_no: q.quote_no || "",
          customer_name: q.customer_name || "",
          contact_no: q.contact_no || "",
          created_at: q.created_at,
          status,
          net_total: t.netTotal,
          grand_total: t.grandTotal,
        });
      }

      if (!q.created_at) continue;
      const d = new Date(q.created_at);
      if (Number.isNaN(d.getTime())) continue;

      if (d.getFullYear() === curY && d.getMonth() === curM) thisMonthNet += t.netTotal;
      else if (d.getFullYear() === prevY && d.getMonth() === prevM) lastMonthNet += t.netTotal;

      for (let i = 0; i < weeks.length; i++) {
        const start = weekStarts[i];
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        if (d >= start && d < end) {
          weeks[i].amount += t.netTotal;
          weeks[i].count += 1;
          break;
        }
      }
    }

    // Win rate over the SCANNED set so numerator and denominator describe the
    // same population. Mixing a scanned wonCount with an exact lifetime total
    // understates the rate the moment truncation kicks in.
    const winRate = scannedCount > 0 ? (counts.won / scannedCount) * 100 : 0;
    let monthChangePercent = 0;
    if (lastMonthNet > 0) {
      monthChangePercent = ((thisMonthNet - lastMonthNet) / lastMonthNet) * 100;
    } else if (thisMonthNet > 0) {
      monthChangePercent = 100;
    }

    return consoleJson({
      totalCount,
      scannedCount,
      truncated,
      counts,
      totalNet,
      totalGrand,
      totalGst,
      totalSqft,
      wonNet,
      wonCount: counts.won,
      winRate,
      thisMonthNet,
      lastMonthNet,
      monthChangePercent,
      avgQuoteValue: scannedCount > 0 ? totalNet / scannedCount : 0,
      weeklyBars: weeks,
      pendingFollowUps: pending.slice(0, 8),
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
