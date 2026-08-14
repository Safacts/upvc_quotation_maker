import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaGet } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/customers/[id] — single customer master record.
 *
 * Backs the quotation editor's CUSTOMER PICKER. The list route
 * (`customers/route.ts`) returns a compact row for the combobox; this returns the
 * full autofill payload the editor writes onto the quotation header:
 *   { name, contact_no, email, address, gstin }
 *
 * `customers` columns are `phone` / `gst_number` / `company` (the table predates
 * this feature); we map them to the header's field names so the editor does not
 * need to know the legacy column names.
 *
 * BONUS: `preferred_glass` is the glass type from the customer's most recent
 * quotation (best-effort — read fails are swallowed and the field is just "").
 * The editor applies it to currently-empty measured rows as a sensible default.
 *
 * Tenant isolation: the row is scoped by `client_id` from the session cookie and
 * 404'd (not 403'd) when it is not this tenant's.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGet("customers", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      soft_deleted: "eq.false",
      select: "id,name,phone,email,company,address,gst_number",
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleError("Not found", 404);
    }
    const c = rows[0];

    // Best-effort preferred glass from the customer's most recent quotation.
    let preferred_glass = "";
    try {
      const quotes = await supaGet("quotations", {
        client_id: "eq." + gate.clientId,
        customer_id: "eq." + id,
        deleted: "eq.false",
        select: "measured_items(glass)",
        order: "created_at.desc",
        limit: 1,
      });
      const first = Array.isArray(quotes) ? quotes[0] : null;
      const items = first?.measured_items;
      if (Array.isArray(items) && items.length > 0) {
        preferred_glass = items[0]?.glass || "";
      }
    } catch {
      // Non-fatal: leave it empty.
    }

    return consoleJson({
      id: c.id,
      name: c.name || "",
      contact_no: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      gstin: c.gst_number || "",
      preferred_glass,
    });
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}
