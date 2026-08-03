import { NextRequest, NextResponse } from "next/server";
import { supaGet, isServiceKeyConfigured } from "@/lib/supabase";
import { createSession, deleteSession, getSession } from "@/lib/session";
import { sha256 } from "@/lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

async function findAdmin(email: string): Promise<any | null> {
  const rows = await supaGet("admins", {
    email: "eq." + email,
    select: "email,password_hash",
  });
  if (Array.isArray(rows) && rows.length > 0) return rows[0];
  return null;
}

async function findClientByEmail(email: string): Promise<any | null> {
  const le = email.toLowerCase();
  
  // 1. Direct match on companyEmail
  const exactMatches = await supaGet("client_public", { 
    "config->>companyEmail": "eq." + le,
    select: "id,config,is_active",
    limit: 1
  });

  if (Array.isArray(exactMatches) && exactMatches.length > 0) {
    const clientRows = await supaGet("clients", {
      id: "eq." + exactMatches[0].id,
      select: "id,config,is_active,password_hash",
    });
    if (Array.isArray(clientRows) && clientRows.length > 0) return clientRows[0];
  }

  // 2. Scan fallback for adminEmails
  const rows = await supaGet("client_public", {
    select: "id,config,is_active",
  });
  if (!Array.isArray(rows)) return null;
  for (const c of rows) {
    const cfg = c.config || {};
    const ae = (cfg.adminEmails || []).map((e: string) => String(e).trim().toLowerCase());
    if (ae.includes(le)) {
      const clientRows = await supaGet("clients", {
        id: "eq." + c.id,
        select: "id,config,is_active,password_hash",
      });
      if (Array.isArray(clientRows) && clientRows.length > 0) {
        return clientRows[0];
      }
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    let raw = "";
    try {
      raw = await request.text();
    } catch (e: any) {
      return json({ error: "Invalid JSON in request: " + e.message, raw: raw.slice(0, 200) }, 400);
    }
    let p: any = {};
    if (raw) {
      try {
        p = JSON.parse(raw);
      } catch (e: any) {
        return json({ error: "Invalid JSON in request: " + e.message, raw: raw.slice(0, 200) }, 400);
      }
    }

    const mode = p.mode || "login";

    if (mode === "logout") {
      await deleteSession();
      return json({ success: true }, 200);
    }

    if (mode === "session") {
      const session = await getSession();
      if (!session) return json({ error: "invalid session" }, 401);
      return json({ role: session.role, email: session.email, client_id: session.client_id }, 200);
    }

    const email = String(p.email || "").trim().toLowerCase();
    if (!email) return json({ error: "email required" }, 400);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const admin = await findAdmin(email);

    if (mode === "google") {
      if (admin) {
        await createSession({ role: "admin", email: admin.email });
        return json({ role: "admin", email: admin.email }, 200);
      }
      const client = await findClientByEmail(email);
      if (client) {
        await createSession({ role: "customer", email, client_id: client.id });
        return json({ role: "customer", email, client_id: client.id }, 200);
      }
      return json({ error: "not registered" }, 401);
    }

    const password = p.password || "";
    if (!password) return json({ error: "password required" }, 400);
    const inputHash = sha256(password);

    if (admin && admin.password_hash === inputHash) {
      await createSession({ role: "admin", email: admin.email });
      return json({ role: "admin", email: admin.email }, 200);
    }

    const client = await findClientByEmail(email);
    if (client && (client.password_hash || "") === inputHash) {
      await createSession({ role: "customer", email, client_id: client.id });
      return json({ role: "customer", email, client_id: client.id }, 200);
    }

    return json({ error: "invalid email or password" }, 401);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
