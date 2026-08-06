import { NextRequest, NextResponse } from "next/server";
import { supaPost, supaDelete, isServiceKeyConfigured } from "@/lib/supabase";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const p = await request.json();
    const clientId = p.client_id || "";
    const invoiceId = p.invoice_id || "";

    if (!clientId) return json({ error: "missing client_id" }, 400);
    if (!invoiceId) return json({ error: "missing invoice_id" }, 400);

    const items: any[] = Array.isArray(p.items) ? p.items : [];
    if (items.length === 0) return json({ error: "no items provided" }, 400);

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

    const inserted = await supaPost("gst_invoice_items", itemRows);

    return json({
      success: true,
      items: Array.isArray(inserted) ? inserted : itemRows,
    });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
