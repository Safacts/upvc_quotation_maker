import { NextRequest, NextResponse } from "next/server";
import { supaGetAllPaged, supaCount, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { quotationTotals } from "@/lib/pricing";

/**
 * Hard ceiling on how many quotations a single stats request will aggregate.
 *
 * This endpoint sums the entire history for a client in a JS loop inside a Vercel
 * function with a 10s wall clock. Previously it issued one unbounded SELECT with
 * two embedded child tables — fine at 47 rows, a guaranteed timeout/OOM later.
 * 5000 quotations is far beyond any realistic uPVC fabricator's lifetime volume
 * (KPR is at ~23), so in practice nothing truncates; the cap exists so that a
 * runaway client cannot take the dashboard down. When it IS hit we say so in the
 * response rather than quietly reporting a partial total as a complete one.
 */
const MAX_QUOTATIONS_SCANNED = 5000;

/** Rows per PostgREST round trip while paging. */
const PAGE_SIZE = 500;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "customer") {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!isServiceKeyConfigured()) {
      return json({ error: "Database not configured" }, 500);
    }

    const clientId = session.client_id;

    // Tenant scope comes from the HttpOnly session cookie, never from the query
    // string — the service-role key bypasses RLS, so this filter IS the isolation.
    const scope = {
      client_id: "eq." + clientId,
      // Soft-deleted quotations are excluded here for the same reason as the
      // console grid and console stats: a deleted quote must not keep earning
      // revenue in the KPIs. All three surfaces now agree on what counts.
      deleted: "eq.false",
      select:
        "id,quote_no,customer_name,contact_no,status,transport_cost,include_gst,gst_percentage,created_at,measured_items(rate,width,height,units),unmeasured_items(rate,units)",
      // `id` is a tiebreaker, NOT decoration. Offset pagination re-runs the query
      // for every page, so a non-deterministic sort lets rows with identical
      // created_at values swap between pages — the same quote gets counted twice
      // while another is skipped entirely, silently corrupting the totals. Bulk
      // imports and same-second saves make ties genuinely likely.
      order: "created_at.desc,id.desc",
    } as const;

    // Bounded, paged read. Newest-first ordering means that if a tenant ever does
    // exceed the cap, the rows we keep are the ones that matter for recent-period
    // stats (this month / last month / 8-week bars) rather than an arbitrary slice.
    const { rows: quotes, truncated } = await supaGetAllPaged(
      "quotations",
      scope,
      PAGE_SIZE,
      MAX_QUOTATIONS_SCANNED,
    );

    // When truncated, the honest lifetime count still comes from the database
    // rather than from the number of rows we happened to load.
    let scannedCount = quotes.length;
    let totalCountExact = scannedCount;
    if (truncated) {
      const exact = await supaCount("quotations", {
        client_id: "eq." + clientId,
        deleted: "eq.false",
      });
      if (exact >= 0) totalCountExact = exact;
    }

    let totalQuoted = 0;
    let wonQuoted = 0;
    let wonCount = 0;

    let thisMonthTotal = 0;
    let lastMonthTotal = 0;

    const pendingFollowUps: Array<{ id: string; quote_no: string; customer_name: string; contact_no: string; created_at: string; total: number }> = [];
    
    const countsByStatus: Record<string, number> = {
      Draft: 0,
      Sent: 0,
      Won: 0,
      Lost: 0
    };

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonth = lastMonthDate.getMonth();

    // Calculate weekly bars for the last 8 weeks
    const weeks: { label: string; amount: number; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1) - i * 7);
      weeks.push({ 
        label: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }), 
        amount: 0, 
        count: 0 
      });
    }

    for (const q of quotes) {
      // Single source of truth — see src/lib/pricing.ts. This endpoint reports the
      // pre-GST business value (net of transport), which is what a fabricator means
      // by "quoted value"; GST is a pass-through, not revenue. `netTotal` is used
      // deliberately instead of `grandTotal` so these figures stay comparable across
      // quotes regardless of whether GST was enabled on any individual quote.
      const totals = quotationTotals(q, q.measured_items, q.unmeasured_items);
      const qTotal = totals.netTotal;

      totalQuoted += qTotal;
      
      const rawStatus = q.status || 'draft';
      const s = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
      
      countsByStatus[s] = (countsByStatus[s] || 0) + 1;

      if (s === 'Won') {
        wonCount++;
        wonQuoted += qTotal;
      }

      // Collect pending follow-ups (Sent or Draft)
      if (s === 'Sent' || s === 'Draft') {
        pendingFollowUps.push({
          id: q.id || '',
          quote_no: q.quote_no || 'Quote',
          customer_name: q.customer_name || 'Valued Customer',
          contact_no: q.contact_no || '',
          created_at: q.created_at || new Date().toISOString(),
          total: qTotal
        });
      }

      if (q.created_at) {
        const qDate = new Date(q.created_at);
        
        // Month comparison
        if (qDate.getFullYear() === currentYear && qDate.getMonth() === currentMonth) {
          thisMonthTotal += qTotal;
        } else if (qDate.getFullYear() === lastMonthYear && qDate.getMonth() === lastMonth) {
          lastMonthTotal += qTotal;
        }

        // Find which week it belongs to
        for (let i = 0; i < 8; i++) {
           const wStart = new Date(now);
           wStart.setDate(wStart.getDate() - (wStart.getDay() === 0 ? 6 : wStart.getDay() - 1) - (7 - i) * 7);
           wStart.setHours(0,0,0,0);
           
           const wEnd = new Date(wStart);
           wEnd.setDate(wEnd.getDate() + 7);
           
           if (qDate >= wStart && qDate < wEnd) {
             weeks[i].amount += qTotal;
             weeks[i].count += 1;
             break;
           }
        }
      }
    }

    // Win rate is computed over the SCANNED set so that numerator and denominator
    // always describe the same population. Mixing a scanned wonCount with an exact
    // lifetime total would understate the rate whenever truncation kicks in.
    const winRate = scannedCount > 0 ? (wonCount / scannedCount) * 100 : 0;
    
    let monthChangePercent = 0;
    if (lastMonthTotal > 0) {
      monthChangePercent = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
    } else if (thisMonthTotal > 0) {
      monthChangePercent = 100;
    }

    return json({
      totalCount: totalCountExact,
      // Present only so the UI can caption aggregates honestly when a tenant's
      // history exceeds MAX_QUOTATIONS_SCANNED. Existing consumers ignore these.
      scannedCount,
      truncated,
      wonCount,
      totalQuoted,
      wonQuoted,
      winRate,
      thisMonthTotal,
      lastMonthTotal,
      monthChangePercent,
      countsByStatus,
      weeklyBars: weeks,
      pendingFollowUps: pendingFollowUps.slice(0, 5) // top 5 pending
    });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
