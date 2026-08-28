import MarketPageRoute, { generateMetadata as generateClientMetadata } from "../[slug]/page";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return generateClientMetadata({ params });
}

export default function KprupvcPage() {
  return MarketPageRoute({ params: Promise.resolve({ slug: "kprupvc" }) });
}
