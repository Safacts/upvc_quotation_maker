import MarketPageRoute, { generateMetadata } from "../[slug]/page";

export { generateMetadata };

export default function VenkateshwaraPage() {
  return MarketPageRoute({ params: Promise.resolve({ slug: "venkateshwara" }) });
}
