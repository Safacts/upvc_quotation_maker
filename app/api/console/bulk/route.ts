import { NextRequest } from "next/server";
import { z } from "zod";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supaGetAllPaged } from "@/lib/supabase";
import { QUOTATION_STATUSES, formatZodError } from "@/lib/console-schemas";
import { sendQuotationEmail } from "@/lib/email-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/console/bulk — bulk operations on a set of quotations.
 *
 * Two operations today:
 *   - `status` : set the same status on up to 500 quotations at once.
 *   - `email`  : email the quotation PDF to each customer.
 *
 * ============================================================================
 *  THE BULK RULES (architecture doc §5.5)
 * ============================================================================
 * Every bulk endpoint MUST:
 *   (a) be capped at 500 ids/request — a larger request would page 500+ rows
 *       into a 10s Vercel function and time out mid-way, leaving a partial
 *       update the user does not know is partial;
 *   (b) RE-VALIDATE `client_id` on EVERY id server-side — the id list is never
 *       trusted as a scope, it is only a list of candidates;
 *   (c) return a per-id result array so PARTIAL FAILURES are visible, not
 *       silent. A status change that updated 498 of 500 must say which 2 failed.
 *
 * Same-origin only: consoleJson(), no CORS.
 */

const MAX_BULK = 500;

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK),
    status: z.enum(QUOTATION_STATUSES),
  }),
  z.object({
    action: z.literal("email"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK),
    // Optional override subject/body. If omitted, defaults are used.
    subject: z.string().max(500).optional(),
    message: z.string().max(5000).optional(),
  }),
]);

type BulkResult = {
  id: string;
  ok: boolean;
  error?: string;
};

/**
 * Re-validate that every id belongs to this tenant.
 *
 * Returns the subset that is owned by the caller. Any id owned by another
 * tenant is dropped and reported as "not found" in the per-id results — a 404,
 * never a 403, so the existence of another tenant's quotation is not confirmed
 * (see the same note in quotations/[id]/route.ts).
 *
 * ONE query, not one per id. This used to call a `loadOwner(id)` helper inside
 * the loop: at the 500-id cap that is 500 sequential HTTP round-trips to
 * PostgREST inside a function with a 10s wall clock. At ~20ms each that is 10
 * seconds spent purely on ownership checks before the first real write — the
 * endpoint timed out on large batches and left a PARTIAL update the user was
 * never told about, which is exactly the failure mode bulk rule (c) exists to
 * prevent. `bulkEmail` 80 lines below already did the correct batched
 * `in.(...)` load, so the codebase disagreed with itself.
 *
 * The tenant filter stays LITERAL and server-side (`client_id: "eq." + ...`):
 * the returned set is the intersection of "id was requested" and "row belongs
 * to the caller", so a foreign id simply never comes back and is reported as
 * not found. Ids are zod-validated UUIDs, so the `in.(...)` list cannot carry
 * a PostgREST metacharacter.
 */
async function filterOwned(
  clientId: string,
  ids: string[],
): Promise<{ owned: string[]; results: BulkResult[] }> {
  const results: BulkResult[] = [];

  // Dedupe the input — the same id twice would otherwise be processed twice
  // and the results array would contradict itself. Order is preserved so the
  // per-id results still line up with what the user selected.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  if (unique.length === 0) return { owned: [], results };

  const rows = await supaGet("quotations", {
    client_id: "eq." + clientId,
    id: "in.(" + unique.join(",") + ")",
    select: "id",
    limit: unique.length,
  });
  const ownedSet = new Set(
    (Array.isArray(rows) ? rows : []).map((r: any) => String(r.id)),
  );

  const owned: string[] = [];
  for (const id of unique) {
    if (ownedSet.has(id)) owned.push(id);
    else results.push({ id, ok: false, error: "not found" });
  }
  return { owned, results };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function bulkStatus(
  clientId: string,
  ids: string[],
  status: string,
): Promise<BulkResult[]> {
  const { owned, results } = await filterOwned(clientId, ids);

  // Apply the update to each owned id individually. A single bulk PATCH with
  // `in.(...)` returns no per-row success signal, so a partial failure (one
  // bad row in a thousand) would be invisible — violating rule (c). Individual
  // patches are O(n) on a capped list and give us a per-id result.
  for (const id of owned) {
    try {
      await supaPatch(
        "quotations",
        { id: "eq." + id, client_id: "eq." + clientId },
        { status },
      );
      results.push({ id, ok: true });
    } catch (e: any) {
      results.push({ id, ok: false, error: String(e?.message ?? e) });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Email a quotation PDF to each customer.
 *
 * For each owned quotation: load the full row + branding, generate the PDF,
 * send it via the SMTP relay. Per-id results tell the user exactly which sends
 * succeeded and which failed (e.g. a customer with no email on file).
 */
async function bulkEmail(
  clientId: string,
  ids: string[],
  subject?: string,
  message?: string,
): Promise<BulkResult[]> {
  const { owned, results } = await filterOwned(clientId, ids);

  if (owned.length === 0) return results;

  // Load branding once for the whole batch — every quotation for this tenant
  // shares the same company header/footer.
  const clients = await supaGet("clients", {
    id: "eq." + clientId,
    select: "config",
    limit: 1,
  });
  const config: Record<string, any> = (Array.isArray(clients) && clients[0]?.config)
    ? (typeof clients[0].config === "string" ? JSON.parse(clients[0].config) : clients[0].config)
    : {};

  // Load all quotations + line items in one bounded scan.
  const { rows } = await supaGetAllPaged(
    "quotations",
    {
      client_id: "eq." + clientId,
      id: "in.(" + owned.join(",") + ")",
      select:
        "id,quote_no,date,customer_name,contact_no,email,address,reference," +
        "supplier_company,transport_cost,include_gst,gst_percentage," +
        "measured_items(code,description,glass,width,height,units,rate)," +
        "unmeasured_items(description,units,rate)",
      order: "created_at.asc,id.asc",
    },
    500,
    500,
  );
  const byId = new Map((Array.isArray(rows) ? rows : []).map((r: any) => [r.id, r]));

  for (const id of owned) {
    const q = byId.get(id);
    if (!q) {
      results.push({ id, ok: false, error: "load failed" });
      continue;
    }
    if (!q.email) {
      results.push({ id, ok: false, error: "no email on file" });
      continue;
    }

    try {
      await sendQuotationEmail({ quotation: q, config, subject, message });
      results.push({ id, ok: true });
    } catch (e: any) {
      results.push({ id, ok: false, error: String(e?.message ?? e) });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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
    const clientId = gate.clientId;

    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Invalid request", fields: formatZodError(parsed.error) }, 400);
    }

    let results: BulkResult[];

    if (parsed.data.action === "status") {
      results = await bulkStatus(clientId, parsed.data.ids, parsed.data.status);
    } else {
      results = await bulkEmail(
        clientId,
        parsed.data.ids,
        parsed.data.subject,
        parsed.data.message,
      );
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    return consoleJson({
      action: parsed.data.action,
      total: results.length,
      ok_count: okCount,
      fail_count: failCount,
      results,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
