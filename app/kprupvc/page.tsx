import MarketPageRoute from "../[slug]/page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KPR UPVC Windows & Door Systems | Premium Glazing Hyderabad",
  description: "Premium UPVC Windows, Doors & Architectural Glazing Solutions in Hyderabad. Specializing in Structural Glazing, Glass Facades, and ACP Cladding.",
  alternates: { canonical: "https://app.vitharn.com/kprupvc/" },
  robots: { index: true, follow: true },
};

export default function KprupvcPage() {
  return MarketPageRoute({ params: Promise.resolve({ slug: "kprupvc" }) });
}
