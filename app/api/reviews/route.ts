import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPost } from "@/lib/supabase";
import { getCachedClients } from "@/lib/slug";

/**
 * PUBLIC, ANONYMOUS, AND DELIBERATELY UNGATED — see `./[clientId]/route.ts`.
 *
 * POST here is a CUSTOMER leaving a testimonial from a quote link. They hold no
 * session and no plan, so `requireTier()` would fail closed on every legitimate
 * submission and silently kill the review funnel for paying tenants. The tenant
 * pays for the MODERATION surface (`./[clientId]/manage`), which is gated on
 * `reviews`; collection is free because the tenant is not the caller.
 *
 * The abuse control that belongs here is the existence check below (BUG-SEC-007),
 * not a paywall.
 */
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
    const quotationNo = typeof body.quotationNo === "string" ? body.quotationNo.trim() : "";
    const rating = body.rating;

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });
    }
    // BUG-SEC-007: `clientId` came straight from an anonymous request body and was
    // inserted with the service-role key (RLS bypassed) with NO existence check.
    // A caller could create rows for a non-existent tenant, silently poisoning the
    // table, or spray testimonials at any real tenant's public page. Reviews are
    // deliberately anonymous (customers leave them from a quote link), so we cannot
    // require a session — but we CAN require the tenant to actually exist.
    const known = await getCachedClients();
    if (!Array.isArray(known) || !known.some((c: any) => c.id === clientId)) {
      return NextResponse.json({ ok: false, error: "Unknown client" }, { status: 404 });
    }
    if (customerName.length < 1 || customerName.length > 100) {
      return NextResponse.json(
        { ok: false, error: "customerName must be between 1 and 100 characters" },
        { status: 400 },
      );
    }
    if (quotationNo.length > 100) {
      return NextResponse.json(
        { ok: false, error: "quotationNo must be at most 100 characters" },
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

    if (quotationNo) {
      const existing = await supaGet("service_reviews", {
        select: "id",
        client_id: "eq." + clientId,
        quotation_no: "eq." + quotationNo,
        limit: 1,
      });
      if (Array.isArray(existing) && existing.length > 0) {
        return NextResponse.json(
          { ok: false, error: "This quotation has already been reviewed. Thank you!", code: "duplicate_review" },
          { status: 409 },
        );
      }
    }

    const newRows = await supaPost("service_reviews", {
      client_id: clientId,
      customer_name: customerName,
      role: role || null,
      rating,
      review_text: reviewText,
      source: typeof body.source === "string" && body.source ? body.source : "quote-link",
      ...(quotationNo ? { quotation_no: quotationNo } : {}),
    });
    return NextResponse.json({ ok: true, review: newRows[0] });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("service_reviews_client_quote_uidx") || msg.includes("23505")) {
      return NextResponse.json(
        { ok: false, error: "This quotation has already been reviewed. Thank you!", code: "duplicate_review" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
