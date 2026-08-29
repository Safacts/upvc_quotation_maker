import type { Metadata } from "next";
import QuotationClient from "./QuotationClient";
import { supaGet } from "@/lib/supabase";
import { hashQuotationToken } from "@/lib/quotation-token";

/**
 * Server wrapper for the public share/approval page. The client component
 * stays untouched; this exists only so the route emits real metadata.
 *
 * The share token gates EVERYTHING here, same as /api/quotation/[id]: the
 * customer name and company brand are looked up ONLY after the token row
 * validates against quotation_share_tokens (id + sha256 hash + expiry +
 * revocation). A bare or invalid id gets a generic title — the <title> must
 * never become an enumeration oracle for customer names. The token itself is
 * never logged.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: "Quotation",
    description: "Review and respond to your quotation.",
    robots: { index: false, follow: false },
  };
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fallback;
    const sp = await searchParams;
    const rawToken = sp.token;
    const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken) || "";
    if (!token) return fallback;

    const tokenRows = await supaGet("quotation_share_tokens", {
      quotation_id: "eq." + id,
      token_hash: "eq." + hashQuotationToken(token),
      expires_at: "gt." + new Date().toISOString(),
      revoked_at: "is.null",
      select: "quotation_id",
      limit: 1,
    });
    if (!Array.isArray(tokenRows) || tokenRows.length === 0) return fallback;

    const quotes = await supaGet("quotations", {
      id: "eq." + id,
      select: "quote_no,customer_name,client_id",
      limit: 1,
    });
    if (!Array.isArray(quotes) || quotes.length === 0) return fallback;
    const quote = quotes[0];

    let company = "";
    let logoUrl = "";
    try {
      const clients = await supaGet("clients", {
        id: "eq." + String(quote.client_id || ""),
        select: "config",
        limit: 1,
      });
      if (Array.isArray(clients) && clients.length > 0 && clients[0]?.config) {
        company = String(clients[0].config.companyName || "").trim();
        logoUrl = String(clients[0].config.logoUrl || clients[0].config.invoiceTopLogoUrl || "").trim();
      }
    } catch {
      // Brand name is cosmetic; the customer-facing title still works without it.
    }

    const customer = String(quote.customer_name || "").trim();
    const title =
      customer && company
        ? `${customer} — ${company} Quotation`
        : customer
          ? `${customer} — Quotation`
          : "Quotation";
    const quoteNo = String(quote.quote_no || "").trim();
    const description = `Quotation${quoteNo ? ` ${quoteNo}` : ""} for ${customer || "Customer"}. Review details and confirm online.`.trim();

    return {
      title,
      description,
      openGraph: {
        title,
        description: `Official Quotation${quoteNo ? ` ${quoteNo}` : ""} from ${company || "UPVC Windows & Doors"}. Review and confirm online.`,
        siteName: company || "UPVC Quotation",
        images: logoUrl ? [{ url: logoUrl, alt: `${company || "Company"} Logo` }] : [],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: `Official Quotation${quoteNo ? ` ${quoteNo}` : ""} from ${company || "UPVC Windows & Doors"}`,
        images: logoUrl ? [logoUrl] : [],
      },
      icons: logoUrl ? { icon: logoUrl, apple: logoUrl } : undefined,
      robots: { index: false, follow: false },
    };
  } catch {
    return fallback;
  }
}

export default async function QuoteSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <QuotationClient params={params} />;
}
