// Trace the running routes extracted from "Runner's Guide to London" (2015) onto
// real London pavements. Input is data/book-routes-input.json — an array of
// routes each carrying an ordered `waypoints` list of named places (streets,
// bridges, parks, stations). This:
//   1. geocodes every unique waypoint via Nominatim (disk-cached, rate-limited,
//      biased to Greater London),
//   2. routes through the geocoded points with BRouter (pedestrian-ish
//      "shortest" profile, per-leg fallback) to get a pavement polyline,
//   3. simplifies + de-spurs the line,
//   4. merges the fine LineString into data/routes.geojson (keyed by id — the
//      geometry drawRoute/drawRouteGL prefer), and
//   5. writes data/book-routes-generated.json: the ROUTES metadata entries with
//      a decimated inline `path` sketch fallback, ready to splice into script.js.
//
//   node tools/build-book-routes.mjs                # trace all
//   node tools/build-book-routes.mjs --only <id,id> # trace a subset
//   node tools/build-book-routes.mjs --dry          # geocode only, no BRouter
//
// Geometry + geocoding: OpenStreetMap (BRouter routing, Nominatim geocoding, ODbL).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { routeThrough } from "./lib/brouter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IN = join(ROOT, "data/book-routes-input.json");
const GEOJSON = join(ROOT, "data/routes.geojson");
const OUT = join(ROOT, "data/book-routes-generated.json");
const CACHE = join(ROOT, "data/geocode-cache.json");
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "TubeRun/1.0 (book route tracing; https://psurma.github.io/TubeRun)";
// Greater London + a margin for Epping Forest, Richmond, Hampton Court, and the
// Surrey Downs Link (Guildford–Cranleigh) to the south-west.
const VIEWBOX = "-0.70,51.72,0.40,51.08"; // left,top,right,bottom
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only")) || "").split("=")[1] ||
  (args.includes("--only") ? args[args.indexOf("--only") + 1] : "");
const onlySet = only ? new Set(only.split(",").map((s) => s.trim())) : null;
const DRY = args.includes("--dry");

let cache = {};
if (existsSync(CACHE)) { try { cache = JSON.parse(readFileSync(CACHE, "utf8")); } catch { /* rebuild */ } }
function saveCache() { writeFileSync(CACHE, JSON.stringify(cache, null, 0)); }

// --- Nominatim geocoding (cached, London-biased, rate-limited) -----------------
async function geocodeOne(q) {
  if (q in cache) return cache[q];
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1&viewbox=${VIEWBOX}&bounded=1&countrycodes=gb`;
  let hit = null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-GB" } });
    if (res.ok) {
      const j = await res.json();
      if (j[0]) hit = [Math.round(+j[0].lat * 1e5) / 1e5, Math.round(+j[0].lon * 1e5) / 1e5];
    }
  } catch { /* network — leave null, retry next run */ }
  cache[q] = hit;
  saveCache();
  await sleep(1100); // Nominatim: <=1 req/sec
  return hit;
}
const kmBetween = (a, b) => distM(a, b) / 1000;
// A stable centre for the route, so ambiguous street names ("Wells Way") can be
// rejected when they resolve to the wrong end of the viewbox.
async function anchorOf(r) {
  const tries = [];
  if (r.area && r.postcode) tries.push(`${r.area}, ${r.postcode}, UK`);
  if (r.postcode) tries.push(`${r.postcode}, UK`);
  if (r.start) tries.push(`${r.start}, London, UK`);
  if (r.area) tries.push(`${r.area}, London, UK`);
  for (const q of tries) { const h = await geocodeOne(q); if (h) return h; }
  return null;
}
// Geocode one waypoint, trying locality-qualified forms and rejecting hits that
// land further than `radius` km from the route anchor (those are wrong-locality
// name collisions). Returns null if only far hits exist.
async function geocodeNear(name, { postcode, area, anchor, radius }) {
  const hasComma = /,/.test(name);
  const forms = [];
  if (hasComma) { forms.push(`${name}, London, UK`, `${name}, UK`); }
  else {
    if (postcode) forms.push(`${name}, ${postcode}, UK`);
    if (area && !name.includes(area)) forms.push(`${name}, ${area}, London, UK`);
    forms.push(`${name}, London, UK`);
  }
  for (const f of forms) {
    const hit = await geocodeOne(f);
    if (!hit) continue;
    if (!anchor || kmBetween(hit, anchor) <= radius) return hit;
  }
  return null;
}

// --- BRouter routing (shared client in lib/brouter.mjs) ------------------------
// Foot-friendly profile first (prefers footpaths/park trails over fast roads);
// if a point islands under it, retry the leg on the denser "shortest" graph.
const PROFILES = [["hiking-beta", 3], ["shortest", 2]];

const toR = Math.PI / 180;
const distM = (a, b) => 12742000 * Math.asin(Math.sqrt(Math.sin((b[0] - a[0]) * toR / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin((b[1] - a[1]) * toR / 2) ** 2));
function deSpur(pts, eps = 12, minDev = 30, win = 300) {
  const kept = []; let i = 0;
  while (i < pts.length) {
    kept.push(pts[i]);
    let jump = -1;
    for (let j = Math.min(i + win, pts.length - 1); j > i + 2; j--) {
      if (distM(pts[i], pts[j]) >= eps) continue;
      let maxDev = 0;
      for (let k = i + 1; k < j && maxDev <= minDev; k++) maxDev = Math.max(maxDev, distM(pts[i], pts[k]));
      if (maxDev > minDev) { jump = j; break; }
    }
    i = jump > -1 ? jump : i + 1;
  }
  return kept;
}
function perp(p, a, b) {
  const dy = b[0] - a[0], dx = b[1] - a[1];
  if (!dx && !dy) return Math.hypot(p[1] - a[1], p[0] - a[0]);
  const t = ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p[1] - (a[1] + t * dx), p[0] - (a[0] + t * dy));
}
function simplify(pts, tol) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let md = 0, idx = -1;
    for (let i = s + 1; i < e; i++) { const d = perp(pts[i], pts[s], pts[e]); if (d > md) { md = d; idx = i; } }
    if (md > tol && idx > -1) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]); return out;
}
const r5 = (n) => Math.round(n * 1e5) / 1e5;
// Decimate a [lat,lon] line down to ~target points for the inline sketch fallback.
function decimate(latlon, target = 26) {
  if (latlon.length <= target) return latlon;
  const step = (latlon.length - 1) / (target - 1);
  const out = [];
  for (let i = 0; i < target; i++) out.push(latlon[Math.round(i * step)]);
  return out;
}
const haversineKm = (a, b) => distM(a, b) / 1000;
function lineKm(latlon) { let k = 0; for (let i = 1; i < latlon.length; i++) k += haversineKm(latlon[i - 1], latlon[i]); return k; }

// --- main ----------------------------------------------------------------------
const routes = JSON.parse(readFileSync(IN, "utf8")).filter((r) => !onlySet || onlySet.has(r.id));
const gj = existsSync(GEOJSON) ? JSON.parse(readFileSync(GEOJSON, "utf8")) : { type: "FeatureCollection", features: [] };
const byId = new Map(gj.features.map((f) => [f.properties.id, f]));
// Load any existing generated set so a `--only` re-trace merges (fixes a subset)
// instead of discarding the rest.
let generated = [];
try { generated = JSON.parse(readFileSync(OUT, "utf8")); } catch { /* fresh */ }
const genById = new Map(generated.map((g, i) => [g.id, i]));
const report = [];

for (const r of routes) {
  const wps = (r.waypoints || []).slice();
  if (wps.length < 2) { report.push(`SKIP ${r.id}: <2 waypoints`); continue; }
  // Geocode each waypoint, anchored to the route's centre. Radius scales with the
  // route length (a 24 km point-to-point legitimately reaches ~24 km from its start).
  const anchor = await anchorOf(r);
  // A loop's waypoints cluster near its centroid (~perimeter×0.6 covers elongated
  // loops); a point-to-point legitimately reaches ~its full length from the start.
  const radius = r.loop ? Math.max(3, (r.bookKm || 5) * 0.6) : Math.max(5, (r.bookKm || 8) * 1.3);
  let hits = [];
  let missed = [];
  for (const w of wps) { const p = await geocodeNear(w, { postcode: r.postcode, area: r.area, anchor, radius }); if (p) hits.push({ name: w, ll: p }); else missed.push(w); }
  // If the anchor was itself mis-geocoded it rejects every real waypoint; retry
  // unanchored (any London hit) so the route still traces.
  if (hits.length < 2 && anchor) {
    hits = []; missed = [];
    for (const w of wps) { const p = await geocodeNear(w, { postcode: r.postcode, area: r.area, anchor: null, radius }); if (p) hits.push({ name: w, ll: p }); else missed.push(w); }
  }
  // Named access points for the route strip — geocoded waypoints, in order.
  const stopLabel = (w) => w.replace(/\bstation\b/i, "Station").replace(/,.*$/, "").trim();
  const stops = hits.map((h) => [stopLabel(h.name), r5(h.ll[0]), r5(h.ll[1])]);
  let pts = hits.map((h) => h.ll);
  if (pts.length < 2) { report.push(`SKIP ${r.id}: geocoded ${pts.length}/${wps.length} (missed: ${missed.join("; ")})`); continue; }
  if (r.loop && pts.length > 2) pts.push(pts[0]); // close the loop
  if (DRY) { report.push(`DRY ${r.id}: ${pts.length}/${wps.length} geocoded${missed.length ? " (missed: " + missed.join("; ") + ")" : ""}`); continue; }
  // Route through the geocoded points on pavements.
  const raw = await routeThrough(pts, PROFILES, { userAgent: UA }); // [lon,lat]
  if (!raw || raw.length < 2) { report.push(`SKIP ${r.id}: no routable path (all waypoints islanded)`); continue; }
  const skipped = routeThrough.lastSkipped || 0;
  const latlon = raw.map((c) => [r5(c[1]), r5(c[0])]);
  // deSpur removes out-and-back detours but treats a loop's start==end closure as
  // one giant spur and eats the whole ring — so only de-spur open (point-to-point) lines.
  const fineLatLon = simplify(r.loop ? latlon : deSpur(latlon), 0.00010);
  if (fineLatLon.length < 2) { report.push(`SKIP ${r.id}: BRouter returned <2 pts`); continue; }
  const km = lineKm(fineLatLon);
  // Largest gap between consecutive vertices — a big one means a straight-line
  // artifact slipped through (path-followed lines stay dense, ~13 m apart).
  let maxGap = 0;
  for (let i = 1; i < fineLatLon.length; i++) maxGap = Math.max(maxGap, distM(fineLatLon[i - 1], fineLatLon[i]));
  // Merge fine line into routes.geojson as [lon,lat].
  const coords = fineLatLon.map((p) => [p[1], p[0]]);
  const feat = { type: "Feature", properties: { id: r.id }, geometry: { type: "LineString", coordinates: coords } };
  if (byId.has(r.id)) { const ex = byId.get(r.id); ex.geometry = feat.geometry; }
  else { gj.features.push(feat); byId.set(r.id, feat); }
  // Decimated inline sketch fallback. For loops drop the closing point that equals
  // the first — drawRoute re-closes loops itself (path.concat([path[0]])).
  let sk = fineLatLon;
  if (r.loop && sk.length > 2 && distM(sk[0], sk[sk.length - 1]) < 20) sk = sk.slice(0, -1);
  const sketch = decimate(sk).map((p) => [r5(p[0]), r5(p[1])]);
  const rec = { ...r, path: sketch, stops, tracedKm: Math.round(km * 10) / 10, missed, maxGapM: Math.round(maxGap), skipped };
  if (genById.has(r.id)) generated[genById.get(r.id)] = rec;
  else { genById.set(r.id, generated.length); generated.push(rec); }
  report.push(`OK   ${r.id}: ${fineLatLon.length} pts, ${km.toFixed(1)} km, gap ${Math.round(maxGap)}m${skipped ? ", skipped " + skipped : ""}${missed.length ? " (missed: " + missed.join("; ") + ")" : ""}`);
  // Flush incrementally so a long run's progress survives interruption.
  writeFileSync(GEOJSON, JSON.stringify(gj));
  writeFileSync(OUT, JSON.stringify(generated, null, 2));
  process.stdout.write(report[report.length - 1] + "\n");
  await sleep(400);
}

if (!DRY) {
  writeFileSync(GEOJSON, JSON.stringify(gj));
  writeFileSync(OUT, JSON.stringify(generated, null, 2));
}
console.log(report.join("\n"));
console.log(`\n${generated.length}/${routes.length} traced -> data/routes.geojson + data/book-routes-generated.json`);
