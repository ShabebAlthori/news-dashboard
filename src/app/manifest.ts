import type { MetadataRoute } from "next";

// Web app manifest (served as /manifest.webmanifest). Paths include the base path because
// the web edition lives under /<repository>/ on GitHub Pages.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE}/`,
    name: "TechPulse",
    short_name: "TechPulse",
    description: "Bilingual (Arabic/English) technology, data and gaming news — ranked, de-duplicated and summarized.",
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    dir: "auto",
    background_color: "#090b18",
    theme_color: "#090b18",
    categories: ["news", "technology"],
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-maskable-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${BASE}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Latest News", short_name: "Latest", url: `${BASE}/latest/` },
      { name: "Data Radar", short_name: "Radar", url: `${BASE}/radar/` },
      { name: "Saved Articles", short_name: "Saved", url: `${BASE}/saved/` },
    ],
  };
}
