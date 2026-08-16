import { NextRequest, NextResponse } from "next/server";
import { supaPost, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";
import { requireTier } from "@/lib/tiers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
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

    // Invoice numbers must be gapless and per-tenant. Letting an unauthorised
    // caller advance another tenant's counter creates permanent audit gaps.
    const t = resolveTenant(session, request.nextUrl.searchParams.get("client_id"));
    if (!t.ok) return json({ error: t.error }, t.status);
    const clientId = t.clientId;

    // TIER GATE — GST invoicing is included from Rs.25,000 `base` upward.
    //
    // This route has a SIDE EFFECT: the RPC advances a persistent per-tenant
    // counter. Gating it matters more than gating a read — an unpaid caller who
    // reached it would burn invoice numbers and leave permanent audit gaps in a
    // sequence that must stay gapless.
    if (!t.isAdmin) {
      const paid = await requireTier(clientId, "invoicing");
      if (!paid.ok) return paid.error;
    }

    const result = await supaPost("rpc/get_next_gst_invoice_number", {
      p_client_id: clientId,
    });

    const invoiceNumber =
      typeof result === "string"
        ? result
        : result?.invoice_number || result?.next_invoice_number || result;

    return json({ invoice_number: invoiceNumber });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
