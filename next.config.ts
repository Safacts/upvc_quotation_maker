import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Defaults to ".next" — identical behaviour on Vercel and in CI, where the env
  // var is never set. The override exists for Windows: `next build` deletes and
  // recreates .next, but a running `npm run start` holds a lock on
  // .next\serve.log and the build dies with EBUSY. Verify without killing the
  // dev server:  set NEXT_DIST_DIR=.next-verify&& npm run build
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  async headers() {
    // CSP with nonce support for inline scripts and event handlers
    // When nonce is present, 'unsafe-inline' is ignored - all inline scripts/event handlers need nonce
    const cspNonce = "'nonce-{NONCE}'"; // Will be replaced by middleware
    const csp = [
      "default-src 'self'",
      `script-src 'self' ${cspNonce} 'unsafe-eval' https://accounts.google.com https://umami.novamymentor.cloud https://pagead2.googlesyndication.com https://apis.google.com`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: https://umami.novamymentor.cloud https://pagead2.googlesyndication.com https://apis.google.com wss:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-src 'self' https://accounts.google.com https://play.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
      ],
    }];
  },
  async rewrites() {
    if (isDev) {
      const flutter = "http://127.0.0.1:8080";
      return [
        { source: "/upvc/:path*", destination: `${flutter}/:path*` },
        { source: "/app/:path*", destination: `${flutter}/:path*` },
        { source: "/flutter_bootstrap.js", destination: `${flutter}/flutter_bootstrap.js` },
        { source: "/main.dart.js", destination: `${flutter}/main.dart.js` },
        { source: "/flutter_service_worker.js", destination: `${flutter}/flutter_service_worker.js` },
        { source: "/assets/:path*", destination: `${flutter}/assets/:path*` },
        { source: "/icons/:path*", destination: `${flutter}/icons/:path*` },
        { source: "/favicon.png", destination: `${flutter}/favicon.png` },
        { source: "/manifest.json", destination: `${flutter}/manifest.json` },
      ];
    }
    return [
      { source: "/app", destination: "/app/index.html" },
      { source: "/app/", destination: "/app/index.html" },
    ];
  },
};

export default nextConfig;
