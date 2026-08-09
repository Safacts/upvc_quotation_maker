import { NextRequest, NextResponse } from "next/server";
import { supaGet } from "@/lib/supabase";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
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
    const clientId = url.searchParams.get("client_id")?.trim();
    const since = url.searchParams.get("since")?.trim();
    const contentType = url.searchParams.get("content_type")?.trim();

    if (!clientId) {
      return NextResponse.json(
        { error: "client_id is required" },
        { status: 400, headers: CORS_HEADERS },
      );
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

    // Fetch manifest rows
    const manifest = await supaGet("content_manifest", {
      ...filters,
      select: "content_type,version,last_modified,checksum,item_count",
      order: "content_type.asc",
    });

    const manifestItems = Array.isArray(manifest) ? manifest : [];

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
          // Terms are stored in client_config_dynamic
          const termsConfig = await supaGet("client_config_dynamic", {
            client_id: "eq." + clientId,
            config_key: "eq.terms_and_conditions",
            select: "config_value",
          });
          if (Array.isArray(termsConfig) && termsConfig.length > 0) {
            data = termsConfig[0]?.config_value || [];
          }
          break;

        case "bank_details":
          // Bank details are stored in client_config_dynamic
          const bankConfig = await supaGet("client_config_dynamic", {
            client_id: "eq." + clientId,
            config_key: "eq.bank_details",
            select: "config_value",
          });
          if (Array.isArray(bankConfig) && bankConfig.length > 0) {
            data = bankConfig[0]?.config_value || {};
          }
          break;

        case "supplier_companies":
          // Supplier companies are stored in client_config_dynamic
          const supplierConfig = await supaGet("client_config_dynamic", {
            client_id: "eq." + clientId,
            config_key: "eq.supplier_companies",
            select: "config_value",
          });
          if (Array.isArray(supplierConfig) && supplierConfig.length > 0) {
            data = supplierConfig[0]?.config_value || [];
          }
          break;

        case "pricing_templates":
          // Pricing templates are stored in client_config_dynamic
          const pricingConfig = await supaGet("client_config_dynamic", {
            client_id: "eq." + clientId,
            config_key: "eq.pricing_templates",
            select: "config_value",
          });
          if (Array.isArray(pricingConfig) && pricingConfig.length > 0) {
            data = pricingConfig[0]?.config_value || [];
          }
          break;

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
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
