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
    const p = await request.json();
    const email = p.admin_email || "";
    const phash = p.admin_password_hash || "";
    const cid = p.id || "";
    if (!email || !cid) return json({ error: "missing params" }, 400);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    let isCustomer = false;
    const admins = await supaGet("admins", {
      email: "eq." + email,
      select: "email,password_hash",
    });
    if (Array.isArray(admins) && admins.length > 0) {
      if (phash && admins[0].password_hash !== phash) {
        return json({ error: "hash mismatch" }, 403);
      }
    } else {
      const clients = await supaGet("clients", {
        select: "id,config",
        limit: 1000,
      });
      let clientMatch: any = null;
      if (Array.isArray(clients)) {
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
      if (!clientMatch) return json({ error: "not authorized" }, 403);
      isCustomer = true;
      if (cid !== clientMatch.id) {
        return json({ error: "can only manage own client" }, 403);
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

    const existing = await supaGet("clients", { id: "eq." + cid, select: "id" });
    const body: Record<string, any> = {
      config,
      is_active: p.is_active ?? true,
      trial_expires_at: p.trial_expires_at ?? null,
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
