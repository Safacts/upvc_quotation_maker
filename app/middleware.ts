import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Service worker cache headers
  if (request.nextUrl.pathname === "/pwa-sw.js") {
    response.headers.set("Service-Worker-Allowed", "/");
    response.headers.set(
      "Cache-Control",
      "no-cache, no-store, must-revalidate",
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/pwa-sw.js",
  ],
};