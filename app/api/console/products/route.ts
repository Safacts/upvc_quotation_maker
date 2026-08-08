import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost } from "@/lib/supabase";
import { productWriteSchema, formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/products — rate card, paged + searchable.
 * POST /api/console/products — create (Alt+C from inside the item grid).
 *
 * This is a RATE CARD, not stock control. Deliberate: a product/rate master is
 * about a day's work and feeds line-item autocomplete plus bulk rate revision.
 * Real inventory (GRN, issue, valuation) is 2+ weeks and a different product —
 * explicitly out of scope per the architecture doc §1.3 / open question 5.
 *
 * `category` is FREE TEXT, not an enum (Supa's call, 08-08-2026): KPR will
 * invent categories we did not anticipate — "Mesh", "Hardware", "Glass" — and an
 * enum means a migration per category. Text plus autocomplete over DISTINCT is
 * cheaper and never blocks the user mid-entry.
 */

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const category = (url.searchParams.get("category") || "").trim().slice(0, 100);
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    // `client_id` is written literally at each call site rather than hidden in
    // this object — see the same note in the quotations route.
    const filters: Record<string, string | number | boolean> = {
      soft_deleted: "eq.false",
    };
    if (category) filters.category = "eq." + category;
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(name.ilike.*${safe}*,description.ilike.*${safe}*,category.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("products", {
      client_id: "eq." + gate.clientId,
      ...filters,
    });
    const rows = await supaGet("products", {
      client_id: "eq." + gate.clientId,
      ...filters,
      select: "id,name,category,description,price,unit,created_at,updated_at",
      order: "name.asc,id.asc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return consoleJson({
      rows: Array.isArray(rows) ? rows : [],
      page,
      page_size: pageSize,
      total_count: totalCount >= 0 ? totalCount : (rows?.length ?? 0),
      total_pages: totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
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

    const parsed = productWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    const inserted = await supaPost("products", {
      client_id: gate.clientId,
      name: data.name,
      category: data.category,
      description: data.description,
      price: data.price,
      // Migration 008 defaults `unit` to 'SFT'; an empty string from a blanked
      // form field would override the default with nothing.
      unit: data.unit || "SFT",
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ product: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
