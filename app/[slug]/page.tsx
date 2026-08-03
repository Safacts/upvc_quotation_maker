import { notFound } from "next/navigation";
import { supaGet } from "@/lib/supabase";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import MarketPage from "./MarketPage";

export const dynamic = "force-dynamic";

export default async function MarketPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) notFound();
  return <MarketPage client={client} slug={slug} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) return {};
  const cfg = parseClientConfig(client.config || {}, client.id);
  return {
    title: cfg.companyName || cfg.appName || "Market Page",
    description: cfg.landingHeroSubtitle || "",
  };
}
