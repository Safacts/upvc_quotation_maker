import { notFound, redirect } from "next/navigation";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supaGet } from "@/lib/supabase";
import { findClientBySlug, getCachedClients } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import MarketPage from "./MarketPage";

export const dynamic = "force-dynamic";

const KPR_SLUG = "kprupvc";
const KPR_INDEX_PATH = join(process.cwd(), "public", KPR_SLUG, "index.html");

function readKprHtml(): string | null {
  try {
    return readFileSync(KPR_INDEX_PATH, "utf8");
  } catch {
    return null;
  }
}

function kprShell(html: string): string {
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

function kprMeta(html: string, key: "title" | "description"): string {
  if (key === "title") {
    return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  }
  return html.match(/<meta name="description" content="([^"]*)"/i)?.[1]?.trim() || "";
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
    const html = readKprHtml();
    if (html)
      return (
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: kprShell(html) }}
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
  if (client.id === KPR_SLUG) {
    const html = readKprHtml();
    const cfg = parseClientConfig(client.config || {}, client.id);
    return {
      title: html ? kprMeta(html, "title") : cfg.seoTitle || cfg.companyName || cfg.appName || "Market Page",
      description: html ? kprMeta(html, "description") : cfg.seoDescription || cfg.landingHeroSubtitle || "",
      icons: { icon: `/api/favicon/${encodeURIComponent(client.id)}` },
      openGraph: {
        title: html ? kprMeta(html, "title") : cfg.seoTitle || cfg.companyName || cfg.appName,
        description: html ? kprMeta(html, "description") : cfg.seoDescription || cfg.landingHeroSubtitle || "",
        url: `https://app.vitharn.com/${slug}`,
        siteName: cfg.companyName || cfg.appName || "KPR UPVC",
        type: "website",
        locale: "en_IN",
      },
      twitter: {
        card: "summary_large_image",
        title: html ? kprMeta(html, "title") : cfg.seoTitle || cfg.companyName || cfg.appName,
        description: html ? kprMeta(html, "description") : cfg.seoDescription || cfg.landingHeroSubtitle || "",
      },
      alternates: {
        canonical: `https://app.vitharn.com/${slug}`,
      },
    };
  }
  const cfg = parseClientConfig(client.config || {}, client.id);
  return {
    title: cfg.seoTitle || cfg.companyName || cfg.appName || "Market Page",
    description: cfg.seoDescription || cfg.landingHeroSubtitle || "",
    keywords: cfg.seoKeywords || "",
    icons: { icon: `/api/favicon/${encodeURIComponent(client.id)}` },
    openGraph: {
      title: cfg.seoTitle || cfg.companyName || cfg.appName,
      description: cfg.seoDescription || cfg.landingHeroSubtitle || "",
      url: `https://app.vitharn.com/${slug}`,
      siteName: cfg.companyName || cfg.appName,
      type: "website",
      locale: "en_IN",
      images: cfg.logoUrl ? [{ url: cfg.logoUrl, width: 200, height: 200, alt: cfg.companyName || cfg.appName }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: cfg.seoTitle || cfg.companyName || cfg.appName,
      description: cfg.seoDescription || cfg.landingHeroSubtitle || "",
    },
    alternates: {
      canonical: `https://app.vitharn.com/${slug}`,
    },
  };
}
