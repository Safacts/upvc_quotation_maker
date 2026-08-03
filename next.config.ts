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
      ];
    }
    return [
      { source: "/upvc/:path*", destination: "/app/index.html" },
      { source: "/app", destination: "/app/index.html" },
      { source: "/app/", destination: "/app/index.html" },
    ];
  },
};

export default nextConfig;
