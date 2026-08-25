import { NextRequest, NextResponse } from "next/server";
import { randomInt, createHash, timingSafeEqual } from "crypto";
import { supaGet, supaPatch, supaPost, isServiceKeyConfigured } from "@/lib/supabase";
import { sendOtpEmail } from "@/lib/mail";
import { authAttemptKey, clearAuthFailures, isAuthLocked, recordAuthFailure } from "@/lib/auth-rate-limit";

/**
 * OTPs are stored as a SHA-256 hash, never in plaintext.
 *
 * BUG-SEC-002: the reset OTP used to be written into `sent_emails.body` as
 * literal "OTP: 123456". `sent_emails` is a general-purpose log table that other
 * code paths read and that any DB-level read (backup dump, support query, a
 * future admin "email log" screen) exposes. Anyone who could see one row could
 * reset that account's password. Hashing means the stored value is useless to a
 * reader; only someone holding the emailed code can produce a matching digest.
 */
function hashOtp(email: string, code: string): string {
  // Email is mixed in so a digest captured for one account cannot be replayed
  // against another account that happened to be issued the same 6 digits.
  return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}

/** Constant-time compare so a timing side-channel cannot reveal the digest. */
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
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
    const attemptKey = authAttemptKey(request, "password-reset", email);
    const lockedFor = isAuthLocked(attemptKey);
    if (lockedFor) return json({ error: "too many password reset attempts; try again later" }, 429);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const admin = await findAdmin(email);
    const client = await findClientByEmail(email);

    const otp = String(p.otp || "").trim();
    const newHash = p.new_hash || "";

    if (!otp) {
      // BUG-SEC-003 (account enumeration): this used to 404 on an unknown email,
      // turning the endpoint into an oracle that confirms which addresses hold
      // accounts. We now always answer `{sent:true}` and simply do no work when
      // there is no account, so a prober learns nothing from the response.
      if (!admin && !client) {
        return json({ sent: true }, 200);
      }
      const code = String(randomInt(100000, 1000000));
      try {
        await sendOtpEmail(email, code);
      } catch (e: any) {
        return json(
          { error: "failed to send OTP: " + String(e?.message ?? e) },
          500,
        );
      }
      // Count every real OTP email against the same bucket so the send path
      // cannot be used to mail-bomb an address (5 sends / 15 min / email+IP).
      recordAuthFailure(attemptKey);
      try {
        await supaPost("sent_emails", {
          recipient: email,
          subject: "Your Password Reset OTP",
          // Hash only — see hashOtp(). The plaintext code exists solely in the
          // email that was just delivered to the account owner.
          body: "OTPHASH: " + hashOtp(email, code),
          client_id: client ? client.id : "system",
        });
      } catch (e: any) {
        return json({ error: "failed to log OTP: " + String(e?.message ?? e) }, 500);
      }
      return json({ sent: true }, 200);
    }

    // Verification path still requires a real account.
    if (!admin && !client) {
      recordAuthFailure(attemptKey);
      return json({ error: "invalid OTP" }, 403);
    }

    if (!newHash) return json({ error: "new_hash required" }, 400);

    const sent = await supaGet("sent_emails", {
      recipient: "eq." + email,
      subject: "eq.Your Password Reset OTP",
      order: "created_at.desc",
      limit: "1",
    });
    if (!Array.isArray(sent) || sent.length === 0) {
      recordAuthFailure(attemptKey);
      return json({ error: "invalid OTP" }, 403);
    }
    const latest = sent[0];
    const body = latest.body || "";
    const match = body.match(/OTPHASH:\s*([a-f0-9]{64})/i);
    if (!match) { recordAuthFailure(attemptKey); return json({ error: "invalid OTP" }, 403); }
    if (!safeEqualHex(match[1].toLowerCase(), hashOtp(email, otp))) {
      recordAuthFailure(attemptKey);
      return json({ error: "invalid OTP" }, 403);
    }
    // BUG-SEC-004: expiry was BEST-EFFORT. A malformed/absent `created_at`, or a
    // Date parse throw, hit `catch {}` and fell through to a successful reset —
    // an OTP with no timestamp never expired. Fail CLOSED instead: no verifiable
    // issue time means we refuse the reset.
    const created = latest.created_at;
    if (!created) return json({ error: "OTP expired" }, 403);
    const createdDt = new Date(String(created).replace("Z", "+00:00"));
    if (!Number.isFinite(createdDt.getTime())) {
      return json({ error: "OTP expired" }, 403);
    }
    if (Date.now() - createdDt.getTime() > 15 * 60 * 1000) {
      return json({ error: "OTP expired" }, 403);
    }

    // BUG-SEC-006: the OTP was never consumed. The same code stayed valid for a
    // full 15 minutes and could be replayed to reset the password repeatedly.
    // Burn it BEFORE applying the change so a replay racing this request fails.
    try {
      await supaPatch(
        "sent_emails",
        { id: "eq." + latest.id },
        { body: "OTPHASH: used" },
      );
    } catch {
      // If we cannot invalidate, we must not proceed — a non-consumable OTP is
      // exactly the replay hole we are closing.
      return json({ error: "could not consume OTP, please request a new one" }, 500);
    }

    if (admin) {
      await supaPatch("admins", { email: "eq." + email }, { password_hash: newHash });
    } else {
      await supaPatch("clients", { id: "eq." + client.id }, { password_hash: newHash });
    }

    clearAuthFailures(attemptKey);

    return json({ success: true, role: admin ? "admin" : "customer" }, 200);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
