import { NextResponse } from "next/server";
import { supaGet } from "@/lib/supabase";

/**
 * tiers.ts — SERVER-SIDE FEATURE GATING (the paywall).
 *
 * ============================================================================
 *  WHY THIS FILE EXISTS
 * ============================================================================
 * `tenant.ts` answers "WHOSE data may this caller touch?" (isolation along the
 * tenant axis). This file answers a DIFFERENT question on a DIFFERENT axis:
 * "WHICH FEATURES has this caller paid for?"
 *
 * Those two are independent and neither implies the other. A ₹10,000 Low-tier
 * client asking for payment tracking is perfectly scoped to their own tenant —
 * `resolveTenant()` returns ok — and is still stealing a ₹55,000 feature.
 *
 * ============================================================================
 *  THE THREE RULES (violate any one and the paywall is decorative)
 * ============================================================================
 * 1. THE TIER COMES FROM THE DATABASE, NEVER FROM THE REQUEST. Not from a
 *    header, not from the body, not from the JWT claims, not from localStorage.
 *    The session cookie is signed, but it is also long-lived (7 days) — a tier
 *    baked into it at login would keep granting access for a week after a
 *    downgrade, and would need a re-login after an upgrade. We read `clients`
 *    on each gated call and cache briefly (see TIER_CACHE_MS).
 *
 * 2. FAIL CLOSED. An unknown / null / unrecognised tier grants NOTHING. The
 *    tempting default is "if we can't tell, let them through" — that is a
 *    silent, undetectable revenue leak. A false block generates a support call
 *    (loud, fixable in seconds); a false allow generates nothing at all and is
 *    discovered only when someone eventually audits. Prefer the loud failure.
 *
 * 3. EVERY DENIAL IS LOGGED. If we over-gate a paying client we must be able to
 *    find it in the logs within seconds, because that client is on the phone.
 *
 * ============================================================================
 *  GRANDFATHERING (decided by Aadi 09-08-2026)
 * ============================================================================
 * Venkateshwara and KPR are our first two clients and keep FULL access
 * regardless of what they have paid. This is deliberate and commercial, not an
 * oversight: they carried the product before it worked. It is implemented as an
 * explicit, auditable allow-list (`GRANDFATHERED`) plus a `tier` of `final` set
 * by migration 014 — belt and braces, so removing one does not silently
 * downgrade a live client mid-quotation.
 */

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/**
 * Tiers in ASCENDING order of capability. The array index IS the rank, so
 * `requireTier("next")` admits `next`, `nextplus` and `final` automatically.
 * Never reorder this array — persisted rows refer to these strings.
 */
export const TIERS = ["low", "base", "next", "nextplus", "final"] as const;

export type Tier = (typeof TIERS)[number];

/** Price in rupees, for the upgrade prompt the UI renders. */
export const TIER_PRICING: Record<Tier, number> = {
  low: 10000,
  base: 25000,
  next: 35000,
  nextplus: 45000,
  final: 55000,
};

export const TIER_LABEL: Record<Tier, string> = {
  low: "Low",
  base: "Base",
  next: "Next",
  nextplus: "Next+",
  final: "Final",
};

/**
 * Accept the spellings that real data and real humans produce, and map them
 * onto the canonical value. `Next+` / `next_plus` / `NEXTPLUS` all mean the
 * same product.
 *
 * Anything NOT in this map resolves to `null` = no tier = access denied. That
 * is the fail-closed path and it is intentional: a typo in the database must
 * lock the account and raise a support call, never silently unlock everything.
 */
const TIER_ALIASES: Record<string, Tier> = {
  low: "low",
  offline: "low",
  base: "base",
  basic: "base",
  standard: "base",
  next: "next",
  nextplus: "nextplus",
  "next+": "nextplus",
  next_plus: "nextplus",
  "next plus": "nextplus",
  final: "final",
  full: "final",
  premium: "final",
};

/** Normalise a stored value to a canonical Tier, or null if unrecognised. */
export function parseTier(raw: unknown): Tier | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return TIER_ALIASES[key] ?? null;
}

/** Rank of a tier on the ladder. -1 for an unknown tier (below everything). */
export function tierRank(tier: Tier | null): number {
  if (!tier) return -1;
  const i = TIERS.indexOf(tier);
  return i;
}

/** Does `have` satisfy a requirement of `need`? Unknown `have` NEVER does. */
export function tierSatisfies(have: Tier | null, need: Tier): boolean {
  return tierRank(have) >= tierRank(need);
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/**
 * The single source of truth mapping a FEATURE to the tier that unlocks it.
 *
 * Routes reference a feature by name (`requireTier(clientId, "payment_tracking")`)
 * rather than hard-coding `"final"`. When Aadi repackages the tiers — and he
 * will, pricing always moves — this table is the only thing that changes. A
 * route that hard-codes a tier string is a route that gets missed in that edit
 * and silently sells the wrong thing.
 *
 * Tier contents per MEETING-003 (comms.md, pricing table):
 *   Low      ₹10,000  Offline app + whitelabeling only. No data responsibility.
 *   Base     ₹25,000  Android app + web dashboard + cloud + invoicing
 *   Next     ₹35,000  + webpage + SEO + dynamic reviews + email notifications
 *   Next+    ₹45,000  + business optimization + WhatsApp sharing
 *   Final    ₹55,000  + web console + payment tracking + auto payment status
 */
export const FEATURE_TIERS = {
  // --- Base: the cloud product itself -------------------------------------
  /** Cloud quotation storage + the mobile app's server sync. */
  cloud_sync: "base",
  /** GST tax invoicing. */
  invoicing: "base",
  /** The customer-facing portal dashboard (NOT the desktop ops console). */
  portal_dashboard: "base",

  // --- Next: the marketing surface ----------------------------------------
  /** Public marketing webpage + SEO metadata. */
  public_webpage: "next",
  /** Customer-submitted reviews + the moderation UI. */
  reviews: "next",
  /** Outbound email notifications (quote sent, welcome, ...). */
  email_notifications: "next",

  // --- Next+: sharing + optimisation --------------------------------------
  /** HMAC token-gated WhatsApp / public share links for a quotation. */
  whatsapp_share: "nextplus",
  /** Business optimisation analytics. */
  business_optimization: "nextplus",

  // --- Final: the back office ---------------------------------------------
  /** The desktop Ops Console (`/<slug>/console`) and all `/api/console/*`. */
  desktop_console: "final",
  /** Payment ledger + automatic paid/partial/unpaid status. */
  payment_tracking: "final",
  /** Tally XML / spreadsheet export. */
  data_export: "final",
} as const satisfies Record<string, Tier>;

export type Feature = keyof typeof FEATURE_TIERS;

/** The tier a feature needs. */
export function featureTier(feature: Feature): Tier {
  return FEATURE_TIERS[feature];
}

// ---------------------------------------------------------------------------
// Grandfathering
// ---------------------------------------------------------------------------

/**
 * Our first clients keep full access forever (Aadi's call, 09-08-2026).
 *
 * Hard-coded rather than config-driven ON PURPOSE: this is a permanent
 * commercial promise to two specific companies, and it must survive someone
 * editing a config blob by hand. Migration 014 ALSO sets their tier to `final`;
 * this list is the belt to that migration's braces.
 */
export const GRANDFATHERED: ReadonlySet<string> = new Set(["venkateshwara", "kprupvc"]);

// ---------------------------------------------------------------------------
// Reading the tier
// ---------------------------------------------------------------------------

/**
 * How long a resolved tier may be reused without re-reading `clients`.
 *
 * A gated route would otherwise add a Supabase round trip to every request.
 * 30 s is short enough that an upgrade takes effect while the client is still
 * on the phone with Aadi ("refresh in half a minute"), and long enough to
 * absorb the burst of calls a single console page-load produces.
 *
 * The cache is per-instance and in-memory: a serverless cold start simply
 * re-reads. It caches the TIER, never the authorisation decision, so it can
 * never leak one tenant's entitlement to another.
 */
const TIER_CACHE_MS = 30_000;

const tierCache = new Map<string, { tier: Tier | null; at: number }>();

/** Drop a tenant's cached tier — call right after an upgrade/downgrade write. */
export function invalidateTierCache(clientId?: string): void {
  if (clientId) tierCache.delete(clientId);
  else tierCache.clear();
}

/**
 * Resolve a tenant's tier from the database.
 *
 * Reads `clients.tier` (migration 014) and falls back to `clients.config.tier`
 * so the gate behaves correctly on a database where 014 has not been applied
 * yet — during that window the column simply does not exist and PostgREST 400s,
 * which `supaGetSafe`-style column stripping would hide. We handle it directly:
 * a failed read is NOT treated as "no tier", it is re-thrown, because silently
 * mapping an outage to a 403 would lock out every paying client at once.
 */
export async function getClientTier(clientId: string): Promise<Tier | null> {
  const id = (clientId ?? "").trim();
  if (!id) return null;

  if (GRANDFATHERED.has(id)) return "final";

  const hit = tierCache.get(id);
  if (hit && Date.now() - hit.at < TIER_CACHE_MS) return hit.tier;

  let rows: any;
  try {
    rows = await supaGet("clients", { id: "eq." + id, select: "id,tier,config" });
  } catch (e: any) {
    // The `tier` column may not exist yet (migration 014 not applied). Retry
    // without it rather than failing the request.
    if (/tier/.test(String(e?.message ?? "")) ) {
      rows = await supaGet("clients", { id: "eq." + id, select: "id,config" });
    } else {
      throw e;
    }
  }

  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  // Column first, then the config blob, so 014's dedicated column wins.
  const tier = parseTier(row?.tier) ?? parseTier(row?.config?.tier) ?? null;

  tierCache.set(id, { tier, at: Date.now() });
  return tier;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export type TierGate = {
  ok: boolean;
  /** Set when ok === true. */
  tier?: Tier | null;
  /** Set when ok === false — a ready-to-return 402/403 response. */
  error?: NextResponse;
};

/**
 * Build the machine-readable denial body.
 *
 * The UI needs enough to render a real upgrade prompt rather than a dead end,
 * so we say exactly which feature was blocked, what they have, what they need
 * and what it costs. This is deliberately NOT a bare "Forbidden": a paying
 * customer who hits a gate must be told how to unblock themselves.
 *
 * HTTP 402 Payment Required is the honest status for "your account is fine,
 * your plan is not". We use 402 rather than 403 so it is trivially separable in
 * logs and metrics from a genuine authorisation failure — over-gating a paying
 * client and leaking a feature look identical in a sea of 403s.
 */
function denial(feature: Feature, have: Tier | null, need: Tier): NextResponse {
  return NextResponse.json(
    {
      error: "upgrade_required",
      message:
        `This feature requires the ${TIER_LABEL[need]} plan ` +
        `(Rs. ${TIER_PRICING[need].toLocaleString("en-IN")}).`,
      feature,
      current_tier: have,
      current_tier_label: have ? TIER_LABEL[have] : null,
      required_tier: need,
      required_tier_label: TIER_LABEL[need],
      upgrade_price: TIER_PRICING[need],
    },
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    },
  );
}

/**
 * THE GATE. Call it after the tenant is resolved, before doing any work.
 *
 *     const gate = await requireConsoleSession(request);
 *     if (!gate.ok) return gate.error;
 *     const paid = await requireTier(gate.clientId, "desktop_console");
 *     if (!paid.ok) return paid.error;
 *
 * ORDER MATTERS: authenticate → resolve tenant → THEN check the tier. Checking
 * the tier first would let an unauthenticated caller probe which tenants have
 * paid for what, by reading the difference between a 401 and a 402.
 */
export async function requireTier(
  clientId: string | null | undefined,
  feature: Feature,
): Promise<TierGate> {
  const need = featureTier(feature);
  const id = (clientId ?? "").trim();

  // No tenant = no entitlement. Should be unreachable if the caller resolved
  // the tenant first, but fail closed rather than assume.
  if (!id) {
    console.warn(`[tier] DENY feature=${feature} reason=no_client_id`);
    return { ok: false, error: denial(feature, null, need) };
  }

  let have: Tier | null;
  try {
    have = await getClientTier(id);
  } catch (e: any) {
    // A database outage must NOT masquerade as "you haven't paid". Surface it
    // as a 503 so it pages us instead of generating false upgrade prompts for
    // every paying client simultaneously.
    console.error(`[tier] LOOKUP FAILED client=${id} feature=${feature}: ${String(e?.message ?? e)}`);
    return {
      ok: false,
      error: NextResponse.json(
        { error: "tier_lookup_failed", message: "Could not verify your plan. Please retry." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  if (!tierSatisfies(have, need)) {
    // Logged at WARN with every field needed to answer "why was my client
    // blocked?" without reproducing it.
    console.warn(
      `[tier] DENY client=${id} feature=${feature} has=${have ?? "NONE"} needs=${need}`,
    );
    return { ok: false, error: denial(feature, have, need) };
  }

  return { ok: true, tier: have };
}

/**
 * Non-throwing variant for RENDERING decisions (hide a nav item, grey a button).
 *
 * This is a UX helper ONLY. It must never be the sole thing standing between a
 * caller and a gated feature — the server-side `requireTier()` on the route is
 * the real boundary. A hidden button is a suggestion; a 402 is a rule.
 */
export async function hasFeature(
  clientId: string | null | undefined,
  feature: Feature,
): Promise<boolean> {
  const id = (clientId ?? "").trim();
  if (!id) return false;
  try {
    return tierSatisfies(await getClientTier(id), featureTier(feature));
  } catch {
    // Fail closed on the UI side too, so a blip hides the button rather than
    // offering a feature that the API will then reject.
    return false;
  }
}

/** Every feature a tier unlocks — powers the account/billing screen. */
export function featuresForTier(tier: Tier | null): Feature[] {
  return (Object.keys(FEATURE_TIERS) as Feature[]).filter((f) =>
    tierSatisfies(tier, FEATURE_TIERS[f]),
  );
}
