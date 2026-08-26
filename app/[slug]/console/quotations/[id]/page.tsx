import { notFound } from "next/navigation";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import EditQuotationClient from "./EditQuotationClient";

/**
 * `/<slug>/console/quotations/[id]` — the split-view editor for an existing
 * quotation.
 *
 * The quotation itself is loaded CLIENT-SIDE from `/api/console/quotations/[id]`
 * rather than server-side here. That is deliberate: the API route already
 * performs the ownership check (read the row by primary key, compare its real
 * `client_id` to the session, 404 on mismatch). Fetching it here as well would
 * mean a second, hand-written copy of that check — and a hand-written copy is
 * exactly how `/api/gst_invoices/items` ended up exploitable while its three
 * sibling routes were patched. One implementation, used by everything.
 */
export const dynamic = "force-dynamic";

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  let rows: any[] = [];
  try { rows = await getCachedClients(); } catch (e: any) {
    console.error("[app/[slug]/console/quotations/[id]/page.tsx] getCachedClients failed:", e?.message ?? e);
    try { rows = await supaGet("client_public", { select: "id,config,is_active,created_at,updated_at" }); } catch(_){}
  }
  const client = findClientBySlug(rows, slug);
  if (!client) notFound();

  const config = parseClientConfig(client.config || {}, client.id);

  return (
    <EditQuotationClient
      quotationId={id}
      companyName={config.companyName || config.appName || client.id}
      companyAddress={config.companyAddress}
      companyContact={config.companyContact}
      gstNumber={config.gstNumber}
    />
  );
}
