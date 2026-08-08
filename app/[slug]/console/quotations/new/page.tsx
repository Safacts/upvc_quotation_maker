import { notFound } from "next/navigation";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import QuotationEditor, { blankHeader } from "../QuotationEditor";

/**
 * `/<slug>/console/quotations/new` — the split-view editor with an empty document.
 *
 * The layout has already authorised the session against this slug, so this
 * component only needs the branding for the live preview. It deliberately does
 * NOT pre-create a database row: a user who opens this screen and changes their
 * mind must not leave an empty draft behind. The row is created by the first
 * successful save (POST), after which the editor replaces the URL with the real
 * id so a second Ctrl+S updates rather than duplicating.
 */
export const dynamic = "force-dynamic";

export default async function NewQuotationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) notFound();

  const config = parseClientConfig(client.config || {}, client.id);

  return (
    <QuotationEditor
      quotationId={null}
      // The tenant's own default GST rate, not a hard-coded 18%. The old
      // DashboardPage.tsx assumed 18% on every quote and therefore disagreed
      // with the PDF the customer actually received.
      initial={{
        header: blankHeader(config.defaultGstPercentage || 18),
        measured: [],
        unmeasured: [],
      }}
      companyName={config.companyName || config.appName || client.id}
      companyAddress={config.companyAddress}
      companyContact={config.companyContact}
      gstNumber={config.gstNumber}
    />
  );
}
