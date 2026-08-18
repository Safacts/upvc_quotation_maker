import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { formatZodError } from "@/lib/console-schemas";
import { supaDelete, supaGet, supaPatch } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = z.string().uuid();
const TAX_TYPES = ["gst", "igst", "exempt", "none"] as const;
const SELECT = "id,business_id,name,code,rate,tax_type,cgst_rate,sgst_rate,igst_rate,is_system,is_active,created_at,updated_at";
const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const optionalRate = z.coerce.number().finite().min(0).max(100).optional();
const updateSchema = z.object({
  name: optionalText(120),
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).transform((v) => v.toUpperCase()).optional(),
  rate: optionalRate,
  tax_type: z.enum(TAX_TYPES).optional(),
  cgst_rate: optionalRate,
  sgst_rate: optionalRate,
  igst_rate: optionalRate,
  is_active: z.boolean().optional(),
});

async function loadTax(id: string) {
  const rows = await supaGet("taxes", { id: `eq.${id}`, select: SELECT, limit: 1 });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
function invalid(error: z.ZodError) { return consoleJson({ error: "Validation failed", fields: formatZodError(error) }, 400); }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireConsoleSession(request); if (!gate.ok) return gate.error;
    const id = (await params).id; if (!UUID.safeParse(id).success) return consoleJson({ error: "Invalid tax id" }, 400);
    const tax = await loadTax(id);
    if (!tax || (!gate.isAdmin && tax.business_id !== null && tax.business_id !== gate.clientId)) return consoleJson({ error: "Not found" }, 404);
    return consoleJson({ tax });
  } catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    let body: any; try { body = await request.json(); } catch { return consoleJson({ error: "Invalid JSON" }, 400); }
    const gate = await requireConsoleSession(request, body?.client_id); if (!gate.ok) return gate.error;
    const id = (await params).id; if (!UUID.safeParse(id).success) return consoleJson({ error: "Invalid tax id" }, 400);
    const tax = await loadTax(id);
    if (!tax || (!gate.isAdmin && tax.business_id !== null && tax.business_id !== gate.clientId)) return consoleJson({ error: "Not found" }, 404);
    if (tax.is_system) return consoleJson({ error: "System taxes cannot be modified" }, 403);
    const parsed = updateSchema.safeParse(body); if (!parsed.success) return invalid(parsed.error);
    const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
    if (!Object.keys(patch).length) return consoleJson({ error: "No fields to update" }, 400);
    const merged = { ...tax, ...patch };
    if ((merged.tax_type === "exempt" || merged.tax_type === "none") && [merged.rate, merged.cgst_rate, merged.sgst_rate, merged.igst_rate].some((v) => Number(v) !== 0)) return consoleJson({ error: "Exempt and none taxes must have zero rates" }, 400);
    await supaPatch("taxes", { id: `eq.${id}`, business_id: `eq.${tax.business_id}`, is_system: "eq.false" }, patch);
    return consoleJson({ ok: true, id });
  } catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireConsoleSession(request); if (!gate.ok) return gate.error;
    const id = (await params).id; if (!UUID.safeParse(id).success) return consoleJson({ error: "Invalid tax id" }, 400);
    const tax = await loadTax(id);
    if (!tax || (!gate.isAdmin && tax.business_id !== gate.clientId)) return consoleJson({ error: "Not found" }, 404);
    if (tax.is_system) return consoleJson({ error: "System taxes cannot be deleted" }, 403);
    await supaDelete("taxes", { id: `eq.${id}`, business_id: `eq.${tax.business_id}`, is_system: "eq.false" });
    return consoleJson({ ok: true, id });
  } catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}
