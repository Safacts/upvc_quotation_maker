import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supaGet } from "@/lib/supabase";

const ALLOWED_ORIGINS = new Set([
  "https://app.vitharn.com",
  "https://vitharn-upvc-staging.vercel.app",
  "http://localhost:3000",
  "http://localhost:3100",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://app.vitharn.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data: any, status = 200, origin: string | null = null) {
  return NextResponse.json(data, { status, headers: corsHeaders(origin) });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function GET(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const session = await getSession().catch(() => null);
    if (!session || session.role !== "admin") {
      return json({ success: false, error: "Unauthorized" }, 401, origin);
    }

    // Fetch full clients table using service_role (bypasses RLS, admin verified)
    // Exclude password_hash from response
    const data = await supaGet("clients", {
      select: "id,config,is_active,trial_expires_at,created_at",
      order: "created_at.desc",
    });

    return json({ success: true, clients: data || [] }, 200, origin);
  } catch (err: any) {
    console.error("Admin clients fetch error:", err);
    return json({ success: false, error: err.message }, 500, request.headers.get("origin"));
  }
}
