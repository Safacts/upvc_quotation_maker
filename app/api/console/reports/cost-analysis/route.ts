import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaGetAllPaged } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;
const PAGE_SIZE = 500;

const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length <= max, { message: `Must be ${max} characters or fewer` });

const dateParam = text(10).refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
  message: "Date must be YYYY-MM-DD",
});

const querySchema = z.object({
  from: dateParam.optional().default(""),
  to: dateParam.optional().default(""),
  status: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim().toLowerCase())
    .optional(),
});

function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? r2((part / whole) * 100) : 0;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolveRange(from: string, to: string): { from: string; to: string } {
  if (from && to) return { from, to };
  const now = new Date();
  if (!from && !to) {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 90);
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + 1);
    return { from: isoDay(start), to: isoDay(end) };
  }
  if (from && !to) {
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + 1);
    return { from, to: isoDay(end) };
  }
  const end = new Date(`${to}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  return { from: isoDay(start), to };
}

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

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { from, to, status } = parsed.data;
    const range = resolveRange(from, to);

    const orderFilters: Record<string, string> = {
      ...dateFilters("created_at", range.from, range.to),
    };
    if (status) {
      orderFilters.status = "eq." + status;
    }

    const { rows: orderRows, truncated } = await supaGetAllPaged(
      "orders",
      {
        client_id: "eq." + clientId,
        ...orderFilters,
        select: "id,order_number,status,total_amount,paid_amount,created_at",
        order: "created_at.asc,id.asc",
      },
      PAGE_SIZE,
      MAX_ROWS,
    );

    const orders = Array.isArray(orderRows) ? orderRows : [];
    const orderIds = orders.map((o: any) => o.id).filter(Boolean);

    let projectMap: Record<string, any> = {};

    if (orderIds.length) {
      try {
        const { rows: projectRows } = await supaGetAllPaged(
          "projects",
          {
            order_id: "in.(" + orderIds.join(",") + ")",
            client_id: "eq." + clientId,
            select: "id,order_id,budget,actual_cost,progress,status",
            order: "id.asc",
          },
          PAGE_SIZE,
          MAX_ROWS,
        );
        if (Array.isArray(projectRows)) {
          for (const p of projectRows) {
            if (p.order_id) projectMap[p.order_id] = p;
          }
        }
      } catch {}
    }

    let totalRevenue = 0;
    let totalCost = 0;
    let totalPaid = 0;

    const rows = orders.map((order: any) => {
      const revenue = n(order.total_amount);
      const paid = n(order.paid_amount);
      const project = projectMap[order.id] || null;
      const budget = project ? n(project.budget) : 0;
      const actualCost = project ? n(project.actual_cost) : 0;
      const profit = revenue - actualCost;
      const margin = revenue > 0 ? pct(profit, revenue) : 0;
      const budgetVariance = budget > 0 ? pct(actualCost, budget) : 0;

      totalRevenue += revenue;
      totalCost += actualCost;
      totalPaid += paid;

      return {
        order_id: order.id,
        order_number: order.order_number || "",
        status: order.status || "",
        date: (order.created_at || "").slice(0, 10),
        revenue: r2(revenue),
        paid: r2(paid),
        budget: r2(budget),
        actual_cost: r2(actualCost),
        profit: r2(profit),
        margin_pct: margin,
        budget_variance_pct: budgetVariance,
        has_project: !!project,
        project_status: project?.status || null,
        progress: project?.progress ?? null,
      };
    });

    const totalProfit = totalRevenue - totalCost;

    return consoleJson({
      from: range.from,
      to: range.to,
      generated_at: new Date().toISOString(),
      truncated,
      scanned_count: rows.length,
      rows,
      summary: {
        total_orders: rows.length,
        total_revenue: r2(totalRevenue),
        total_cost: r2(totalCost),
        total_profit: r2(totalProfit),
        overall_margin_pct: pct(totalProfit, totalRevenue),
        total_paid: r2(totalPaid),
        total_outstanding: r2(totalRevenue - totalPaid),
        orders_with_projects: rows.filter((r: any) => r.has_project).length,
        orders_without_projects: rows.filter((r: any) => !r.has_project).length,
      },
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
