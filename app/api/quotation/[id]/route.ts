import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-client";
import { hashQuotationToken } from "@/lib/quotation-token";


/**
 * The ONLY `clients.config` keys this PUBLIC, UNAUTHENTICATED route may emit.
 *
 * This endpoint is reachable by anyone holding a share link — i.e. every
 * customer the tenant has ever emailed a quotation to. `clients.config` is a
 * jsonb blob that also carries CREDENTIAL MATERIAL (`portalPasswordHash`, an
 * unsalted SHA-256 of the tenant's portal password) plus `supabaseAnonKey`,
 * `adminEmails` and billing/trial flags. Returning the blob wholesale handed
 * all of that to the recipient of any quote.
 *
 * This is an ALLOW-list on purpose: a deny-list (`config - 'portalPasswordHash'`)
 * silently re-leaks every sensitive key added to the blob in future. The list
 * below is exactly what `app/quote/[id]/page.tsx` renders — nothing more.
 */
const PUBLIC_CONFIG_KEYS = [
  "clientId",
  "companyName",
  "companyProprietor",
  "companyAddress",
  "companyContact",
  "companyEmail",
  "logoUrl",
  "landingPrimaryColor",
] as const;

function publicClientConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const src = config as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_CONFIG_KEYS) {
    if (src[key] !== undefined && src[key] !== null) out[key] = src[key];
  }
  return out;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Invalid or missing token" }, { status: 403 });
  }

  const { data: tokenRow } = await supabaseAdmin
    .from("quotation_share_tokens")
    .select("quotation_id")
    .eq("quotation_id", id)
    .eq("token_hash", hashQuotationToken(token))
    .gt("expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .maybeSingle();

  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  const { data: quotation, error } = await supabaseAdmin
    .from("quotations")
    .select("id,quote_no,date,customer_name,reference,address,contact_no,transport_cost,email,status,include_gst,gst_percentage,client_id,viewed_at,view_count")
    .eq("id", id)
    .single();

  if (error || !quotation) {
    return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  }

  // Record view event for the fabricator's CRM
  if (!quotation.viewed_at) {
    await supabaseAdmin
      .from("quotations")
      .update({
        viewed_at: new Date().toISOString(),
        view_count: 1,
      })
      .eq("id", id);
  } else {
    await supabaseAdmin
      .from("quotations")
      .update({
        view_count: (Number(quotation.view_count) || 1) + 1,
      })
      .eq("id", id);
  }

  const { data: measured } = await supabaseAdmin
    .from("measured_items")
    .select("code,description,width,height,units,glass,rate")
    .eq("quotation_id", id)
    .order("created_at");

  const { data: unmeasured } = await supabaseAdmin
    .from("unmeasured_items")
    .select("description,units,rate")
    .eq("quotation_id", id)
    .order("created_at");

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("config")
    .eq("id", quotation.client_id)
    .single();

  return NextResponse.json({
    quotation,
    measured: measured || [],
    unmeasured: unmeasured || [],
    clientConfig: publicClientConfig(client?.config),
    token,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token;
  if (!token) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const { data: tokenRow } = await supabaseAdmin
    .from("quotation_share_tokens")
    .select("quotation_id")
    .eq("quotation_id", id)
    .eq("token_hash", hashQuotationToken(token))
    .gt("expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .maybeSingle();

  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  const action = body.action;
  let newStatus: string | null = null;
  const now = new Date().toISOString();
  const updatePayload: Record<string, any> = {
    state_changed_at: now,
  };

  if (action === "approve") {
    newStatus = "approved";
    updatePayload.status = "approved";
    updatePayload.approved_at = now;
    updatePayload.accepted_at = now;
  } else if (action === "reject") {
    newStatus = "rejected";
    updatePayload.status = "rejected";
    updatePayload.rejected_at = now;
  } else if (action === "review") {
    newStatus = "sent";
    updatePayload.status = "sent";
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("quotations")
    .update(updatePayload)
    .eq("id", id)
    .eq("deleted", false)
    .select("id,status");

  if (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
