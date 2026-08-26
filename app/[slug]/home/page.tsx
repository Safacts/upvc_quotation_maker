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
  // Ultimate fallback: if DB is unreachable but slug is a known client, serve a minimal page
  // This ensures /venkateshwara/home never 404s due to transient DB/cache issues
  if (!client && slug.toLowerCase() === "venkateshwara") {
    console.warn("[home/page] client not found in DB, using fallback for venkateshwara");
    client = { id: "venkateshwara", config: { companyName: "Venkateshwara UPVC", appName: "Venkateshwara UPVC Quote" }, is_active: true } as any;
  }
  if (!client) notFound();
  const session = await getSession();
  const ownsClient = session?.role === "customer" && session.client_id === client.id;
  if (!ownsClient && session?.role !== "admin") redirect("/upvc/login");
  return <CustomerPortal client={client} slug={slug} />;
}
