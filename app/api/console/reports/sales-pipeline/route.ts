import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const allLeads: any[] = [];
    let offset = 0;
    const pageSize = 500;
    const maxRows = 5000;

    while (allLeads.length < maxRows) {
      const limit = Math.min(pageSize, maxRows - allLeads.length);
      const rows = await supaGet("leads", {
        client_id: "eq." + clientId,
        select: "id,status,value",
        order: "created_at.asc",
        limit,
        offset,
      });
      if (!Array.isArray(rows) || rows.length === 0) break;
      allLeads.push(...rows);
      if (rows.length < limit) break;
      offset += rows.length;
    }

    const buckets: Record<string, { count: number; total_value: number }> = {};
    for (const s of LEAD_STATUSES) {
      buckets[s] = { count: 0, total_value: 0 };
    }

    let totalLeads = 0;
    let totalValue = 0;

    for (const lead of allLeads) {
      const status = (lead.status || "new").toLowerCase();
      if (!buckets[status]) {
        buckets[status] = { count: 0, total_value: 0 };
      }
      buckets[status].count += 1;
      buckets[status].total_value += n(lead.value);
      totalLeads += 1;
      totalValue += n(lead.value);
    }

    const funnel = LEAD_STATUSES.map((status) => ({
      status,
      count: buckets[status].count,
      total_value: r2(buckets[status].total_value),
      pct_of_total: totalLeads > 0 ? r2((buckets[status].count / totalLeads) * 100) : 0,
      pct_of_value: totalValue > 0 ? r2((buckets[status].total_value / totalValue) * 100) : 0,
    }));

    const won = buckets.won || { count: 0, total_value: 0 };
    const lost = buckets.lost || { count: 0, total_value: 0 };
    const active = totalLeads - won.count - lost.count;
    const conversionRate = totalLeads > 0 ? r2((won.count / totalLeads) * 100) : 0;

    return consoleJson({
      generated_at: new Date().toISOString(),
      funnel,
      summary: {
        total_leads: totalLeads,
        total_value: r2(totalValue),
        won_count: won.count,
        won_value: r2(won.total_value),
        lost_count: lost.count,
        lost_value: r2(lost.total_value),
        active_leads: active,
        conversion_rate_pct: conversionRate,
      },
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
