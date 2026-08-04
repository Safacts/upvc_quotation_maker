import { NextRequest, NextResponse } from "next/server";
import { getCachedClients, findClientBySlug, slugify } from "@/lib/slug";

// Serves the Flutter web app at /upvc/<slug> with a per-client branded splash
// screen. The Flutter build is a shared static copy in public/app/, so the
// base href is /app/ and only the splash (logo + name) is injected per client.

const VITHARN_NAME = "Vitharn UPVC Quotation Maker";
const VITHARN_ICON = "/app/icons/Icon-192.png";

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hexColor(v: number | undefined, fallback: string): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return "#" + v.toString(16).padStart(8, "0").slice(2);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const rows = await getCachedClients();
  const client = findClientBySlug(rows, slug);
  const cfg = client?.config || {};

  const isVitharnHost = _request.nextUrl.hostname.includes("vitharn.com");
  const umamiScript = isVitharnHost
    ? '<script defer src="https://umami.novamymentor.cloud/umami.js" data-website-id="13fc779a-eb5b-4e48-9011-f7b7b985a03d"></script>'
    : "";

  const hasClientBranding = !!(client && (cfg.appName || cfg.companyName || cfg.logoUrl));
  const appName = String(cfg.appName || cfg.companyName || client?.id || VITHARN_NAME);
  const logoUrl = String(cfg.logoUrl || "").trim();
  const splashName = hasClientBranding ? appName : VITHARN_NAME;
  const splashIcon = logoUrl || VITHARN_ICON;
  const themeColor = hexColor(cfg.primaryColor, "#6366f1");
  const appSlug = slugify(appName) || slugify(client?.id || "app");

  const html = `<!DOCTYPE html>
<html>
<head>
  <base href="/app/">
  <meta charset="UTF-8">
  <meta content="IE=Edge" http-equiv="X-UA-Compatible">
  <meta name="description" content="${esc(splashName)}">
  <link rel="preconnect" href="https://effxrwrbsjduvhmorvrq.supabase.co">
  <link rel="dns-prefetch" href="https://effxrwrbsjduvhmorvrq.supabase.co">
  <link rel="preload" href="flutter_bootstrap.js" as="script">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="${esc(splashName)}">
  <meta name="theme-color" content="${themeColor}">
  <link rel="apple-touch-icon" href="icons/Icon-192.png">
  <link rel="icon" type="image/png" href="favicon.png"/>
  <title>${esc(splashName)}</title>
  <link rel="manifest" href="/api/pwa/${esc(appSlug)}">
  <style>
    body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
    #loading { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; background:#f8fafc; }
    #loading img { width:96px; height:96px; object-fit:contain; border-radius:50%; background:#fff; padding:8px; box-shadow:0 8px 24px rgba(99,102,241,0.15); }
    #loading h2 { margin:20px 0 6px; font-size:20px; color:#0f172a; }
    #loading p { margin:0; font-size:14px; color:#94a3b8; }
    #loading .spinner { width:40px; height:40px; margin-top:24px; border:4px solid #e0e7ff; border-top-color:#6366f1; border-radius:50%; animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  </style>
  ${umamiScript}
</head>
<body>
  <div id="loading">
    <img src="${esc(splashIcon)}" alt="${esc(splashName)}">
    <h2>${esc(splashName)}</h2>
    <p>Loading…</p>
    <div class="spinner"></div>
  </div>
  <script src="flutter_bootstrap.js" async></script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
