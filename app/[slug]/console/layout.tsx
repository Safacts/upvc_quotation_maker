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
  if (!access.ok) redirect(access.redirectTo || "/login");

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
