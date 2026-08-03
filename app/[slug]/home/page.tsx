import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supaGet } from "@/lib/supabase";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import CustomerPortal from "./CustomerPortal";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: "Customer Portal — UPVC Quotation Maker",
    manifest: "/api/pwa/" + slug,
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) notFound();
  return <CustomerPortal client={client} slug={slug} />;
}
