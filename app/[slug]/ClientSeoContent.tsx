import { parseClientConfig } from "@/lib/types";

type Props = { client: { id: string; config?: Record<string, unknown> }; slug: string };

function cityFromAddress(address: string): string {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-2) || parts.at(-1) || "India";
}

export default function ClientSeoContent({ client, slug }: Props) {
  const cfg = parseClientConfig(client.config || {}, client.id);
  const brand = cfg.companyName || cfg.appName || client.id;
  const city = cityFromAddress(cfg.companyAddress);
  const description = cfg.seoDescription || cfg.landingHeroSubtitle ||
    `${brand} provides UPVC windows, doors, glazing, and quotation support in ${city}.`;
  const services = (cfg.landingServices || []).filter(Boolean).slice(0, 12);
  const canonical = `https://app.vitharn.com/${slug}/`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: brand,
    description,
    url: canonical,
    image: cfg.logoUrl || undefined,
    telephone: cfg.companyContact || undefined,
    email: cfg.companyEmail || undefined,
    address: cfg.companyAddress ? {
      "@type": "PostalAddress",
      streetAddress: cfg.companyAddress,
      addressLocality: city,
      addressCountry: "IN",
    } : undefined,
    areaServed: city,
    makesOffer: services.map((service) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: service },
    })),
  };

  return (
    <>
      <section className="client-seo-content" aria-label={`${brand} overview`}>
        <p>{city} UPVC Windows &amp; Doors</p>
        <h1>{cfg.landingHeroTitle || brand}</h1>
        <p>{description}</p>
        {services.length > 0 && (
          <ul>
            {services.map((service) => <li key={service}>{service}</li>)}
          </ul>
        )}
        {cfg.companyAddress && <p>Serving {cfg.companyAddress}</p>}
        {cfg.landingCTA && <p>{cfg.landingCTA}</p>}
      </section>
      <script type="application/ld+json">
        {JSON.stringify(schema).replace(/</g, "\\u003c")}
      </script>
    </>
  );
}
