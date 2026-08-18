import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaDelete, supaGet, supaPatch } from "@/lib/supabase";
import { formatZodError } from "@/lib/console-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const text = (max: number) => z.union([z.string(), z.null(), z.undefined()]).transform((value) => (value ?? "").trim()).refine((value) => value.length <= max, { message: `Must be ${max} characters or fewer` });
const nonNegativeNumber = (defaultValue: number) => z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((value) => value === null || value === undefined || value === "" ? defaultValue : typeof value === "number" ? value : Number(value)).refine((value) => Number.isFinite(value) && value >= 0, { message: "Must be a non-negative number" });
const partyPatchSchema = z.object({
  name: text(200).refine((value) => value.length > 0, { message: "Name is required" }).optional(),
  party_type: z.enum(["customer", "supplier", "both"]).optional(), company_name: text(200).optional(), phone: text(40).optional(), email: text(320).optional(), address: text(500).optional(), city: text(100).optional(), state: text(100).optional(), state_code: text(10).optional(), pincode: text(20).optional(), gstin: text(20).optional(), pan: text(20).optional(), opening_balance: nonNegativeNumber(0).optional(), opening_balance_type: z.enum(["none", "debit", "credit"]).optional(), credit_limit: nonNegativeNumber(0).optional(), payment_terms_days: z.union([z.number(), z.string()]).transform((value) => Number(value)).refine((value) => Number.isInteger(value) && value >= 0, { message: "Must be a non-negative integer" }).optional(), notes: text(2000).optional(), is_active: z.boolean().optional(),
}).strict();
const SELECT = "id,business_id,name,party_type,company_name,phone,email,address,city,state,state_code,pincode,gstin,pan,opening_balance,opening_balance_type,credit_limit,payment_terms_days,notes,is_active,deleted_at,created_at,updated_at";

type Params = { params: Promise<{ id: string }> };

async function ownedParty(request: NextRequest, id: string) {
  const gate = await requireConsoleSession(request);
  if (!gate.ok) return { gate };
  const rows = await supaGet("parties", { id: "eq." + id, business_id: "eq." + gate.clientId, deleted_at: "is.null", select: SELECT, limit: 1 });
  return { gate, party: Array.isArray(rows) ? rows[0] : null };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const id = (await params).id;
    if (!idSchema.safeParse(id).success) return consoleJson({ error: "Invalid party id" }, 400);
    const result = await ownedParty(request, id);
    if (!result.gate.ok) return result.gate.error;
    if (!result.party) return consoleJson({ error: "Party not found" }, 404);
    return consoleJson({ party: result.party });
  } catch (error: any) { return consoleJson({ error: String(error?.message ?? error) }, 500); }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = (await params).id;
    if (!idSchema.safeParse(id).success) return consoleJson({ error: "Invalid party id" }, 400);
    let body: unknown;
    try { body = await request.json(); } catch { return consoleJson({ error: "Invalid JSON" }, 400); }
    const gate = await requireConsoleSession(request, (body as any)?.client_id);
    if (!gate.ok) return gate.error;
    const existing = await supaGet("parties", { id: "eq." + id, business_id: "eq." + gate.clientId, deleted_at: "is.null", select: "id", limit: 1 });
    if (!Array.isArray(existing) || !existing[0]) return consoleJson({ error: "Party not found" }, 404);
    const parsed = partyPatchSchema.safeParse(body);
    if (!parsed.success) return consoleJson({ error: "Validation failed", fields: formatZodError(parsed.error) }, 400);
    const data = parsed.data as Record<string, unknown>;
    if (!Object.keys(data).length) return consoleJson({ error: "No fields to update" }, 400);
    const updated = await supaPatch("parties", { id: "eq." + id, business_id: "eq." + gate.clientId, deleted_at: "is.null" }, data);
    const party = Array.isArray(updated) ? updated[0] : updated;
    return consoleJson({ party: party || { id } });
  } catch (error: any) { return consoleJson({ error: String(error?.message ?? error) }, 500); }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const id = (await params).id;
    if (!idSchema.safeParse(id).success) return consoleJson({ error: "Invalid party id" }, 400);
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const existing = await supaGet("parties", { id: "eq." + id, business_id: "eq." + gate.clientId, deleted_at: "is.null", select: "id", limit: 1 });
    if (!Array.isArray(existing) || !existing[0]) return consoleJson({ error: "Party not found" }, 404);
    await supaPatch("parties", { id: "eq." + id, business_id: "eq." + gate.clientId, deleted_at: "is.null" }, { is_active: false, deleted_at: new Date().toISOString() });
    return consoleJson({ ok: true, id });
  } catch (error: any) { return consoleJson({ error: String(error?.message ?? error) }, 500); }
}
