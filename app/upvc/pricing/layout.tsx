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
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
