import { notFound, redirect } from "next/navigation";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import MarketPage from "./MarketPage";

export const dynamic = "force-dynamic";

const KPR_SLUG = "kprupvc";
const VENKATESHWARA_SLUG = "venkateshwara";
const KPR_INDEX_PATH = join(process.cwd(), "public", KPR_SLUG, "index.html");
const VENKATESHWARA_INDEX_PATH = join(process.cwd(), "public", VENKATESHWARA_SLUG, "index.html");

function readStaticHtml(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function buildShell(html: string): string {
  const links = [...html.matchAll(/<link[^>]*>/gi)]
    .map((m) => m[0])
    .filter((l) => !/rel=["']icon/i.test(l));
  const scripts = [...html.matchAll(/<script[^>]*>[^<]*<\/script>/gi)].map((m) => m[0]);
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
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) notFound();

  if (client.id === KPR_SLUG) {
    if (slug !== KPR_SLUG) redirect(`/${KPR_SLUG}/`);
    const html = readStaticHtml(KPR_INDEX_PATH);
    if (html)
      return (
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: buildShell(html) }}
        />
      );
  }

  if (client.id === VENKATESHWARA_SLUG) {
    // Canonical URL is /venkateshwara/ — served directly as static by Next.js
    // This branch handles alias slugs e.g. /venkateshwara-upvc-windows-doors
    if (slug !== VENKATESHWARA_SLUG) redirect(`/${VENKATESHWARA_SLUG}/`);
    const html = readStaticHtml(VENKATESHWARA_INDEX_PATH);
    if (html)
      return (
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: buildShell(html) }}
        />
      );
  }

  return <MarketPage client={client} slug={slug} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  if (!client) return {};

  if (client.id === VENKATESHWARA_SLUG) {
    const html = readStaticHtml(VENKATESHWARA_INDEX_PATH);
    const title = html ? htmlMeta(html, "title") : "Sri Venkateshwara UPVC Windows & Doors | Hyderabad";
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
        siteName: "Sri Venkateshwara UPVC Windows & Doors",
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
    const kprFallbackTitle = kprBrandTitle
      ? kprCity
        ? `${kprBrandTitle} \u2014 UPVC Windows & Doors in ${kprCity}`
        : `${kprBrandTitle} \u2014 UPVC Windows & Doors`
      : "Market Page";
    const kprSeoTitle = cfg.seoTitle ? cfg.seoTitle : kprFallbackTitle;
    const kprServiceArea = serviceAreaFromAddress(cfg.companyAddress);
    const kprServices: string[] = Array.isArray(cfg.landingServices) ? cfg.landingServices : [];
    const kprPositioning = cfg.landingHeroSubtitle || "";
    const kprFallbackDescription = cfg.companyName && kprServiceArea && kprServices.length > 0 && kprPositioning
      ? `${cfg.companyName} \u2014 ${kprServiceArea} \u2014 ${kprServices.slice(0, 2).join(", ")}. ${kprPositioning}`
      : kprPositioning || "";
    const kprSeoDescription = cfg.seoDescription ? cfg.seoDescription : kprFallbackDescription;
    return {
      title: html ? htmlMeta(html, "title") : kprSeoTitle,
      description: html ? htmlMeta(html, "description") : kprSeoDescription,
      keywords: cfg.seoKeywords || undefined,
      icons: { icon: [{ url: `/api/favicon/${encodeURIComponent(client.id)}`, type: "image/png", sizes: "48x48" }] },
      openGraph: {
        title: html ? htmlMeta(html, "title") : kprSeoTitle,
        description: html ? htmlMeta(html, "description") : kprSeoDescription,
        url: `https://app.vitharn.com/${slug}`,
        siteName: cfg.companyName || cfg.appName || "KPR UPVC",
        type: "website",
        locale: "en_IN",
      },
      twitter: {
        card: "summary_large_image",
        title: html ? htmlMeta(html, "title") : kprSeoTitle,
        description: html ? htmlMeta(html, "description") : kprSeoDescription,
      },
      alternates: {
        canonical: `https://app.vitharn.com/${slug}`,
      },
    };
  }
  const cfg = parseClientConfig(client.config || {}, client.id);
  const city = cityFromAddress(cfg.companyAddress);
  const brandName = cfg.companyName || cfg.appName || "";
  const fallbackTitle = brandName
    ? city
      ? `${brandName} \u2014 UPVC Windows & Doors in ${city}`
      : `${brandName} \u2014 UPVC Windows & Doors`
    : "Market Page";
  const seoTitle = cfg.seoTitle ? cfg.seoTitle : fallbackTitle;
  const serviceArea = serviceAreaFromAddress(cfg.companyAddress);
  const services: string[] = Array.isArray(cfg.landingServices) ? cfg.landingServices : [];
  const positioning = cfg.landingHeroSubtitle || "";
  const fallbackDescription = cfg.companyName && serviceArea && services.length > 0 && positioning
    ? `${cfg.companyName} \u2014 ${serviceArea} \u2014 ${services.slice(0, 2).join(", ")}. ${positioning}`
    : positioning || "";
  const seoDescription = cfg.seoDescription ? cfg.seoDescription : fallbackDescription || "";
  return {
    title: seoTitle,
    description: seoDescription,
    keywords: cfg.seoKeywords || undefined,
    icons: { icon: [{ url: `/api/favicon/${encodeURIComponent(client.id)}`, type: "image/png", sizes: "48x48" }] },
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      url: `https://app.vitharn.com/${slug}`,
      siteName: cfg.companyName || cfg.appName,
      type: "website",
      locale: "en_IN",
      images: cfg.logoUrl ? [{ url: cfg.logoUrl, width: 200, height: 200, alt: cfg.companyName || cfg.appName }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description: seoDescription,
    },
    alternates: {
      canonical: `https://app.vitharn.com/${slug}`,
    },
  };
}
