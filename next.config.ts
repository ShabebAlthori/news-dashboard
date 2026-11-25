import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker (set NEXT_OUTPUT=standalone at build time).
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // This dashboard renders live, per-reader data on every request, so it opts out of
  // Cache Components / partial prerendering.
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
