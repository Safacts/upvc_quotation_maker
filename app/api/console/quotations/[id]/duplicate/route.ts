import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPost } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/console/quotations/[id]/duplicate — clone as a new draft.
 *
 * Tally's Alt+2. Creates a fresh draft copy of a quotation: the source row's
 * header and line items are copied verbatim EXCEPT the status (forced to
 * "draft"), the quote_no (left blank for the user to set), and the timestamps.
 *
 * The new row carries the SAME client_id as the source — it was already
 * verified as owned by the caller — so this can never move a quotation between
 * tenants.
 */

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    // Read the source WITH tenant scope. 404 covers both "missing" and
    // "belongs to another tenant" — indistinguishable by design.
    const rows = await supaGet("quotations", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select:
        "client_id,quote_no,date,customer_name,contact_no,email,address," +
        "reference,supplier_company,transport_cost,include_gst,gst_percentage," +
        "measured_items(code,description,glass,width,height,units,rate,bom_config)," +
        "unmeasured_items(description,units,rate)",
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const src = rows[0];

    const inserted = await supaPost("quotations", {
      client_id: src.client_id,
      quote_no: "",
      date: new Date().toISOString().slice(0, 10),
      customer_name: src.customer_name,
      contact_no: src.contact_no,
      email: src.email,
      address: src.address,
      reference: src.reference ? src.reference + " (copy)" : "(copy)",
      supplier_company: src.supplier_company,
      status: "draft",
      transport_cost: num(src.transport_cost),
      include_gst: src.include_gst === true,
      gst_percentage: num(src.gst_percentage),
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    if (Array.isArray(src.measured_items) && src.measured_items.length) {
      await supaPost(
        "measured_items",
        src.measured_items.map((m: any) => ({
          quotation_id: row.id,
          client_id: src.client_id,
          code: m.code,
          description: m.description,
          glass: m.glass,
          width: num(m.width),
          height: num(m.height),
          units: num(m.units, 1),
          rate: num(m.rate),
          bom_config: m.bom_config || {},
        })) as any,
      );
    }
    if (Array.isArray(src.unmeasured_items) && src.unmeasured_items.length) {
      await supaPost(
        "unmeasured_items",
        src.unmeasured_items.map((u: any) => ({
          quotation_id: row.id,
          client_id: src.client_id,
          description: u.description,
          units: num(u.units, 1),
          rate: num(u.rate),
        })) as any,
      );
    }

    return consoleJson({ id: row.id, quote_no: row.quote_no }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
