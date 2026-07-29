// Build real geometry for the "Disused railways" routes — London's closed
// railway alignments that survive as public paths (Parkland Walk, the Wandle
// Trail over the Surrey Iron Railway, ...). Each route is BRouter foot-routed
// through via-points anchored on station coordinates we already hold (plus a
// few hand-placed trail points), de-spurred, simplified to overview weight,
// and merged into data/routes.geojson by id (replacing any existing feature).
//
//   node tools/generate-disused-routes.mjs
//
// After running: update the ROUTES entries in script.js with the printed
// distances, then re-run generate-pubs.mjs and generate-boroughs.mjs.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { brouterRaw } from "./lib/brouter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Station name -> [lat, lon] from the network data (tube + NR), so anchors
// are exact. Names must match the data's cleaned station names.
const coordByName = {};
for (const file of ["data/tube-network.json", "data/nr-network.json"]) {
  const net = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
  for (const id in net) for (const sid in net[id].stations) {
    const s = net[id].stations[sid];
    if (!coordByName[s.n]) coordByName[s.n] = [s.lat, s.lon];
  }
}
const stn = (name) => {
  const c = coordByName[name];
  if (!c) throw new Error(`station not found in network data: ${name}`);
  return c;
};

// Via-points: station anchors by name, trail points as [lat, lon].
const DISUSED = [
  { id: "parkland-walk", vias: [stn("Finsbury Park"), [51.5717, -0.1218], stn("Highgate"), [51.5872, -0.1440], stn("Alexandra Palace")] },
  { id: "crystal-palace-high-level", vias: [stn("Forest Hill"), [51.4408, -0.0800], stn("Sydenham Hill"), stn("Crystal Palace")] },
  { id: "northern-heights", vias: [stn("Mill Hill East"), [51.6165, -0.2295], stn("Mill Hill Broadway")] },
  { id: "ebury-way", vias: [stn("Rickmansworth"), [51.6355, -0.4630], [51.6480, -0.4230], stn("Watford High Street")] },
  { id: "surrey-iron-railway", vias: [stn("Wandsworth Town"), stn("Earlsfield"), stn("Colliers Wood"), stn("Mitcham Junction"), stn("West Croydon")] },
  { id: "longmoor-military", vias: [stn("Liss"), [51.0505, -0.8877], [51.0571, -0.8842]] },
];

// Single attempt, throws on failure (there is no fallback for these — a failed
// route is reported and left alone).
const brouter = (vias) => brouterRaw(vias, "shortest", { userAgent: "LineRunners/1.0 (disused railway routes)" }); // [lon, lat, ele]

const toR = Math.PI / 180;
function distM(a, b) {
  const dLa = (b[0] - a[0]) * toR, dLo = (b[1] - a[1]) * toR;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLo / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(s));
}
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

const geoPath = join(ROOT, "data/routes.geojson");
const geo = JSON.parse(readFileSync(geoPath, "utf8"));
const summary = [];
for (const { id, vias } of DISUSED) {
  const raw = await brouter(vias);
  const latlon = deSpur(raw.map((c) => [r5(c[1]), r5(c[0])]));
  const line = simplify(latlon, 0.00012).map(([lat, lon]) => [lon, lat]); // geojson order
  let km = 0;
  for (let i = 1; i < line.length; i++) km += distM([line[i - 1][1], line[i - 1][0]], [line[i][1], line[i][0]]) / 1000;
  const feature = { type: "Feature", properties: { id }, geometry: { type: "LineString", coordinates: line } };
  const at = geo.features.findIndex((f) => f.properties.id === id);
  if (at >= 0) geo.features[at] = feature; else geo.features.push(feature);
  summary.push({ id, pts: line.length, km: Math.round(km * 10) / 10 });
  await sleep(600);
}
writeFileSync(geoPath, JSON.stringify(geo));
console.log("Merged into data/routes.geojson");
console.table(summary);
