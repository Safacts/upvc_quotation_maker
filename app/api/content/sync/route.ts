import { NextRequest, NextResponse } from "next/server";
import { supaGet } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";
import { requireTier } from "@/lib/tiers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-client-id",
} as const;

/**
 * GET /api/content/sync
 *
 * Returns the delta of changes since the client's last sync. The Flutter app
 * sends the versions it has locally, and this endpoint returns only the content
 * that has changed.
 *
 * Query params:
 *   client_id — required, the client's unique identifier
 *   since — optional, ISO timestamp to fetch changes since
 *   content_type — optional, filter by content type
 *
 * Response:
 *   {
 *     "client_id": "venkateshwara",
 *     "changes": [
 *       {
 *         "content_type": "products",
 *         "version": 6,
 *         "last_modified": "2026-08-09T12:00:00Z",
 *         "data": [...]
 *       }
 *     ],
 *     "deleted": [
 *       {
 *         "content_type": "products",
 *         "ids": ["uuid1", "uuid2"]
 *       }
 *     ]
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const since = url.searchParams.get("since")?.trim();
    const contentType = url.searchParams.get("content_type")?.trim();

    // AUTH + TENANT. `client_id` used to be taken straight from the query string
    // and fed to the service-role key (RLS bypassed), so any anonymous caller
    // could dump another tenant's entire product catalogue, price list, terms
    // and BANK DETAILS by guessing a slug. The tenant is now DERIVED from the
    // signed cookie for customers; the query param is honoured only for an
    // admin, who must name the tenant explicitly. See src/lib/tenant.ts.
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS },
      );
    }
    const t = resolveTenant(session, url.searchParams.get("client_id"));
    if (!t.ok) {
      return NextResponse.json(
        { error: t.error },
        { status: t.status, headers: CORS_HEADERS },
      );
    }
    const clientId = t.clientId;

    // TIER GATE — server-side content sync is the cloud product itself, unlocked
    // at Rs.25,000 `base`. A `low` tenant bought a self-contained offline APK and
    // has no server-side catalogue to pull.
    //
    // NOTE (deviation, logged deliberately): the brief specified
    // `public_webpage` (`next`) for this route on the understanding that it feeds
    // the marketing site. It does not — `lib/services/sync_engine.dart` is its
    // only caller and it returns products / terms / bank_details /
    // pricing_templates into the app's offline SQLite store. Gating it at `next`
    // would 402 every Rs.25,000 `base` tenant on the cloud sync they paid for,
    // which is precisely the over-gating failure tiers.ts warns about. Gated at
    // `cloud_sync` instead; `public_webpage` belongs on the marketing routes.
    if (!t.isAdmin) {
      const paid = await requireTier(clientId, "cloud_sync");
      if (!paid.ok) {
        // Re-wrapped so the denial carries this route's CORS headers — the
        // Flutter web build calls this cross-origin and would otherwise see a
        // blocked request instead of an upgrade prompt.
        return NextResponse.json(await paid.error.json(), {
          status: paid.error.status,
          headers: CORS_HEADERS,
        });
      }
    }

    // Build filters for the manifest query
    const filters: Record<string, string> = {
      client_id: "eq." + clientId,
    };

    // If since is provided, only fetch content modified after that time
    if (since) {
      filters.last_modified = "gt." + since;
    }

    // If content_type is provided, filter by it
    if (contentType) {
      filters.content_type = "eq." + contentType;
    }

    // Fetch manifest rows — graceful on missing table (migration 014)
    let manifestItems: any[] = [];
    try {
      const manifest = await supaGet("content_manifest", {
        ...filters,
        select: "content_type,version,last_modified,checksum,item_count",
        order: "content_type.asc",
      });
      manifestItems = Array.isArray(manifest) ? manifest : [];
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes("PGRST205") || msg.includes("Could not find the table")) {
        console.warn("[content/sync] table missing (migration 014 not applied) — returning empty");
        return NextResponse.json(
          { client_id: clientId, changes: [], deleted: [], timestamp: new Date().toISOString() },
          { headers: CORS_HEADERS },
        );
      }
      throw err;
    }

    // Fetch actual content for each changed type
    const changes: any[] = [];

    for (const item of manifestItems) {
      const type = item.content_type;
      let data: any[] = [];

      switch (type) {
        case "products":
          // Fetch products for this client
          data = await supaGet("products", {
            client_id: "eq." + clientId,
            soft_deleted: "eq.false",
            select: "id,name,category,description,price,unit,created_at,updated_at",
            order: "name.asc",
          });
          break;

        case "terms":
        case "bank_details":
        case "supplier_companies":
        case "pricing_templates": {
          const keyMap: Record<string, string> = {
            terms: "terms_and_conditions",
            bank_details: "bank_details",
            supplier_companies: "supplier_companies",
            pricing_templates: "pricing_templates",
          };
          try {
            const cfg = await supaGet("client_config_dynamic", {
              client_id: "eq." + clientId,
              config_key: "eq." + keyMap[type],
              select: "config_value",
            });
            if (Array.isArray(cfg) && cfg.length > 0) {
              data = cfg[0]?.config_value ?? (type === "bank_details" ? {} : []);
            }
          } catch (err: any) {
            const msg = String(err?.message ?? err);
            if (msg.includes("PGRST205") || msg.includes("Could not find the table")) {
              console.warn(`[content/sync] client_config_dynamic missing — skipping ${type}`);
            } else throw err;
          }
          break;
        }

        default:
          // Unknown content type, skip
          continue;
      }

      changes.push({
        content_type: type,
        version: item.version,
        last_modified: item.last_modified,
        checksum: item.checksum,
        item_count: item.item_count,
        data: data,
      });
    }

    return NextResponse.json(
      {
        client_id: clientId,
        changes: changes,
        deleted: [], // TODO: Implement soft-delete tracking
        timestamp: new Date().toISOString(),
      },
      { headers: CORS_HEADERS },
    );
  } catch (e: any) {
    console.error("[content/sync] Unhandled error:", e);
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
