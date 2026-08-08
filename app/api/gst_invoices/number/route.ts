import { NextRequest, NextResponse } from "next/server";
import { supaPost, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
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
