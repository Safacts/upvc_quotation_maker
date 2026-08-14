import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaGet, supaPost } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Item templates — reusable measured-item presets for the quotation editor.
 *
 *   GET  /api/console/item-templates — list this tenant's active templates.
 *   POST /api/console/item-templates — create a template (also powers a future
 *         "Save row as template" action).
 *
 * Table `item_templates` (created by a parallel migration) columns:
 *   id, client_id, name, description, width_mm, height_mm, window_type,
 *   quantity, rate, glass, is_active.
 *
 * Every read/write is scoped to `client_id` from the session cookie — the same
 * isolation contract as every other `/api/console/*` route.
 */

// Accepts number or numeric string from the client, normalises to a string the
// `measured_items` grid expects ("" means "not set"). Empty/garbage → "".
const dimSchema = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return "";
    const s = String(v).trim();
    return s;
  })
  .optional()
  .default("");

const templateWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(""),
  width_mm: dimSchema,
  height_mm: dimSchema,
  window_type: z.string().trim().max(100).optional().default(""),
  quantity: dimSchema,
  rate: dimSchema,
  glass: z.string().trim().max(200).optional().default(""),
});

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const rows = await supaGet("item_templates", {
      client_id: "eq." + gate.clientId,
      is_active: "eq.true",
      select: "id,name,description,width_mm,height_mm,window_type,quantity,rate,glass",
      order: "name.asc",
    });
    return consoleJson({ templates: Array.isArray(rows) ? rows : [] });
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleJson({ error: "Invalid JSON" }, 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;

    const parsed = templateWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        400,
      );
    }
    const d = parsed.data;

    const inserted = await supaPost("item_templates", {
      client_id: gate.clientId,
      name: d.name,
      description: d.description,
      width_mm: d.width_mm,
      height_mm: d.height_mm,
      window_type: d.window_type,
      quantity: d.quantity || "1",
      rate: d.rate,
      glass: d.glass,
      is_active: true,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleError("Insert failed");

    return consoleJson({ template: row }, 201);
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}
