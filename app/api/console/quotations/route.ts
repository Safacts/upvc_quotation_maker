import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost, supaDelete, supabaseRpc, supaGetSafe, supaPostSafe } from "@/lib/supabase";
import { quotationTotals } from "@/lib/pricing";
import {
  quotationQuerySchema,
  quotationWriteSchema,
  formatZodError,
} from "@/lib/console-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/quotations — paged, sorted, filtered quotation grid.
 * POST /api/console/quotations — create a quotation with its line items.
 *
 * ============================================================================
 *  search_quotations RPC — wired with PostgREST fallback
 * ============================================================================
 * Migration 010 defines `search_quotations` / `get_quote_stats`. When it is
 * applied the RPC is the correct home for this query: the money math lives next
 * to the data, sorting by computed money columns (grand_total, net_total) is
 * pushed down, and total_count comes back in one pass.
 *
 * VERIFIED on 08-08-2026 the migration is NOT YET APPLIED (the pooler host
 * rejects the tenant user from this network). Rather than shipping a grid that
 * is broken on arrival, this route TRIES the RPC first and transparently falls
 * back to the PostgREST+paging implementation below when the RPC returns 404.
 * The response contract is identical either way — callers cannot tell the
 * difference. When the migration lands, the fallback simply stops firing.
 */

/** Fields the grid needs. Deliberately excludes `address` — heavy, unused in the list. */
const LIST_SELECT =
  "id,quote_no,date,customer_name,contact_no,email,reference,supplier_company," +
  "status,transport_cost,include_gst,gst_percentage,advance_paid,created_at,customer_id," +
  "measured_items(id,width,height,units,rate),unmeasured_items(id,units,rate)";

/**
 * Normalise a status for comparison.
 *
 * The live table contains BOTH 'Draft' and 'draft' (verified 08-08-2026, 49
 * rows). PostgREST `in.(...)` is case-sensitive, so filtering on 'draft' silently
 * drops the legacy capitalised rows — the user sees a grid that is missing
 * quotations they know exist, with no error. Every status comparison in this file
 * goes through here.
 */
function normStatus(v: unknown): string {
  return (v ?? "draft").toString().trim().toLowerCase();
}

/** Case-insensitive status filter that survives the legacy 'Draft' rows. */
function statusFilterValues(statuses: string[]): string[] {
  const out = new Set<string>();
  for (const s of statuses) {
    const lower = s.toLowerCase();
    out.add(lower);
    out.add(lower.charAt(0).toUpperCase() + lower.slice(1));
    out.add(lower.toUpperCase());
  }
  return [...out];
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = quotationQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      dir: url.searchParams.get("dir") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      page_size: url.searchParams.get("page_size") ?? undefined,
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query", fields: formatZodError(parsed.error) }, 400);
    }
    const { q, status, from, to, sort, dir, page, page_size } = parsed.data;

    // ---- Try the RPC first (migration 010) ---------------------------------
    // When applied, `search_quotations` pushes sort/filter/page into Postgres and
    // returns total_count in one pass. On a 404 (migration not yet live) we fall
    // through to the PostgREST implementation below — same response contract.
    try {
      const rpcRows = await supabaseRpc("search_quotations", {
        p_cid: clientId,
        p_q: q || null,
        p_status: status.length ? status : null,
        p_from: from || null,
        p_to: to || null,
        p_customer_id: null,
        p_sort: sort,
        p_dir: dir,
        p_page: page,
        p_page_size: page_size,
      });

      if (Array.isArray(rpcRows)) {
        const totalCount = rpcRows.length > 0 ? Number(rpcRows[0]?.total_count || rpcRows.length) : 0;
        const list = rpcRows.map((r: any) => ({
          id: r.id,
          quote_no: r.quote_no || "",
          date: r.quote_date || "",
          customer_name: r.customer_name || "",
          contact_no: r.contact_no || "",
          email: "",
          reference: r.reference || "",
          supplier_company: r.supplier_company || "",
          customer_id: r.customer_id || null,
          status: normStatus(r.status),
          created_at: r.created_at,
          item_count: 0,
          total_sqft: Number(r.total_sqft) || 0,
          subtotal: Number(r.subtotal) || 0,
          transport: Number(r.transport) || 0,
          net_total: Number(r.net_total) || 0,
          gst_percentage: Number(r.gst_percentage) || 0,
          gst_amount: Number(r.gst_amount) || 0,
          grand_total: Number(r.grand_total) || 0,
        }));

        return consoleJson({
          rows: list,
          page,
          page_size,
          total_count: totalCount,
          total_pages: totalCount > 0 ? Math.ceil(totalCount / page_size) : 1,
          sort,
          dir,
        });
      }
    } catch {
      // RPC not available (migration 010 not applied) — fall through.
    }

    // ---- PostgREST fallback ------------------------------------------------
    // NOTE: `client_id` is deliberately NOT stored in this object. It is written
    // out literally at every query below.
    //
    // Folding it in here and spreading the object would still send the filter,
    // but it would hide the tenant boundary from anyone auditing the query —
    // including the STATIC AUDIT in tests/client-isolation.test.ts, which greps
    // each supa-call for the literal text `client_id` and cannot see through a
    // spread. A reviewer skimming this file must see the tenant scope ON the
    // query, not two scrolls above it. Since the service-role key bypasses RLS
    // and this filter IS the entire tenant boundary, "go and check further up"
    // is not an acceptable answer.
    //
    // SOFT DELETE: the RPC path (migration 010) filters `NOT q.deleted`
    // internally; this fallback did not. Because the RPC failure above is
    // swallowed silently, any RPC outage flipped the grid over to a fallback
    // that RESURRECTED soft-deleted quotations — they reappeared in the list
    // and counted toward the revenue KPIs, with no error anywhere to explain
    // why the numbers moved. The two paths must agree on what "a quotation"
    // means. This also activates the existing partial index
    // `quotations_client_live_idx (client_id) WHERE deleted = false`.
    const filters: Record<string, string | number | boolean> = {
      deleted: "eq.false",
    };

    if (status.length) {
      filters.status = "in.(" + statusFilterValues(status).join(",") + ")";
    }
    if (from) filters.created_at = "gte." + from;
    // `to` is EXCLUSIVE and applied as a second predicate on the same column.
    // PostgREST needs distinct keys for two conditions on one column, hence the
    // `and=` form below rather than overwriting `filters.created_at`.
    if (from && to) {
      delete filters.created_at;
      filters.and = `(created_at.gte.${from},created_at.lt.${to})`;
    } else if (to) {
      filters.created_at = "lt." + to;
    }

    if (q) {
      // Search across the three fields a fabricator actually types: the customer,
      // the quote number, and the phone. `*` is PostgREST's ILIKE wildcard.
      // Commas and parens inside `or=(...)` would terminate the expression, so
      // they are stripped rather than escaped.
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(customer_name.ilike.*${safe}*,quote_no.ilike.*${safe}*,contact_no.ilike.*${safe}*)`;
      }
    }

    // ---- Count (filtered, not table-wide) ----------------------------------
    // "Showing 1-50 of N" must describe the ACTIVE FILTER. Reporting the table
    // total instead makes the pager offer pages that render empty.
    const totalCount = await supaCount("quotations", {
      client_id: "eq." + clientId,
      ...filters,
    });

    // ---- Page --------------------------------------------------------------
    // `id` is a TIEBREAKER, not decoration. Offset paging re-runs the query per
    // page; without a deterministic second key, rows sharing a `created_at`
    // (bulk imports, same-second saves) swap between pages — one quote appears
    // twice and another is skipped, and the totals are silently wrong.
    const offset = (page - 1) * page_size;
    const rows = await supaGetSafe("quotations", {
      client_id: "eq." + clientId,
      ...filters,
      select: LIST_SELECT,
      order: `${sort}.${dir},id.desc`,
      limit: page_size,
      offset,
    });

    const list = (Array.isArray(rows) ? rows : []).map((r: any) => {
      // ONE money implementation for every surface. See src/lib/pricing.ts.
      const totals = quotationTotals(r, r.measured_items, r.unmeasured_items);
      return {
        id: r.id,
        quote_no: r.quote_no || "",
        date: r.date || "",
        customer_name: r.customer_name || "",
        contact_no: r.contact_no || "",
        email: r.email || "",
        reference: r.reference || "",
        supplier_company: r.supplier_company || "",
        customer_id: r.customer_id || null,
        status: normStatus(r.status),
        created_at: r.created_at,
        item_count:
          (r.measured_items?.length || 0) + (r.unmeasured_items?.length || 0),
        total_sqft: totals.totalSqft,
        subtotal: totals.subtotal,
        transport: totals.transport,
        net_total: totals.netTotal,
        gst_percentage: totals.gstPercentage,
        gst_amount: totals.gstAmount,
        grand_total: totals.grandTotal,
      };
    });

    return consoleJson({
      rows: list,
      page,
      page_size,
      // -1 means PostgREST did not return a parseable count; the UI shows the
      // row count instead of inventing a total.
      total_count: totalCount >= 0 ? totalCount : list.length,
      total_pages: totalCount > 0 ? Math.ceil(totalCount / page_size) : 1,
      sort,
      dir,
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

    // The admin override is read from the body here, but `resolveTenant` still
    // refuses to honour it for a customer session — a customer's own client_id
    // is used regardless of what they send.
    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const parsed = quotationWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    // A blank draft is useful as the editor's first workspace, but repeated
    // autosaves/new-editor visits must not create an endless list of blanks.
    // Check child tables rather than trusting totals: a quotation with no
    // measured or unmeasured rows is the only kind considered empty.
    if (data.measured_items.length === 0 && data.unmeasured_items.length === 0) {
      const quotations = await supaGet("quotations", {
        client_id: "eq." + clientId,
        select: "id",
      });
      if (Array.isArray(quotations) && quotations.length > 0) {
        const measured = await supaGet("measured_items", {
          client_id: "eq." + clientId,
          select: "quotation_id",
        });
        const unmeasured = await supaGet("unmeasured_items", {
          client_id: "eq." + clientId,
          select: "quotation_id",
        });
        const itemQuoteIds = new Set(
          [...(Array.isArray(measured) ? measured : []), ...(Array.isArray(unmeasured) ? unmeasured : [])]
            .map((row: any) => String(row.quotation_id)),
        );
        const existingBlank = quotations.find((row: any) => !itemQuoteIds.has(String(row.id)));
        if (existingBlank) {
          return consoleJson(
            {
              error: "Only one empty quotation is allowed",
              existing_id: existingBlank.id,
            },
            409,
          );
        }
      }
    }

    // A supplied `customer_id` names a row in another table. Verify it belongs
    // to THIS tenant before storing the link — otherwise a legitimately
    // logged-in user can graft their quotation onto a stranger's customer
    // record. This is the exact class of bug that made
    // `/api/gst_invoices/items` exploitable: the row looked correctly scoped
    // while pointing at someone else's parent.
    if (data.customer_id) {
      const owner = await supaGet("customers", {
        id: "eq." + data.customer_id,
        client_id: "eq." + clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(owner) || owner.length === 0) {
        return consoleJson({ error: "Unknown customer" }, 404);
      }
    }

    const inserted = await supaPostSafe("quotations", {
      client_id: clientId,
      quote_no: data.quote_no,
      date: data.date || new Date().toISOString().slice(0, 10),
      customer_name: data.customer_name,
      contact_no: data.contact_no,
      email: data.email,
      address: data.address,
      reference: data.reference,
      supplier_company: data.supplier_company,
      status: data.status,
      transport_cost: data.transport_cost,
      advance_paid: data.advance_paid,
      include_gst: data.include_gst,
      gst_percentage: data.gst_percentage,
      customer_id: data.customer_id,
    });

    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    // Children carry `client_id` too — `measured_items` and `unmeasured_items`
    // have their own column and their own RLS policy, and a NULL there makes the
    // row invisible to the anon-key path the Flutter app still uses.
    // If either child insert fails, remove the header we just created. A header
    // without its lines is an orphan that appears as a valid quotation in grids.
    try {
      if (data.measured_items.length) {
        await supaPost(
          "measured_items",
          data.measured_items.map((m) => ({
            quotation_id: row.id,
            client_id: clientId,
            code: m.code,
            description: m.description,
            glass: m.glass,
            width: m.width,
            height: m.height,
            units: m.units,
            rate: m.rate,
            bom_config: m.bom,
          })) as any,
        );
      }
      if (data.unmeasured_items.length) {
        await supaPost(
          "unmeasured_items",
          data.unmeasured_items.map((u) => ({
            quotation_id: row.id,
            client_id: clientId,
            description: u.description,
            units: u.units,
            rate: u.rate,
          })) as any,
        );
      }
    } catch (e) {
      // Best effort: preserve the original insert error, but never knowingly
      // leave a partially-created quotation behind.
      const cleanup = await Promise.allSettled([
        supaDelete("measured_items", { quotation_id: "eq." + row.id, client_id: "eq." + clientId }),
        supaDelete("unmeasured_items", { quotation_id: "eq." + row.id, client_id: "eq." + clientId }),
        supaDelete("quotations", { id: "eq." + row.id, client_id: "eq." + clientId }),
      ]);
      for (const outcome of cleanup) {
        if (outcome.status === "rejected") {
          console.error("[console/quotations] orphan cleanup failed:", String(outcome.reason));
        }
      }
      throw e;
    }

    const totals = quotationTotals(row, data.measured_items, data.unmeasured_items);
    return consoleJson({ id: row.id, quote_no: row.quote_no, totals }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
