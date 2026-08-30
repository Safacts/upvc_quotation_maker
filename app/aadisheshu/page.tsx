import type { Metadata } from "next";
import AadisheshuPortfolio from "./AadisheshuPortfolio";

export const metadata: Metadata = {
  title: "Aadisheshu Konga — AI Systems & Platform Infrastructure",
  description:
    "Portfolio of Aadisheshu Konga, a software engineer building applied AI products, production platforms, and resilient infrastructure.",
  alternates: { canonical: "https://app.vitharn.com/aadisheshu" },
  openGraph: {
    title: "Aadisheshu Konga — AI Systems & Platform Infrastructure",
    description:
      "Software engineer building applied AI products, production platforms, and resilient infrastructure.",
    url: "https://app.vitharn.com/aadisheshu",
    siteName: "Aadisheshu Konga",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aadisheshu Konga — AI Systems & Platform Infrastructure",
    description:
      "Software engineer building applied AI products, production platforms, and resilient infrastructure.",
  },
};

export default function AadisheshuPage() {
  return <AadisheshuPortfolio />;
}
