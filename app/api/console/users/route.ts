import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaCount, supaGet, supaPost } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_SELECT = "id,business_id,auth_user_id,email,full_name,role,phone,is_active,last_seen_at,created_at,updated_at";
const roles = ["owner", "manager", "accountant", "salesperson"] as const;
const createSchema = z.object({
  email: z.string().trim().email().max(320),
  full_name: z.string().trim().max(200).default(""),
  role: z.enum(roles).default("salesperson"),
  phone: z.string().trim().max(40).default(""),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok || !gate.clientId) return gate.error;
    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("page_size") || "50", 10) || 50));
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const filters: Record<string, string> = { business_id: `eq.${gate.clientId}` };
    if (q) filters.or = `(email.ilike.*${q.replace(/[(),*]/g, " ")}*,full_name.ilike.*${q.replace(/[(),*]/g, " ")}*)`;
    const total = await supaCount("users", filters);
    const rows = await supaGet("users", { ...filters, select: USER_SELECT, order: "created_at.asc,id.asc", limit: pageSize, offset: (page - 1) * pageSize });
    return consoleJson({ users: Array.isArray(rows) ? rows : [], page, page_size: pageSize, total_count: total >= 0 ? total : (Array.isArray(rows) ? rows.length : 0) });
  } catch (error: unknown) {
    console.error("Users GET failed", error);
    return consoleError("Unable to load users");
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok || !gate.clientId) return gate.error;
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return consoleJson({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, 400);
    const inserted = await supaPost("users", { business_id: gate.clientId, ...parsed.data, email: parsed.data.email.toLowerCase() });
    const user = Array.isArray(inserted) ? inserted[0] : inserted;
    return consoleJson({ user }, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("users_business_email_key") || message.includes("duplicate key")) return consoleError("A user with this email already exists", 409);
    console.error("Users POST failed", error);
    return consoleError("Unable to create user");
  }
}
