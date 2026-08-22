import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPatch, supaDelete, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession, deleteSession } from "@/lib/session";
import { sendSignupNotification, sendSignupConfirmation, sendAdminCompose } from "@/lib/mail";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
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

    if (mode === "send") {
      if (session.role !== "admin") {
        return json({ error: "not authorized" }, 403);
      }
      const to = String(body.to || "").trim().toLowerCase();
      const subject = String(body.subject || "").trim();
      const text = String(body.body || "");
      if (!to || !subject || !text) {
        return json({ error: "to, subject and body are required" }, 400);
      }
      if (to.length > 320 || subject.length > 200 || text.length > 10000) {
        return json({ error: "content too long" }, 400);
      }
      try {
        await sendAdminCompose({ to, subject, text });
      } catch (e: any) {
        return json({ error: String(e?.message ?? e) }, 500);
      }
      return json({ sent: true, to, subject });
    }

    if (mode === "archive") {
      if (session.role !== "admin") {
        return json({ error: "not authorized" }, 403);
      }
      const reqId = String(body.id || "").trim();
      if (!reqId) return json({ error: "id required" }, 400);
      const allowedStatuses = ["archived", "pending", "submitted"];
      const newStatus = allowedStatuses.includes(body.status) ? body.status : "archived";
      await supaPatch("signup_requests", { id: "eq." + reqId }, {
        status: newStatus,
        updated_at: new Date().toISOString(),
      });
      return json({ archived: true, status: newStatus });
    }

    if (mode === "delete") {
      if (session.role !== "admin") {
        return json({ error: "not authorized" }, 403);
      }
      const reqId = String(body.id || "").trim();
      if (!reqId) return json({ error: "id required" }, 400);
      await supaDelete("signup_requests", { id: "eq." + reqId });
      return json({ deleted: true });
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

      // Lead-intel: the moment a pending lead enters a contact number, alert the
      // team immediately — even if they never click "Submit for Review". Fires
      // at most once per signup row (guarded via config flag).
      const newPhone = String(body.phone || "").trim();
      const hadPhone = String((row as any).phone || "").trim() !== "";
      const alreadyAlerted = Boolean(merged.contactCapturedAlertSent);
      const rowStatus = String(row.status || "pending");
      if (newPhone && !hadPhone && !alreadyAlerted && rowStatus === "pending") {
        try {
          await supaPatch("signup_requests", { email: "eq." + sessionEmail }, {
            config: { ...merged, contactCapturedAlertSent: true },
            updated_at: new Date().toISOString(),
          });
        } catch {
          // flag write is best-effort; still try to send the alert below
        }
        try {
          await sendSignupNotification("contact", {
            email: row.email,
            name: body.name !== undefined ? String(body.name) : row.name,
            phone: newPhone,
            config: merged,
          });
        } catch {
          // mail failure must not fail the save
        }
      }
      return json({ saved: true });
    }

    if (mode === "submit") {
      if (!row) return json({ error: "not found" }, 404);
      const status = row.status || "pending";
      if (status === "submitted" || status === "approved") {
        return json({ submitted: false, status });
      }
      const effectiveName = String(row.name || "").trim();
      const effectivePhone = String(
        row.phone || (row.config || {}).companyContact || "",
      ).trim();
      if (!effectiveName || !effectivePhone) {
        return json(
          {
            error:
              "Please fill Owner Name and Contact Number before submitting for review.",
          },
          400,
        );
      }
      const submittedAt = new Date().toISOString();
      await supaPatch("signup_requests", { email: "eq." + sessionEmail }, {
        status: "submitted",
        updated_at: submittedAt,
      });
      try {
        await sendSignupNotification("submitted", {
          email: row.email,
          name: effectiveName,
          phone: effectivePhone,
          config: row.config || {},
          submittedAt,
        });
      } catch (e) {
        // mail failure must not fail the submit
      }
      try {
        await sendSignupConfirmation({
          email: row.email,
          name: effectiveName,
          companyName: (row.config || {}).companyName,
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
