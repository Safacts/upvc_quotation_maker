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

function inferContentType(url: string, headerType: string | null): string {
  if (headerType && headerType.toLowerCase().startsWith("image/")) {
    return headerType.split(";")[0].trim().toLowerCase();
  }
  const clean = url.split("?")[0].split("#")[0].toLowerCase();
  if (clean.endsWith(".ico")) return "image/x-icon";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  return "image/png";
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
    try {
      const res = await fetch(target);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        const contentType = inferContentType(target, res.headers.get("content-type"));
        return new NextResponse(bytes, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    } catch {}
  }
  const ico = readFileSync(join(process.cwd(), "public", "favicon.ico"));
  return new NextResponse(ico, {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
