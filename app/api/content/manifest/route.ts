import { NextRequest, NextResponse } from "next/server";
import { supaGet, supabaseRpc } from "@/lib/supabase";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-client-id",
} as const;

/**
 * GET /api/content/manifest
 *
 * Returns the content manifest for a client. The Flutter app uses this to
 * determine what content has changed since its last sync.
 *
 * Query params:
 *   client_id — required, the client's unique identifier
 *
 * Response:
 *   {
 *     "client_id": "venkateshwara",
 *     "manifest": [
 *       {
 *         "content_type": "products",
 *         "version": 5,
 *         "last_modified": "2026-08-09T10:30:00Z",
 *         "checksum": "abc123...",
 *         "item_count": 42
 *       },
 *       ...
 *     ]
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

    // Set the x-client-id header for RLS
    const headers = { "x-client-id": clientId };

    // Fetch all manifest rows for this client
    const manifest = await supaGet("content_manifest", {
      client_id: "eq." + clientId,
      select: "content_type,version,last_modified,checksum,item_count",
      order: "content_type.asc",
    });

    const items = Array.isArray(manifest) ? manifest : [];

    return NextResponse.json(
      {
        client_id: clientId,
        manifest: items,
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
