import MarketPageRoute, { generateMetadata } from "../[slug]/page";

export { generateMetadata };

export default function KprupvcPage() {
  return MarketPageRoute({ params: Promise.resolve({ slug: "kprupvc" }) });
}
