// Re-route the curated routes whose original geometry was poor — box-corner
// via-points routed onto perimeter roads (Wimbledon's 21.7 km "rectangle" for
// an 8 km windmill loop) or collapsed legs (the Grand Tour lost a whole bank
// of the Thames). Each route here gets hand-placed via-points on the intended
// paths, BRouter foot routing, de-spur + simplify, and is merged into
// data/routes.geojson by id. Prints the routed km — update the ROUTES card
// distances in script.js to match, then re-run generate-pubs/boroughs.
//
//   node tools/fix-route-geometry.mjs [id ...]

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BROUTER = "https://brouter.de/brouter";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hand-placed [lat, lon] via-points tracing each route's intended course.
const VIAS = {
  "wimbledon-common": [[51.4341, -0.2358], [51.432, -0.2398], [51.427, -0.239], [51.4237, -0.2313], [51.429, -0.227], [51.437, -0.227], [51.4408, -0.2317], [51.4385, -0.2385], [51.4341, -0.2358]],
  "grand-tour": [[51.5074, -0.1278], [51.5007, -0.122], [51.5033, -0.1196], [51.5076, -0.0994], [51.5044, -0.0754], [51.5079, -0.0754], [51.511, -0.0985], [51.51, -0.1223], [51.5074, -0.1278]],
  "hyde-kensington": [[51.5027, -0.1516], [51.5019, -0.1705], [51.5022, -0.1857], [51.5099, -0.1876], [51.5117, -0.175], [51.5131, -0.1589], [51.5074, -0.1533], [51.5027, -0.1516]],
  "hampstead-heath": [[51.5548, -0.164], [51.559, -0.1497], [51.5638, -0.1462], [51.5712, -0.1668], [51.5717, -0.1745], [51.568, -0.1785], [51.5665, -0.1855], [51.5605, -0.1785], [51.5602, -0.172], [51.557, -0.163], [51.5548, -0.164]],
  "bushy-park": [[51.4245, -0.3355], [51.4131, -0.3341], [51.4093, -0.345], [51.4175, -0.3495], [51.4245, -0.3355]],
  "crystal-palace-park": [[51.4222, -0.0725], [51.4177, -0.0687], [51.4165, -0.0755], [51.4218, -0.0788], [51.4222, -0.0725]],
  "olympic-park": [[51.5432, -0.0125], [51.5386, -0.0116], [51.5387, -0.017], [51.5395, -0.0195], [51.5468, -0.0231], [51.5497, -0.0151], [51.548, -0.0146], [51.5432, -0.0125]],
  "clapham-common": [[51.4623, -0.15], [51.4614, -0.1382], [51.4531, -0.1477], [51.4623, -0.15]],
  "thames-barrier": [[51.4827, -0.0096], [51.487, 0.003], [51.4995, 0.0], [51.5005, 0.006], [51.496, 0.0135], [51.4907, 0.021], [51.493, 0.0335]],
  "grand-union-paddington": [[51.5223, -0.183], [51.5303, -0.2205], [51.5365, -0.2455], [51.5395, -0.2745], [51.5407, -0.2997]],
};

async function brouter(vias) {
  const lonlats = vias.map(([lat, lon]) => `${lon},${lat}`).join("|");
  const url = `${BROUTER}?lonlats=${lonlats}&profile=shortest&alternativeidx=0&format=geojson`;
  const res = await fetch(url, { headers: { "User-Agent": "TubeRun/1.0 (route geometry repair)" } });
  const text = await res.text();
  let gj;
  try { gj = JSON.parse(text); } catch { throw new Error(`non-JSON (${res.status}): ${text.slice(0, 120)}`); }
  if (!gj.features || !gj.features[0]) throw new Error(`no route: ${text.slice(0, 120)}`);
  return gj.features[0].geometry.coordinates;
}

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

const only = process.argv.slice(2);
const ids = Object.keys(VIAS).filter((id) => !only.length || only.includes(id));
const geoPath = join(ROOT, "data/routes.geojson");
const geo = JSON.parse(readFileSync(geoPath, "utf8"));
const summary = [];
for (const id of ids) {
  let raw;
  try { raw = await brouter(VIAS[id]); }
  catch (e) { summary.push({ id, error: e.message.slice(0, 70) }); await sleep(500); continue; }
  const pts = raw.map((c) => [r5(c[1]), r5(c[0])]);
  // Closed loops must skip deSpur — the whole circuit "returns to its start",
  // which the out-and-back detector would swallow in one bite.
  const isLoop = distM(pts[0], pts[pts.length - 1]) < 60;
  const latlon = isLoop ? pts : deSpur(pts);
  const line = simplify(latlon, 0.00012).map(([lat, lon]) => [lon, lat]);
  let km = 0;
  for (let i = 1; i < line.length; i++) km += distM([line[i - 1][1], line[i - 1][0]], [line[i][1], line[i][0]]) / 1000;
  const at = geo.features.findIndex((f) => f.properties.id === id);
  const feature = { type: "Feature", properties: at >= 0 ? geo.features[at].properties : { id }, geometry: { type: "LineString", coordinates: line } };
  if (at >= 0) geo.features[at] = feature; else geo.features.push(feature);
  summary.push({ id, pts: line.length, km: Math.round(km * 10) / 10 });
  await sleep(500);
}
writeFileSync(geoPath, JSON.stringify(geo));
console.log("Merged into data/routes.geojson");
console.table(summary);
