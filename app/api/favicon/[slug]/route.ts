import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCachedClients, findClientBySlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

function faviconVariant(logoUrl: string): string | null {
  const m = logoUrl.match(/^(.+\/logos\/)([^/?#]+)\.([a-z0-9]+)(\?.*)?$/i);
  if (!m) return null;
  return m[1] + m[2] + "-favicon." + m[3];
}

async function resolveFavicon(logoUrl: string): Promise<string> {
  const variant = faviconVariant(logoUrl);
  if (variant) {
    try {
      const head = await fetch(variant, { method: "HEAD" });
      if (head.ok) return variant;
    } catch {}
  }
  return logoUrl;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  const logoUrl = client?.config?.logoUrl;
  if (client && typeof logoUrl === "string" && logoUrl.trim()) {
    const target = await resolveFavicon(logoUrl.trim());
    return NextResponse.redirect(target, 302);
  }
  const ico = readFileSync(join(process.cwd(), "public", "favicon.ico"));
  return new NextResponse(ico, {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
