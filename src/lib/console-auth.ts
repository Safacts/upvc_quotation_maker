import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/session";
import { resolveTenant, type TenantResolution } from "@/lib/tenant";
import { isServiceKeyConfigured } from "@/lib/supabase";
import { requireTier } from "@/lib/tiers";

/**
 * console-auth.ts — THE ENTRY GATE FOR EVERY `/api/console/*` ROUTE.
 *
 * ============================================================================
 *  WHY THIS FILE EXISTS (read before adding a console route)
 * ============================================================================
 *
 * Every route in this repo talks to Supabase with the SERVICE ROLE key, which
 * BYPASSES Row Level Security. The `client_isolation` RLS policies on
 * `quotations` / `customers` / `products` are therefore INERT for API traffic.
 * There is no database net below the application layer — this guard IS the
 * tenant boundary.
 *
 * Two production holes were found on 08-08-2026 that this file exists to make
 * structurally impossible:
 *
 *   1. `/api/gst_invoices/items` POST took `client_id` from the request BODY,
 *      wrote with the service-role key, and had `Access-Control-Allow-Origin: *`.
 *      Anyone on the internet could inject line items into any tenant's invoice.
 *   2. `/api/reviews/[clientId]/manage` took `clientId` from the URL PATH and
 *      allowed GET/PATCH/DELETE with no session at all.
 *
 * Both read as if they were scoped. Neither was AUTHORISED. The rule that
 * prevents a third instance:
 *
 *   >> `client_id` is DERIVED from the HttpOnly session cookie. It is never
 *   >> read from the body, the query string, or the URL path — with the single
 *   >> exception of an `admin` role explicitly naming a tenant.
 *
 * `resolveTenant()` (src/lib/tenant.ts) enforces that, including the subtle case
 * that broke the old hand-rolled guards: `/api/portal_auth` mints a valid signed
 * cookie with `role: "signup"` for ANY unrecognised email, with no verification.
 * Guards written as `if (session.role === "customer" && mismatch) 403` skip
 * entirely for a `signup` session and let attacker input through. `resolveTenant`
 * fails closed on every role that is not `customer` or `admin`.
 *
 * ============================================================================
 *  CORS — CONSOLE ROUTES ARE SAME-ORIGIN ONLY
 * ============================================================================
 * The Flutter endpoints (`/api/portal_stats`, `/api/portal_settings`, ...) carry
 * `Access-Control-Allow-Origin: *` because the Dart app calls them from a
 * different browsing context. The console is a Next.js page on the SAME origin,
 * so its cookie rides along without any CORS grant. Adding a wildcard here would
 * make a tenant's entire commercial history world-readable from any web page the
 * user happens to have open. `consoleJson()` deliberately emits NO CORS headers.
 */

/** Response headers for every console route. Note the absence of CORS. */
const CONSOLE_HEADERS = {
  "Content-Type": "application/json",
  // Business data. Never let a shared proxy or the browser bfcache retain it.
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  // A tenant's quotation data must not be framed by a third-party page.
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
} as const;

/** JSON response helper for console routes. Same-origin, private, no CORS. */
export function consoleJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: CONSOLE_HEADERS });
}

/**
 * NOTE ON SHAPE: flat optional fields, NOT a discriminated union — identical
 * reasoning to `TenantResolution` in tenant.ts. `tsconfig.json` sets
 * `strict: false`, which disables the narrowing a `{ok:true}|{ok:false}` union
 * needs, so `if (guard.error) return guard.error` would fail to compile.
 */
export type ConsoleSession = {
  ok: boolean;
  /** Set only when ok === true. The ONLY tenant this request may touch. */
  clientId?: string;
  isAdmin?: boolean;
  session?: SessionPayload;
  /** Set only when ok === false. A ready-to-return NextResponse. */
  error?: NextResponse;
};

/**
 * Gate a `/api/console/*` request.
 *
 * Usage — the first two lines of every console handler, no exceptions:
 *
 *     const gate = await requireConsoleSession(request);
 *     if (!gate.ok) return gate.error;
 *     const clientId = gate.clientId;   // trusted; derived from the cookie
 *
 * @param request        The incoming request. Used ONLY to read an admin's
 *                       `?client_id=` override — never to scope a customer.
 * @param requestedInBody An admin override supplied in a JSON body instead of
 *                       the query string (POST/PATCH). Ignored for customers.
 */
export async function requireConsoleSession(
  request?: Request | null,
  requestedInBody?: string | null,
): Promise<ConsoleSession> {
  // Fail loudly rather than returning empty grids that look like "no data yet".
  if (!isServiceKeyConfigured()) {
    return { ok: false, error: consoleJson({ error: "Database not configured" }, 500) };
  }

  const session = await getSession();

  // An admin may act cross-tenant but must NAME the tenant. For a customer this
  // value is only ever compared against their own id — never substituted for it.
  let requested: string | null = requestedInBody ?? null;
  if (!requested && request) {
    try {
      requested = new URL(request.url).searchParams.get("client_id");
    } catch {
      requested = null;
    }
  }

  const tenant: TenantResolution = resolveTenant(session, requested);
  if (!tenant.ok) {
    return {
      ok: false,
      error: consoleJson({ error: tenant.error || "Forbidden" }, tenant.status || 403),
    };
  }

  // ── Tier gating (only for non-admin sessions) ──────────────────────────
  // Admins bypass the paywall — an admin acting cross-tenant is US doing
  // support, not a customer consuming a feature. Console routes gate inside
  // requireConsoleSession(), so callers must NOT double-gate.
  if (!tenant.isAdmin) {
    const tierCheck = await requireTier(tenant.clientId!, "desktop_console");
    if (!tierCheck.ok) {
      // Re-wrap with console headers (no CORS on console routes, but
      // consistency with the CONSOLE_HEADERS shape).
      return { ok: false, error: tierCheck.error };
    }
  }

  return {
    ok: true,
    clientId: tenant.clientId,
    isAdmin: !!tenant.isAdmin,
    session,
  };
}

/**
 * Authorise a page render at `/<slug>/console`.
 *
 * The console is addressed by SLUG, but the session carries a `client_id`. A
 * logged-in tenant typing another tenant's slug into the address bar must not
 * get a rendered shell — even an empty one leaks the other company's branding,
 * name and logo from `clients.config` before a single API call is made.
 *
 * Returns `ok:false` with a `redirectTo` rather than throwing, so the caller can
 * decide between `redirect()` and `notFound()`.
 */
export type ConsoleAccess = {
  ok: boolean;
  clientId?: string;
  isAdmin?: boolean;
  /** Set only when ok === false. */
  redirectTo?: string;
};

export async function requireConsoleAccess(resolvedClientId: string): Promise<ConsoleAccess> {
  const session = await getSession();
  if (!session) return { ok: false, redirectTo: "/login" };

  if (session.role === "admin") {
    return { ok: true, clientId: resolvedClientId, isAdmin: true };
  }

  if (session.role === "customer") {
    const own = (session.client_id ?? "").trim();
    // Not `notFound()` — a 404 vs a redirect is itself an oracle telling the
    // caller whether the other tenant's slug exists.
    if (!own || own !== resolvedClientId) return { ok: false, redirectTo: "/login" };
    return { ok: true, clientId: own, isAdmin: false };
  }

  // `signup` and any future pre-account role holds no tenant identity.
  return { ok: false, redirectTo: "/login" };
}
