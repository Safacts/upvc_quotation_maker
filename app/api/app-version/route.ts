import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/app-version
 * Returns the latest APK version info for auto-update checks.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    version: "1.0.6",
    downloadUrl: "https://github.com/Safacts/upvc_quotation_maker/releases/download/v1.0.6-venkateshwara/app-debug.apk",
    releaseNotes: "Version 1.0.6: Improved auto-update, version display on About page, stability fixes.",
    forceUpdate: false,
    releasedAt: "2026-08-10T06:00:00Z",
  });
}
