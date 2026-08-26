import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://jqjxhhgfwdzckijnnede.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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

  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Service not configured" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  try {
    const encoded = encodeURIComponent(clientId);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/clients?id=eq.${encoded}&select=config,is_active`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) throw new Error(`Supabase ${res.status}`);

    const rows = await res.json();
    if (!rows || !rows.length) {
      // Try slug match on all clients
      const allRes = await fetch(
        `${SUPABASE_URL}/rest/v1/clients?select=id,config,is_active`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
      );
      const all = await allRes.json();
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
    }

    const row = rows[0];
    return NextResponse.json(
      { clientId: row.id, ...row.config, isActive: row.is_active },
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
