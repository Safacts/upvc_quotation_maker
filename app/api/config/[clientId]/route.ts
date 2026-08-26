import { NextRequest, NextResponse } from "next/server";
import { supaGet } from "@/lib/supabase";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId: rawId } = await params;
  const clientId = decodeURIComponent(rawId).trim();

  try {
    // Use client_public view (migration 047) which strips sensitive fields:
    // portalPasswordHash, adminEmails, bankAccountNo, bankIfsc, gstNumber,
    // supabaseAnonKey, isPaid, trialEndsAt, companyEmail are all redacted.
    const rows = await supaGet("client_public", {
      id: "eq." + clientId,
      select: "id,config,is_active,trial_expires_at,created_at",
      limit: 1,
    });

    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0];
      return NextResponse.json(
        { clientId: row.id, ...row.config, isActive: row.is_active },
        { headers: CORS_HEADERS },
      );
    }

    // Fallback: slug match on client_public (also redacted)
    const all = await supaGet("client_public", {
      select: "id,config,is_active,trial_expires_at,created_at",
    });
    if (!Array.isArray(all)) {
      return NextResponse.json({ error: "Client not found" }, { status: 404, headers: CORS_HEADERS });
    }
    const slug = clientId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const match = all.find((c: any) => {
      const cid = (c.id || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const appName = ((c.config?.appName as string) || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return cid === slug || appName === slug;
    });
    if (!match) {
      return NextResponse.json({ error: "Client not found" }, { status: 404, headers: CORS_HEADERS });
    }
    return NextResponse.json(
      { clientId: match.id, ...match.config, isActive: match.is_active },
      { headers: CORS_HEADERS },
    );
  } catch (e: any) {
    console.error("config API error:", e.message);
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
