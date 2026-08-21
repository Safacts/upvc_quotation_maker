import { NextRequest, NextResponse } from "next/server";
import {
  supaGet,
  supaPatch,
  supaPost,
  supaDelete,
  uploadLogoFile,
  isServiceKeyConfigured,
} from "@/lib/supabase";
import { sendWelcomeEmail } from "@/lib/mail";
import { getSession } from "@/lib/session";

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
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  resolveCors(request);
  try {
    const p = await request.json();
    const email = p.admin_email || "";
    const phash = p.admin_password_hash || "";
    const cid = p.id || "";
    if (!email || !cid) return json({ error: "missing params", hint: "admin_email and id are required" }, 400);
    if (!isServiceKeyConfigured()) return json({ error: "no service key", hint: "server misconfigured" }, 500);

    let isCustomer = false;
    const admins = await supaGet("admins", {
      email: "eq." + email,
      select: "email,password_hash",
    });
    if (Array.isArray(admins) && admins.length > 0) {
      if (!phash) return json({ error: "password hash required", hint: "admin auth: hash missing (re-login required)" }, 403);
      if (admins[0].password_hash !== phash) {
        return json({ error: "hash mismatch", hint: "admin auth: hash does not match stored value" }, 403);
      }
    } else {
      // Fetch clients with id, config, and password_hash
      const clients = await supaGet("clients", {
        select: "id,config,password_hash",
        limit: 1000,
      });
      let clientMatch: any = null;
      if (Array.isArray(clients)) {
        // 1. Try exact match on cid first
        const byId = clients.find((c) => c.id === cid);
        if (byId) {
          const cfg = byId.config || {};
          const adminEmails = cfg.adminEmails || [];
          if (
            !email ||
            cfg.companyEmail === email ||
            (Array.isArray(adminEmails) && adminEmails.includes(email))
          ) {
            clientMatch = byId;
          }
        }
        // 2. If not matched, scan by email
        if (!clientMatch) {
          for (const c of clients) {
            const cfg = c.config || {};
            const adminEmails = cfg.adminEmails || [];
            if (
              cfg.companyEmail === email ||
              (Array.isArray(adminEmails) && adminEmails.includes(email))
            ) {
              clientMatch = c;
              break;
            }
          }
        }
        // 3. Fallback: if cid matches and user has a valid session for cid
        if (!clientMatch && byId) {
          clientMatch = byId;
        }
      }
      
      // STRICTURE: Ensure client authentication requires the correct portal hash or valid session
      if (!clientMatch) return json({ error: "not authorized", hint: "no client found for email " + email }, 403);
      
      // Accept either a matching password_hash OR a valid session cookie.
      // Password hash is the primary auth (proves knowledge of the secret).
      // Session fallback handles Google-signed-in clients (no password) and
      // Flutter web callers that rely on the HttpOnly session cookie.
      let authedBySession = false;
      const expectedHash = clientMatch.password_hash || clientMatch.config?.portalPasswordHash;
      if (phash && (clientMatch.password_hash === phash || expectedHash === phash)) {
        // Password hash matches — primary auth succeeded
      } else {
        // Password hash missing or mismatch — try session-based auth
        const session = await getSession();
        if (session && (session.role === "admin" || (session.role === "customer" && (session.client_id === clientMatch.id || session.client_id === cid)))) {
          authedBySession = true;
        } else {
          const hasSession = !!session;
          const sessionRole = session?.role ?? "none";
          const sessionClient = (session as any)?.client_id ?? "none";
          if (!phash) {
            return json({
              error: "password hash required",
              hint: `client auth: hash empty and session invalid (hasSession:${hasSession} role:${sessionRole} sessionClient:${sessionClient} expected:${clientMatch.id}) — re-login or ensure cookie is sent (withCredentials)`,
            }, 403);
          }
          return json({
            error: "hash mismatch",
            hint: `client auth: hash mismatch and session fallback failed (hasSession:${hasSession} role:${sessionRole} sessionClient:${sessionClient} expected:${clientMatch.id})`,
          }, 403);
        }
      }
      
      isCustomer = true;
      if (cid !== clientMatch.id) {
        return json({ error: "can only manage own client", hint: `cid ${cid} != ${clientMatch.id}` }, 403);
      }
    }

    let config: Record<string, any> = p.config || {};
    if (typeof config === "string") {
      try {
        config = JSON.parse(config);
      } catch {
        return json({ error: "invalid config" }, 400);
      }
    }
    // Merge mode: only the fields sent by the client are updated. Protects
    // fields the sender doesn't know about (portalPasswordHash, appDownloadUrl,
    // colors, quotePrefix, adminEmails, ...) from being wiped by a partial save.
    if (p.merge) {
      const existing = await supaGet("clients", {
        id: "eq." + cid,
        select: "config",
      });
      if (
        Array.isArray(existing) &&
        existing.length > 0 &&
        existing[0].config &&
        typeof existing[0].config === "object" &&
        !Array.isArray(existing[0].config)
      ) {
        config = { ...existing[0].config, ...config };
      }
    }
    const portalHash = p.portal_password_hash || null;
    if (portalHash) {
      config.portalPasswordHash = portalHash;
    }

    if (isCustomer && p._delete) {
      return json({ error: "customers cannot delete clients" }, 403);
    }

    const logoFile = p.logoFile;
    if (logoFile && logoFile.data) {
      try {
        config.logoUrl = await uploadLogoFile(cid, logoFile);
      } catch (e: any) {
        return json(
          { error: "logo upload failed: " + String(e?.message ?? e) },
          500,
        );
      }
    }

    const heroFile = p.heroFile;
    if (heroFile && heroFile.data) {
      try {
        config.landingHeroImage = await uploadLogoFile(cid, heroFile);
      } catch (e: any) {
        return json(
          { error: "hero image upload failed: " + String(e?.message ?? e) },
          500,
        );
      }
    }

    const invoiceTopLogoFile = p.invoiceTopLogoFile;
    if (invoiceTopLogoFile && invoiceTopLogoFile.data) {
      try {
        config.invoiceTopLogoUrl = await uploadLogoFile(cid, invoiceTopLogoFile, 'invoice-top');
      } catch (e: any) {
        return json(
          { error: "invoice top logo upload failed: " + String(e?.message ?? e) },
          500,
        );
      }
    }

    const invoiceBgLogoFile = p.invoiceBgLogoFile;
    if (invoiceBgLogoFile && invoiceBgLogoFile.data) {
      try {
        config.invoiceBackgroundLogoUrl = await uploadLogoFile(cid, invoiceBgLogoFile, 'invoice-bg');
      } catch (e: any) {
        return json(
          { error: "invoice background logo upload failed: " + String(e?.message ?? e) },
          500,
        );
      }
    }

    if (p._delete) {
      await supaDelete("quotations", { client_id: "eq." + cid });
      await supaDelete("sent_emails", { client_id: "eq." + cid });
      await supaDelete("clients", { id: "eq." + cid });
      return json({ success: true, deleted: cid }, 200);
    }

    const existing = await supaGet("clients", { id: "eq." + cid, select: "id,config,is_active,trial_expires_at" });
    const prior = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;

    // BUG-SEC-001 (PRIVILEGE ESCALATION / BILLING BYPASS)
    // `config` is written verbatim from the request body. A customer authenticates
    // for their OWN client id (allowed), then posts config.isPaid = true and/or a
    // far-future config.trialEndsAt. portal_auth's trial gate reads exactly those
    // two fields, so the client grants themselves a permanent free licence. The
    // same body could also set `is_active` and `trial_expires_at` directly.
    // Billing state is ADMIN-ONLY: for a customer, always re-assert the stored values.
    if (isCustomer) {
      const priorCfg = (prior && prior.config) || {};
      config.isPaid = priorCfg.isPaid ?? false;
      config.trialEndsAt = priorCfg.trialEndsAt ?? null;
      // portalPasswordHash is credential material. A customer changing their OWN
      // portal password is legitimate (they send `portal_password_hash`), but a
      // silent `config.portalPasswordHash` smuggled inside the config blob is not.
      if (!portalHash) {
        if (priorCfg.portalPasswordHash !== undefined) {
          config.portalPasswordHash = priorCfg.portalPasswordHash;
        } else {
          delete config.portalPasswordHash;
        }
      }
    }

    const body: Record<string, any> = {
      config,
      // Customers may not flip their own activation or extend their own trial.
      is_active: isCustomer
        ? (prior ? prior.is_active : true)
        : (p.is_active ?? true),
      trial_expires_at: isCustomer
        ? (prior ? prior.trial_expires_at : null)
        : (p.trial_expires_at ?? null),
    };
    if (portalHash) body.password_hash = portalHash;
    if (Array.isArray(existing) && existing.length > 0) {
      await supaPatch("clients", { id: "eq." + cid }, body);
    } else {
      // 7-DAY TRIAL SYSTEM INJECTION
      body.config.isPaid = false;
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);
      const trialIso = trialEnd.toISOString();
      body.config.trialEndsAt = trialIso;
      body.trial_expires_at = trialIso; // Native PostgreSQL column sync
      
      body.id = cid;
      await supaPost("clients", body);
    }

    let welcomeResult: any = null;
    if (p.send_welcome) {
      const emailAddr = String(config.companyEmail || "").trim();
      const tempPassword = p.temp_password || "";
      if (!emailAddr) {
        welcomeResult = { error: "no company email to send to" };
      } else if (!tempPassword) {
        welcomeResult = { error: "no temporary password provided" };
      } else {
        try {
          await sendWelcomeEmail({
            cfg: config,
            clientId: cid,
            email: emailAddr,
            tempPassword,
          });
          welcomeResult = { sent: true };
        } catch (e: any) {
          welcomeResult = { error: String(e?.message ?? e) };
        }
      }
    }

    return json(
      { success: true, logoUrl: config.logoUrl ?? null, welcomeEmail: welcomeResult },
      200,
    );
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS(request: NextRequest) {
  resolveCors(request);
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}
