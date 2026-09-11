import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supaPost } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logs wa.me (MVP) attempts today; BSP send swaps behind this contract later.
// Same-origin + session gated. client_id NEVER taken from body for customers.
const schema = z.object({
  to_phone: z.string().trim().min(10).max(20),
  message: z.string().trim().min(1).max(2000),
  template: z.string().trim().max(100).optional().default("field_quote_sent"),
  channel: z.enum(["wa.me", "bsp", "email", "portal"]).optional().default("wa.me"),
  related_id: z.string().uuid().optional().nullable(),
});

export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const session = await getSession();
  if (!session || (session.role !== "customer" && session.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  const d = parsed.data;
  try {
    await supaPost("whatsapp_logs", {
      client_id: session.client_id ?? "",
      to_phone: d.to_phone,
      template: d.template ?? "field_quote_sent",
      message: d.message,
      related_id: d.related_id ?? null,
      channel: d.channel ?? "wa.me",
      status: "logged",
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: String((e as Error)?.message ?? e) },
      { status: 500 }
    );
  }
}
