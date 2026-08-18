import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { formatZodError } from "@/lib/console-schemas";
import { supaCount, supaGetSafe, supaPost } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAX_TYPES = ["gst", "igst", "exempt", "none"] as const;
const SELECT = "id,business_id,name,code,rate,tax_type,cgst_rate,sgst_rate,igst_rate,is_system,is_active,created_at,updated_at";

const text = (max: number) => z.string().trim().min(1).max(max);
const rate = z.coerce.number().finite().min(0).max(100);

const writeSchema = z.object({
  name: text(120),
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, "Code may contain only letters, numbers, underscores and hyphens").transform((v) => v.toUpperCase()),
  rate,
  tax_type: z.enum(TAX_TYPES).default("gst"),
  cgst_rate: rate.default(0),
  sgst_rate: rate.default(0),
  igst_rate: rate.default(0),
  is_active: z.boolean().default(true),
});

function validationError(error: z.ZodError) {
  return consoleJson({ error: "Validation failed", fields: formatZodError(error) }, 400);
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("page_size") || 50)));
    if (!Number.isInteger(page) || !Number.isInteger(pageSize)) return consoleJson({ error: "Invalid pagination" }, 400);
    const q = (url.searchParams.get("q") || "").trim().replace(/[(),*]/g, " ");
    const taxType = url.searchParams.get("tax_type");
    const active = url.searchParams.get("is_active");
    const filters: Record<string, string> = {
      or: `(business_id.is.null,business_id.eq.${gate.clientId})`,
    };
    if (taxType) {
      if (!TAX_TYPES.includes(taxType as any)) return consoleJson({ error: "Invalid tax_type" }, 400);
      filters.tax_type = `eq.${taxType}`;
    }
    if (active === "true" || active === "false") filters.is_active = `eq.${active}`;
    if (q) {
      filters.and = `(or(business_id.is.null,business_id.eq.${gate.clientId}),or(name.ilike.*${q}*,code.ilike.*${q}*))`;
      delete filters.or;
    }
    const count = await supaCount("taxes", filters);
    const rows = await supaGetSafe("taxes", {
      ...filters,
      select: SELECT,
      order: "is_system.desc,name.asc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const list = Array.isArray(rows) ? rows : [];
    return consoleJson({ rows: list, page, page_size: pageSize, total_count: count >= 0 ? count : list.length, total_pages: count > 0 ? Math.ceil(count / pageSize) : 1 });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any;
    try { body = await request.json(); } catch { return consoleJson({ error: "Invalid JSON" }, 400); }
    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const parsed = writeSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const data = parsed.data;
    if (data.tax_type === "exempt" || data.tax_type === "none") {
      if (data.rate !== 0 || data.cgst_rate !== 0 || data.sgst_rate !== 0 || data.igst_rate !== 0) return consoleJson({ error: "Exempt and none taxes must have zero rates" }, 400);
    }
    const inserted = await supaPost("taxes", { business_id: gate.clientId, ...data, is_system: false });
    const tax = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!tax?.id) return consoleJson({ error: "Insert failed" }, 500);
    return consoleJson({ tax }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
