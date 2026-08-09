import { NextRequest, NextResponse } from "next/server";
import { supaGet } from "@/lib/supabase";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-client-id",
} as const;

/**
 * GET /api/white-label
 *
 * Returns dynamic white-labeling configuration for a client. This allows
 * the server to push branding updates without rebuilding the APK.
 *
 * Query params:
 *   client_id — required, the client's unique identifier
 *
 * Response:
 *   {
 *     "client_id": "venkateshwara",
 *     "config": {
 *       "logo_url": "https://...",
 *       "primary_color": 6513505,
 *       "accent_color": 15508377,
 *       "company_name": "My Company",
 *       ...
 *     },
 *     "version": 3,
 *     "last_modified": "2026-08-09T10:30:00Z"
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id")?.trim();

    if (!clientId) {
      return NextResponse.json(
        { error: "client_id is required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Fetch all dynamic config for this client
    const configRows = await supaGet("client_config_dynamic", {
      client_id: "eq." + clientId,
      select: "config_key,config_value,value_type,updated_at",
      order: "config_key.asc",
    });

    const rows = Array.isArray(configRows) ? configRows : [];

    // Build config map
    const config: Record<string, any> = {};
    let lastModified = new Date(0).toISOString();

    for (const row of rows) {
      const key = row.config_key;
      const value = row.config_value;
      const type = row.value_type || "string";

      // Extract the actual value based on type
      let actualValue: any;
      if (typeof value === "object" && value !== null && "value" in value) {
        actualValue = value.value;
      } else {
        actualValue = value;
      }

      // Convert color values to int
      if (type === "color" && typeof actualValue === "number") {
        config[key] = actualValue;
      } else {
        config[key] = actualValue;
      }

      // Track the latest modification time
      if (row.updated_at && row.updated_at > lastModified) {
        lastModified = row.updated_at;
      }
    }

    // Fetch the current version from content manifest
    let version = 1;
    try {
      const manifest = await supaGet("content_manifest", {
        client_id: "eq." + clientId,
        content_type: "eq.white_label",
        select: "version",
      });
      if (Array.isArray(manifest) && manifest.length > 0) {
        version = manifest[0].version || 1;
      }
    } catch {
      // Manifest might not exist yet, use default version
    }

    return NextResponse.json(
      {
        client_id: clientId,
        config: config,
        version: version,
        last_modified: lastModified,
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
