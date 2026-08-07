import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { supaGet, supaPatch, supaPost, isServiceKeyConfigured } from "@/lib/supabase";
import { sendOtpEmail } from "@/lib/mail";

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
  const rows = await supaGet("client_public", {
    select: "id,config,is_active",
  });
  if (!Array.isArray(rows)) return null;
  const le = email.toLowerCase();
  for (const c of rows) {
    const cfg = c.config || {};
    const ce = String(cfg.companyEmail || "").trim().toLowerCase();
    const ae = (cfg.adminEmails || []).map((e: string) =>
      String(e).trim().toLowerCase(),
    );
    if (ce === le || ae.includes(le)) {
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
    const raw = await request.text();
    const p = raw ? JSON.parse(raw) : {};
    const email = String(p.email || "").trim().toLowerCase();
    if (!email) return json({ error: "email required" }, 400);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const admin = await findAdmin(email);
    const client = await findClientByEmail(email);
    if (!admin && !client) {
      return json({ error: "no account found for this email" }, 404);
    }

    const otp = String(p.otp || "").trim();
    const newHash = p.new_hash || "";

    if (!otp) {
      const code = String(randomInt(100000, 1000000));
      try {
        await sendOtpEmail(email, code);
      } catch (e: any) {
        return json(
          { error: "failed to send OTP: " + String(e?.message ?? e) },
          500,
        );
      }
      try {
        await supaPost("sent_emails", {
          recipient: email,
          subject: "Your Password Reset OTP",
          body: "OTP: " + code,
          client_id: client ? client.id : "system",
        });
      } catch (e: any) {
        return json({ error: "failed to log OTP: " + String(e?.message ?? e) }, 500);
      }
      return json({ sent: true }, 200);
    }

    if (!newHash) return json({ error: "new_hash required" }, 400);

    const sent = await supaGet("sent_emails", {
      recipient: "eq." + email,
      order: "created_at.desc",
      limit: "1",
    });
    if (!Array.isArray(sent) || sent.length === 0) {
      return json({ error: "no OTP sent to this email" }, 403);
    }
    const latest = sent[0];
    const body = latest.body || "";
    const match = body.match(/OTP:\s*(\d{6})/);
    if (!match || match[1] !== otp) return json({ error: "invalid OTP" }, 403);
    const created = latest.created_at;
    if (created) {
      try {
        const createdDt = new Date(String(created).replace("Z", "+00:00"));
        if (Date.now() - createdDt.getTime() > 15 * 60 * 1000) {
          return json({ error: "OTP expired" }, 403);
        }
      } catch {
        // skip expiry check
      }
    }

    if (admin) {
      await supaPatch("admins", { email: "eq." + email }, { password_hash: newHash });
    } else {
      await supaPatch("clients", { id: "eq." + client.id }, { password_hash: newHash });
    }

    return json({ success: true, role: admin ? "admin" : "customer" }, 200);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
