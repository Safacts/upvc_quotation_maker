import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaGetAllPaged, supaCount } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/dashboard-widgets — aggregated widget data for the console dashboard.
 *
 * Returns:
 *   - totalProducts: count of all active products
 *   - lowStockCount: products where stock_quantity <= low_stock_threshold
 *   - totalPaymentsThisMonth: sum of payments received this calendar month
 *   - overdueAmount: total balance from quotations with payment_status unpaid/partial
 *     where the quotation is older than 30 days
 *   - recentStockMovements: last 5 stock movements
 *   - gstCollectedThisMonth: GST amount from quotations created this month
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
    const clientId = gate.clientId;

    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth();
    const monthStart = new Date(curY, curM, 1).toISOString();
    const monthEnd = new Date(curY, curM + 1, 1).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Product counts ──────────────────────────────────────────────
    const totalProducts = await supaCount("products", {
      client_id: "eq." + clientId,
      soft_deleted: "eq.false",
    });

    // Low stock: fetch all product rows and count in JS (PostgREST can't
    // compare two columns in a filter). This is bounded by MAX_ROWS.
    let lowStockCount = 0;
    try {
      const { rows: products } = await supaGetAllPaged(
        "products",
        {
          client_id: "eq." + clientId,
          soft_deleted: "eq.false",
          select: "stock_quantity,low_stock_threshold",
        },
        PAGE_SIZE,
        MAX_ROWS,
      );
      for (const p of Array.isArray(products) ? products : []) {
        const stock = Number(p.stock_quantity) || 0;
        const threshold = Number(p.low_stock_threshold) || 10;
        if (stock <= threshold) lowStockCount += 1;
      }
    } catch {
      // If products table has missing columns, degrade gracefully
    }

    // ── 2. Payments this month ─────────────────────────────────────────
    let totalPaymentsThisMonth = 0;
    try {
      const { rows: payments } = await supaGetAllPaged(
        "payments",
        {
          client_id: "eq." + clientId,
          paid_at: "gte." + monthStart,
          select: "amount,paid_at",
        },
        PAGE_SIZE,
        MAX_ROWS,
      );
      for (const p of Array.isArray(payments) ? payments : []) {
        const d = new Date(p.paid_at || "");
        if (!Number.isNaN(d.getTime()) && d.getTime() < new Date(monthEnd).getTime()) {
          totalPaymentsThisMonth += Number(p.amount) || 0;
        }
      }
    } catch {
      // payments table may not exist yet
    }

    // ── 3. Overdue amounts (unpaid/partial quotations older than 30 days) ──
    let overdueAmount = 0;
    let overdueCount = 0;
    try {
      const { rows: overdueQuotes } = await supaGetAllPaged(
        "quotations",
        {
          client_id: "eq." + clientId,
          deleted: "eq.false",
          or: "(payment_status.eq.unpaid,payment_status.eq.partial)",
          created_at: "lte." + thirtyDaysAgo,
          select: "id,amount_paid,grand_total",
        },
        PAGE_SIZE,
        MAX_ROWS,
      );

      // Fetch grand totals from quotation_money for accurate balance
      const quoteIds = (Array.isArray(overdueQuotes) ? overdueQuotes : []).map(
        (q: any) => q.id,
      );
      const moneyMap = new Map<string, number>();
      if (quoteIds.length > 0) {
        try {
          const { rows: moneyRows } = await supaGetAllPaged(
            "quotation_money",
            {
              client_id: "eq." + clientId,
              select: "id,grand_total",
            },
            PAGE_SIZE,
            MAX_ROWS,
          );
          for (const m of Array.isArray(moneyRows) ? moneyRows : []) {
            moneyMap.set(m.id, Number(m.grand_total) || 0);
          }
        } catch {
          // fallback: use quote.grand_total if quotation_money unavailable
        }
      }

      for (const q of Array.isArray(overdueQuotes) ? overdueQuotes : []) {
        const grand = moneyMap.get(q.id) ?? Number(q.grand_total) ?? 0;
        const paid = Number(q.amount_paid) || 0;
        const balance = grand - paid;
        if (balance > 0) {
          overdueAmount += balance;
          overdueCount += 1;
        }
      }
    } catch {
      // Quotations table may have missing columns
    }

    // ── 4. Recent stock movements (last 5) ─────────────────────────────
    let recentStockMovements: any[] = [];
    try {
      const rows = await supaGet("stock_movements", {
        client_id: "eq." + clientId,
        select: "id,product_name,movement_type,quantity,note,actor,created_at",
        order: "created_at.desc,id.desc",
        limit: 5,
      });
      recentStockMovements = Array.isArray(rows) ? rows : [];
    } catch {
      // stock_movements table may not exist yet
    }

    // ── 5. GST collected this month ────────────────────────────────────
    let gstCollectedThisMonth = 0;
    try {
      const { rows: monthQuotes } = await supaGetAllPaged(
        "quotations",
        {
          client_id: "eq." + clientId,
          deleted: "eq.false",
          created_at: "gte." + monthStart,
          select: "id,include_gst,gst_percentage,measured_items,unmeasured_items",
        },
        PAGE_SIZE,
        MAX_ROWS,
      );

      // Import quotationTotals for accurate GST calculation
      const { quotationTotals } = await import("@/lib/pricing");
      for (const q of Array.isArray(monthQuotes) ? monthQuotes : []) {
        const d = new Date(q.created_at || "");
        if (!Number.isNaN(d.getTime()) && d < new Date(monthEnd)) {
          const t = quotationTotals(q, q.measured_items, q.unmeasured_items);
          gstCollectedThisMonth += t.gstAmount;
        }
      }
    } catch {
      // If pricing or quotations table has issues, report 0
    }

    return consoleJson({
      totalProducts: totalProducts >= 0 ? totalProducts : 0,
      lowStockCount,
      totalPaymentsThisMonth: r2(totalPaymentsThisMonth),
      overdueAmount: r2(overdueAmount),
      overdueCount,
      recentStockMovements,
      gstCollectedThisMonth: r2(gstCollectedThisMonth),
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
