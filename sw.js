/* Tube Run service worker — offline app shell + runtime caching.
 *
 * Strategy:
 *   - navigations   → network-first, fall back to the cached shell (opens offline)
 *   - same-origin   → stale-while-revalidate (serve cache, refresh in the background)
 *   - map tiles     → cache-first with a capped runtime cache (offline maps you've seen)
 *   - external APIs → straight to the network (open-meteo / TfL are online-only)
 *
 * Versioned assets (script.js?v=, style.css?v=) don't need listing here — the
 * stale-while-revalidate handler caches whatever the page actually loads, so a new
 * ?v= simply becomes a new cache entry. Bump SW_VERSION to purge old caches.
 */
const SW_VERSION = "v1";
const SHELL = "tuberun-shell-" + SW_VERSION;
const RUNTIME = "tuberun-runtime-" + SW_VERSION;
const TILES = "tuberun-tiles-" + SW_VERSION;
const TILE_MAX = 500;

// The app can boot offline from these. Cached individually so one 404 can't abort install.
const PRECACHE = [
  "index.html",
  "site.webmanifest",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/icon.svg",
  "img/apple-touch-icon.png",
  "img/favicon-32.png",
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/leaflet.css",
  "vendor/fonts/fonts.css",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL).then(async (cache) => {
      await Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => null)));
      // Also precache the ?v=-versioned assets index.html references (script.js,
      // style.css, fonts.css) so the app works offline right after the first visit,
      // before any reload has had a chance to cache them via stale-while-revalidate.
      try {
        const html = await (await fetch("index.html", { cache: "no-store" })).text();
        const versioned = [...html.matchAll(/(?:href|src)="([^"]+\?v=\d+)"/g)].map((m) => m[1]);
        await Promise.all(versioned.map((u) => cache.add(u).catch(() => null)));
      } catch (_) { /* offline at install time — SWR fills the gap on a later online load */ }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME, TILES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isTile = (href) => /basemaps\.cartocdn\.com|api\.os\.uk/.test(href);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Navigations: network-first, fall back to the cached shell so the app opens offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put("index.html", copy)); return res; })
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  // Map tiles (cross-origin): cache-first, capped so the cache can't grow without bound.
  if (isTile(url.href)) {
    e.respondWith(
      caches.open(TILES).then((cache) => cache.match(req).then((hit) =>
        hit || fetch(req).then((res) => { cache.put(req, res.clone()); trimCache(TILES, TILE_MAX); return res; }).catch(() => hit)
      ))
    );
    return;
  }

  // Same-origin assets + data: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(RUNTIME).then((cache) => cache.match(req).then((hit) => {
        const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || network;
      }))
    );
  }
  // External APIs (open-meteo / TfL): not intercepted — they need the live network.
});

function trimCache(name, max) {
  caches.open(name).then((cache) => cache.keys().then((keys) => {
    if (keys.length > max) cache.delete(keys[0]).then(() => trimCache(name, max));
  }));
}
