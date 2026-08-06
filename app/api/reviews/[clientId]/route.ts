import { NextResponse } from "next/server";
import { supaGet } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  if (!clientId || !clientId.trim()) {
    return NextResponse.json({ reviews: [], quotation: null });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  const rows = await supaGet("service_reviews", {
    select: "id,customer_name,role,rating,review_text,source,created_at,quotation_no",
    client_id: "eq." + clientId,
    is_visible: "eq.true",
    order: "created_at.desc",
  });
  let quotation: { customer_name: string; has_review: boolean } | null = null;
  if (q) {
    const quotes = await supaGet("quotations", {
      select: "customer_name",
      client_id: "eq." + clientId,
      quote_no: "eq." + q,
      limit: 1,
    });
    if (Array.isArray(quotes) && quotes.length > 0) {
      const existing = await supaGet("service_reviews", {
        select: "id",
        client_id: "eq." + clientId,
        quotation_no: "eq." + q,
        limit: 1,
      });
      quotation = {
        customer_name: quotes[0].customer_name,
        has_review: Array.isArray(existing) && existing.length > 0,
      };
    }
  }
  return NextResponse.json({ reviews: rows, quotation });
}
