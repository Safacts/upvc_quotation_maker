import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vitharn vs Vyapar vs myBillBook | UPVC Software Comparison",
  description: "Compare UPVC-specific quotations, portals, websites, pricing, and total cost against Vyapar and myBillBook.",
  alternates: { canonical: "https://app.vitharn.com/upvc/compare" },
  openGraph: {
    title: "Which software is best for UPVC fabricators?",
    description: "A practical feature and three-year cost comparison for UPVC window and door businesses.",
    url: "https://app.vitharn.com/upvc/compare",
    type: "website",
    images: [{ url: "/og-upvc.png", width: 1200, height: 630, alt: "Vitharn UPVC software comparison" }],
  },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
