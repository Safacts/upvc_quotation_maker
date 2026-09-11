import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaPost } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Foreground check-in only. No background trail is accepted here.
const schema = z.object({
  task_id: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  accuracy_m: z.number().min(0).max(100000).optional().nullable(),
  address: z.string().trim().max(500).optional().default(""),
  note: z.string().trim().max(1000).optional().default(""),
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
    const inserted = await supaPost("task_checkins", {
      client_id: gate.clientId,
      task_id: d.task_id,
      user_id: gate.session?.email ?? "",
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      accuracy_m: d.accuracy_m ?? null,
      address: d.address ?? "",
      note: d.note ?? "",
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return consoleJson({ checkin: row }, 201);
  } catch (e: unknown) {
    return consoleJson({ error: String((e as Error)?.message ?? e) }, 500);
  }
}
