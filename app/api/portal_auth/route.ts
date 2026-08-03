import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPost, isServiceKeyConfigured } from "@/lib/supabase";
import { createSession, deleteSession, getSession } from "@/lib/session";
import { sha256 } from "@/lib/auth";
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

async function findSignupByEmail(email: string): Promise<any | null> {
  const le = String(email).trim().toLowerCase();
  const rows = await supaGet("signup_requests", {
    email: "eq." + le,
    select: "id,email,name,phone,auth_method,password_hash,status,config",
  });
  if (Array.isArray(rows) && rows.length > 0) return rows[0];
  return null;
}

async function findInactiveClientByEmail(email: string): Promise<any | null> {
  const le = String(email).trim().toLowerCase();
  const rows = await supaGet("clients", {
    select: "id,config,is_active",
    limit: 1000,
  });
  if (!Array.isArray(rows)) return null;
  for (const c of rows) {
    const cfg = c.config || {};
    const companyEmail = String(cfg.companyEmail || "").trim().toLowerCase();
    const ae = (cfg.adminEmails || []).map((e: string) =>
      String(e).trim().toLowerCase()
    );
    if (c.is_active === false && (companyEmail === le || ae.includes(le))) {
      return c;
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
      if (session.role === "signup") {
        const signup = await findSignupByEmail(session.email);
        return json(
          {
            role: "signup",
            email: session.email,
            signup_request_id: signup ? String(signup.id) : session.signup_request_id,
            status: signup ? signup.status : "pending",
          },
          200
        );
      }
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
        if (client.is_active === false) {
          return json({ error: "Your account is currently deactivated. Please contact support." }, 403);
        }
        await createSession({ role: "customer", email, client_id: client.id });
        return json({ role: "customer", email, client_id: client.id }, 200);
      }
      const inactive = await findInactiveClientByEmail(email);
      if (inactive) {
        return json({ error: "Your account is currently deactivated. Please contact support." }, 403);
      }
      const signup = await findSignupByEmail(email);
      if (signup) {
        await createSession({ role: "signup", email: signup.email, signup_request_id: String(signup.id) });
        return json({ role: "signup", email: signup.email, status: signup.status, signup_request_id: String(signup.id) }, 200);
      }
      let newRow: any;
      try {
        newRow = await supaPost("signup_requests", { email, auth_method: "google" });
      } catch (e: any) {
        return json({ error: String(e?.message ?? e) }, 500);
      }
      const newSignupId =
        Array.isArray(newRow) && newRow.length > 0 ? String(newRow[0].id) : undefined;
      try {
        await sendSignupNotification("new", { email });
      } catch {
      }
      await createSession({ role: "signup", email, signup_request_id: newSignupId });
      return json({ role: "signup", email, status: "pending", signup_request_id: newSignupId }, 200);
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
      if (client.is_active === false) {
        return json({ error: "Your account is currently deactivated. Please contact support." }, 403);
      }
      await createSession({ role: "customer", email, client_id: client.id });
      return json({ role: "customer", email, client_id: client.id }, 200);
    }

    if (!admin && !client) {
      const inactive = await findInactiveClientByEmail(email);
      if (inactive) {
        return json({ error: "Your account is currently deactivated. Please contact support." }, 403);
      }
      const signup = await findSignupByEmail(email);
      if (signup) {
        if (signup.auth_method === "google" || !signup.password_hash) {
          return json({ error: "This account was created with Google Sign-In. Please use Sign in with Google." }, 401);
        }
        if (signup.password_hash === inputHash) {
          await createSession({ role: "signup", email: signup.email, signup_request_id: String(signup.id) });
          return json({ role: "signup", email: signup.email, status: signup.status, signup_request_id: String(signup.id) }, 200);
        }
        return json({ error: "invalid email or password" }, 401);
      }
      let newRow: any;
      try {
        newRow = await supaPost("signup_requests", { email, auth_method: "password", password_hash: inputHash });
      } catch (e: any) {
        return json({ error: String(e?.message ?? e) }, 500);
      }
      const newSignupId =
        Array.isArray(newRow) && newRow.length > 0 ? String(newRow[0].id) : undefined;
      try {
        await sendSignupNotification("new", { email });
      } catch {
      }
      await createSession({ role: "signup", email, signup_request_id: newSignupId });
      return json({ role: "signup", email, status: "pending", signup_request_id: newSignupId }, 200);
    }

    return json({ error: "invalid email or password" }, 401);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
