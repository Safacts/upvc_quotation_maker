import { Metadata } from "next";

export const metadata: Metadata = {
  title: "UPVC Software Pricing 2026 — One-Time Payment, No Monthly Fees",
  description: "Vitharn UPVC pricing: Starter ₹25,000 one-time. No monthly fees for the first 25 clients. GST invoicing, WhatsApp sharing, customer portal. 7-day free trial.",
  openGraph: {
    title: "UPVC Software Pricing 2026 — Vitharn ERP Services",
    description: "One-time pricing for UPVC fabricators. ₹25,000 — ₹55,000. No monthly fees. Setup in 24 hours.",
    url: "https://app.vitharn.com/upvc/pricing",
    siteName: "Vitharn UPVC",
    type: "website",
    images: [{ url: "https://app.vitharn.com/og-pricing.svg", width: 1200, height: 630, alt: "Vitharn UPVC Pricing 2026" }],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Vitharn UPVC",
    "description": "Business management software for UPVC window and door fabricators",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "25000",
      "highPrice": "55000",
      "priceCurrency": "INR",
      "offerCount": "4"
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        key="jsonld"
      />
      {children}
    </>
  );
}
