import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supaGet, isServiceKeyConfigured } from "@/lib/supabase";
import { authorizeOwnedTenant } from "@/lib/tenant";
import { buildGstInvoicePdf, type GstInvoicePdfData } from "@/lib/gst-invoice-pdf";
import type { ClientConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gst_invoices/[id]/pdf — generate the GST invoice PDF.
 *
 * Returns the customer-facing GST invoice as a binary download. Money figures
 * are read straight from the stored row (the row already carries computed totals
 * from the Flutter app's `calculateTotals()`), so the PDF matches what was
 * invoiced.
 *
 * Same ownership model as the JSON GET route: read by primary key, verify the
 * caller may touch it, 404 on mismatch.
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
    const session = await getSession();
    if (!session) return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    if (!isServiceKeyConfigured()) return new NextResponse(JSON.stringify({ error: "no service key" }), { status: 500 });

    const { id } = await params;
    // Read the parent row by primary key. At this point we do NOT yet know the
    // owner — that is what the ownership check below establishes. The static audit
    // in tests/client-isolation.test.ts flags this read; it is the read-by-pk-then-
    // verify pattern and is listed in that test's ALLOWED table with a justification.
    const rows = await supaGet("gst_invoices", { id: "eq." + id, select: "*" });
    if (!Array.isArray(rows) || rows.length === 0) {
      return new NextResponse(JSON.stringify({ error: "not found" }), { status: 404 });
    }
    const inv = rows[0];

    const auth = authorizeOwnedTenant(session, inv.client_id);
    if (!auth.ok) return new NextResponse(JSON.stringify({ error: auth.error }), { status: auth.status });

    // Child rows carry their OWN client_id column and their own RLS policy. Even
    // though the parent's ownership was just verified above, we add client_id to
    // this query too — a service-role key bypasses RLS, so a DELETE/SELECT that
    // relies only on "the check above already covered it" can never reach another
    // tenant's rows regardless of how `id` was obtained. Defence in depth.
    const itemRows = await supaGet("gst_invoice_items", {
      invoice_id: "eq." + id,
      client_id: "eq." + inv.client_id,
      select: "*",
      order: "sno.asc",
    });
    const items = (Array.isArray(itemRows) ? itemRows : []).map((it: any) => ({
      sno: num(it.sno, 1),
      hsnCode: String(it.hsn_code || ""),
      description: String(it.description || ""),
      quantity: num(it.quantity),
      unit: String(it.unit || "SFT"),
      rate: num(it.rate),
      taxableValue: num(it.taxable_value),
    }));

    // Tenant branding.
    const clientId = inv.client_id;
    const clients = await supaGet("clients", { id: "eq." + clientId, select: "config", limit: 1 });
    const config: ClientConfig = (Array.isArray(clients) && clients[0]?.config)
      ? (typeof clients[0].config === "string" ? JSON.parse(clients[0].config) : clients[0].config)
      : { clientId } as any;

    const pdfData: GstInvoicePdfData = {
      invoiceNumber: String(inv.invoice_number || ""),
      invoiceDate: inv.invoice_date || inv.created_at || new Date(),
      placeOfSupply: String(inv.place_of_supply || ""),
      companyName: String(inv.supplier_company_name || config.companyName || config.appName || clientId),
      companyAddress: String(inv.supplier_address || config.companyAddress || ""),
      gstNumber: String(inv.supplier_gstin || config.gstNumber || ""),
      bankName: String(config.bankName || ""),
      bankBranch: String(config.bankBranch || ""),
      bankAccountNo: String(config.bankAccountNo || ""),
      bankIfsc: String(config.bankIfsc || ""),
      buyerName: String(inv.buyer_name || ""),
      buyerAddress: String(inv.buyer_address || ""),
      buyerGstin: String(inv.buyer_gstin || ""),
      buyerState: String(inv.buyer_state || ""),
      buyerStateCode: String(inv.buyer_state_code || ""),
      isInterstate: inv.is_interstate === true,
      isReverseCharge: inv.is_reverse_charge === true,
      items,
      subtotal: num(inv.subtotal),
      transportCost: num(inv.transport_cost),
      taxableValue: num(inv.taxable_value),
      cgstRate: num(inv.cgst_rate),
      sgstRate: num(inv.sgst_rate),
      igstRate: num(inv.igst_rate),
      cgstAmount: num(inv.cgst_amount),
      sgstAmount: num(inv.sgst_amount),
      igstAmount: num(inv.igst_amount),
      grandTotal: num(inv.grand_total),
      amountInWords: String(inv.amount_in_words || ""),
      notes: String(inv.notes || ""),
      termsAndConditions: Array.isArray(config.termsAndConditions)
        ? config.termsAndConditions.map(String)
        : [],
    };

    const bytes = await buildGstInvoicePdf(pdfData);
    const filename = `gst_invoice_${inv.invoice_number || id}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (e: any) {
    return new NextResponse(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
  }
}
