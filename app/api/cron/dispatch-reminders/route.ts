import { NextRequest } from "next/server";
import { consoleJson } from "@/lib/console-auth";
import { supaGet, supaPost, supaPatch } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron (every 5 min): due followup_reminders -> app_notifications.
// Auth: CRON_SECRET bearer (Vercel) else service-role internal. No tenant input.
// Telegram is ON HOLD per owner decision -- this dispatches push/email only.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return consoleJson({ error: "Unauthorized" }, 401);
    }
  }
  try {
    const now = new Date().toISOString();
    const due = await supaGet("followup_reminders", {
      state: "eq.pending",
      remind_at: "lte." + now,
      select: "id,client_id,lead_id,quotation_id,assigned_to,channel,template_key",
      limit: 100,
    });
    const rows = Array.isArray(due) ? due : [];
    let sent = 0;
    for (const r of rows as Array<Record<string, unknown>>) {
      try {
        await supaPost("app_notifications", {
          client_id: r.client_id,
          kind: "followup",
          title: "Follow-up due",
          body: "A scheduled follow-up is due. Open the task to call or message.",
        });
        await supaPatch(
          "followup_reminders",
          { id: "eq." + String(r.id) },
          { state: "sent" }
        );
        sent += 1;
      } catch {
        try {
          await supaPatch(
            "followup_reminders",
            { id: "eq." + String(r.id) },
            { state: "failed" }
          );
        } catch {}
      }
    }
    return consoleJson({ ok: true, due: rows.length, sent });
  } catch (e: unknown) {
    return consoleJson({ error: String((e as Error)?.message ?? e) }, 500);
  }
}
