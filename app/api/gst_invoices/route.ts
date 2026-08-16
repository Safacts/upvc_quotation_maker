import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPost, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";
import { requireTier } from "@/lib/tiers";
import { computeGstTotals, gstItemTaxableValue } from "@/lib/gst-calculations";
import { amountInWords } from "@/lib/gst-invoice-pdf";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return json({ error: "Unauthorized" }, 401);
    }
    
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    // Tenant is DERIVED from the signed cookie for customers. The old code read
    // it from searchParams and only compared it when role === "customer", so a
    // self-issued `signup` session read any tenant's invoices. See src/lib/tenant.ts.
    const t = resolveTenant(session, request.nextUrl.searchParams.get("client_id"));
    if (!t.ok) return json({ error: t.error }, t.status);
    const clientId = t.clientId;

    // TIER GATE — GST invoicing is included from Rs.25,000 `base` upward.
    if (!t.isAdmin) {
      const paid = await requireTier(clientId, "invoicing");
      if (!paid.ok) return paid.error;
    }

    const invoices = await supaGet("gst_invoices", {
      client_id: "eq." + clientId,
      select: "*",
      order: "created_at.desc",
    });

    return json({ invoices: Array.isArray(invoices) ? invoices : [] });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return json({ error: "Unauthorized" }, 401);
    }
    
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const p = await request.json();
    const t = resolveTenant(session, p.client_id);
    if (!t.ok) return json({ error: t.error }, t.status);
    const clientId = t.clientId;

    // TIER GATE — GST invoicing is included from Rs.25,000 `base` upward.
    if (!t.isAdmin) {
      const paid = await requireTier(clientId, "invoicing");
      if (!paid.ok) return paid.error;
    }

    const items: any[] = Array.isArray(p.items) ? p.items : [];

    // GAP 4: Server-side recompute — never trust client-supplied tax amounts.
    // Recompute all tax figures from items + transport + rates + states.
    const computed = computeGstTotals({
      items,
      transportCost: p.transport_cost,
      cgstRate: p.cgst_rate,
      sgstRate: p.sgst_rate,
      isInterstate: p.is_interstate,
      supplierState: p.supplier_state,
      buyerState: p.buyer_state,
    });

    const invoiceBody: Record<string, any> = {
      client_id: clientId,
      invoice_number: p.invoice_number || null,
      invoice_date: p.invoice_date || null,
      supplier_company_name: p.supplier_company_name || null,
      supplier_address: p.supplier_address || null,
      supplier_gstin: p.supplier_gstin || null,
      supplier_state: p.supplier_state || null,
      supplier_state_code: p.supplier_state_code || null,
      buyer_name: p.buyer_name || null,
      buyer_address: p.buyer_address || null,
      buyer_gstin: p.buyer_gstin || null,
      buyer_state: p.buyer_state || null,
      buyer_state_code: p.buyer_state_code || null,
      place_of_supply: p.place_of_supply || null,
      place_of_supply_code: p.place_of_supply_code || null,
      is_interstate: computed.isInterstate,
      is_reverse_charge: p.is_reverse_charge ?? false,
      source_quotation_id: p.source_quotation_id || null,
      transport_cost: computed.transportCost,
      // --- Server-computed values (overwrite client-supplied) ---
      subtotal: computed.subtotal,
      taxable_value: computed.taxableValue,
      cgst_rate: computed.cgstRate,
      sgst_rate: computed.sgstRate,
      igst_rate: computed.igstRate,
      cgst_amount: computed.cgstAmount,
      sgst_amount: computed.sgstAmount,
      igst_amount: computed.igstAmount,
      grand_total: computed.grandTotal,
      amount_in_words: amountInWords(computed.grandTotal),
      notes: p.notes || null,
      status: p.status || "draft",
    };

    const inserted = await supaPost("gst_invoices", invoiceBody);
    const invoice = Array.isArray(inserted) ? inserted[0] : inserted;
    const invoiceId = invoice?.id;

    if (invoiceId && items.length > 0) {
      const itemRows = items.map((item, idx) => ({
        invoice_id: invoiceId,
        client_id: clientId,
        sno: item.sno ?? idx + 1,
        hsn_code: item.hsn_code || null,
        description: item.description || null,
          quantity: item.quantity ?? 0,
          unit: item.unit || null,
          rate: item.rate ?? 0,
          taxable_value: gstItemTaxableValue(item),
      }));
      await supaPost("gst_invoice_items", itemRows);
    }

    return json({ success: true, invoice }, 201);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
