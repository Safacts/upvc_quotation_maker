import { NextRequest, NextResponse } from "next/server";
import { supaPost } from "@/lib/supabase";

export async function GET() {
  return NextResponse.json({ reviews: [] });
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const reviewText = typeof body.reviewText === "string" ? body.reviewText.trim() : "";
    const rating = body.rating;

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });
    }
    if (customerName.length < 1 || customerName.length > 100) {
      return NextResponse.json(
        { ok: false, error: "customerName must be between 1 and 100 characters" },
        { status: 400 },
      );
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false, error: "rating must be an integer between 1 and 5" },
        { status: 400 },
      );
    }
    if (reviewText.length < 1 || reviewText.length > 1000) {
      return NextResponse.json(
        { ok: false, error: "reviewText must be between 1 and 1000 characters" },
        { status: 400 },
      );
    }

    const newRows = await supaPost("service_reviews", {
      client_id: clientId,
      customer_name: customerName,
      role: role || null,
      rating,
      review_text: reviewText,
      source: typeof body.source === "string" && body.source ? body.source : "quote-link",
    });
    return NextResponse.json({ ok: true, review: newRows[0] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
