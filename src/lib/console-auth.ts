import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/session";
import { resolveTenant, type TenantResolution } from "@/lib/tenant";
import { isServiceKeyConfigured } from "@/lib/supabase";
import { requireTier, hasFeature, type Feature, type Tier } from "@/lib/tiers";

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
  /** Set only when ok === true. The tenant's verified pricing tier. */
  tier?: Tier | null;
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
 * ============================================================================
 *  TIER ENFORCEMENT IS BUILT IN — DO NOT ADD IT PER-ROUTE
 * ============================================================================
 * The desktop Ops Console is the Rs.55,000 `final` tier feature. Rather than
 * ask all twelve `/api/console/*` handlers to remember a `requireTier()` call,
 * this single choke point enforces it for all of them.
 *
 * That is a deliberate structural choice, and it is the lesson from commit
 * `e494019`: that commit patched an auth hole in `gst_invoices/route.ts`,
 * `number` and `[id]` but MISSED `items/`, which stayed exploitable for a day.
 * A per-route check is a checklist, and checklists get one line missed. A gate
 * that every route must already pass through cannot be forgotten — a new
 * console route added next month is gated the moment it calls this function.
 *
 * `overrideFeature` exists for the rare console route that should be available
 * BELOW `final`. Pass the feature explicitly; there is no way to disable the
 * tier check entirely, only to change which feature is demanded.
 *
 * @param request        The incoming request. Used ONLY to read an admin's
 *                       `?client_id=` override — never to scope a customer.
 * @param requestedInBody An admin override supplied in a JSON body instead of
 *                       the query string (POST/PATCH). Ignored for customers.
 * @param overrideFeature Demand a different feature than `desktop_console`.
 */
export async function requireConsoleSession(
  request?: Request | null,
  requestedInBody?: string | null,
  overrideFeature: Feature = "desktop_console",
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

  // TIER CHECK — after authentication and tenant resolution, never before.
  //
  // Order matters: checking the tier first would let an UNAUTHENTICATED caller
  // probe which tenants have paid for what, by reading the difference between a
  // 401 and a 402.
  //
  // Platform admins bypass the paywall. An admin acting cross-tenant is us
  // doing support, not a customer consuming a feature — and billing us for our
  // own product would make every support call require an upgrade.
  if (!tenant.isAdmin) {
    const paid = await requireTier(tenant.clientId, overrideFeature);
    if (!paid.ok) {
      return { ok: false, error: paid.error };
    }
    return {
      ok: true,
      clientId: tenant.clientId,
      isAdmin: false,
      session,
      tier: paid.tier,
    };
  }

  return {
    ok: true,
    clientId: tenant.clientId,
    isAdmin: true,
    session,
    tier: "final",
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
  /**
   * Set when the caller is authenticated and owns the tenant, but their plan
   * does not include the console. Distinct from `redirectTo` because bouncing a
   * PAYING customer to `/login` is a terrible experience — they are logged in;
   * they just have not bought this. The layout renders an upgrade prompt.
   */
  upgradeRequired?: boolean;
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

    // The console is a `final`-tier feature. Gate the PAGE as well as the API:
    // without this the shell renders, then every grid inside it fires an API
    // call that 402s, and the customer sees a dashboard full of error toasts
    // instead of a clear "upgrade to unlock" message.
    //
    // This is UX, NOT security — `requireConsoleSession()` on each API route is
    // the real boundary. Someone who bypasses this render check reaches an
    // empty shell whose every data call is still refused.
    if (!(await hasFeature(own, "desktop_console"))) {
      return { ok: false, clientId: own, isAdmin: false, upgradeRequired: true };
    }

    return { ok: true, clientId: own, isAdmin: false };
  }

  // `signup` and any future pre-account role holds no tenant identity.
  return { ok: false, redirectTo: "/login" };
}
