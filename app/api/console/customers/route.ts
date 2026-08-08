import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost } from "@/lib/supabase";
import { customerWriteSchema, formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/customers — customer master, paged + searchable.
 * POST /api/console/customers — create (also powers Alt+C create-on-the-fly).
 *
 * Backs the Customers grid and the `EntityCombobox` in the quotation editor.
 * Table is live (migration 007 applied, verified 08-08-2026).
 *
 * SOFT DELETE: `customers.soft_deleted` exists because fabricators delete the
 * wrong customer and a hard delete would take the FK link off their historical
 * quotations with it. Every read here filters `soft_deleted=eq.false`; the rows
 * remain for the audit trail.
 */

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    // `client_id` is written literally at each call site rather than hidden in
    // this object — see the same note in the quotations route. A spread that
    // conceals the tenant boundary defeats both human review and the STATIC
    // AUDIT in tests/client-isolation.test.ts.
    const filters: Record<string, string | number | boolean> = {
      soft_deleted: "eq.false",
    };
    if (q) {
      // Parens/commas/asterisks would terminate the `or=(...)` expression.
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(name.ilike.*${safe}*,phone.ilike.*${safe}*,company.ilike.*${safe}*,email.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("customers", {
      client_id: "eq." + gate.clientId,
      ...filters,
    });
    const rows = await supaGet("customers", {
      client_id: "eq." + gate.clientId,
      ...filters,
      select: "id,name,phone,email,company,address,gst_number,created_at,updated_at",
      // `id` tiebreaker: `name` is not unique, so offset paging without it can
      // repeat or skip a customer between pages.
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

    const parsed = customerWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    // Migration 007 has a UNIQUE index on (client_id, phone) WHERE phone <> ''
    // AND soft_deleted = false. Hitting it raises a 409 from PostgREST with a
    // Postgres constraint name in the body — useless to a fabricator mid-quote.
    // Alt+C create-on-the-fly makes duplicate phones the NORMAL case (the same
    // repeat customer typed in again), so we look first and return the existing
    // row instead of an error. The user gets their customer either way.
    if (data.phone) {
      const existing = await supaGet("customers", {
        client_id: "eq." + gate.clientId,
        phone: "eq." + data.phone,
        soft_deleted: "eq.false",
        select: "id,name,phone,email,company,address,gst_number",
        limit: 1,
      });
      if (Array.isArray(existing) && existing.length > 0) {
        return consoleJson({ customer: existing[0], existing: true }, 200);
      }
    }

    const inserted = await supaPost("customers", {
      client_id: gate.clientId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      company: data.company,
      address: data.address,
      gst_number: data.gst_number,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ customer: row, existing: false }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
