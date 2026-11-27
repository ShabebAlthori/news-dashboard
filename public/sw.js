// TechPulse service worker (web edition). Lives at <base>/sw.js with scope <base>/.
//
// - Pages: network first, cached copy when offline (so a new deploy shows up at once).
// - App files under _next/static (content-hashed): cache first.
// - Data files under data/ (home, snapshot, status, radar, report, stocks): stale-while-revalidate
//   per exact URL (the page versions them with ?v=), and the latest cached copy of a file when the
//   network is unavailable. The page shows "Data is X old" from the data's own timestamps, so an
//   older cached copy is never shown as if it were current.
const VERSION = "techpulse-v1";
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const SHELL = ["/", "/latest/", "/radar/", "/technology/", "/gaming/", "/companies/", "/saved/", "/settings/", "/search/", "/report/", "/stocks/", "/manifest.webmanifest", "/icons/icon-192.png"].map((p) => BASE + p);
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const DATA = `${VERSION}-data`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match(`${BASE}/`)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/** Keep the two newest versions of each data file. */
async function trim(cache, path) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname === path);
  for (const old of keys.slice(0, Math.max(0, keys.length - 2))) await cache.delete(old);
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(DATA);
  const path = new URL(request.url).pathname;
  const update = fetch(request)
    .then(async (res) => {
      if (res.ok) {
        await cache.put(request, res.clone());
        await trim(cache, path);
      }
      return res;
    })
    .catch(() => null);
  const hit = await cache.match(request);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  const res = await update;
  if (res && res.ok) return res;
  // Offline or a failed response: the latest copy of this file we have (the page flags its age).
  return (await cache.match(request, { ignoreSearch: true })) || res || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(`${BASE}/`)) return;
  if (url.pathname.startsWith(`${BASE}/data/`)) {
    event.respondWith(staleWhileRevalidate(event));
  } else if (url.pathname.startsWith(`${BASE}/_next/static/`) || url.pathname.startsWith(`${BASE}/icons/`)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});
