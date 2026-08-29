import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { sendMail } from "@/lib/mail";
import { getSession } from "@/lib/session";
import { requireTier } from "@/lib/tiers";
import { supaGet } from "@/lib/supabase";

const PROD_ORIGIN = "https://app.vitharn.com";
const DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3100",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);
let _allowOrigin = PROD_ORIGIN;

function resolveCors(request: NextRequest) {
  const origin = request.headers.get("origin");
  _allowOrigin =
    origin && (DEV_ORIGINS.has(origin) || origin === PROD_ORIGIN)
      ? origin
      : PROD_ORIGIN;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": _allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-client-id",
    "Vary": "Origin",
  };
}

const MAX_BODY = 4_000_000;
const MAX_ATTACH = 3_500_000;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

// Best-effort per-sender daily cap so one authenticated tenant/admin cannot
// drain the Brevo quota. In-memory by design: serverless instances each hold
// their own map and it resets on redeploy — a ceiling, not an accounting system.
const dailySends = new Map<string, { date: string; count: number }>();
const DAILY_SEND_LIMIT = 100;

function consumeDailySendQuota(identity: string): boolean {
  const date = new Date().toISOString().slice(0, 10);
  const key = `${identity}:${date}`;
  const bucket = dailySends.get(key);
  if (!bucket || bucket.date !== date) {
    dailySends.set(key, { date, count: 1 });
    return true;
  }
  if (bucket.count >= DAILY_SEND_LIMIT) return false;
  bucket.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  resolveCors(request);
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return json({ error: "Payload too large" }, 413);
    }
    const body = raw ? JSON.parse(raw) : {};

    // 1. Check Web Session Cookie
    const session = await getSession();
    let authenticatedClientId: string | null = null;
    let isAdmin = false;

    if (session && session.email) {
      // BUG-SEC-005: "signup" is a pre-account role and must not relay mail.
      if (session.role !== "admin" && session.role !== "customer") {
        return json({ error: "Forbidden" }, 403);
      }
      if (session.role === "admin") {
        isAdmin = true;
      } else if (session.role === "customer") {
        authenticatedClientId = session.client_id ? String(session.client_id) : null;
      }
    } else {
      // 2. Flutter Native/API Credentials in body (for Android APK & tokenless callers)
      const clientId = String(
        body.client_id ?? body.clientId ?? request.headers.get("x-client-id") ?? ""
      ).trim();
      const phash = String(body.admin_password_hash ?? body.password_hash ?? "").trim();

      if (clientId && phash) {
        // Check if admin
        const adminEmail = String(body.admin_email ?? body.email ?? "").trim();
        if (adminEmail) {
          const admins = await supaGet("admins", {
            email: `eq.${adminEmail}`,
            select: "email,password_hash",
          });
          if (Array.isArray(admins) && admins.length > 0 && admins[0].password_hash) {
            if (safeEqual(String(admins[0].password_hash), phash)) {
              isAdmin = true;
            }
          }
        }

        if (!isAdmin) {
          // Check if client tenant (exact or case-insensitive or email scan)
          let clients = await supaGet("clients", {
            select: "id,config,password_hash",
            limit: 1000,
          });
          if (Array.isArray(clients)) {
            const byId = clients.find(
              (c) => c.id === clientId || String(c.id).toLowerCase() === clientId.toLowerCase()
            );
            const clientMatch = byId || clients.find((c) => {
              const cfg = c.config || {};
              const ae = cfg.adminEmails || [];
              return (
                cfg.companyEmail === adminEmail ||
                (Array.isArray(ae) && ae.includes(adminEmail))
              );
            });

            if (clientMatch) {
              const clientHash =
                clientMatch.password_hash || clientMatch.config?.portalPasswordHash;
              if (
                (clientHash && safeEqual(String(clientHash), phash)) ||
                (clientMatch.password_hash && safeEqual(String(clientMatch.password_hash), phash))
              ) {
                authenticatedClientId = String(clientMatch.id);
              }
            }
          }
        }
      }
    }

    if (!isAdmin && !authenticatedClientId) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!isAdmin && authenticatedClientId) {
      const paid = await requireTier(authenticatedClientId, "email_notifications");
      if (!paid.ok) return json(await paid.error.json(), paid.error.status);
    }

    const to = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const html = String(body.html ?? "");

    if (!to || !to.includes("@") || to.length > 320) {
      return json({ error: "Invalid recipient" }, 400);
    }
    if (!subject || subject.length > 500) {
      return json({ error: "Invalid subject" }, 400);
    }
    if (!html || html.length > 200000) {
      return json({ error: "Invalid body" }, 400);
    }

    const attachments: Array<{ filename?: string; content: Buffer; cid?: string }> = [];
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (rawAttachments.length > 3) {
      return json({ error: "Too many attachments" }, 400);
    }
    for (const a of rawAttachments) {
      const b64 = String(a?.content ?? "").trim();
      if (!b64 || b64.length > MAX_ATTACH) {
        return json({ error: "Invalid attachment" }, 400);
      }
      attachments.push({
        filename: a.filename ? String(a.filename).slice(0, 255) : undefined,
        cid: a.cid ? String(a.cid).slice(0, 255) : undefined,
        content: Buffer.from(b64, "base64"),
      });
    }

    const senderKey = isAdmin
      ? String(session?.email || body.admin_email || body.email || "admin").trim().toLowerCase()
      : String(authenticatedClientId);
    if (!consumeDailySendQuota(senderKey)) {
      return json({ error: "Daily email limit reached" }, 429);
    }

    await sendMail({ to, subject, html, attachments });
    return json({ success: true }, 200);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS(request: NextRequest) {
  resolveCors(request);
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

