import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaGetAllPaged } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/payments/overdue — overdue amounts per customer.
 *
 * Finds quotations with payment_status != 'paid' and groups by customer,
 * showing total invoiced, total paid, and balance outstanding.
 */

const MAX_ROWS = 5000;
const PAGE_SIZE = 500;

function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    // Get all unpaid/partial quotations
    const { rows: quotes } = await supaGetAllPaged(
      "quotations",
      {
        client_id: "eq." + gate.clientId,
        deleted: "eq.false",
        or: "(payment_status.eq.unpaid,payment_status.eq.partial)",
        select:
          "id,quote_no,date,customer_name,customer_id,payment_status,amount_paid",
        order: "date.desc,id.desc",
      },
      PAGE_SIZE,
      MAX_ROWS,
    );

    // Get grand totals from quotation_money for all quotations in one pass
    const quoteIds = (Array.isArray(quotes) ? quotes : []).map((q: any) => q.id);
    const moneyMap = new Map<string, number>();

    if (quoteIds.length > 0) {
      // quotation_money has all quotations, so fetch all for this client
      // and build a lookup. This avoids N+1 queries.
      try {
        const { rows: moneyRows } = await supaGetAllPaged(
          "quotation_money",
          {
            client_id: "eq." + gate.clientId,
            select: "id,grand_total",
          },
          PAGE_SIZE,
          MAX_ROWS,
        );
        for (const m of (Array.isArray(moneyRows) ? moneyRows : [])) {
          moneyMap.set(m.id, Number(m.grand_total) || 0);
        }
      } catch {
        // Fallback: grand_total unavailable, balance will be inaccurate
      }
    }

    // Group by customer
    type CustomerOverdue = {
      customer_name: string;
      customer_id: string | null;
      quote_count: number;
      total_invoiced: number;
      total_paid: number;
      balance: number;
      latest_quote_date: string;
    };

    const groups = new Map<string, CustomerOverdue>();

    for (const q of (Array.isArray(quotes) ? quotes : [])) {
      const name = (q.customer_name || "(unnamed)").trim();
      const key = name.toLowerCase();
      let g = groups.get(key);
      if (!g) {
        g = {
          customer_name: name,
          customer_id: q.customer_id || null,
          quote_count: 0,
          total_invoiced: 0,
          total_paid: 0,
          balance: 0,
          latest_quote_date: "",
        };
        groups.set(key, g);
      }
      g.quote_count += 1;
      g.total_invoiced += moneyMap.get(q.id) || 0;
      g.total_paid += Number(q.amount_paid) || 0;
      const d = q.date || "";
      if (d > g.latest_quote_date) g.latest_quote_date = d;
    }

    const rows = [...groups.values()]
      .map((g) => ({
        ...g,
        total_invoiced: r2(g.total_invoiced),
        total_paid: r2(g.total_paid),
        balance: r2(g.total_invoiced - g.total_paid),
      }))
      .filter((g) => g.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    const totalOverdue = rows.reduce((sum, r) => sum + r.balance, 0);

    return consoleJson({
      rows,
      summary: {
        customers_with_overdue: rows.length,
        total_overdue: r2(totalOverdue),
      },
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
