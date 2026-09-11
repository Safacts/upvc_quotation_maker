import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaPost } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  lead_id: z.string().uuid().optional().nullable(),
  quotation_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().trim().max(200).optional().default(""),
  remind_at: z.string().trim().min(1),
  channel: z.enum(["push", "whatsapp", "email"]).optional().default("push"),
  template_key: z.string().trim().max(100).optional().default("followup_reminder"),
});

export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return consoleJson({ error: "Invalid JSON" }, 400);
  }
  const gate = await requireConsoleSession(request);
  if (!gate.ok) return gate.error;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return consoleJson({ error: "Validation failed" }, 400);
  const d = parsed.data;
  try {
    const inserted = await supaPost("followup_reminders", {
      client_id: gate.clientId,
      lead_id: d.lead_id ?? null,
      quotation_id: d.quotation_id ?? null,
      assigned_to: d.assigned_to ?? "",
      remind_at: d.remind_at,
      channel: d.channel ?? "push",
      template_key: d.template_key ?? "followup_reminder",
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return consoleJson({ reminder: row }, 201);
  } catch (e: unknown) {
    return consoleJson({ error: String((e as Error)?.message ?? e) }, 500);
  }
}
