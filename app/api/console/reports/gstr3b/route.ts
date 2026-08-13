import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGetAllPaged } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/reports/gstr3b — GSTR-3B monthly summary.
 *
 * Aggregates outward supplies from quotation_money (won quotations) for a given
 * month. Supports ?from= and ?to= date filters (YYYY-MM-DD).
 * Default: last 30 days.
 */

const MAX_ROWS = 5000;
const PAGE_SIZE = 500;

const DEFAULT_WINDOW_DAYS = 30;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolveRange(from: string, to: string): { from: string; to: string } {
  if (from && to) return { from, to };
  const now = new Date();
  if (!from && !to) {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - DEFAULT_WINDOW_DAYS);
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
  start.setUTCDate(start.getUTCDate() - DEFAULT_WINDOW_DAYS);
  return { from: isoDay(start), to };
}

function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

const dateParam = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ?? "").toString().trim())
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "Date must be YYYY-MM-DD",
  });

const querySchema = z.object({
  from: dateParam.optional().default(""),
  to: dateParam.optional().default(""),
});

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const range = resolveRange(parsed.data.from, parsed.data.to);

    // Fetch won quotations in the period
    const { rows: quotes, truncated } = await supaGetAllPaged(
      "quotation_money",
      {
        client_id: "eq." + gate.clientId,
        and: `(date.gte.${range.from},date.lt.${range.to})`,
        status: "eq.won",
        select: "id,date,customer_name,net_total,gst_percentage,gst_amount,grand_total",
        order: "date.asc",
      },
      PAGE_SIZE,
      MAX_ROWS,
    );

    const n = (v: unknown) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };

    const list = (Array.isArray(quotes) ? quotes : []).map((r: any) => ({
      date: r.date || "",
      customer_name: r.customer_name || "",
      net_total: r2(n(r.net_total)),
      gst_percentage: r2(n(r.gst_percentage)),
      gst_amount: r2(n(r.gst_amount)),
      grand_total: r2(n(r.grand_total)),
    }));

    // Aggregate for GSTR-3B
    let totalTaxable = 0;
    let totalGst = 0;
    let totalGrand = 0;

    for (const row of list) {
      totalTaxable += row.net_total;
      totalGst += row.gst_amount;
      totalGrand += row.grand_total;
    }

    // Split GST into CGST + SGST (intra-state, 50/50) — this is the standard
    // default for Telangana. IGST would need state-code comparison.
    const totalCgst = r2(totalGst / 2);
    const totalSgst = r2(totalGst / 2);

    return consoleJson({
      report: "gstr3b",
      from: range.from,
      to: range.to,
      generated_at: new Date().toISOString(),
      outward_supplies: {
        rows: list,
        summary: {
          invoice_count: list.length,
          total_taxable: r2(totalTaxable),
          total_cgst: totalCgst,
          total_sgst: totalSgst,
          total_igst: 0,
          total_gst: r2(totalGst),
          total_grand: r2(totalGrand),
        },
      },
      truncated,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
