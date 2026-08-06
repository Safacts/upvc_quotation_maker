import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPatch, supaDelete } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  if (!clientId || !clientId.trim()) {
    return NextResponse.json({ reviews: [] });
  }
  const rows = await supaGet("service_reviews", {
    select: "id,customer_name,role,rating,review_text,is_visible,source,created_at",
    client_id: "eq." + clientId,
    order: "created_at.desc",
  });
  return NextResponse.json({ reviews: rows });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  if (!clientId || !clientId.trim()) {
    return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }

  const update: Record<string, any> = {};
  if (typeof body.customerName === "string") {
    const v = body.customerName.trim();
    if (v.length < 1 || v.length > 100) {
      return NextResponse.json({ ok: false, error: "customerName must be 1-100 chars" }, { status: 400 });
    }
    update.customer_name = v;
  }
  if (typeof body.role === "string") {
    update.role = body.role.trim() || null;
  }
  if (typeof body.reviewText === "string") {
    const v = body.reviewText.trim();
    if (v.length < 1 || v.length > 1000) {
      return NextResponse.json({ ok: false, error: "reviewText must be 1-1000 chars" }, { status: 400 });
    }
    update.review_text = v;
  }
  if (typeof body.rating === "number") {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      return NextResponse.json({ ok: false, error: "rating must be 1-5" }, { status: 400 });
    }
    update.rating = body.rating;
  }
  if (typeof body.isVisible === "boolean") {
    update.is_visible = body.isVisible;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }

  const rows = await supaPatch(
    "service_reviews",
    { id: "eq." + id, client_id: "eq." + clientId },
    update,
  );
  return NextResponse.json({ ok: true, review: rows[0] });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  if (!clientId || !clientId.trim()) {
    return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const id = body.id;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }

  await supaDelete("service_reviews", {
    id: "eq." + id,
    client_id: "eq." + clientId,
  });
  return NextResponse.json({ ok: true });
}
