import type { SessionPayload } from "@/lib/session";

/**
 * TENANT RESOLUTION — the single authorisation point for multi-tenant routes.
 * Owned by QA (Bugsy). Added 08-08-2026.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every API route talks to Supabase with the SERVICE ROLE key, which bypasses
 * Row Level Security. The `client_isolation` RLS policies are therefore inert
 * for API traffic — application code is the entire tenant boundary.
 *
 * The recurring defect in this codebase was never a MISSING `client_id` filter.
 * It was an UNAUTHORISED filter value. Routes did this:
 *
 *     const clientId = searchParams.get("client_id");          // attacker input
 *     if (session.role === "customer" && session.client_id !== clientId) 403;
 *     await supaGet("gst_invoices", { client_id: "eq." + clientId });
 *
 * That reads correctly and is still broken, because the guard only fires for
 * `role === "customer"`. `/api/portal_auth` mints a valid signed session with
 * `role: "signup"` for ANY unrecognised email, with no verification and no
 * approval (portal_auth/route.ts:264-277). A stranger POSTs one novel email,
 * receives a real cookie, and every `role === "customer"` comparison is skipped
 * — so `clientId` flows unchecked into the query. The filter is present; the
 * authorisation is not.
 *
 * THE RULE: `signup` is a pre-account role. It grants access to the signup
 * wizard and nothing else. It must never satisfy a data-route guard.
 *
 * Use `resolveTenant()` instead of hand-rolling the check. It returns a value
 * DERIVED from the session for customers, so a caller-supplied client_id can
 * never be the thing that gets queried.
 */

/**
 * NOTE ON SHAPE: this is a flat type with optional fields, NOT a discriminated
 * union. `tsconfig.json` sets `strict: false`, which disables the narrowing that
 * would make `{ok:true}|{ok:false}` usable — `if (!t.ok) return json(t.error)`
 * fails to compile under a union there. A flat shape keeps call sites readable
 * and compiles under both settings. If `strict` is ever enabled, this can become
 * a proper union.
 */
export type TenantResolution = {
  ok: boolean;
  /** Set only when ok === true. The tenant the caller may act on. */
  clientId?: string;
  isAdmin?: boolean;
  /** Set only when ok === false. */
  status?: 400 | 401 | 403;
  error?: string;
};

/**
 * Resolve the tenant a request is allowed to act on.
 *
 * - customer → ALWAYS their own `session.client_id`. A `requested` value that
 *   disagrees is a 403, never a silent override.
 * - admin    → may act cross-tenant, but must name the tenant explicitly;
 *   an admin with no `requested` value is a 400, not a wildcard.
 * - signup / anything else → 403. Pre-account roles hold no tenant.
 * - no session → 401.
 */
export function resolveTenant(
  session: SessionPayload | null,
  requested?: string | null,
): TenantResolution {
  if (!session) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const want = (requested ?? "").trim();

  if (session.role === "customer") {
    const own = (session.client_id ?? "").trim();
    if (!own) {
      // A customer session with no tenant is malformed; fail closed rather than
      // falling through to a caller-supplied id.
      return { ok: false, status: 403, error: "Forbidden" };
    }
    if (want && want !== own) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: true, clientId: own, isAdmin: false };
  }

  if (session.role === "admin") {
    if (!want) {
      return { ok: false, status: 400, error: "missing client_id" };
    }
    return { ok: true, clientId: want, isAdmin: true };
  }

  // role === "signup" and any future role. Explicitly NOT a tenant identity.
  return { ok: false, status: 403, error: "Forbidden" };
}

/**
 * Authorise a tenant that is already known from a stored row (the ownership
 * check pattern: fetch by primary key, then confirm the caller may touch it).
 *
 * Returns the verified owner id so callers can re-stamp child rows with it
 * instead of trusting the request body.
 */
export function authorizeOwnedTenant(
  session: SessionPayload | null,
  ownerClientId: string | null | undefined,
): TenantResolution {
  if (!session) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const owner = (ownerClientId ?? "").trim();
  if (!owner) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (session.role === "admin") {
    return { ok: true, clientId: owner, isAdmin: true };
  }
  if (session.role === "customer" && (session.client_id ?? "").trim() === owner) {
    return { ok: true, clientId: owner, isAdmin: false };
  }
  return { ok: false, status: 403, error: "Forbidden" };
}
