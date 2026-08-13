import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vitharn UPVC — Quotation Software for UPVC Fabricators | One-Time Payment",
  description:
    "Vitharn UPVC is business management software for UPVC window & door fabricators. Create branded quotations in seconds, manage customers, get a business website. One-time payment, no monthly fees. 7-day free trial.",
  keywords: [
    "UPVC quotation software",
    "UPVC window quotation maker",
    "UPVC door fabricator software",
    "UPVC business management India",
    "quotation software for fabricators",
    "Vitharn UPVC",
    "Vitharn ERP Services",
    "UPVC pricing software",
    "branded quotation PDF",
    "WhatsApp quotation sharing",
  ].join(", "),
  openGraph: {
    title: "Vitharn UPVC — Quotation Software for UPVC Fabricators",
    description:
      "Create branded quotations in seconds. Manage customers. Get your own business website. One-time payment. No monthly fees.",
    url: "https://app.vitharn.com/upvc",
    siteName: "Vitharn UPVC",
    type: "website",
    images: [
      {
        url: "/og-upvc.png",
        width: 1200,
        height: 630,
        alt: "Vitharn UPVC — Business Management for UPVC Fabricators",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vitharn UPVC — Quotation Software for UPVC Fabricators",
    description:
      "Branded quotations in seconds. Manage customers. One-time payment. No monthly fees.",
    images: ["/og-upvc.png"],
  },
  alternates: {
    canonical: "https://app.vitharn.com/upvc",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function UpvcLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Vitharn UPVC",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android",
    description:
      "Business management software for UPVC window and door fabricators. Create branded quotations, manage customers, share via WhatsApp, and get a dedicated business website.",
    url: "https://app.vitharn.com/upvc",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "25000",
      highPrice: "55000",
      priceCurrency: "INR",
      offerCount: "4",
    },
    provider: {
      "@type": "Organization",
      name: "Vitharn ERP Services",
      url: "https://app.vitharn.com",
    },
    applicationSubCategory: "Quotation Management, ERP",
    featureList: [
      "Instant branded PDF quotations",
      "UPVC mm to sqft auto-calculation",
      "WhatsApp quote sharing",
      "Customer portal with login",
      "Business website included",
      "Web and Android access",
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        key="jsonld-upvc"
      />
      {children}
    </>
  );
}
