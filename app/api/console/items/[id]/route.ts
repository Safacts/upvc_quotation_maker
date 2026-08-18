import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaDelete, supaGet, supaPatch } from "@/lib/supabase";
import { formatZodError } from "@/lib/console-schemas";
import { assertReferenceOwnership, ITEM_SELECT, itemIdSchema, itemPatchSchema } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function owned(id: string, businessId: string) { return supaGet("items", { id: `eq.${id}`, business_id: `eq.${businessId}`, deleted_at: "is.null", select: ITEM_SELECT, limit: 1 }); }

export async function GET(request: NextRequest, { params }: Context) {
  try { const gate = await requireConsoleSession(request); if (!gate.ok) return gate.error; const id = (await params).id; if (!itemIdSchema.safeParse(id).success) return consoleJson({ error: "Invalid item id" }, 400); const rows = await owned(id, gate.clientId!); return rows?.[0] ? consoleJson({ item: rows[0] }) : consoleJson({ error: "Item not found" }, 404); }
  catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try { let body: any; try { body = await request.json(); } catch { return consoleJson({ error: "Invalid JSON" }, 400); } const gate = await requireConsoleSession(request, body?.client_id); if (!gate.ok) return gate.error; const id = (await params).id; if (!itemIdSchema.safeParse(id).success) return consoleJson({ error: "Invalid item id" }, 400); if (!(await owned(id, gate.clientId!))?.[0]) return consoleJson({ error: "Item not found" }, 404); const parsed = itemPatchSchema.safeParse(body); if (!parsed.success) return consoleJson({ error: "Validation failed", fields: formatZodError(parsed.error) }, 400); const refError = await assertReferenceOwnership(gate.clientId!, parsed.data.unit_id, parsed.data.tax_id); if (refError) return consoleJson({ error: refError }, 400); const updated = await supaPatch("items", { id: `eq.${id}`, business_id: `eq.${gate.clientId}`, deleted_at: "is.null" }, parsed.data); const item = Array.isArray(updated) ? updated[0] : updated; return item ? consoleJson({ item }) : consoleJson({ error: "Item not found" }, 404); }
  catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try { const gate = await requireConsoleSession(request); if (!gate.ok) return gate.error; const id = (await params).id; if (!itemIdSchema.safeParse(id).success) return consoleJson({ error: "Invalid item id" }, 400); const updated = await supaPatch("items", { id: `eq.${id}`, business_id: `eq.${gate.clientId}`, deleted_at: "is.null" }, { deleted_at: new Date().toISOString(), is_active: false }); return updated?.length ? consoleJson({ ok: true }) : consoleJson({ error: "Item not found" }, 404); }
  catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}
