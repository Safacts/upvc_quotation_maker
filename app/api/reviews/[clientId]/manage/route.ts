import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPatch, supaDelete } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Tenant guard for the review MANAGEMENT surface.
 *
 * This route is the owner-facing moderation API: it exposes hidden reviews and
 * allows edit/delete. The public, read-only feed lives at
 * `/api/reviews/[clientId]` — that one is meant to be anonymous, this one is NOT.
 *
 * `clientId` arrives in the URL PATH, which is entirely attacker-controlled, and
 * every write below goes through the service-role key (RLS bypassed). Until
 * 08-08-2026 there was no session check here at all, so any anonymous caller
 * could enumerate, rewrite or delete any tenant's testimonials just by putting a
 * different slug in the URL. This function is that missing boundary.
 *
 * Returns the offending NextResponse on failure, or null when the caller is
 * allowed to act on `clientId`.
 */
async function guard(clientId: string): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Admins legitimately moderate on behalf of any tenant; a customer is confined
  // to the client_id baked into their signed cookie.
  if (session.role === "customer" && session.client_id !== clientId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "customer" && session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  if (!clientId || !clientId.trim()) {
    return NextResponse.json({ reviews: [] });
  }
  // Gated: this returns is_visible=false rows the public feed deliberately hides.
  const denied = await guard(clientId);
  if (denied) return denied;
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
  const denied = await guard(clientId);
  if (denied) return denied;

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
  // BUG-FUNC-002: a PATCH for an id belonging to ANOTHER tenant matches zero rows,
  // yet this returned `{ok:true, review: undefined}` — a silent no-op reported as
  // success. Surface the miss so the UI cannot show "saved" for a write that
  // never happened.
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Review not found" }, { status: 404 });
  }
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
  const denied = await guard(clientId);
  if (denied) return denied;

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
