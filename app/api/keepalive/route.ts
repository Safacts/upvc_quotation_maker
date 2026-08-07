import { NextResponse } from "next/server";
// NOTE: tsconfig maps "@/*" -> "./src/*", so this resolves to src/lib/supabase.ts.
import { supaGet, isServiceKeyConfigured } from "@/lib/supabase";

/**
 * Supabase free-tier keepalive probe.
 *
 * WHY THIS EXISTS: Supabase pauses a free-tier project after ~7 days with no
 * database activity. Restoring a paused project is a manual dashboard action and
 * takes minutes — during which every client sees a dead app. An external monitor
 * (UptimeRobot, 5-minute interval) hits this route to keep the project warm.
 *
 * CRITICAL: the ping must reach POSTGRES, not just Vercel. A route that returns
 * `{ ok: true }` without touching the database proves only that Vercel is alive
 * and would let Supabase pause anyway while the monitor stays green. So we run a
 * real (but minimal) query: one indexed column, one row, from a table that always
 * exists. That is the cheapest statement that still counts as database activity.
 *
 * Contract for the monitor:
 *   200 -> database answered, project is warm.
 *   503 -> database did NOT answer. Alert. Do NOT treat as "site up".
 * We deliberately return 503 (not 200-with-error-body) so UptimeRobot's default
 * HTTP-status check catches a dead DB without extra keyword configuration.
 */

// Never cache: a cached 200 would keep the monitor green while the DB sleeps,
// which is the exact failure mode this route exists to prevent.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();

  if (!isServiceKeyConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        db: "unconfigured",
        error: "SUPABASE_SERVICE_ROLE_KEY is not set in this environment",
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    // Smallest possible real read. `clients` is the tenant table — it always has
    // rows and `id` is the primary key, so this is a single index lookup.
    await supaGet("clients", { select: "id", limit: 1 });

    return NextResponse.json(
      {
        ok: true,
        db: "awake",
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        db: "unreachable",
        // Truncated: this response is public, so never echo a full driver dump.
        error: String(e?.message || e).slice(0, 200),
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// HEAD is what most uptime monitors send by default. Next.js will NOT derive it
// from GET for a route handler, so without this an unconfigured monitor gets 405
// and reports the site as down. Reuse GET so HEAD is a genuine DB probe too.
export async function HEAD() {
  return GET();
}
