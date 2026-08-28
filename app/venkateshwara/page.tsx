import MarketPageRoute from "../[slug]/page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Venkateshwara UPVC Windows & Doors | Hyderabad",
  description: "Premium UPVC Windows & Doors in Hyderabad with German hardware and 10-year warranty.",
  alternates: { canonical: "https://app.vitharn.com/venkateshwara/" },
  robots: { index: true, follow: true },
};

export default function VenkateshwaraPage() {
  return MarketPageRoute({ params: Promise.resolve({ slug: "venkateshwara" }) });
}
