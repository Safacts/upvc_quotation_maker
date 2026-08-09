import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supabaseRpc } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/quotations/number — next quotation number.
 *
 * Tries the `get_next_quote_number` RPC (same one the Flutter app uses) for a
 * gapless, tenant-scoped sequence. On failure (migration not applied, pooler
 * blip) falls back to a date+sequence derivation from the live rows so a new
 * quotation is never blocked from being created.
 */

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    // ---- Try the RPC first (same as Flutter) -------------------------------
    try {
      const res = await supabaseRpc("get_next_quote_number", { cid: clientId });
      const num = typeof res === "string" ? res.replace(/^"|"$/g, "") : String(res || "");
      if (num && num !== "null") return consoleJson({ quote_no: num });
    } catch {
      // Migration not applied or RPC unavailable — fall through.
    }

    // ---- Fallback: derive from live rows -----------------------------------
    // Find the highest existing numeric suffix for this tenant and increment.
    // This is NOT gapless (deletes create gaps) but never blocks the user and
    // is unique enough for a draft that the user will name properly on save.
    const rows = await supaGet("quotations", {
      client_id: "eq." + clientId,
      select: "quote_no",
      order: "created_at.desc",
      limit: 500,
    });

    let maxSeq = 0;
    // The tenant's own prefix, recovered from their existing quote numbers.
    let derivedPrefix = "";
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const qn = String(r?.quote_no || "");
        // Match trailing digits: "KPRUPVC-07082026-0042" -> 42.
        const m = qn.match(/-(\d+)$/);
        if (m) {
          const n = Number(m[1]);
          if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
        }
        // Take the prefix from the most recent row that actually has one.
        // Rows are ordered created_at.desc, so the first hit is the newest.
        if (!derivedPrefix) {
          const p = qn.match(/^([A-Za-z0-9]+)-/);
          if (p) derivedPrefix = p[1];
        }
      }
    }

    // The prefix is PER TENANT and must never be hard-coded. This line used to
    // read `KPRUPVC-${datePart}-${seq}` literally, so whenever the RPC was
    // unavailable EVERY tenant — Venkateshwara (JVUPVC), Akshaya (AKSHUPVC) —
    // silently minted quote numbers branded with another fabricator's prefix.
    // A customer receiving a "KPRUPVC-..." quote from Venkateshwara is a
    // visible cross-tenant branding leak on a printed commercial document.
    //
    // Preference order: what this tenant's own rows already use, then their
    // configured `quotePrefix`, then the client id. No literal fallback.
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
        // Config unreadable — fall through to the client id below.
      }
    }
    if (!prefix) prefix = String(clientId).toUpperCase();

    const d = new Date();
    const datePart = `${pad(d.getDate(), 2)}${pad(d.getMonth() + 1, 2)}${d.getFullYear()}`;
    const seq = pad(maxSeq + 1, 4);
    const quote_no = `${prefix}-${datePart}-${seq}`;

    return consoleJson({ quote_no });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
