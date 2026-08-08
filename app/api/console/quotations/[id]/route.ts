import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supaPost, supaDelete } from "@/lib/supabase";
import { quotationTotals } from "@/lib/pricing";
import { quotationWriteSchema, formatZodError } from "@/lib/console-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    /api/console/quotations/[id] — load one quotation with its line items.
 * PATCH  /api/console/quotations/[id] — save the split-view editor (Ctrl+S).
 * DELETE /api/console/quotations/[id] — delete a quotation and its children.
 *
 * ============================================================================
 *  THE OWNERSHIP CHECK IS NOT OPTIONAL
 * ============================================================================
 * `id` comes from the URL PATH, which is entirely attacker-controlled. Scoping
 * the WRITE by `client_id` is not sufficient on its own: a PATCH filtered by
 * `id=eq.X AND client_id=eq.mine` against someone else's quotation updates zero
 * rows and PostgREST returns `[]` with HTTP 200 — the UI would report "Saved"
 * for a write that never happened.
 *
 * So every method here does the same two steps in the same order:
 *   1. Read the row by primary key and take its REAL `client_id`.
 *   2. Compare that to the session's tenant. 404 on mismatch — never 403.
 *
 * 404 rather than 403 is deliberate. A 403 confirms "this id exists but is not
 * yours", which turns the endpoint into an enumeration oracle for a competitor
 * counting how many quotations another fabricator has. A missing row and a
 * forbidden row must be indistinguishable from outside.
 */

/** Load the row's true owner. Returns null when the id does not exist at all. */
async function loadOwner(id: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("quotations", {
    id: "eq." + id,
    select: "id,client_id",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

const DETAIL_SELECT =
  "id,quote_no,date,customer_name,contact_no,email,address,reference," +
  "supplier_company,status,transport_cost,include_gst,gst_percentage," +
  "created_at,client_id,customer_id," +
  "measured_items(id,code,description,glass,width,height,units,rate,created_at)," +
  "unmeasured_items(id,description,units,rate,created_at)";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGet("quotations", {
      id: "eq." + id,
      // Both predicates on the SAME request: the row must exist AND be ours.
      client_id: "eq." + gate.clientId,
      select: DETAIL_SELECT,
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }

    const q = rows[0];
    // PostgREST does not order embedded rows. Without this, the line items
    // reshuffle between loads and the user's row 3 is not the same row 3 they
    // edited a minute ago.
    const measured = [...(q.measured_items || [])].sort((a: any, b: any) =>
      String(a.created_at || "").localeCompare(String(b.created_at || "")),
    );
    const unmeasured = [...(q.unmeasured_items || [])].sort((a: any, b: any) =>
      String(a.created_at || "").localeCompare(String(b.created_at || "")),
    );

    return consoleJson({
      quotation: {
        ...q,
        status: (q.status || "draft").toString().trim().toLowerCase(),
        measured_items: undefined,
        unmeasured_items: undefined,
      },
      measured_items: measured,
      unmeasured_items: unmeasured,
      totals: quotationTotals(q, measured, unmeasured),
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleJson({ error: "Invalid JSON" }, 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const owner = await loadOwner(id);
    if (!owner) return consoleJson({ error: "Not found" }, 404);
    // Admins may cross tenants; a customer's gate.clientId is their own, so this
    // single comparison covers both roles correctly.
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleJson({ error: "Not found" }, 404);
    }
    // The row's OWN client_id wins. Never re-stamp a row with the caller's
    // tenant — that would let an admin silently move a quotation between
    // companies by editing it.
    const clientId = owner.client_id;

    const parsed = quotationWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    if (data.customer_id) {
      const cust = await supaGet("customers", {
        id: "eq." + data.customer_id,
        client_id: "eq." + clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(cust) || cust.length === 0) {
        return consoleJson({ error: "Unknown customer" }, 404);
      }
    }

    await supaPatch(
      "quotations",
      { id: "eq." + id, client_id: "eq." + clientId },
      {
        quote_no: data.quote_no,
        date: data.date,
        customer_name: data.customer_name,
        contact_no: data.contact_no,
        email: data.email,
        address: data.address,
        reference: data.reference,
        supplier_company: data.supplier_company,
        status: data.status,
        transport_cost: data.transport_cost,
        include_gst: data.include_gst,
        gst_percentage: data.gst_percentage,
        customer_id: data.customer_id,
      },
    );

    // Line items are REPLACED, not diffed.
    //
    // A diff needs stable client-side ids for rows the user may have inserted,
    // deleted and reordered in one editing session, and every mismatch shows up
    // as a duplicated or vanished line on a customer-facing document. Replace is
    // O(n) on a list capped at 200 and is trivially correct.
    //
    // The known trade-off, written down rather than discovered later: this is
    // NOT atomic — PostgREST has no transaction across calls. A failure between
    // the delete and the insert leaves the quotation with no line items. The
    // header row survives, so nothing is unrecoverable, and the fix (a single
    // `save_quotation` plpgsql RPC) belongs with migrations 009/010 which are
    // not yet applied. Deletes run BEFORE inserts so a partial failure cannot
    // double the line items and double the customer's price.
    //
    // `client_id` is on the delete as well as `quotation_id`, even though the
    // parent's ownership was just verified. `measured_items` and
    // `unmeasured_items` each carry their own `client_id` column, so scoping
    // costs nothing and means a destructive statement can never reach another
    // tenant's rows regardless of how `id` was obtained. A DELETE is the one
    // operation where "the check above already covered it" is not a good enough
    // answer.
    await supaDelete("measured_items", {
      quotation_id: "eq." + id,
      client_id: "eq." + clientId,
    });
    await supaDelete("unmeasured_items", {
      quotation_id: "eq." + id,
      client_id: "eq." + clientId,
    });

    if (data.measured_items.length) {
      await supaPost(
        "measured_items",
        data.measured_items.map((m) => ({
          quotation_id: id,
          client_id: clientId,
          code: m.code,
          description: m.description,
          glass: m.glass,
          width: m.width,
          height: m.height,
          units: m.units,
          rate: m.rate,
        })) as any,
      );
    }
    if (data.unmeasured_items.length) {
      await supaPost(
        "unmeasured_items",
        data.unmeasured_items.map((u) => ({
          quotation_id: id,
          client_id: clientId,
          description: u.description,
          units: u.units,
          rate: u.rate,
        })) as any,
      );
    }

    return consoleJson({
      ok: true,
      id,
      totals: quotationTotals(
        {
          transport_cost: data.transport_cost,
          include_gst: data.include_gst,
          gst_percentage: data.gst_percentage,
        },
        data.measured_items,
        data.unmeasured_items,
      ),
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const owner = await loadOwner(id);
    if (!owner) return consoleJson({ error: "Not found" }, 404);
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleJson({ error: "Not found" }, 404);
    }

    // Children first. `measured_items.quotation_id` may not carry ON DELETE
    // CASCADE on this database, and orphaned line items would keep counting
    // toward nothing while still holding the tenant's data.
    //
    // Every one of these three statements carries `client_id` in addition to
    // its key. The ownership check above already passed, so this is redundant by
    // design — and redundancy is exactly what a destructive statement running
    // under a service-role key that bypasses RLS should have.
    await supaDelete("measured_items", {
      quotation_id: "eq." + id,
      client_id: "eq." + owner.client_id,
    });
    await supaDelete("unmeasured_items", {
      quotation_id: "eq." + id,
      client_id: "eq." + owner.client_id,
    });
    await supaDelete("quotations", { id: "eq." + id, client_id: "eq." + owner.client_id });

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
