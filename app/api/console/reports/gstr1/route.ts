import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGetAllPaged } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/reports/gstr1 — GSTR-1 report for GST filing.
 *
 * Combines B2B invoices (from gst_invoices) and B2C data (from quotation_money
 * for invoices without GST registration) into a GSTR-1 format.
 *
 * Supports ?from= and ?to= date filters (YYYY-MM-DD).
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
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const range = resolveRange(parsed.data.from, parsed.data.to);

    // --- B2B: invoices from gst_invoices ---
    const { rows: gstRows, truncated: gstTruncated } = await supaGetAllPaged(
      "gst_invoices",
      {
        client_id: "eq." + gate.clientId,
        and: `(invoice_date.gte.${range.from},invoice_date.lt.${range.to})`,
        status: "neq.cancelled",
        select:
          "invoice_number,invoice_date,buyer_name,buyer_gstin,buyer_state_code," +
          "place_of_supply_code,is_interstate,taxable_value," +
          "cgst_rate,sgst_rate,igst_rate," +
          "cgst_amount,sgst_amount,igst_amount,grand_total",
        order: "invoice_date.asc,invoice_number.asc",
      },
      PAGE_SIZE,
      MAX_ROWS,
    );

    // --- B2C: from quotation_money (won quotations without GST invoices) ---
    const { rows: quoteRows, truncated: quoteTruncated } = await supaGetAllPaged(
      "quotation_money",
      {
        client_id: "eq." + gate.clientId,
        and: `(date.gte.${range.from},date.lt.${range.to})`,
        status: "eq.won",
        select:
          "quote_no,date,customer_name,net_total,gst_percentage,gst_amount,grand_total",
        order: "date.asc",
      },
      PAGE_SIZE,
      MAX_ROWS,
    );

    const n = (v: unknown) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };

    // Build B2B section
    const b2bRows = (Array.isArray(gstRows) ? gstRows : []).map((r: any) => ({
      invoice_number: r.invoice_number || "",
      invoice_date: r.invoice_date || "",
      buyer_name: r.buyer_name || "",
      buyer_gstin: r.buyer_gstin || "",
      buyer_state_code: r.buyer_state_code || "",
      place_of_supply_code: r.place_of_supply_code || "",
      is_interstate: r.is_interstate || false,
      taxable_value: r2(n(r.taxable_value)),
      cgst_rate: r2(n(r.cgst_rate)),
      sgst_rate: r2(n(r.sgst_rate)),
      igst_rate: r2(n(r.igst_rate)),
      cgst_amount: r2(n(r.cgst_amount)),
      sgst_amount: r2(n(r.sgst_amount)),
      igst_amount: r2(n(r.igst_amount)),
      grand_total: r2(n(r.grand_total)),
    }));

    // Build B2C section (quotations that don't have a GST invoice)
    const b2cRows = (Array.isArray(quoteRows) ? quoteRows : []).map((r: any) => ({
      quote_no: r.quote_no || "",
      date: r.date || "",
      customer_name: r.customer_name || "",
      taxable_value: r2(n(r.net_total)),
      gst_percentage: r2(n(r.gst_percentage)),
      gst_amount: r2(n(r.gst_amount)),
      grand_total: r2(n(r.grand_total)),
    }));

    // Summaries
    const b2bSummary = b2bRows.reduce(
      (acc, r) => ({
        count: acc.count + 1,
        taxable: acc.taxable + r.taxable_value,
        cgst: acc.cgst + r.cgst_amount,
        sgst: acc.sgst + r.sgst_amount,
        igst: acc.igst + r.igst_amount,
        total: acc.total + r.grand_total,
      }),
      { count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
    );

    const b2cSummary = b2cRows.reduce(
      (acc, r) => ({
        count: acc.count + 1,
        taxable: acc.taxable + r.taxable_value,
        gst: acc.gst + r.gst_amount,
        total: acc.total + r.grand_total,
      }),
      { count: 0, taxable: 0, gst: 0, total: 0 },
    );

    return consoleJson({
      report: "gstr1",
      from: range.from,
      to: range.to,
      generated_at: new Date().toISOString(),
      b2b: {
        rows: b2bRows,
        summary: {
          invoice_count: b2bSummary.count,
          total_taxable: r2(b2bSummary.taxable),
          total_cgst: r2(b2bSummary.cgst),
          total_sgst: r2(b2bSummary.sgst),
          total_igst: r2(b2bSummary.igst),
          total_grand: r2(b2bSummary.total),
        },
      },
      b2c: {
        rows: b2cRows,
        summary: {
          invoice_count: b2cSummary.count,
          total_taxable: r2(b2cSummary.taxable),
          total_gst: r2(b2cSummary.gst),
          total_grand: r2(b2cSummary.total),
        },
      },
      truncated: gstTruncated || quoteTruncated,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
