import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vitharn UPVC Pricing Flyer | One-Time Software Cost",
  description: "Download and share the Vitharn UPVC software pricing flyer for one-time plans, features, and setup details.",
  alternates: { canonical: "https://app.vitharn.com/upvc/pricing/show" },
};

export default function PricingFlyerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
