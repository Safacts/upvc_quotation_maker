import { NextRequest, NextResponse } from "next/server";
import { supaGet, supabaseRpc } from "@/lib/supabase";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-client-id",
} as const;

/**
 * GET /api/feature-flags
 *
 * Returns feature flags for a client based on their subscription tier.
 * The Flutter app uses this to determine which features to show/hide.
 *
 * Query params:
 *   client_id — required, the client's unique identifier
 *   tier — optional, override the client's tier (for testing)
 *
 * Response:
 *   {
 *     "client_id": "venkateshwara",
 *     "tier": "base",
 *     "flags": {
 *       "offline_mode": true,
 *       "product_catalog": true,
 *       "push_notifications": true,
 *       ...
 *     }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id")?.trim();
    const tierOverride = url.searchParams.get("tier")?.trim();

    if (!clientId) {
      return NextResponse.json(
        { error: "client_id is required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Determine the client's tier
    let tier = tierOverride || "base";

    if (!tierOverride) {
      try {
        // Try to get tier from the database function
        const tierResult = await supabaseRpc("get_client_tier", {
          p_client_id: clientId,
        });
        if (tierResult) {
          tier = tierResult;
        }
      } catch {
        // Fallback to base tier if function doesn't exist yet
        tier = "base";
      }
    }

    // Fetch feature flags for this client and tier.
    // If the table doesn't exist yet (migration 014 not applied), degrade
    // gracefully: return an empty flag set instead of 500. The Flutter app
    // treats missing flags as "off", so this is safe.
    let flagRows: any[] = [];
    try {
      const flags = await supaGet("feature_flags", {
        client_id: "eq." + clientId,
        tier: "eq." + tier,
        select: "feature_key,enabled,description",
        order: "feature_key.asc",
      });
      flagRows = Array.isArray(flags) ? flags : [];
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes("PGRST205") || msg.includes("Could not find the table")) {
        console.warn("[feature-flags] table missing (migration 014 not applied) — returning empty flags");
      } else {
        throw err;
      }
    }

    // Convert to a simple key-value map
    const flagsMap: Record<string, boolean> = {};
    const flagsDetail: Record<string, { enabled: boolean; description: string }> = {};

    for (const row of flagRows) {
      flagsMap[row.feature_key] = row.enabled;
      flagsDetail[row.feature_key] = {
        enabled: row.enabled,
        description: row.description || "",
      };
    }

    return NextResponse.json(
      {
        client_id: clientId,
        tier: tier,
        flags: flagsMap,
        flags_detail: flagsDetail,
        timestamp: new Date().toISOString(),
      },
      { headers: CORS_HEADERS },
    );
  } catch (e: any) {
    console.error("[feature-flags] GET error:", e?.message ?? e);
    console.error("[feature-flags] full error:", e);
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
