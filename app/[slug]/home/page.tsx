import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { getSession } from "@/lib/session";
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
  const session = await getSession();
  const ownsClient = session?.role === "customer" && session.client_id === client.id;
  if (!ownsClient && session?.role !== "admin") redirect("/upvc/login");
  return <CustomerPortal client={client} slug={slug} />;
}
