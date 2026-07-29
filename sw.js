/* Line Runners service worker — offline app shell + runtime caching.
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
const SW_VERSION = "v5"; // v5: rebrand cache prefix overland- -> linerunners- (activate drops anything outside the current triple, so the old caches go with it). v4: RUNTIME beats the SHELL precache, tiles fetched cors so res.ok is real; bumping drops the old opaque tile entries. v3: rebrand cache prefix tuberun- -> overland-. v2: global cache lookup + runtime ?v= eviction; bumping purges v1's unbounded runtime
const SHELL = "linerunners-shell-" + SW_VERSION;
const RUNTIME = "linerunners-runtime-" + SW_VERSION;
const TILES = "linerunners-tiles-" + SW_VERSION;
const TILE_MAX = 500;
const TILE_TOUCH = 0.15; // odds of re-putting a cache hit to refresh its eviction order

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

// Path of the SW scope root ("/LineRunners/" in production) — used to spot shell navigations.
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
        .then((res) => { if (res.ok && isShell) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put("index.html", copy)).catch(() => {}); } return res; })
        .catch(() => caches.match("index.html"))
        // Offline before the shell was ever cached — respondWith(undefined) would throw.
        .then((res) => res || new Response("Offline", { status: 503 }))
    );
    return;
  }

  // Map tiles (cross-origin): cache-first, capped so the cache can't grow without bound.
  //
  // The page asks for tiles from plain <img> tags, so the browser's request is no-cors
  // and the response opaque — its status is unreadable, so a 404 or 500 tile would be
  // cached as though it were valid and then served forever. Re-issue the request in
  // cors mode (every basemap we use answers with Access-Control-Allow-Origin) so res.ok
  // means something and only real tiles get stored. If a provider ever refuses CORS the
  // original no-cors request still serves the tile, just without caching it.
  // Adding crossOrigin: "anonymous" to the two L.tileLayer calls in script.js would make
  // the page's own request cors and make this re-issue unnecessary.
  if (isTile(url.href)) {
    e.respondWith(
      caches.open(TILES).then((cache) => cache.match(req).then((hit) => {
        if (hit) {
          // Approximate LRU: a put moves the entry to the back of the key order, so
          // trimCache() drops tiles you haven't looked at lately instead of the home
          // area you loaded first. Sampled, to keep panning off the write path.
          if (Math.random() < TILE_TOUCH) cache.put(req, hit.clone()).catch(() => {});
          return hit;
        }
        return fetch(req.url, { mode: "cors" })
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).then(() => trimCache(TILES, TILE_MAX)).catch(() => {});
            return res;
          })
          .catch(() => fetch(req))
          .catch(() => Response.error());
      }))
    );
    return;
  }

  // Live status must always be network-fresh, and its per-minute ?t= key would mint
  // an endless stream of cache entries — so never cache it. Not intercepting leaves
  // failures to the page, which already handles a missing live.json.
  if (url.pathname.endsWith("/data/live.json")) return;

  // Same-origin assets + data: stale-while-revalidate. RUNTIME is consulted FIRST so a
  // refreshed copy always wins: a global caches.match() walks caches in creation order,
  // and SHELL is created at install, so site.webmanifest and the precached icons would
  // otherwise be served from their install-time copies for the life of the registration.
  // The global match stays as the fallback, because SHELL is what covers a first-visit
  // offline load. Fresh responses go to RUNTIME, and after each write RUNTIME entries
  // for the same path under a different query are evicted, so old ?v= generations don't
  // pile up deploy after deploy.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(RUNTIME).then((cache) => cache.match(req).then((fresh) => fresh || caches.match(req)).then((hit) => {
        const network = fetch(req).then((res) => {
          if (res.ok) {
            cache.put(req, res.clone())
              .then(() => cache.keys(req, { ignoreSearch: true }))
              .then((keys) => Promise.all(keys.filter((k) => k.url !== req.url).map((k) => cache.delete(k))))
              .catch(() => {});
          }
          return res;
        }).catch(() => hit || Response.error());
        return hit || network;
      }))
    );
  }
  // External APIs (open-meteo / TfL): not intercepted — they need the live network.
});

function trimCache(name, max) {
  return caches.open(name).then((cache) => cache.keys().then((keys) => {
    if (keys.length > max) return cache.delete(keys[0]).then(() => trimCache(name, max));
  }));
}
