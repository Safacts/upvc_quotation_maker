import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaGet, supaPost, supabaseRpc } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /[slug]/console/quotations/[id]/duplicate
 *
 * Clone an existing quotation as a brand-new DRAFT for the SAME customer:
 *   - copies header + measured_items + unmeasured_items
 *   - mints a fresh quote_no (same generator the editor + number route use)
 *   - resets date to today, status to 'draft', clears id
 *   - returns { id, quote_no } so the editor can navigate to the new row
 *
 * Ownership is verified twice, in the established order: load by PK, compare the
 * row's real client_id to the session tenant, 404 (never 403) on mismatch.
 * Reuses the same `supaGet`/`supaPost` helpers and the quote_no generator logic
 * from `app/api/console/quotations/number/route.ts` (no second implementation).
 */

const DETAIL_SELECT =
  "id,quote_no,date,customer_name,contact_no,email,address,reference," +
  "supplier_company,status,transport_cost,include_gst,gst_percentage," +
  "client_id,customer_id," +
  "measured_items(id,code,description,glass,width,height,units,rate,created_at)," +
  "unmeasured_items(id,description,units,rate,created_at)";

/** Reuse the number route's generator: RPC first, then live-row fallback. */
async function nextQuoteNo(clientId: string): Promise<string> {
  try {
    const res = await supabaseRpc("get_next_quote_number", { cid: clientId });
    const num = typeof res === "string" ? res.replace(/^"|"$/g, "") : String(res || "");
    if (num && num !== "null") return num;
  } catch {
    // RPC unavailable (migration not applied) — fall through.
  }

  const rows = await supaGet("quotations", {
    client_id: "eq." + clientId,
    select: "quote_no",
    order: "created_at.desc",
    limit: 500,
  });

  let maxSeq = 0;
  let derivedPrefix = "";
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const qn = String(r?.quote_no || "");
      const m = qn.match(/-(\d+)$/);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
      }
      if (!derivedPrefix) {
        const p = qn.match(/^([A-Za-z0-9]+)-/);
        if (p) derivedPrefix = p[1];
      }
    }
  }

  // Per-tenant prefix — never hard-coded (a hard-coded KPRUPVC would brand
  // another fabricator's quote). Prefer this tenant's own rows, then their
  // configured quotePrefix, then the client id.
  let prefix = derivedPrefix;
  if (!prefix) {
    try {
      const clients = await supaGet("clients", {
        id: "eq." + clientId,
        select: "config",
        limit: 1,
      });
      const raw = Array.isArray(clients) && clients[0]?.config;
      const config: Record<string, any> =
        typeof raw === "string" ? JSON.parse(raw) : (raw || {});
      if (config.quotePrefix) prefix = String(config.quotePrefix);
    } catch {
      // Config unreadable — fall through to client id below.
    }
  }
  if (!prefix) prefix = String(clientId).toUpperCase();

  const d = new Date();
  const pad = (n: number, l: number) => String(n).padStart(l, "0");
  const datePart = `${pad(d.getDate(), 2)}${pad(d.getMonth() + 1, 2)}${d.getFullYear()}`;
  return `${prefix}-${datePart}-${pad(maxSeq + 1, 4)}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;
    const { id } = await params;

    // 1. Load source + verify ownership.
    const rows = await supaGet("quotations", {
      id: "eq." + id,
      // Both predicates: the row must exist AND be ours.
      client_id: "eq." + clientId,
      select: DETAIL_SELECT,
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleError("Not found", 404);
    }
    const q = rows[0];

    // PostgREST does not order embedded rows — sort so the clone keeps order.
    const measured = [...(q.measured_items || [])].sort((a: any, b: any) =>
      String(a.created_at || "").localeCompare(String(b.created_at || "")),
    );
    const unmeasured = [...(q.unmeasured_items || [])].sort((a: any, b: any) =>
      String(a.created_at || "").localeCompare(String(b.created_at || "")),
    );

    // 2. Fresh header as a draft.
    const quote_no = await nextQuoteNo(clientId);
    const date = new Date().toISOString().slice(0, 10);

    const inserted = await supaPost("quotations", {
      client_id: clientId,
      quote_no,
      date,
      customer_name: q.customer_name || "",
      contact_no: q.contact_no || "",
      email: q.email || "",
      address: q.address || "",
      reference: q.reference || "",
      supplier_company: q.supplier_company || "",
      status: "draft",
      transport_cost: q.transport_cost != null ? q.transport_cost : "0",
      include_gst: !!q.include_gst,
      gst_percentage: q.gst_percentage != null ? q.gst_percentage : "18",
      customer_id: q.customer_id || null,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleError("Insert failed");

    // 3. Deep-copy children, scoped to the new quotation + tenant.
    if (measured.length) {
      await supaPost(
        "measured_items",
        measured.map((m: any) => ({
          quotation_id: row.id,
          client_id: clientId,
          code: m.code || "",
          description: m.description || "",
          glass: m.glass || "",
          width: m.width != null ? m.width : "",
          height: m.height != null ? m.height : "",
          units: m.units != null ? m.units : "1",
          rate: m.rate != null ? m.rate : "",
        })) as any,
      );
    }
    if (unmeasured.length) {
      await supaPost(
        "unmeasured_items",
        unmeasured.map((u: any) => ({
          quotation_id: row.id,
          client_id: clientId,
          description: u.description || "",
          units: u.units != null ? u.units : "1",
          rate: u.rate != null ? u.rate : "",
        })) as any,
      );
    }

    return consoleJson({ id: row.id, quote_no }, 201);
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}
