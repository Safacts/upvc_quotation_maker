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
  // Turbopack FS cache races on Windows (.next/dev/cache/*.meta EACCES).
  // Dev-only — build keeps normal caching. Fixes "Persisting failed" noise.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://www.gstatic.com https://umami.novamymentor.cloud https://pagead2.googlesyndication.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self' https: https://umami.novamymentor.cloud https://pagead2.googlesyndication.com https://apis.google.com wss:; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://accounts.google.com https://play.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  async rewrites() {
    return [
      { source: "/app", destination: "/app/index.html" },
      { source: "/app/", destination: "/app/index.html" },
    ];
  },
};

export default nextConfig;
