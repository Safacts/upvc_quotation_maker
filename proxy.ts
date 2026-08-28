import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

function getEncodedKey(): Uint8Array {
  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) throw new Error("JWT_SECRET environment variable is missing");
  return new TextEncoder().encode(secretKey);
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Base response (also used to attach PWA service-worker headers)
  const response = NextResponse.next();

  // Service worker cache headers
  if (path === '/pwa-sw.js') {
    response.headers.set('Service-Worker-Allowed', '/');
    response.headers.set(
      'Cache-Control',
      'no-cache, no-store, must-revalidate',
    );
  }

  // Only protect dynamic slug routes and admin routes — defense-in-depth
  // with page-level requireConsoleAccess (src/lib/console-auth.ts:215).
  const isProtectedPath =
    path.includes('/home') ||
    path.includes('/console') ||
    path.includes('/business-admin') ||
    path.startsWith('/admin') ||
    path.startsWith('/dashboard');

  if (!isProtectedPath) {
    return response;
  }

  const sessionCookie = request.cookies.get('__Host-session')?.value || request.cookies.get('session')?.value;

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Lazy key init — avoids crashing the edge runtime at import time when
  // JWT_SECRET is momentarily unset (e.g. during `next build` without env).
  let encodedKey: Uint8Array;
  try {
    encodedKey = getEncodedKey();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { payload } = await jwtVerify(sessionCookie, encodedKey, {
      algorithms: ['HS256'],
    });

    // If accessing admin area, must be admin
    if (path.startsWith('/admin') && payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Note: Full tenant verification by slug requires hitting the DB,
    // which the proxy can't natively do easily. The page.tsx handles the
    // strict tenant validation since it hits the DB anyway. For now, just
    // ensure they are logged in.

    return response;
  } catch (error) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login (auth routes)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|login|logo.png).*)',
  ],
};
