import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import { requireConsoleAccess } from "@/lib/console-auth";
import { UIProvider } from "@/lib/hooks/useUI";
import ConsoleShell from "./ConsoleShell";

/**
 * Server layout for `/<slug>/console/*`.
 *
 * A thin RSC that does three things and hands off: resolve the tenant from the
 * slug, AUTHORISE the session against it, then render the client shell. All the
 * interactivity lives in `ConsoleShell.tsx`.
 *
 * `force-dynamic` is mandatory. The default would let Next cache this layout,
 * and a cached shell means tenant A's company name, logo and client_id could be
 * served to tenant B. Anything that reads a session cookie must be dynamic.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ops Console — Vitharn",
  // Keep the console out of search results: it is an authenticated back office,
  // and its URLs contain the tenant slug.
  robots: { index: false, follow: false },
};

export default async function ConsoleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) notFound();

  // AUTHORISE BEFORE RENDERING ANYTHING.
  //
  // The console is addressed by SLUG but the session carries a `client_id`.
  // Without this check, any logged-in tenant could type a competitor's slug and
  // receive a fully rendered shell — leaking their company name and logo out of
  // `clients.config` before a single API call is made. The API routes would then
  // correctly return that tenant's OWN data into a shell branded as someone
  // else's company, which is worse than either failure alone.
  const access = await requireConsoleAccess(client.id);

  // A tenant who is logged in and owns this slug, but whose plan does not
  // include the console, gets an upgrade prompt — NOT a redirect to /upvc/login.
  // Bouncing an authenticated paying customer to a login screen tells them
  // something is broken and generates a support call; this tells them the truth
  // and how to fix it.
  if (!access.ok && access.upgradeRequired) {
    const cfg = parseClientConfig(client.config || {}, client.id);
    // NOTE: plain CSS with the `vc-` prefix (see console.css). Tailwind is
    // installed but NOT wired in this repo — utility classes compile to nothing
    // and render as unstyled text. Do not "modernise" this to `className="flex"`.
    return (
      <div className="vc-upgrade-gate">
        <div className="vc-upgrade-card">
          {cfg.logoUrl ? <img src={cfg.logoUrl} alt="" className="vc-upgrade-logo" /> : null}
          <h1 className="vc-upgrade-title">Ops Console</h1>
          <p className="vc-upgrade-plan">Included with the Final plan — Rs. 55,000</p>
          <p className="vc-upgrade-body">
            The desktop Ops Console gives you keyboard-driven grids, reports,
            payment tracking and Tally export on a full-size screen. Your
            current plan does not include it yet.
          </p>
          <p className="vc-upgrade-body">
            To enable it for <strong>{cfg.companyName || client.id}</strong>,
            contact Vitharn ERP Services and we will activate it on your account.
          </p>
          <a className="vc-upgrade-back" href={`/${slug}/home`}>
            Back to my dashboard
          </a>
        </div>
      </div>
    );
  }

  if (!access.ok) redirect(access.redirectTo || "/upvc/login");

  const config = parseClientConfig(client.config || {}, client.id);

  return (
    <UIProvider clientId={client.id}>
      <ConsoleShell
        slug={slug}
        clientId={client.id}
        companyName={config.companyName || config.appName || client.id}
        logoUrl={config.logoUrl}
      >
        {children}
      </ConsoleShell>
    </UIProvider>
  );
}
