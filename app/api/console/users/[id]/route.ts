import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaDelete, supaGet, supaPatch } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const roles = ["owner", "manager", "accountant", "salesperson"] as const;
const patchSchema = z.object({ email: z.string().trim().email().max(320).optional(), full_name: z.string().trim().max(200).optional(), role: z.enum(roles).optional(), phone: z.string().trim().max(40).optional(), is_active: z.boolean().optional() }).strict();
const SELECT = "id,business_id,auth_user_id,email,full_name,role,phone,is_active,last_seen_at,created_at,updated_at";
type Context = { params: Promise<{ id: string }> };
async function ownedUser(request: NextRequest, id: string) {
  const gate = await requireConsoleSession(request);
  if (!gate.ok || !gate.clientId) return { gate, user: null };
  const rows = await supaGet("users", { id: `eq.${id}`, business_id: `eq.${gate.clientId}`, select: SELECT, limit: 1 });
  return { gate, user: Array.isArray(rows) ? rows[0] : null };
}
export async function GET(request: NextRequest, { params }: Context) {
  try { const { id } = await params; const result = await ownedUser(request, id); if (!result.gate.ok) return result.gate.error; if (!result.user) return consoleError("User not found", 404); return consoleJson({ user: result.user }); }
  catch (error: unknown) { console.error("User GET failed", error); return consoleError("Unable to load user"); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  try { const { id } = await params; const result = await ownedUser(request, id); if (!result.gate.ok) return result.gate.error; if (!result.user || !result.gate.clientId) return consoleError("User not found", 404); const parsed = patchSchema.safeParse(await request.json()); if (!parsed.success) return consoleJson({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, 400); if (!Object.keys(parsed.data).length) return consoleError("At least one field is required", 400); const data = { ...parsed.data, ...(parsed.data.email ? { email: parsed.data.email.toLowerCase() } : {}) }; const rows = await supaPatch("users", { id: `eq.${id}`, business_id: `eq.${result.gate.clientId}` }, data); return consoleJson({ user: Array.isArray(rows) ? rows[0] : rows }); }
  catch (error: unknown) { const message = error instanceof Error ? error.message : ""; if (message.includes("users_business_email_key") || message.includes("duplicate key")) return consoleError("A user with this email already exists", 409); console.error("User PATCH failed", error); return consoleError("Unable to update user"); }
}
export async function DELETE(request: NextRequest, { params }: Context) {
  try { const { id } = await params; const result = await ownedUser(request, id); if (!result.gate.ok) return result.gate.error; if (!result.user || !result.gate.clientId) return consoleError("User not found", 404); if (result.user.role === "owner") return consoleError("The business owner cannot be deleted", 400); await supaDelete("users", { id: `eq.${id}`, business_id: `eq.${result.gate.clientId}` }); return consoleJson({ success: true }); }
  catch (error: unknown) { console.error("User DELETE failed", error); return consoleError("Unable to delete user"); }
}
