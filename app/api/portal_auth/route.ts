import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { timingSafeEqual } from "crypto";
import { supaGet, supaPatch, supaPost, isServiceKeyConfigured } from "@/lib/supabase";
import { createSession, deleteSession, getSession } from "@/lib/session";
import { sha256 } from "@/lib/auth";
import { authAttemptKey, clearAuthFailures, isAuthLocked, recordAuthFailure } from "@/lib/auth-rate-limit";
import { sendSignupNotification } from "@/lib/mail";
import { notifyNewClientSignup, isTelegramConfigured } from "@/lib/telegram";

const GOOGLE_CLIENT_ID =
  "726482519803-od8lidratsv0du7jtaeopj29khmn6meb.apps.googleusercontent.com";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

// Instant Telegram lead ping on first-time signup. Fire-and-forget — a slow
// or failed Telegram call must never delay the auth response. Chat IDs come
// from TELEGRAM_LEAD_CHAT_IDS (comma-separated); default = founder's chat.
async function pingLeadChannels(opts: { email: string; method: string }): Promise<void> {
  try {
    if (!isTelegramConfigured()) return;
    const raw = (process.env.TELEGRAM_LEAD_CHAT_IDS || "1295597987").trim();
    const chatIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
    await Promise.all(
      chatIds.map((chatId) =>
        notifyNewClientSignup({
          chatId,
          clientName: opts.email,
          email: `${opts.email} (via ${opts.method} login)`,
        }).catch(() => {}),
      ),
    );
  } catch {
  }
}

// Verifies a Google ID token (issued by the browser GSI or native plugin) and
// returns the email it was issued to, or null when the signature/aud/iss/exp
// check fails. The email in the token is what the app trusts — never the body.
async function verifyGoogleCredential(credential: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      audience: GOOGLE_CLIENT_ID,
    });
    const email = String(payload.email || "").trim().toLowerCase();
    if (!email || payload.email_verified !== true) return null;
    return email;
  } catch {
    return null;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
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

async function backfillPortalHash(client: any): Promise<void> {
  try {
    if (!client?.id || !client.password_hash) return;
    if (client.config && client.config.portalPasswordHash) return;
    const rows = await supaGet("clients", {
      id: "eq." + client.id,
      select: "config",
    });
    if (!Array.isArray(rows) || rows.length === 0) return;
    const existing =
      rows[0].config &&
      typeof rows[0].config === "object" &&
      !Array.isArray(rows[0].config)
        ? rows[0].config
        : {};
    await supaPatch(
      "clients",
      { id: "eq." + client.id },
      { config: { ...existing, portalPasswordHash: client.password_hash } },
    );
  } catch {
    // best-effort backfill: never block login on it
  }
}

async function findInactiveClientByEmail(email: string): Promise<any | null> {
  const le = String(email).trim().toLowerCase();
  const rows = await supaGet("clients", {
    select: "id,config,is_active,password_hash",
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
      if (session.role === "admin") {
        return json({ role: session.role, email: session.email, client_id: session.client_id }, 200);
      }
      if (session.role === "customer") {
        return json({ role: session.role, email: session.email, client_id: session.client_id }, 200);
      }
      return json({ role: session.role, email: session.email, client_id: session.client_id }, 200);
    }

    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    if (mode === "google") {
      if (!p.credential) return json({ error: "missing Google credential" }, 400);
      const verified = await verifyGoogleCredential(String(p.credential));
      if (!verified) {
        return json({ error: "Google sign-in could not be verified. Please try again." }, 401);
      }
      const googleEmail = verified;
      const gAdmin = await findAdmin(googleEmail);
      if (gAdmin) {
        await createSession({ role: "admin", email: gAdmin.email });
        return json({ role: "admin", email: gAdmin.email }, 200);
      }
      const client = await findClientByEmail(googleEmail);
      if (client) {
        if (client.is_active === false) {
          return json({ error: "Your account is currently deactivated. Please contact support." }, 403);
        }
        
        // 7-DAY TRIAL LOCKOUT SYSTEM
        const cfg = client.config || {};
        // TRIAL LOCKOUT WITH WARNING
        if (!cfg.isPaid && cfg.trialEndsAt) {
          const now = new Date();
          const trialEnd = new Date(cfg.trialEndsAt);
          const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          // If trial already expired
          if (now > trialEnd) {
             return json({ 
               error: "Your 7-day trial has expired. Please contact Vitharn ERP Services to upgrade to a paid account.",
               code: "TRIAL_EXPIRED",
               trialEndedAt: cfg.trialEndsAt
             }, 403);
          }
          
          // If trial expiring in 2 days or less — warn but allow login
          if (daysRemaining <= 2) {
            // Allow login but include warning
            await backfillPortalHash(client);
            await createSession({ role: "customer", email: googleEmail, client_id: client.id });
            return json({ 
              role: "customer", 
              email: googleEmail, 
              client_id: client.id,
              warning: "TRIAL_EXPIRING_SOON",
              daysRemaining,
              message: `Your trial expires in ${daysRemaining} day(s). Please contact Vitharn ERP Services to upgrade.`
            }, 200);
          }
        }

        await createSession({ role: "customer", email: googleEmail, client_id: client.id });
        return json({ role: "customer", email: googleEmail, client_id: client.id }, 200);
      }
      const inactive = await findInactiveClientByEmail(googleEmail);
      if (inactive) {
        return json({ error: "Your account is currently deactivated. Please contact support." }, 403);
      }
      const signup = await findSignupByEmail(googleEmail);
      if (signup) {
        await createSession({ role: "signup", email: signup.email, signup_request_id: String(signup.id) });
        return json({ role: "signup", email: signup.email, status: signup.status, signup_request_id: String(signup.id) }, 200);
      }
      const googleSignupKey = authAttemptKey(request, "signup-create", "");
      if (isAuthLocked(googleSignupKey)) {
        return json({ error: "Too many attempts. Try again later." }, 429);
      }
      recordAuthFailure(googleSignupKey);
      let newRow: any;
      try {
        newRow = await supaPost("signup_requests", { email: googleEmail, auth_method: "google" });
      } catch (e: any) {
        return json({ error: String(e?.message ?? e) }, 500);
      }
      const newSignupId =
        Array.isArray(newRow) && newRow.length > 0 ? String(newRow[0].id) : undefined;
      try {
        await sendSignupNotification("new", { email: googleEmail });
      } catch {
      }
      void pingLeadChannels({ email: googleEmail, method: "Google" });
      await createSession({ role: "signup", email: googleEmail, signup_request_id: newSignupId });
      return json({ role: "signup", email: googleEmail, status: "pending", signup_request_id: newSignupId }, 200);
    }

    // From here on: password or session-based login — email IS required in body.
    const email = String(p.email || "").trim().toLowerCase();
    if (!email) return json({ error: "email required" }, 400);

    const attemptKey = authAttemptKey(request, "portal-login", email);
    if (isAuthLocked(attemptKey)) {
      return json({ error: "Too many attempts. Try again later." }, 429);
    }

    const admin = await findAdmin(email);

    const password = p.password || "";
    if (!password) return json({ error: "password required" }, 400);
    const inputHash = sha256(password);

    if (admin && safeEqual(String(admin.password_hash || ""), inputHash)) {
      clearAuthFailures(attemptKey);
      await createSession({ role: "admin", email: admin.email });
      return json({ role: "admin", email: admin.email }, 200);
    }

    const client = await findClientByEmail(email);
    if (client && safeEqual(String(client.password_hash || ""), inputHash)) {
      clearAuthFailures(attemptKey);
      if (client.is_active === false) {
        return json({ error: "Your account is currently deactivated. Please contact support." }, 403);
      }
      
      // TRIAL LOCKOUT WITH WARNING — warn 2 days before, lock only after expiry
      const cfg = client.config || {};
      if (!cfg.isPaid && cfg.trialEndsAt) {
        const now = new Date();
        const trialEnd = new Date(cfg.trialEndsAt);
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        // If trial already expired — hard lockout
        if (now > trialEnd) {
           return json({ 
             error: "Your 7-day trial has expired. Please contact Vitharn ERP Services to upgrade to a paid account.",
             code: "TRIAL_EXPIRED",
             trialEndedAt: cfg.trialEndsAt
           }, 403);
        }
        
        // If trial expiring in 2 days or less — warn but allow login
        if (daysRemaining <= 2) {
          await backfillPortalHash(client);
          await createSession({ role: "customer", email, client_id: client.id });
          return json({ 
            role: "customer", 
            email, 
            client_id: client.id,
            warning: "TRIAL_EXPIRING_SOON",
            daysRemaining,
            message: `Your trial expires in ${daysRemaining} day(s). Please contact Vitharn ERP Services to upgrade.`
          }, 200);
        }
      }

      await backfillPortalHash(client);
      await createSession({ role: "customer", email, client_id: client.id });
      return json({ role: "customer", email, client_id: client.id }, 200);
    }

    if (!admin && !client) {
      const inactive = await findInactiveClientByEmail(email);
      if (inactive) {
        // Verify the password BEFORE revealing deactivation, otherwise this
        // branch is an oracle that confirms which emails hold accounts.
        if (!safeEqual(String(inactive.password_hash || ""), inputHash)) {
          recordAuthFailure(attemptKey);
          return json({ error: "invalid email or password" }, 401);
        }
        return json({ error: "Your account is currently deactivated. Please contact support." }, 403);
      }
      const signup = await findSignupByEmail(email);
      if (signup) {
        if (signup.auth_method === "google" || !signup.password_hash) {
          return json({ error: "This account was created with Google Sign-In. Please use Sign in with Google." }, 401);
        }
        if (safeEqual(String(signup.password_hash), inputHash)) {
          clearAuthFailures(attemptKey);
          await createSession({ role: "signup", email: signup.email, signup_request_id: String(signup.id) });
          return json({ role: "signup", email: signup.email, status: signup.status, signup_request_id: String(signup.id) }, 200);
        }
        recordAuthFailure(attemptKey);
        return json({ error: "invalid email or password" }, 401);
      }
      const signupCreateKey = authAttemptKey(request, "signup-create", "");
      if (isAuthLocked(signupCreateKey)) {
        return json({ error: "Too many attempts. Try again later." }, 429);
      }
      recordAuthFailure(signupCreateKey);
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
      void pingLeadChannels({ email, method: "email" });
      await createSession({ role: "signup", email, signup_request_id: newSignupId });
      return json({ role: "signup", email, status: "pending", signup_request_id: newSignupId }, 200);
    }

    recordAuthFailure(attemptKey);
    return json({ error: "invalid email or password" }, 401);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
