import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import ReviewForm from "./ReviewForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clientId: string }>;
}): Promise<Metadata> {
  const { clientId } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, clientId);
  if (!client) return {};
  const cfg = parseClientConfig(client.config || {}, client.id);
  return {
    title: `Rate your experience - ${cfg.companyName || cfg.appName}`,
    icons: { icon: `/api/favicon/${encodeURIComponent(client.id)}` },
  };
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, clientId);
  if (!client) notFound();
  const cfg = parseClientConfig(client.config || {}, client.id);
  const companyName = cfg.companyName || cfg.appName;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            {cfg.logoUrl ? (
              <img
                src={cfg.logoUrl}
                alt={`${companyName} logo`}
                className="h-9 w-auto object-contain"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[#d89b25]">
                {(companyName || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-mono text-sm tracking-[0.2em] uppercase">
              {companyName}
            </span>
          </div>
          <a
            href={`/${clientId}/`}
            className="font-mono text-xs tracking-[0.2em] uppercase text-white/60 transition-colors hover:text-[#d89b25]"
          >
            ← Back
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <ReviewForm clientId={clientId} companyName={companyName} />
      </main>
    </div>
  );
}
