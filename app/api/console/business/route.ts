import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaGet, supaPatch } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUSINESS_SELECT = "id,name,legal_name,slug,email,phone,gstin,address,state,state_code,currency,timezone,settings,is_active,created_at,updated_at";
const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  legal_name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(40).optional(),
  gstin: z.string().trim().max(20).optional(),
  address: z.string().trim().max(1000).optional(),
  state: z.string().trim().max(100).optional(),
  state_code: z.string().trim().max(10).optional(),
  currency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().max(100).optional(),
  settings: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
}).strict();

type Business = Record<string, unknown>;

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok || !gate.clientId) return gate.error;
    const rows = await supaGet("businesses", {
      id: `eq.${gate.clientId}`,
      select: BUSINESS_SELECT,
      limit: 1,
    });
    const business = Array.isArray(rows) ? rows[0] as Business | undefined : undefined;
    if (!business) return consoleError("Business not found", 404);
    return consoleJson({ business });
  } catch (error: unknown) {
    console.error("Business GET failed", error);
    return consoleError("Unable to load business");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok || !gate.clientId) return gate.error;
    const body: unknown = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return consoleJson({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, 400);
    if (Object.keys(parsed.data).length === 0) return consoleError("At least one field is required", 400);
    const updated = await supaPatch("businesses", { id: `eq.${gate.clientId}` }, parsed.data);
    const business = Array.isArray(updated) ? updated[0] as Business | undefined : undefined;
    if (!business) return consoleError("Business not found", 404);
    return consoleJson({ business });
  } catch (error: unknown) {
    console.error("Business PATCH failed", error);
    return consoleError("Unable to update business");
  }
}
