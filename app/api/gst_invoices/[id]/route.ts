import { NextRequest, NextResponse } from "next/server";
import {
  supaGet,
  supaPost,
  supaPatch,
  supaDelete,
  isServiceKeyConfigured,
} from "@/lib/supabase";
import { getSession } from "@/lib/session";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return json({ error: "Unauthorized" }, 401);
    }
    
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const { id } = await params;
    const rows = await supaGet("gst_invoices", {
      id: "eq." + id,
      select: "*",
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ error: "not found" }, 404);
    }
    
    if (session.role === "customer" && session.client_id !== rows[0].client_id) {
      return json({ error: "Forbidden" }, 403);
    }

    const items = await supaGet("gst_invoice_items", {
      invoice_id: "eq." + id,
      select: "*",
      order: "sno.asc",
    });

    return json({ invoice: rows[0], items: Array.isArray(items) ? items : [] });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return json({ error: "Unauthorized" }, 401);
    }
    
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const { id } = await params;
    const p = await request.json();
    
    const existingRows = await supaGet("gst_invoices", { id: "eq." + id, select: "client_id" });
    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      return json({ error: "not found" }, 404);
    }
    if (session.role === "customer" && session.client_id !== existingRows[0].client_id) {
      return json({ error: "Forbidden" }, 403);
    }
    
    const updateBody: Record<string, any> = {};
    const fields = [
      "invoice_number", "invoice_date", "supplier_company_name",
      "supplier_address", "supplier_gstin", "supplier_state",
      "supplier_state_code", "buyer_name", "buyer_address",
      "buyer_gstin", "buyer_state", "buyer_state_code",
      "place_of_supply", "place_of_supply_code", "is_interstate",
      "is_reverse_charge", "source_quotation_id", "transport_cost",
      "subtotal", "taxable_value", "cgst_rate", "sgst_rate", "igst_rate",
      "cgst_amount", "sgst_amount", "igst_amount", "grand_total",
      "amount_in_words", "notes", "status",
    ];

    for (const f of fields) {
      if (p[f] !== undefined) updateBody[f] = p[f];
    }

    if (Object.keys(updateBody).length > 0) {
      await supaPatch("gst_invoices", { id: "eq." + id }, updateBody);
    }

    if (Array.isArray(p.items)) {
      await supaDelete("gst_invoice_items", { invoice_id: "eq." + id });
      if (p.items.length > 0) {
        const itemRows = p.items.map((item: any, idx: number) => ({
          invoice_id: id,
          client_id: p.client_id || null,
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
    }

    return json({ success: true });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return json({ error: "Unauthorized" }, 401);
    }
    
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const { id } = await params;
    
    const existingRows = await supaGet("gst_invoices", { id: "eq." + id, select: "client_id" });
    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      return json({ error: "not found" }, 404);
    }
    if (session.role === "customer" && session.client_id !== existingRows[0].client_id) {
      return json({ error: "Forbidden" }, 403);
    }

    await supaDelete("gst_invoice_items", { invoice_id: "eq." + id });
    await supaDelete("gst_invoices", { id: "eq." + id });

    return json({ success: true, deleted: id });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
