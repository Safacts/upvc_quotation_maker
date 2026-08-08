import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGetAllPaged } from "@/lib/supabase";
import { quotationTotals } from "@/lib/pricing";
import { formatZodError } from "@/lib/console-schemas";
import { buildTallyXml, type TallyExportConfig, DEFAULT_TALLY_CONFIG } from "@/lib/export/tally-xml";
import { toCsv, toXlsx } from "@/lib/export/spreadsheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/console/export — export a set of quotations as CSV, XLSX, or Tally XML.
 *
 * The export always works on a caller-supplied list of quotation ids — the
 * accountant picks the rows on the grid and exports exactly those. The server
 * re-validates that every id belongs to THIS tenant before including it, so the
 * id list is never trusted as a scope.
 *
 * Same-origin only: the response is a binary download, not JSON, so it bypasses
 * consoleJson(). CORS is never set on a download — a tenant's sales data must
 * not leave the browser as a world-readable response.
 */

const EXPORT_FORMATS = ["csv", "xlsx", "tally_xml"] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

const exportSchema = z.object({
  // Capped at 500 ids/request — the architecture doc's bulk rule (§5.5). A
  // larger request would page 500+ full quotations into a 10s Vercel function
  // and time out mid-write, leaving a truncated file the accountant trusts.
  ids: z.array(z.string().uuid()).min(1).max(500),
  format: z.enum(EXPORT_FORMATS),
  // Optional Tally config overrides. Validated loosely — a bad ledger name is
  // the accountant's problem to spot, not ours to reject.
  tally_config: z
    .object({
      salesLedger: z.string().max(100).optional(),
      customerLedger: z.string().max(100).optional(),
      cgstLedger: z.string().max(100).optional(),
      sgstLedger: z.string().max(100).optional(),
      igstLedger: z.string().max(100).optional(),
      cgstRate: z.number().min(0).max(100).optional(),
      sgstRate: z.number().min(0).max(100).optional(),
      igstRate: z.number().min(0).max(100).optional(),
      narration: z.string().max(500).optional(),
      voucherType: z.string().max(100).optional(),
    })
    .optional(),
});

/** Fetch the full rows for a set of ids, scoped to THIS tenant. */
async function fetchQuotations(clientId: string, ids: string[]) {
  // PostgREST `in.(...)` with a 500-element list is well within the URL limit.
  // We fetch with line items so the CSV/XLSX can include per-line detail, and
  // recompute totals via pricing.ts for the same reason every other route does.
  const { rows } = await supaGetAllPaged(
    "quotations",
    {
      client_id: "eq." + clientId, // tenant scope: from the session cookie
      id: "in.(" + ids.join(",") + ")",
      select:
        "id,quote_no,date,customer_name,contact_no,email,address,reference," +
        "supplier_company,status,transport_cost,include_gst,gst_percentage," +
        "created_at," +
        "measured_items(code,description,glass,width,height,units,rate)," +
        "unmeasured_items(description,units,rate)",
      // Preserve the caller's id order — the accountant selected them in a
      // specific sequence and the export should honour it.
      order: "created_at.asc,id.asc",
    },
    500,
    500,
  );
  return Array.isArray(rows) ? rows : [];
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalise a status for display. */
function normStatus(v: unknown): string {
  return (v ?? "draft").toString().trim().toLowerCase();
}

/** Build the flat CSV/XLSX row shape shared by both formats. */
function flattenForExport(q: any) {
  const t = quotationTotals(q, q.measured_items, q.unmeasured_items);
  return {
    quote_no: q.quote_no || "",
    date: q.date || (q.created_at || "").slice(0, 10),
    customer_name: q.customer_name || "",
    contact_no: q.contact_no || "",
    email: q.email || "",
    status: normStatus(q.status),
    company_name: q.supplier_company || "",
    subtotal: Math.round(t.subtotal * 100) / 100,
    transport: Math.round(t.transport * 100) / 100,
    net_total: Math.round(t.netTotal * 100) / 100,
    gst_percentage: t.gstPercentage,
    gst_amount: Math.round(t.gstAmount * 100) / 100,
    grand_total: Math.round(t.grandTotal * 100) / 100,
    total_sqft: Math.round(t.totalSqft * 100) / 100,
    measured_count: (q.measured_items || []).length,
    unmeasured_count: (q.unmeasured_items || []).length,
  };
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleJson({ error: "Invalid JSON" }, 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Invalid request", fields: formatZodError(parsed.error) }, 400);
    }
    const { ids, format, tally_config } = parsed.data;

    // Fetch + TENANT-REVALIDATE every id. `client_id=eq.` on the query means any
    // id owned by another tenant simply does not come back — it is silently
    // dropped, and the export contains only rows the caller actually owns.
    const rows = await fetchQuotations(clientId, ids);

    if (rows.length === 0) {
      return consoleJson({ error: "No matching quotations for export" }, 404);
    }

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      const headers = [
        "Quote No", "Date", "Customer", "Contact", "Email", "Status",
        "Subtotal", "Transport", "Net Total", "GST %", "GST Amount",
        "Grand Total", "Total Sqft", "Measured Items", "Unmeasured Items",
      ];
      const csvRows = rows.map((q) => {
        const f = flattenForExport(q);
        return [
          f.quote_no, f.date, f.customer_name, f.contact_no, f.email, f.status,
          f.subtotal, f.transport, f.net_total, f.gst_percentage, f.gst_amount,
          f.grand_total, f.total_sqft, f.measured_count, f.unmeasured_count,
        ];
      });
      const csv = toCsv(headers, csvRows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="quotations_export_${stamp}.csv"`,
          "Cache-Control": "private, no-store, max-age=0",
        },
      });
    }

    if (format === "xlsx") {
      const headers = [
        "Quote No", "Date", "Customer", "Contact", "Email", "Status",
        "Subtotal", "Transport", "Net Total", "GST %", "GST Amount",
        "Grand Total", "Total Sqft", "Measured Items", "Unmeasured Items",
      ];
      const dataRows = rows.map((q) => {
        const f = flattenForExport(q);
        return [
          f.quote_no, f.date, f.customer_name, f.contact_no, f.email, f.status,
          f.subtotal, f.transport, f.net_total, f.gst_percentage, f.gst_amount,
          f.grand_total, f.total_sqft, f.measured_count, f.unmeasured_count,
        ];
      });
      const xml = toXlsx([{ name: "Quotations", headers, rows: dataRows }]);
      return new NextResponse(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.ms-excel;charset=utf-8",
          "Content-Disposition": `attachment; filename="quotations_export_${stamp}.xls"`,
          "Cache-Control": "private, no-store, max-age=0",
        },
      });
    }

    // ---- Tally XML -----------------------------------------------------------
    const tallyRows = rows.map((q: any) => {
      const t = quotationTotals(q, q.measured_items, q.unmeasured_items);
      return {
        id: q.id,
        quote_no: q.quote_no || "",
        date: q.date || (q.created_at || "").slice(0, 10),
        customer_name: q.customer_name || "",
        net_total: t.netTotal,
        gst_amount: t.gstAmount,
        grand_total: t.grandTotal,
        include_gst: !!q.include_gst,
        gst_percentage: num(q.gst_percentage),
        transport_cost: q.transport_cost,
        company_name: q.supplier_company || "",
      };
    });

    const config: Partial<TallyExportConfig> = { ...(tally_config || {}) };
    const { xml, emitted, skipped } = buildTallyXml(tallyRows as any, config);

    const res = new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml;charset=utf-8",
        "Content-Disposition": `attachment; filename="tally_vouchers_${stamp}.xml"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Tally-Emitted": String(emitted),
        "X-Tally-Skipped": String(skipped),
      },
    });
    return res;
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
