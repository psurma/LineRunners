/* Tube Run service worker — offline app shell + runtime caching.
 *
 * Strategy:
 *   - navigations   → network-first, fall back to the cached shell (opens offline)
 *   - same-origin   → stale-while-revalidate (serve cache, refresh in the background)
 *   - live.json     → network only (must be fresh; its per-minute ?t= would flood the cache)
 *   - map tiles     → cache-first with a capped runtime cache (offline maps you've seen)
 *   - external APIs → straight to the network (open-meteo / TfL are online-only)
 *
 * Versioned assets (script.js?v=, style.css?v=) don't need listing here — the
 * stale-while-revalidate handler caches whatever the page actually loads, so a new
 * ?v= simply becomes a new cache entry. Bump SW_VERSION to purge old caches.
 */
const SW_VERSION = "v2"; // v2: global cache lookup + runtime ?v= eviction; bumping purges v1's unbounded runtime
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
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL).then(async (cache) => {
      await Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => null)));
      // Also precache the ?v=-versioned assets index.html references (script.js,
      // style.css, fonts.css, leaflet) so the app works offline right after the first
      // visit, before any reload has had a chance to cache them via stale-while-revalidate.
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

// Path of the SW scope root ("/TubeRun/" in production) — used to spot shell navigations.
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const isTile = (href) => /basemaps\.cartocdn\.com|api\.os\.uk|tiles\.openfreemap\.org|server\.arcgisonline\.com/.test(href);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Navigations: network-first, fall back to the cached shell so the app opens offline.
  // Only a navigation to the shell itself may refresh the cached copy — a lab page
  // (hero-lab.html, maplibre-lab.html) must not overwrite index.html's offline slot.
  if (req.mode === "navigate") {
    const isShell = url.pathname === SCOPE_PATH || url.pathname === SCOPE_PATH + "index.html";
    e.respondWith(
      fetch(req)
        .then((res) => { if (res.ok && isShell) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put("index.html", copy)); } return res; })
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  // Map tiles (cross-origin): cache-first, capped so the cache can't grow without bound.
  if (isTile(url.href)) {
    e.respondWith(
      caches.open(TILES).then((cache) => cache.match(req).then((hit) =>
        hit || fetch(req).then((res) => { if (res.ok || res.type === "opaque") { cache.put(req, res.clone()); trimCache(TILES, TILE_MAX); } return res; }).catch(() => hit)
      ))
    );
    return;
  }

  // Live status must always be network-fresh, and its per-minute ?t= key would mint
  // an endless stream of cache entries — so never cache it. Not intercepting leaves
  // failures to the page, which already handles a missing live.json.
  if (url.pathname.endsWith("/data/live.json")) return;

  // Same-origin assets + data: stale-while-revalidate. Look the request up across ALL
  // caches (global match) — the SHELL precache has to serve first-visit offline loads —
  // but write fresh responses to RUNTIME. After each write, evict RUNTIME entries for
  // the same path under a different query, so old ?v= generations don't pile up deploy
  // after deploy.
  if (url.origin === self.location.origin) {
    e.respondWith(
      Promise.all([caches.open(RUNTIME), caches.match(req)]).then(([cache, hit]) => {
        const network = fetch(req).then((res) => {
          if (res.ok) {
            cache.put(req, res.clone())
              .then(() => cache.keys(req, { ignoreSearch: true }))
              .then((keys) => Promise.all(keys.filter((k) => k.url !== req.url).map((k) => cache.delete(k))));
          }
          return res;
        }).catch(() => hit);
        return hit || network;
      })
    );
  }
  // External APIs (open-meteo / TfL): not intercepted — they need the live network.
});

function trimCache(name, max) {
  caches.open(name).then((cache) => cache.keys().then((keys) => {
    if (keys.length > max) cache.delete(keys[0]).then(() => trimCache(name, max));
  }));
}
