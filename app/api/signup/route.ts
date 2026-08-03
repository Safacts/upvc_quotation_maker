import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPatch, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession, deleteSession } from "@/lib/session";
import { sendSignupNotification } from "@/lib/mail";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON" }, 400);
    }

    const mode = body.mode;

    if (mode === "logout") {
      await deleteSession();
      return json({ success: true });
    }

    const session = await getSession();
    if (!session) {
      return json({ error: "not authorized" }, 403);
    }

    if (mode === "list") {
      if (session.role !== "admin") {
        return json({ error: "not authorized" }, 403);
      }
      const rows = await supaGet("signup_requests", {
        order: "created_at.desc",
        select:
          "id,email,name,phone,auth_method,status,config,created_at,updated_at",
      });
      return json(Array.isArray(rows) ? rows : []);
    }

    if (session.role !== "signup") {
      return json({ error: "not authorized" }, 403);
    }

    if (!isServiceKeyConfigured()) {
      return json({ error: "Database not configured" }, 500);
    }

    const sessionEmail = String(session.email || "").trim().toLowerCase();
    if (!sessionEmail) {
      return json({ error: "not authorized" }, 403);
    }

    const rows = await supaGet("signup_requests", {
      email: "eq." + sessionEmail,
      select: "email,name,phone,status,auth_method,config,created_at,updated_at",
    });
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    if (mode === "get") {
      if (!row) return json({ error: "not found" }, 404);
      return json({
        email: row.email,
        name: row.name,
        phone: row.phone,
        status: row.status,
        auth_method: row.auth_method,
        config: row.config || {},
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    if (mode === "save") {
      if (!row) return json({ error: "not found" }, 404);
      const merged = { ...(row.config || {}), ...(body.config || {}) };
      const patchBody: Record<string, any> = {
        config: merged,
        updated_at: new Date().toISOString(),
      };
      if (body.name !== undefined) patchBody.name = body.name;
      if (body.phone !== undefined) patchBody.phone = body.phone;
      await supaPatch("signup_requests", { email: "eq." + sessionEmail }, patchBody);
      return json({ saved: true });
    }

    if (mode === "submit") {
      if (!row) return json({ error: "not found" }, 404);
      const status = row.status || "pending";
      if (status === "submitted" || status === "approved") {
        return json({ submitted: false, status });
      }
      const submittedAt = new Date().toISOString();
      await supaPatch("signup_requests", { email: "eq." + sessionEmail }, {
        status: "submitted",
        updated_at: submittedAt,
      });
      try {
        await sendSignupNotification("submitted", {
          email: row.email,
          name: row.name,
          phone: row.phone,
          config: row.config || {},
          submittedAt,
        });
      } catch (e) {
        // mail failure must not fail the submit
      }
      return json({ submitted: true, status: "submitted" });
    }

    return json({ error: "unknown mode" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
