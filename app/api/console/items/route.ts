import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaCount, supaGet, supaPost } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";
import { assertReferenceOwnership, ITEM_SELECT, itemWriteSchema } from "./_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const category = (url.searchParams.get("category") || "").trim().slice(0, 100);
    const itemType = (url.searchParams.get("item_type") || "").trim();
    const includeInactive = url.searchParams.get("include_inactive") === "true";
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)));
    const filters: Record<string, string | number | boolean> = { business_id: `eq.${gate.clientId}`, deleted_at: "is.null" };
    if (!includeInactive) filters.is_active = "eq.true";
    if (category) filters.category = `eq.${category}`;
    if (itemType) filters.item_type = `eq.${itemType}`;
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) filters.or = `(name.ilike.*${safe}*,sku.ilike.*${safe}*,description.ilike.*${safe}*,category.ilike.*${safe}*)`;
    }
    const total = await supaCount("items", filters);
    const rows = await supaGet("items", { ...filters, select: ITEM_SELECT, order: "name.asc,id.asc", limit: pageSize, offset: (page - 1) * pageSize });
    return consoleJson({ rows: Array.isArray(rows) ? rows : [], page, page_size: pageSize, total_count: total >= 0 ? total : rows?.length ?? 0, total_pages: total > 0 ? Math.ceil(total / pageSize) : 1 });
  } catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}

export async function POST(request: NextRequest) {
  try {
    let body: any; try { body = await request.json(); } catch { return consoleJson({ error: "Invalid JSON" }, 400); }
    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const parsed = itemWriteSchema.safeParse(body);
    if (!parsed.success) return consoleJson({ error: "Validation failed", fields: formatZodError(parsed.error) }, 400);
    const refError = await assertReferenceOwnership(gate.clientId!, parsed.data.unit_id, parsed.data.tax_id);
    if (refError) return consoleJson({ error: refError }, 400);
    const inserted = await supaPost("items", { ...parsed.data, business_id: gate.clientId });
    const item = Array.isArray(inserted) ? inserted[0] : inserted;
    return item?.id ? consoleJson({ item }, 201) : consoleJson({ error: "Insert failed" }, 500);
  } catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}
