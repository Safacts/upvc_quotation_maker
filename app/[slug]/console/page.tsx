import OverviewClient from "./OverviewClient";

/**
 * `/<slug>/console` — Overview.
 *
 * The layout has already resolved the tenant and authorised the session, so this
 * is intentionally a one-line server component. Data is fetched client-side from
 * `/api/console/stats`, which derives `client_id` from the HttpOnly cookie.
 * Fetching it here on the server would mean passing a tenant id down through
 * props — the exact pattern that makes a stale or swapped id invisible.
 */
export const dynamic = "force-dynamic";

export default function ConsoleOverviewPage() {
  return <OverviewClient />;
}
