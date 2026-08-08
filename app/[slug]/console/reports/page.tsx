import ReportsClient from "./ReportsClient";

/**
 * `/<slug>/console/reports` — the commercial reports hub.
 *
 * The layout has already resolved the tenant and authorised the session. This is a
 * thin server component that hands off to the client, which fetches report data
 * from `/api/console/reports` (scoped by the HttpOnly cookie).
 */
export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return <ReportsClient />;
}
