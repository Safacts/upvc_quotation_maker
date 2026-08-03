import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supaGet } from "@/lib/supabase";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import CustomerPortal from "./CustomerPortal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customer Portal — UPVC Quotation Maker",
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) notFound();
  return <CustomerPortal client={client} slug={slug} />;
}
