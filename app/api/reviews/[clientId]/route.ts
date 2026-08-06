import { NextResponse } from "next/server";
import { supaGet } from "@/lib/supabase";

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
    select: "id,customer_name,role,rating,review_text,source,created_at",
    client_id: "eq." + clientId,
    is_visible: "eq.true",
    order: "created_at.desc",
  });
  return NextResponse.json({ reviews: rows });
}
