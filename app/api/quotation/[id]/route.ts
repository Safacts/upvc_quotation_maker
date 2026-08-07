import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-client";

const TOKEN_SECRET = process.env.QUOTE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function generateToken(quotationId: string): string {
  return createHmac("sha256", TOKEN_SECRET).update(quotationId).digest("hex").slice(0, 16);
}

function verifyToken(quotationId: string, token: string): boolean {
  if (!TOKEN_SECRET) return false;
  const expected = generateToken(quotationId);
  return expected === token;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token || !verifyToken(id, token)) {
    return NextResponse.json({ error: "Invalid or missing token" }, { status: 403 });
  }

  const { data: quotation, error } = await supabaseAdmin
    .from("quotations")
    .select("id,quote_no,date,customer_name,reference,address,contact_no,transport_cost,email,status,include_gst,gst_percentage,client_id")
    .eq("id", id)
    .single();

  if (error || !quotation) {
    return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
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
    clientConfig: client?.config || {},
    token,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token;
  if (!token || !verifyToken(id, token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const action = body.action;
  let newStatus: string | null = null;
  if (action === "approve") newStatus = "won";
  else if (action === "reject") newStatus = "lost";
  else if (action === "review") newStatus = "sent";
  else return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("quotations")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
