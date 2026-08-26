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
  let rows: any[] = [];
  let client: any = null;
  try {
    rows = await getCachedClients();
    client = findClientBySlug(rows, slug);
  } catch (e: any) {
    console.error("[home/page] getCachedClients failed:", e?.message ?? e);
  }
  if (!client) {
    try {
      const { supaGet } = await import("@/lib/supabase");
      rows = await supaGet("client_public", { select: "id,config,is_active,created_at,updated_at" });
      client = findClientBySlug(rows, slug);
    } catch (e2: any) {
      console.error("[home/page] direct supaGet fallback failed:", e2?.message ?? e2);
    }
  }
  if (!client) notFound();
  const session = await getSession();
  const ownsClient = session?.role === "customer" && session.client_id === client.id;
  if (!ownsClient && session?.role !== "admin") redirect("/upvc/login");
  return <CustomerPortal client={client} slug={slug} />;
}
