import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
