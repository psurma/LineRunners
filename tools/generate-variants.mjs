// Generate per-variant pavement geometry for branching lines' route variants.
//
// Companion to generate-routes.mjs. The "Line by line" panel offers each branch
// combination of a line as a dropdown variant; without this, those variants draw
// as straight station-to-station hops (generate-routes.mjs only routes the main
// route + individual branches). This routes each variant's full station sequence
// on the OSM *pedestrian* network via BRouter and writes data/variant-routes.json,
// keyed by line id -> array aligned to LINE_VARIANTS[id] (each an [[lat,lon],...]
// pavement line, or null if a variant couldn't be assembled).
//
//   node tools/generate-variants.mjs
//
// Geometry derives from OpenStreetMap (BRouter) — an ODbL "produced work",
// attribution only. Re-run when LINE_VARIANTS or station coordinates change.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractLiteral } from "./lib/extract.mjs";
import { brouterRaw } from "./lib/brouter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NET = JSON.parse(readFileSync(join(ROOT, "data/tube-network.json"), "utf8"));

// LINE_VARIANTS stays defined in script.js (single source of truth).
const LINE_VARIANTS = extractLiteral(readFileSync(join(ROOT, "script.js"), "utf8"), "LINE_VARIANTS");

// Replicate the site's assembleVariant: stitch branch station-id sequences into
// one ordered [{name,lat,lon}], dropping the shared join station between segs.
function assembleVariant(id, variant) {
  const ln = NET[id];
  if (!ln || !ln.branches) return null;
  const ids = [];
  for (const [bi, rev] of variant.segs) {
    const branch = ln.branches[bi];
    if (!branch) continue;
    const seg = rev ? [...branch].reverse() : branch;
    for (const sid of seg) {
      if (ids.length && ids[ids.length - 1] === sid) continue;
      ids.push(sid);
    }
  }
  return ids.map((sid) => { const s = ln.stations[sid]; return s ? { name: s.n, lat: s.lat, lon: s.lon } : null; }).filter(Boolean);
}

const PROFILE = "shortest"; // most direct — hugs the line's road corridor, matches generate-routes.mjs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Single attempt, throws on failure — the caller's per-segment fallback handles it.
const brouter = (points) => brouterRaw(points, PROFILE, { userAgent: "LineRunners/1.0 (variant routes)" });

// Whole path in one request; per-segment fallback so one un-snappable station
// doesn't lose the whole variant (that leg becomes a straight-line placeholder).
async function routeStations(stations) {
  try {
    return { coords: await brouter(stations), mode: "whole" };
  } catch (_) { /* fall through to per-segment */ }
  const coords = [];
  let straight = 0;
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    let seg;
    try { seg = await brouter([a, b]); }
    catch { straight++; seg = [[a.lon, a.lat], [b.lon, b.lat]]; }
    coords.push(...(coords.length ? seg.slice(1) : seg));
    await sleep(300);
  }
  return { coords, mode: `segments${straight ? ` (${straight} straight)` : ""}` };
}

const r5 = (n) => Math.round(n * 1e5) / 1e5;

// Douglas-Peucker down to ~13 m — BRouter returns thousands of points per variant;
// this keeps ~10% (a smooth overview line) so all variants fit in one small file.
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

const toR = Math.PI / 180;
function distM(a, b) {
  const dLa = (b[0] - a[0]) * toR, dLo = (b[1] - a[1]) * toR;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLo / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(s));
}
// Off-road stations (platforms set back from the road) sit as hard via-points, so
// BRouter spurs in to touch them and back out. Detect those out-and-back excursions
// — the path leaves the road, goes >30 m out, and returns within ~12 m of where it
// left — and drop the excursion so the route just runs *past* the station on the road.
function deSpur(pts, eps = 12, minDev = 30, win = 300) {
  const kept = [];
  let i = 0;
  while (i < pts.length) {
    kept.push(pts[i]);
    let jump = -1;
    for (let j = Math.min(i + win, pts.length - 1); j > i + 2; j--) {
      if (distM(pts[i], pts[j]) >= eps) continue;
      let maxDev = 0;
      for (let k = i + 1; k < j && maxDev <= minDev; k++) maxDev = Math.max(maxDev, distM(pts[i], pts[k]));
      if (maxDev > minDev) { jump = j; break; } // a real excursion, not sensor noise
    }
    i = jump > -1 ? jump : i + 1;
  }
  return kept;
}

const out = {};
const summary = [];
console.log(`Routing variants for ${Object.keys(LINE_VARIANTS).length} lines via BRouter (${PROFILE})...\n`);
for (const [id, variants] of Object.entries(LINE_VARIANTS)) {
  const geoms = [];
  for (let vi = 0; vi < variants.length; vi++) {
    const stations = assembleVariant(id, variants[vi]);
    if (!stations || stations.length < 2) { geoms.push(null); summary.push({ line: id, v: vi, pts: 0, mode: "skipped" }); continue; }
    const label = `${stations[0].name} -> ${stations[stations.length - 1].name}`;
    process.stdout.write(`${id.padEnd(14)} v${vi} ${label.padEnd(42)} … `);
    const r = await routeStations(stations);
    const latlon = r.coords.map((c) => [r5(c[1]), r5(c[0])]); // [lon,lat,ele] -> [lat,lon], 5dp
    const line = simplify(deSpur(latlon), 0.00012); // drop station spurs, then ~13 m Douglas-Peucker
    geoms.push(line);
    console.log(`${String(line.length).padStart(4)} pts [${r.mode}]`);
    summary.push({ line: id, v: vi, pts: line.length, mode: r.mode });
    await sleep(400);
  }
  out[id] = geoms;
}
writeFileSync(join(ROOT, "data/variant-routes.json"), JSON.stringify(out));
console.log("\nWrote data/variant-routes.json");
console.table(summary);
