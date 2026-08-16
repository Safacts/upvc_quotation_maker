import { NextRequest, NextResponse } from "next/server";
import {
  supaGet,
  supaPost,
  supaPatch,
  supaDelete,
  isServiceKeyConfigured,
} from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { authorizeOwnedTenant } from "@/lib/tenant";
import { requireTier } from "@/lib/tiers";
import { computeGstTotals, gstItemTaxableValue } from "@/lib/gst-calculations";
import { amountInWords } from "@/lib/gst-invoice-pdf";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * TIER GATE — GST invoicing is included from Rs.25,000 `base` upward.
 *
 * Always call this AFTER `authorizeOwnedTenant()`, never before: reversing the
 * order turns the route into an oracle, because a caller could tell "that
 * invoice id exists but belongs to someone else" (403) apart from "your plan is
 * too low" (402) and enumerate other tenants' invoice ids.
 *
 * Admins are exempt — an admin acting cross-tenant is us doing support, not a
 * customer consuming a feature.
 *
 * Returns the denial response, or null when the caller may proceed. The 402
 * body is re-wrapped through `json()` so it picks up this route's CORS headers;
 * `requireTier`'s own response carries none, and the Flutter build calls these
 * endpoints cross-origin, so a bare 402 would surface as a network error rather
 * than an upgrade prompt.
 */
async function gateInvoicing(auth: { isAdmin?: boolean; clientId?: string }) {
  if (auth.isAdmin) return null;
  const paid = await requireTier(auth.clientId, "invoicing");
  if (paid.ok) return null;
  return json(await paid.error.json(), paid.error.status);
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
    
    // Ownership, not just comparison: a `signup` role holds no tenant and is
    // rejected here rather than falling through the old customer-only check.
    const auth = authorizeOwnedTenant(session, rows[0].client_id);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const denied = await gateInvoicing(auth);
    if (denied) return denied;

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

    // Fetch the FULL existing row (not just client_id) so we can recompute
    // tax amounts server-side from the persisted state when the client
    // does not resend every field.
    const existingRows = await supaGet("gst_invoices", { id: "eq." + id, select: "*" });
    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      return json({ error: "not found" }, 404);
    }
    const existing = existingRows[0];

    // Ownership, not just comparison: a `signup` role holds no tenant and is
    // rejected here rather than falling through the old customer-only check.
    const auth = authorizeOwnedTenant(session, existing.client_id);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const denied = await gateInvoicing(auth);
    if (denied) return denied;

    // The verified owner of this invoice. Child rows are re-stamped with THIS,
    // never with anything the caller sent.
    const ownerClientId = auth.clientId;

    // Merge: client input takes precedence for recompute-relevant fields,
    // existing persisted values serve as fallback.
    const mergedSupplierState = p.supplier_state || existing.supplier_state;
    const mergedBuyerState = p.buyer_state || existing.buyer_state;
    const mergedTransport = p.transport_cost !== undefined ? p.transport_cost : existing.transport_cost;
    const mergedCgstRate = p.cgst_rate !== undefined ? p.cgst_rate : existing.cgst_rate;
    const mergedSgstRate = p.sgst_rate !== undefined ? p.sgst_rate : existing.sgst_rate;

    // Items for recompute: client-supplied if present, otherwise fetch the
    // existing line items from the database so totals stay correct even when
    // the caller only patches header fields.
    let recomputeItems: any[] = Array.isArray(p.items) ? p.items : [];
    if (!Array.isArray(p.items)) {
      const existingItems = await supaGet("gst_invoice_items", {
        invoice_id: "eq." + id,
        client_id: "eq." + ownerClientId,
        select: "*",
        order: "sno.asc",
      });
      recomputeItems = Array.isArray(existingItems) ? existingItems : [];
    }

    // GAP 4: Server-side recompute — never trust client-supplied tax amounts.
    const computed = computeGstTotals({
      items: recomputeItems,
      transportCost: mergedTransport,
      cgstRate: mergedCgstRate,
      sgstRate: mergedSgstRate,
      isInterstate: p.is_interstate,
      supplierState: mergedSupplierState,
      buyerState: mergedBuyerState,
    });

    const updateBody: Record<string, any> = {};
    const fields = [
      "invoice_number", "invoice_date", "supplier_company_name",
      "supplier_address", "supplier_gstin", "supplier_state",
      "supplier_state_code", "buyer_name", "buyer_address",
      "buyer_gstin", "buyer_state", "buyer_state_code",
      "place_of_supply", "place_of_supply_code", "is_reverse_charge",
      "source_quotation_id", "notes", "status",
    ];

    for (const f of fields) {
      if (p[f] !== undefined) updateBody[f] = p[f];
    }

    // --- Server-computed values (overwrite client-supplied) ---
    updateBody.transport_cost = computed.transportCost;
    updateBody.subtotal = computed.subtotal;
    updateBody.taxable_value = computed.taxableValue;
    updateBody.cgst_rate = computed.cgstRate;
    updateBody.sgst_rate = computed.sgstRate;
    updateBody.igst_rate = computed.igstRate;
    updateBody.cgst_amount = computed.cgstAmount;
    updateBody.sgst_amount = computed.sgstAmount;
    updateBody.igst_amount = computed.igstAmount;
    updateBody.grand_total = computed.grandTotal;
    updateBody.is_interstate = computed.isInterstate;
    updateBody.amount_in_words = amountInWords(computed.grandTotal);

    if (Object.keys(updateBody).length > 0) {
      await supaPatch("gst_invoices", { id: "eq." + id }, updateBody);
    }

    if (Array.isArray(p.items)) {
      await supaDelete("gst_invoice_items", { invoice_id: "eq." + id });
      if (p.items.length > 0) {
        const itemRows = p.items.map((item: any, idx: number) => ({
          invoice_id: id,
          // Always the tenant VERIFIED against the stored parent row above.
          // Previously `p.client_id || null` — a body-supplied value. That let a
          // caller stamp child rows with a foreign tenant, or with NULL, which
          // orphans them from every `client_id=eq.` filter and silently corrupts
          // a tax document that must stay auditable.
          client_id: ownerClientId,
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
    const auth = authorizeOwnedTenant(session, existingRows[0].client_id);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const denied = await gateInvoicing(auth);
    if (denied) return denied;

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
