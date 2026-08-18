import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaCount, supaGet, supaPost } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (value ?? "").trim())
    .refine((value) => value.length <= max, { message: `Must be ${max} characters or fewer` });

const nonNegativeNumber = (defaultValue: number) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
        return defaultValue;
      }
      return typeof value === "number" ? value : Number(value);
    })
    .refine((value) => Number.isFinite(value) && value >= 0, { message: "Must be a non-negative number" });

const partyWriteSchema = z.object({
  name: text(200).refine((value) => value.length > 0, { message: "Name is required" }),
  party_type: z.enum(["customer", "supplier", "both"]).default("customer"),
  company_name: text(200),
  phone: text(40),
  email: text(320),
  address: text(500),
  city: text(100),
  state: text(100),
  state_code: text(10),
  pincode: text(20),
  gstin: text(20),
  pan: text(20),
  opening_balance: nonNegativeNumber(0),
  opening_balance_type: z.enum(["none", "debit", "credit"]).default("none"),
  credit_limit: nonNegativeNumber(0),
  payment_terms_days: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => value === null || value === undefined || value === "" ? 0 : Number(value))
    .refine((value) => Number.isInteger(value) && value >= 0, { message: "Must be a non-negative integer" }),
  notes: text(2000),
  is_active: z.boolean().optional().default(true),
});

const PARTY_SELECT =
  "id,business_id,name,party_type,company_name,phone,email,address,city,state,state_code,pincode,gstin,pan,opening_balance,opening_balance_type,credit_limit,payment_terms_days,notes,is_active,deleted_at,created_at,updated_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const type = url.searchParams.get("party_type");
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)));
    const filters: Record<string, string | number | boolean> = { deleted_at: "is.null" };
    if (!includeInactive) filters.is_active = "eq.true";
    if (type && ["customer", "supplier", "both"].includes(type)) filters.party_type = "eq." + type;
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) filters.or = `(name.ilike.*${safe}*,company_name.ilike.*${safe}*,phone.ilike.*${safe}*,email.ilike.*${safe}*,gstin.ilike.*${safe}*)`;
    }

    const query = { business_id: "eq." + gate.clientId, ...filters };
    const totalCount = await supaCount("parties", query);
    const rows = await supaGet("parties", {
      ...query,
      select: PARTY_SELECT,
      order: "name.asc,id.asc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return consoleJson({
      rows: Array.isArray(rows) ? rows : [],
      page,
      page_size: pageSize,
      total_count: totalCount >= 0 ? totalCount : (Array.isArray(rows) ? rows.length : 0),
      total_pages: totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1,
    });
  } catch (error: any) {
    return consoleJson({ error: String(error?.message ?? error) }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try { body = await request.json(); } catch { return consoleJson({ error: "Invalid JSON" }, 400); }
    const gate = await requireConsoleSession(request, (body as any)?.client_id);
    if (!gate.ok) return gate.error;
    const parsed = partyWriteSchema.safeParse(body);
    if (!parsed.success) return consoleJson({ error: "Validation failed", fields: formatZodError(parsed.error) }, 400);
    const inserted = await supaPost("parties", { business_id: gate.clientId, ...parsed.data });
    const party = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!party?.id) return consoleJson({ error: "Insert failed" }, 500);
    return consoleJson({ party }, 201);
  } catch (error: any) {
    return consoleJson({ error: String(error?.message ?? error) }, 500);
  }
}
