import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-client";

const TOKEN_SECRET = process.env.QUOTE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-secret";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "customer") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    
    // Verify the client owns this quotation
    const { data: quotation, error } = await supabaseAdmin
      .from("quotations")
      .select("client_id")
      .eq("id", id)
      .single();

    if (error || !quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    if (quotation.client_id !== session.client_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const token = createHmac("sha256", TOKEN_SECRET).update(id).digest("hex").slice(0, 16);
    
    return NextResponse.json({ token }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
