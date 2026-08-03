import { NextResponse } from "next/server";

// Root-scope service worker making the web app installable (PWA).
// It lives behind a route handler so the [slug] catch-all route cannot shadow it.

const SW_SOURCE = `/* Vitharn PWA install helper — root-scope service worker.
   Makes the app installable and offline-capable by caching navigation
   pages (network-first, cache fallback). Everything else is passthrough. */
const NAV_CACHE = "vitharn-pwa-nav-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== NAV_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches
              .open(NAV_CACHE)
              .then((c) => c.put(req.url, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req.url).then((r) => r || caches.match("/")),
        ),
    );
    return;
  }

  // Passthrough for all other requests.
  event.respondWith(fetch(req));
});
`;

export async function GET() {
  return new NextResponse(SW_SOURCE, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
