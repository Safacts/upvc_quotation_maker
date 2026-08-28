import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supaGet } from "@/lib/supabase";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    // Fetch full clients table using service_role (bypasses RLS, but admin session verified)
    // Exclude password_hash from response
    const data = await supaGet("clients", {
      select: "id,config,is_active,trial_expires_at,created_at",
      order: "created_at.desc",
    });

    return json({ success: true, clients: data || [] });
  } catch (err: any) {
    console.error("Admin clients fetch error:", err);
    return json({ success: false, error: err.message }, 500);
  }
}