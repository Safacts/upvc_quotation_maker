import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPost, isServiceKeyConfigured } from "@/lib/supabase";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const clientId = request.nextUrl.searchParams.get("client_id");
    if (!clientId) return json({ error: "missing client_id" }, 400);

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
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const p = await request.json();
    const clientId = p.client_id || "";
    if (!clientId) return json({ error: "missing client_id" }, 400);

    const items: any[] = Array.isArray(p.items) ? p.items : [];

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
      is_interstate: p.is_interstate ?? false,
      is_reverse_charge: p.is_reverse_charge ?? false,
      source_quotation_id: p.source_quotation_id || null,
      transport_cost: p.transport_cost ?? 0,
      subtotal: p.subtotal ?? 0,
      taxable_value: p.taxable_value ?? 0,
      cgst_rate: p.cgst_rate ?? 0,
      sgst_rate: p.sgst_rate ?? 0,
      igst_rate: p.igst_rate ?? 0,
      cgst_amount: p.cgst_amount ?? 0,
      sgst_amount: p.sgst_amount ?? 0,
      igst_amount: p.igst_amount ?? 0,
      grand_total: p.grand_total ?? 0,
      amount_in_words: p.amount_in_words || null,
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
        taxable_value: item.taxable_value ?? 0,
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
