import { notFound, redirect } from "next/navigation";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { supaGet } from "@/lib/supabase";
import { parseClientConfig } from "@/lib/types";
import MarketPage from "./MarketPage";
import VaishnaviMarketPage from "./VaishnaviMarketPage";
import EshanyaMarketPage from "./EshanyaMarketPage";
import ClientSeoContent from "./ClientSeoContent";

export const dynamic = "force-dynamic";

const KPR_SLUG = "kprupvc";
const VENKATESHWARA_SLUG = "venkateshwara";
const KPR_INDEX_PATH = join(process.cwd(), "public", KPR_SLUG, "index.html");
const ESHANYA_SLUG = "eshanya_trade_links";
const VENKATESHWARA_INDEX_PATH = join(process.cwd(), "public", VENKATESHWARA_SLUG, "index.html");

// Only these config keys may reach the browser on PUBLIC market pages.
// The full row (bank details, admin emails, trial state, updater fields,
// Supabase keys) must never be serialized into the RSC payload.
const MARKET_PUBLIC_CONFIG_KEYS = [
  "appName", "companyName", "companyAddress", "companyEmail", "companyContact",
  "companyProprietor", "logoUrl", "invoiceTopLogoUrl", "primaryColor", "accentColor",
  "landingHeroTitle", "landingHeroSubtitle", "landingAboutTitle", "landingAboutText", "landingHeroImage",
  "landingServices", "landingGallery", "landingTestimonials", "landingMapUrl",
  "landingCTA", "landingFooter", "seoTitle", "seoDescription", "seoKeywords",
  "appDownloadUrl", "defaultGstPercentage", "termsAndConditions",
];

type ClientRow = NonNullable<ReturnType<typeof findClientBySlug>>;

function toPublicClient(row: ClientRow): ClientRow {
  const cfg = (row.config || {}) as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const k of MARKET_PUBLIC_CONFIG_KEYS) {
    if (cfg[k] !== undefined && cfg[k] !== null) safe[k] = cfg[k];
  }
  return { ...row, config: safe } as ClientRow;
}

function readStaticHtml(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function buildShell(html: string): string {
  // Source is a static build artifact in public/<slug>/index.html, not user input.
  // Still strip event handlers and javascript: URLs to avoid stored XSS if the file
  // were ever writable, and rely on CSP (next.config.ts) as second layer.
  const stripEventHandlers = (s: string) => s.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const stripJsUrl = (s: string) => s.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
  const links = [...html.matchAll(/<link[^>]*>/gi)]
    .map((m) => stripJsUrl(stripEventHandlers(m[0])))
    .filter((l) => !/rel=["']icon/i.test(l));
  const scripts = [...html.matchAll(/<script[^>]*>[^<]*<\/script>/gi)].map((m) => stripEventHandlers(m[0]));
  const root = html.match(/<div id="root"[^>]*><\/div>/i)?.[0];
  const shell = [links.join("\n"), scripts.join("\n"), root || ""]
    .filter(Boolean)
    .join("\n");
  return shell.replace(/\s*\/>/g, ">");
}

function htmlMeta(html: string, key: "title" | "description"): string {
  if (key === "title") {
    return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  }
  return html.match(/<meta name="description" content="([^"]*)"/i)?.[1]?.trim() || "";
}

function cityFromAddress(addr: string): string {
  const parts = (addr || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const pick = parts
    .slice(-2)
    .map((p) => p.replace(/[0-9]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return pick[0] || "";
}

function serviceAreaFromAddress(addr: string): string {
  const parts = (addr || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const pick = parts
    .slice(-2)
    .map((p) => p.replace(/[0-9]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return pick.length ? pick.join(", ") : "";
}

export default async function MarketPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let rows: any[] = [];
  try { rows = await getCachedClients(); } catch (e: any) {
    console.error("[app/[slug]/page.tsx] getCachedClients failed:", e?.message ?? e);
    try { rows = await supaGet("client_public", { select: "id,config,is_active,created_at" }); } catch(_){}
  }
  const found = findClientBySlug(rows, slug);
  if (!found) notFound();
  const client = toPublicClient(found);

  if (client.id === KPR_SLUG) {
    if (slug !== KPR_SLUG) redirect(`/${KPR_SLUG}/`);
    const html = readStaticHtml(KPR_INDEX_PATH);
    if (html)
      return <><ClientSeoContent client={client} slug={KPR_SLUG} /><div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: buildShell(html) }} /></>;
  }

  if (client.id === ESHANYA_SLUG) {
    return <><ClientSeoContent client={client} slug={slug} /><EshanyaMarketPage client={client} slug={slug} /></>;
  }

  if (client.id === VENKATESHWARA_SLUG) {
    // Canonical URL is /venkateshwara/ — served directly as static by Next.js
    // This branch handles alias slugs e.g. /venkateshwara-upvc-windows-doors
    if (slug !== VENKATESHWARA_SLUG) redirect(`/${VENKATESHWARA_SLUG}/`);
    const html = readStaticHtml(VENKATESHWARA_INDEX_PATH);
    if (html)
      return <><ClientSeoContent client={client} slug={VENKATESHWARA_SLUG} /><div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: buildShell(html) }} /></>;
  }

  if (client.id === "VAISHNAVI UPVC WINDOWS AND DOORS" || slug.toLowerCase().includes("vaishnavi")) {
    return <><ClientSeoContent client={client} slug={slug} /><VaishnaviMarketPage client={client} slug={slug} /></>;
  }

  return <><ClientSeoContent client={client} slug={slug} /><MarketPage client={client} slug={slug} /></>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let rows: any[] = [];
  try {
    rows = await getCachedClients();
  } catch (error) {
    console.error("[app/[slug]/page.tsx] metadata client lookup failed:", error);
    try {
      rows = await supaGet("client_public", { select: "id,config,is_active,created_at" });
    } catch (fallbackError) {
      console.error("[app/[slug]/page.tsx] metadata fallback failed:", fallbackError);
    }
  }
  const client = findClientBySlug(rows, slug);
  if (!client) return {};

  if (client.id === "VAISHNAVI UPVC WINDOWS AND DOORS" || slug.toLowerCase().includes("vaishnavi")) {
    const title = "Vaishnavi UPVC Windows & Doors | Hyderabad | For Better View, Better Life";
    const description = "Premium soundproof UPVC windows, 3-track sliding balcony doors & villa security windows with SS304 mesh in Hyderabad. 10-year warranty. Free measurement by Kiran Chary.";
    return {
      title,
      description,
      keywords: "Vaishnavi UPVC, UPVC Windows Hyderabad, UPVC Doors LB Nagar, Kharmanghat UPVC, Jillelaguda UPVC, Kiran Chary UPVC",
      icons: { icon: [{ url: `/api/favicon/${encodeURIComponent(client.id)}`, type: "image/png", sizes: "48x48" }] },
      openGraph: {
        title,
        description,
        url: `https://app.vitharn.com/${slug}`,
        siteName: "Vaishnavi UPVC Windows & Doors",
        type: "website",
        locale: "en_IN",
        images: [{ url: "/vaishnavi/images/hero.jpg", width: 1200, height: 675, alt: "Vaishnavi UPVC Windows & Doors" }],
      },
      twitter: { card: "summary_large_image", title, description },
      alternates: { canonical: `https://app.vitharn.com/${slug}` },
    };
  }

  if (client.id === VENKATESHWARA_SLUG) {
    const html = readStaticHtml(VENKATESHWARA_INDEX_PATH);
    const title = html ? htmlMeta(html, "title") : "Venkateshwara UPVC Windows & Doors | Hyderabad";
    const description = html ? htmlMeta(html, "description") : "Premium UPVC Windows & Doors in Hyderabad. German hardware, 10-year warranty. Free site measurement by J. Venkatesh.";
    return {
      title,
      description,
      keywords: "Venkateshwara UPVC, UPVC Windows Hyderabad, UPVC Doors Hyderabad, Villa Windows Grill Mesh, Sliding Windows Hyderabad, J Venkatesh UPVC",
      icons: { icon: [{ url: `/api/favicon/${encodeURIComponent(client.id)}`, type: "image/png", sizes: "48x48" }] },
      openGraph: {
        title,
        description,
        url: `https://app.vitharn.com/venkateshwara/`,
        siteName: "Venkateshwara UPVC Windows & Doors",
        type: "website",
        locale: "en_IN",
      },
      twitter: { card: "summary_large_image", title, description },
      alternates: { canonical: `https://app.vitharn.com/venkateshwara/` },
    };
  }
  if (client.id === KPR_SLUG) {
    const html = readStaticHtml(KPR_INDEX_PATH);
    const cfg = parseClientConfig(client.config || {}, client.id);
    const kprCity = cityFromAddress(cfg.companyAddress);
    const kprBrandTitle = cfg.companyName || cfg.appName || "KPR UPVC";
    const title = html ? htmlMeta(html, "title") : `${kprBrandTitle} | Best UPVC Windows & Doors in ${kprCity || "Hyderabad"}`;
    const description = html
      ? htmlMeta(html, "description")
      : `Get the best UPVC Windows and Doors in ${kprCity || "Hyderabad"}. German hardware, multi-chamber noise reduction, 10-year warranty.`;
    return {
      title,
      description,
      keywords: "KPR UPVC, UPVC Windows Hyderabad, UPVC Doors, Sliding Windows, Casement Windows, German Hardware, Best UPVC Fabricator",
      icons: { icon: [{ url: `/api/favicon/${encodeURIComponent(client.id)}`, type: "image/png", sizes: "48x48" }] },
      openGraph: {
        title,
        description,
        url: `https://app.vitharn.com/${KPR_SLUG}/`,
        siteName: kprBrandTitle,
        type: "website",
        locale: "en_IN",
      },
      twitter: { card: "summary_large_image", title, description },
      alternates: { canonical: `https://app.vitharn.com/${KPR_SLUG}/` },
    };
  }
  if (client.id === ESHANYA_SLUG) {
    const cfg = parseClientConfig(client.config || {}, client.id);
    const brand = cfg.companyName || "Eshanya Trade Links";
    const city = cityFromAddress(cfg.companyAddress) || "Coimbatore";
    const title = cfg.seoTitle || `${brand} | UPVC Windows & Doors in ${city}`;
    const description = cfg.seoDescription || cfg.landingHeroSubtitle ||
      `${brand} offers UPVC windows, doors, glass, mesh, measurement, and installation discussions for homes and commercial spaces in ${city}, Tamil Nadu.`;
    return {
      title,
      description,
      keywords: cfg.seoKeywords || "Eshanya Trade Links, Eshanya UPVC, UPVC Windows Coimbatore, UPVC Doors Coimbatore, Sliding Windows Coimbatore, Casement Windows, Mosquito Mesh, UPVC quotation",
      icons: { icon: [{ url: `/api/favicon/${encodeURIComponent(client.id)}`, type: "image/png", sizes: "48x48" }] },
      openGraph: { title, description, url: `https://app.vitharn.com/${slug}/`, siteName: brand, type: "website", locale: "en_IN", images: [{ url: cfg.landingHeroImage || "/eshanya/assets/upvc-hero-premium.png", width: 1200, height: 675, alt: `${brand} UPVC windows and doors` }] },
      twitter: { card: "summary_large_image", title, description },
      alternates: { canonical: `https://app.vitharn.com/${slug}/` },
    };
  }

  const cfg = parseClientConfig(client.config || {}, client.id);
  const city = cityFromAddress(cfg.companyAddress);
  const serviceArea = serviceAreaFromAddress(cfg.companyAddress);
  const brandTitle = cfg.companyName || cfg.appName || client.id;
  const pageTitle = cfg.seoTitle || `${brandTitle} | Premium UPVC Windows & Doors${city ? ` in ${city}` : ""}`;
  const pageDescription =
    cfg.seoDescription ||
    `Premium custom UPVC Windows & Doors by ${brandTitle}${serviceArea ? ` serving ${serviceArea}` : ""}. Multi-chamber noise cancellation, German hardware, 10-year profile warranty. Get a free instant quote.`;

  return {
    title: pageTitle,
    description: pageDescription,
    keywords:
      cfg.seoKeywords ||
      `${brandTitle}, UPVC Windows${city ? ` ${city}` : ""}, UPVC Doors, Soundproof Windows, Sliding Windows, Villa Windows with Grill Mesh, German Hardware UPVC, Free Site Measurement`,
    icons: {
      icon: [
        {
          url: `/api/favicon/${encodeURIComponent(client.id)}`,
          type: "image/png",
          sizes: "48x48",
        },
      ],
    },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: `https://app.vitharn.com/${slug}`,
      siteName: brandTitle,
      type: "website",
      locale: "en_IN",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: pageDescription,
    },
    alternates: {
      canonical: `https://app.vitharn.com/${slug}`,
    },
  };
}
