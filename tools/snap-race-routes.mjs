// Re-trace the two on-road race routes (The Big Half, Vitality London 10,000) so
// they follow real streets instead of straight chords. Their inline `path` in
// script.js is a hand-drawn sketch of the course; earlier geocoded-waypoint tracing
// detoured badly (Big Half 47 km vs 21 km real). Here we feed BRouter the EXACT
// on-course sketch coords as waypoints — no geocoding — so each leg snaps to the
// road corridor it already sits on. Writes the geometry into data/routes.geojson
// and named landmark stops into data/route-stops.json (for the Route ideas strip).
//
//   node tools/snap-race-routes.mjs
//
// Reuses the proven BRouter helpers from build-book-routes.mjs (full-route first,
// per-leg fallback that skips islands rather than drawing a chord). deSpur is
// deliberately skipped: these courses are precise and genuinely double back
// (Big Half runs out The Highway and returns), which deSpur would wrongly collapse.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEOJSON = join(ROOT, "data/routes.geojson");
const STOPS = join(ROOT, "data/route-stops.json");

const BROUTER = "https://brouter.de/brouter";
const UA = "TubeRun/1.0 (race route snapping; https://psurma.github.io/TubeRun)";
const PROFILE = "hiking-beta";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function brouterRaw(points, profile) {
  const lonlats = points.map((p) => `${p[1]},${p[0]}`).join("|");
  const res = await fetch(`${BROUTER}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`, { headers: { "User-Agent": UA } });
  const text = await res.text();
  if (text[0] === "{") {
    const gj = JSON.parse(text);
    if (gj.features && gj.features[0]) return gj.features[0].geometry.coordinates; // [lon,lat]
    throw Object.assign(new Error("no route"), { kind: "route" });
  }
  const permanent = /island|not mapped|not routable|unreachable|too far/i.test(text);
  throw Object.assign(new Error(text.slice(0, 90)), { kind: permanent ? "island" : "net" });
}
async function brouterTry(points) {
  for (const [profile, tries] of [[PROFILE, 3], ["shortest", 2]]) {
    for (let a = 0; a < tries; a++) {
      try { return await brouterRaw(points, profile); }
      catch (e) { if (e.kind === "island" || e.kind === "route") break; await sleep(800 * (a + 1)); }
    }
  }
  return null;
}
async function routeThrough(pts) {
  const full = await brouterTry(pts);
  if (full) return full;
  const out = []; let cur = pts[0];
  for (let k = 1; k < pts.length; k++) {
    const seg = await brouterTry([cur, pts[k]]);
    await sleep(200);
    if (seg && seg.length >= 2) { out.push(...(out.length ? seg.slice(1) : seg)); cur = pts[k]; }
    else if (out.length === 0) cur = pts[k];
  }
  return out.length >= 2 ? out : null;
}

const toR = Math.PI / 180;
const distM = (a, b) => 12742000 * Math.asin(Math.sqrt(Math.sin((b[0] - a[0]) * toR / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin((b[1] - a[1]) * toR / 2) ** 2));
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
const lineKm = (lonlat) => { let k = 0; for (let i = 1; i < lonlat.length; i++) k += distM([lonlat[i - 1][1], lonlat[i - 1][0]], [lonlat[i][1], lonlat[i][0]]) / 1000; return k; };

// The two race routes: exact on-course sketch waypoints (from script.js) + named
// landmark access points for the strip (positioned along the course, matching each
// route's highlights). stops are [label, lat, lon].
const RACES = [
  {
    // Eastern waypoints track The Highway's real NE rise (lat 51.5075 -> 51.5108
    // heading to Limehouse) and return via the continuous Narrow St / Wapping
    // riverside corridor. The original flat-51.5085 sketch snapped north of the
    // road/railway barrier and detoured 8 km; this traces to 20.9 km (99%).
    id: "big-half", km: 21.1,
    path: [[51.5030, -0.0785], [51.5055, -0.0754], [51.5075, -0.0705], [51.5083, -0.0616], [51.5090, -0.0522], [51.5100, -0.0430], [51.5108, -0.0355], [51.5095, -0.0270], [51.5085, -0.0400], [51.5060, -0.0520], [51.5045, -0.0615], [51.5055, -0.0730], [51.5030, -0.0754], [51.4990, -0.0670], [51.5008, -0.0520], [51.4990, -0.0455], [51.4935, -0.0480], [51.4880, -0.0475], [51.4835, -0.0330], [51.4818, -0.0210], [51.4827, -0.0098]],
    // Stops sit on the OUTBOUND leg (Tower Bridge start, then east along The
    // Highway) so they project monotonically start→finish. The course doubles
    // back through Wapping/Tower Bridge on the return; placing these two stops on
    // the return leg instead makes the strip's leg distances clamp to 0.
    stops: [
      ["Tower Bridge", 51.5030, -0.0785], ["Wapping", 51.5083, -0.0616], ["Limehouse", 51.5108, -0.0355],
      ["Rotherhithe", 51.4935, -0.0480], ["Deptford", 51.4835, -0.0330], ["Cutty Sark", 51.4827, -0.0098],
    ],
  },
  {
    id: "vitality-10k", km: 10.0,
    path: [[51.5045, -0.1330], [51.5065, -0.1290], [51.5079, -0.1281], [51.5104, -0.1200], [51.5113, -0.1105], [51.5140, -0.1110], [51.5155, -0.0975], [51.5138, -0.0932], [51.5133, -0.0886], [51.5122, -0.0910], [51.5115, -0.0975], [51.5110, -0.1080], [51.5100, -0.1200], [51.5079, -0.1281], [51.5065, -0.1245], [51.5030, -0.1265], [51.5010, -0.1330]],
    stops: [
      ["The Mall", 51.5055, -0.1300], ["Trafalgar Square", 51.5079, -0.1281], ["Strand", 51.5113, -0.1105],
      ["St Paul's", 51.5138, -0.0975], ["Bank", 51.5133, -0.0886], ["Buckingham Palace", 51.5010, -0.1330],
    ],
  },
];

const gj = JSON.parse(readFileSync(GEOJSON, "utf8"));
const stopsOut = JSON.parse(readFileSync(STOPS, "utf8"));

for (const race of RACES) {
  process.stdout.write(`tracing ${race.id} (${race.path.length} waypoints)... `);
  const coords = await routeThrough(race.path); // [lon,lat]
  if (!coords) { console.log("FAILED — left unchanged"); continue; }
  const simplified = simplify(coords, 0.00010).map((p) => [r5(p[0]), r5(p[1])]);
  const km = lineKm(simplified);
  const feat = gj.features.find((f) => f.properties.id === race.id);
  if (!feat) { console.log(`no geojson feature for ${race.id}!`); continue; }
  feat.geometry.coordinates = simplified;
  stopsOut[race.id] = race.stops.map((s) => [s[0], s[1], s[2]]);
  console.log(`${simplified.length} pts, ${km.toFixed(2)} km (book ${race.km} km, ${Math.round((km / race.km) * 100)}%)`);
}

writeFileSync(GEOJSON, JSON.stringify(gj));
writeFileSync(STOPS, JSON.stringify(stopsOut));
console.log("wrote data/routes.geojson + data/route-stops.json");
