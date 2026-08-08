import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secretKey = process.env.JWT_SECRET;
if (!secretKey) throw new Error("JWT_SECRET environment variable is missing");
const encodedKey = new TextEncoder().encode(secretKey);

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Only protect dynamic slug routes and admin routes
  const isProtectedPath = path.includes('/home') || path.includes('/business-admin') || path.startsWith('/admin') || path.startsWith('/dashboard');

  if (!isProtectedPath) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('session')?.value;

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { payload } = await jwtVerify(sessionCookie, encodedKey, {
      algorithms: ["HS256"],
    });

    // If accessing admin area, must be admin
    if (path.startsWith('/admin') && payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Optional: if accessing /[slug]/home, verify they own this slug
    // We can extract slug from path: /[slug]/home
    const match = path.match(/^\/([^\/]+)\/(home|business-admin)/);
    if (match && payload.role === 'customer') {
      const slug = match[1];
      // Note: Full tenant verification by slug requires hitting the DB, 
      // which middleware can't natively do easily if not using Edge DB clients. 
      // We will let the page.tsx handle the strict tenant validation (since it hits the DB anyway)
      // For now, just ensure they are logged in.
    }

    return NextResponse.next();
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
