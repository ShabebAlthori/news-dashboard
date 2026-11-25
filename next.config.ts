import type { NextConfig } from "next";

// Web edition (GitHub Pages): plain static files, built by `npm run build:static`.
const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";

async function securityHeaders() {
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
}

const nextConfig: NextConfig = {
  // Static export for the web edition; otherwise a server build (standalone for Docker).
  output: STATIC ? "export" : process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  basePath: STATIC && process.env.NEXT_PUBLIC_BASE_PATH ? process.env.NEXT_PUBLIC_BASE_PATH : undefined,
  trailingSlash: STATIC,
  images: STATIC ? { unoptimized: true } : undefined,
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
  // Custom headers need a server; GitHub Pages serves its own.
  headers: STATIC ? undefined : securityHeaders,
};

export default nextConfig;
