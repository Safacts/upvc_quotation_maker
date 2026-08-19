import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac } from "crypto";

// Generate a random nonce for CSP
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64");
}

// Public paths that don't need auth
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/api/portal_auth",
  "/api/sso/redirect",
  "/api/sso/token",
  "/api/sso/validate",
  "/api/reset_client_password",
  "/api/send_otp",
  "/api/send_email",
  "/api/quotation/[id]/token",
  "/api/quotation/[id]/pdf",
  "/api/favicon/[slug]",
  "/api/pwa/[slug]",
  "/pwa-sw.js",
  "/upvc",
  "/app",
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const response = NextResponse.next();

  // Inject CSP nonce into response headers
  const csp = response.headers.get("Content-Security-Policy") || "";
  if (csp.includes("{NONCE}")) {
    response.headers.set(
      "Content-Security-Policy",
      csp.replace("{NONCE}", nonce),
    );
  }

  // Add nonce to response for client-side use
  response.headers.set("X-CSP-Nonce", nonce);

  // Add COOP/COEP headers for proper cross-origin isolation
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");

  // Fix service worker scope and CSP
  if (request.nextUrl.pathname === "/pwa-sw.js") {
    response.headers.set("Service-Worker-Allowed", "/");
    response.headers.set(
      "Cache-Control",
      "no-cache, no-store, must-revalidate",
    );
  }

  // Allow service worker to fetch cross-origin resources
  if (request.nextUrl.pathname.startsWith("/upvc/") ||
      request.nextUrl.pathname.startsWith("/app/")) {
    response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  }

  // Auth check for protected routes
  if (!isPublicPath(request.nextUrl.pathname)) {
    const session = request.cookies.get("session")?.value;
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};