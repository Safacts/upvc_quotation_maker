import { NextRequest, NextResponse } from "next/server";
import { getCachedClients, findClientBySlug, slugify } from "@/lib/slug";
import { supaGet } from "@/lib/supabase";

// Serves a per-client PWA web manifest at /api/pwa/<slug> so "App Lite Mode"
// can install the Flutter web app with the client's name and logo.

function hexColor(v: number | undefined, fallback: string): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  const hex = v.toString(16).padStart(8, "0").slice(2);
  return "#" + hex;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let rows: any[] = [];
  try { rows = await getCachedClients(); } catch (e: any) {
    console.error("[app/api/pwa/[slug]/route.ts] getCachedClients failed:", e?.message ?? e);
    try { rows = await supaGet("client_public", { select: "id,config,is_active,created_at,updated_at" }); } catch(_){}
  }
  const client = findClientBySlug(rows, slug);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const cfg = client.config || {};
  const appName = String(cfg.appName || cfg.companyName || client.id);
  const companyName = String(cfg.companyName || appName);
  const appSlug = slugify(appName) || slugify(client.id);
  const logoUrl = String(cfg.logoUrl || "").trim();

  const primary = hexColor(cfg.primaryColor, "#6366f1");
  const background = "#F8FAFC";

  const icons: any[] = [];
  if (logoUrl) {
    icons.push({ src: logoUrl, sizes: "512x512", type: "image/png", purpose: "any" });
  }
  icons.push(
    { src: "/app/icons/Icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/Icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/Icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/Icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  );

  const manifest = {
    name: appName,
    short_name: appName.slice(0, 12),
    description: companyName,
    id: "/upvc/" + appSlug,
    start_url: "/upvc/" + appSlug,
    scope: "/upvc/",
    display: "standalone",
    background_color: background,
    theme_color: primary,
    orientation: "portrait-primary",
    prefer_related_applications: false,
    icons,
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
