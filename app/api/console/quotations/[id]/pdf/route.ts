import { NextRequest, NextResponse } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet } from "@/lib/supabase";
import { quotationTotals } from "@/lib/pricing";
import { buildQuotationPdf, type QuotationPdfData } from "@/lib/quotation-pdf";
import type { ClientConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/quotations/[id]/pdf — generate the uPVC quotation PDF.
 *
 * Returns the customer-facing PDF as a binary download. The document is
 * generated server-side from the SAME `src/lib/pricing.ts` the editor and the
 * Flutter app use, so the numbers match the on-screen preview exactly.
 *
 * Ownership is enforced by the `[id]` GET route we delegate the fetch to — we
 * read the row by primary key AND client_id, so a cross-tenant id returns 404
 * (never a 403 that would confirm the id exists for someone else).
 */

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGet("quotations", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select:
        "id,quote_no,date,customer_name,contact_no,email,address,reference," +
        "supplier_company,transport_cost,include_gst,gst_percentage,status," +
        "measured_items(id,code,description,glass,width,height,units,rate)," +
        "unmeasured_items(id,description,units,rate)",
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const q = rows[0];

    // Tenant branding for the header / footer blocks.
    const clientId = gate.clientId;
    const clients = await supaGet("clients", {
      id: "eq." + clientId,
      select: "config",
      limit: 1,
    });
    const config: ClientConfig = (Array.isArray(clients) && clients[0]?.config)
      ? (typeof clients[0].config === "string"
        ? JSON.parse(clients[0].config)
        : clients[0].config)
      : { clientId } as any;

    const measured = (q.measured_items || []).map((m: any) => ({
      code: String(m.code || ""),
      description: String(m.description || ""),
      glass: String(m.glass || ""),
      width: num(m.width),
      height: num(m.height),
      units: num(m.units, 1),
      rate: num(m.rate),
    }));
    const unmeasured = (q.unmeasured_items || []).map((u: any) => ({
      description: String(u.description || ""),
      units: num(u.units, 1),
      rate: num(u.rate),
    }));

    const totals = quotationTotals(q, measured, unmeasured);

    const pdfData: QuotationPdfData = {
      quoteNo: String(q.quote_no || ""),
      date: q.date || q.created_at || new Date(),
      customerName: String(q.customer_name || ""),
      contactNo: String(q.contact_no || ""),
      email: String(q.email || ""),
      address: String(q.address || ""),
      reference: String(q.reference || ""),
      supplierCompany: String(q.supplier_company || ""),
      measured,
      unmeasured,
      totals,
      clientId: String(clientId || ""),
      companyName: String(config.companyName || config.appName || clientId),
      companyAddress: String(config.companyAddress || ""),
      companyProprietor: String(config.companyProprietor || ""),
      companyContact: String(config.companyContact || ""),
      gstNumber: String(config.gstNumber || ""),
      bankName: String(config.bankName || ""),
      bankBranch: String(config.bankBranch || ""),
      bankAccountNo: String(config.bankAccountNo || ""),
      bankIfsc: String(config.bankIfsc || ""),
      termsAndConditions: Array.isArray(config.termsAndConditions)
        ? config.termsAndConditions.map(String)
        : [],
      logoUrl: String(config.invoiceTopLogoUrl || config.logoUrl || ""),
      watermarkUrl: String(config.invoiceBackgroundLogoUrl || config.logoUrl || ""),
    };

    const bytes = await buildQuotationPdf(pdfData);

    const filename = `quotation_${q.quote_no || id}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
