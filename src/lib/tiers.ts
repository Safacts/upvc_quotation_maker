import { NextResponse } from "next/server";
import { supaGet } from "@/lib/supabase";

// ============================================================================
//  Tier ladder — never reorder; persisted rows use these exact strings.
// ============================================================================

/** Ordered tier names — array index IS the rank. */
export const TIERS: string[] = ["low", "base", "next", "nextplus", "final"];

/**
 * Feature → minimum tier index. A client at tier index >= this value is
 * admitted; below it, `requireTier` returns 402.
 */
export const FEATURE_TIERS: Record<string, number> = {
  cloud_sync: 1,
  invoicing: 1,
  portal_dashboard: 1,
  public_webpage: 2,
  reviews: 2,
  email_notifications: 2,
  whatsapp_share: 3,
  business_optimization: 3,
  desktop_console: 4,
  payment_tracking: 4,
  data_export: 3,
};

/**
 * Grandfathered clients are always promoted to `final` regardless of what the
 * DB says. Belt (allow-list) AND braces (migration 014 sets tier='final').
 */
const GRANDFATHERED = new Set(["venkateshwara", "kprupvc"]);

/** Per-instance cache TTL in milliseconds. */
export const TIER_CACHE_MS = 30_000;

// ============================================================================
//  Per-instance tier cache
// ============================================================================

type CacheEntry = { tier: string; expiresAt: number };

const tierCache = new Map<string, CacheEntry>();

/**
 * Bust the cache for a single client after a tier upgrade/downgrade write.
 */
export function invalidateTierCache(clientId: string): void {
  tierCache.delete(clientId);
}

// ============================================================================
//  Tier lookup (private)
// ============================================================================

/**
 * Read the client's tier from the DB (or cache). Returns `"final"` as the
 * default when no `tier` field is present in `clients.config` — the schema
 * does NOT have a dedicated `tier` column yet, so every existing client
 * defaults to `final` until migration 014 populates the config field.
 *
 * On DB outage, throws so the caller can return 503.
 */
async function resolveTier(clientId: string): Promise<string> {
  const now = Date.now();

  // 1. Check cache
  const cached = tierCache.get(clientId);
  if (cached && cached.expiresAt > now) {
    return cached.tier;
  }

  // 2. Grandfathered clients
  if (GRANDFATHERED.has(clientId)) {
    const tier = "final";
    tierCache.set(clientId, { tier, expiresAt: now + TIER_CACHE_MS });
    return tier;
  }

  // 3. Fetch from DB via service-role (clients table has SELECT revoked from
  //    anon, so we use supaGet which carries the service-role key).
  //    `client_public` view does NOT expose config — we must hit `clients` directly.
  //    This is safe because the service-role key bypasses RLS and the caller
  //    has already been authenticated + tenant-resolved upstream.
  try {
    const rows = await supaGet("clients", {
      id: "eq." + clientId,
      select: "config",
      limit: 1,
    });

    const row = Array.isArray(rows) ? rows[0] : null;
    const cfg = row?.config ?? {};
    const tier: string =
      typeof cfg.tier === "string" && TIERS.includes(cfg.tier)
        ? cfg.tier
        : "final"; // default when tier field absent

    tierCache.set(clientId, { tier, expiresAt: now + TIER_CACHE_MS });
    return tier;
  } catch (err: any) {
    // DB outage — propagate so caller can return 503 (not 402).
    throw err;
  }
}

// ============================================================================
//  Public API
// ============================================================================

/**
 * Denial shape — flat optional fields, NOT a discriminated union.
 * Same reasoning as `ConsoleSession` and `TenantResolution`.
 */
type TierDenial = {
  ok: false;
  error: NextResponse;
};

type TierAllow = {
  ok: true;
  tier: string;
};

/**
 * Check whether `clientId` has paid for `feature`.
 *
 * - Returns `{ ok: true, tier }` when allowed.
 * - Returns `{ ok: false, error: NextResponse }` when denied (HTTP 402).
 * - Returns 503 on DB outage (NOT 402 — mapping an outage to "you haven't
 *   paid" would false-prompt every paying client at once).
 * - NEVER throws. NEVER returns a response you can ignore.
 */
export async function requireTier(
  clientId: string,
  feature: string,
): Promise<TierDenial | TierAllow> {
  const requiredIdx = FEATURE_TIERS[feature];
  if (requiredIdx === undefined) {
    // Unknown feature — allow (fail-open on unrecognised features to avoid
    // blocking routes that were added after the feature map was last updated).
    return { ok: true, tier: "final" };
  }

  try {
    const currentTier = await resolveTier(clientId);
    const currentIdx = TIERS.indexOf(currentTier);

    if (currentIdx >= requiredIdx) {
      return { ok: true, tier: currentTier };
    }

    // Denied — build the 402 response with machine-readable body.
    // Upgrade price = price of the required tier (TIERS[requiredIdx]).
    const priceMap: Record<number, number> = {
      0: 10_000,
      1: 25_000,
      2: 35_000,
      3: 45_000,
      4: 55_000,
    };

    const body = {
      error: "upgrade_required",
      feature,
      current_tier: currentTier,
      required_tier: TIERS[requiredIdx],
      upgrade_price: priceMap[requiredIdx] ?? 0,
    };

    return {
      ok: false,
      error: NextResponse.json(body, { status: 402 }),
    };
  } catch {
    // DB outage → 503, not 402.
    return {
      ok: false,
      error: NextResponse.json(
        { error: "database_unavailable" },
        { status: 503 },
      ),
    };
  }
}

/**
 * Non-throwing UX variant for hiding buttons in the UI. A hidden button is a
 * suggestion; the route's 402 from `requireTier` is the actual rule.
 */
export async function hasFeature(
  clientId: string,
  feature: string,
): Promise<boolean> {
  const result = await requireTier(clientId, feature);
  return result.ok;
}
