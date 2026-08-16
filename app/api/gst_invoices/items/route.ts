import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPost, supaDelete, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";
import { requireTier } from "@/lib/tiers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    // AUTH GATE. This route writes with the service-role key, which bypasses RLS,
    // so this check IS the tenant boundary — there is no database-level net below
    // it. Commit e494019 patched the sibling gst_invoices routes but missed this
    // one, leaving an unauthenticated, CORS-wildcarded write into a financial
    // table. Do not remove.
    const session = await getSession();
    if (!session) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const p = await request.json();
    const invoiceId = p.invoice_id || "";
    if (!invoiceId) return json({ error: "missing invoice_id" }, 400);

    // The tenant is taken from the signed HttpOnly cookie for customers, NEVER
    // from the request body. A body-supplied client_id is accepted only for
    // admins (who legitimately act across tenants) and is otherwise ignored.
    const t = resolveTenant(session, p.client_id);
    if (!t.ok) return json({ error: t.error }, t.status);
    const clientId = t.clientId;

    // Ownership check on the PARENT invoice. Without this, a legitimately
    // logged-in tenant could pass their own client_id together with another
    // tenant's invoice_id and graft line items onto that invoice — the rows
    // would look correctly scoped while corrupting a stranger's tax document.
    const parent = await supaGet("gst_invoices", {
      id: "eq." + invoiceId,
      select: "id,client_id",
      limit: 1,
    });
    if (!Array.isArray(parent) || parent.length === 0) {
      return json({ error: "invoice not found" }, 404);
    }
    if (parent[0].client_id !== clientId) {
      return json({ error: "Forbidden" }, 403);
    }

    // TIER GATE — GST invoicing is included from Rs.25,000 `base` upward.
    //
    // Checked AFTER the parent-ownership check so a 402 can never be used to
    // probe whether another tenant's invoice_id exists.
    if (!t.isAdmin) {
      const paid = await requireTier(clientId, "invoicing");
      if (!paid.ok) return paid.error;
    }

    const items: any[] = Array.isArray(p.items) ? p.items : [];
    if (items.length === 0) return json({ error: "no items provided" }, 400);

    const itemRows = items.map((item, idx) => ({
      invoice_id: invoiceId,
      // Always the verified tenant, never the caller's claim.
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
