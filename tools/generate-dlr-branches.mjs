// Pavement geometry for the DLR's secondary BRANCHES (the main branch lives in
// routes/dlr.gpx; this covers the rest — the Beckton and Woolwich/City Airport
// arms, the Bank and Tower Gateway spurs) so the Line-by-Line branch picker
// draws them on real streets instead of station-to-station chords. Writes into
// data/tube-branch-routes.json: { <lineId>: [ [[lat,lon],...] per non-main
// branch ] } — the tube-line analogue of data/nr-branch-routes.json, consumed
// by buildBranchOptions in the same branches-minus-main order.
//
//   node tools/generate-dlr-branches.mjs
//
// Geometry: OpenStreetMap via BRouter (ODbL).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NET = JSON.parse(readFileSync(join(ROOT, "data/tube-network.json"), "utf8"));
const BROUTER = "https://brouter.de/brouter";
const LINES = ["dlr"]; // tube-network lines that want branch pavement geometry
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function brouter(points) {
  const lonlats = points.map((p) => `${p.lon},${p.lat}`).join("|");
  const res = await fetch(`${BROUTER}?lonlats=${lonlats}&profile=shortest&alternativeidx=0&format=geojson`, { headers: { "User-Agent": "TubeRun/1.0 (dlr branch routes)" } });
  const text = await res.text();
  let gj;
  try { gj = JSON.parse(text); } catch { throw new Error(`non-JSON (${res.status})`); }
  if (!gj.features || !gj.features[0]) throw new Error("no route");
  return gj.features[0].geometry.coordinates;
}
async function routeStations(st) {
  try { return await brouter(st); } catch (_) { /* per-leg fallback */ }
  const out = [];
  for (let i = 0; i < st.length - 1; i++) {
    let seg;
    try { seg = await brouter([st[i], st[i + 1]]); }
    catch { seg = [[st[i].lon, st[i].lat], [st[i + 1].lon, st[i + 1].lat]]; }
    out.push(...(out.length ? seg.slice(1) : seg));
    await sleep(250);
  }
  return out;
}
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

const tbPath = join(ROOT, "data/tube-branch-routes.json");
let out = {};
try { out = JSON.parse(readFileSync(tbPath, "utf8")); } catch { /* new file */ }
let done = 0;
for (const id of LINES) {
  const ln = NET[id];
  if (!ln || !ln.route || !(ln.branches || []).length) { console.log(`${id}: no branches, skipped`); continue; }
  const mainKey = ln.route.join("|");
  const mainRev = [...ln.route].reverse().join("|");
  out[id] = [];
  for (const b of ln.branches) {
    if (b.join("|") === mainKey || b.join("|") === mainRev || b.length < 2) continue;
    const st = b.map((sid) => ln.stations[sid]).filter(Boolean);
    if (st.length < 2) continue;
    const raw = await routeStations(st);
    const line = simplify(deSpur(raw.map((c) => [r5(c[1]), r5(c[0])])), 0.00012);
    if (line.length > 1) out[id].push(line);
    done++;
    const a = ln.stations[b[0]], z = ln.stations[b[b.length - 1]];
    process.stdout.write(`${id} branch ${out[id].length}: ${a.n} -> ${z.n} (${line.length} pts)\n`);
    await sleep(400);
  }
}
writeFileSync(tbPath, JSON.stringify(out));
console.log(`Done: ${done} branches -> data/tube-branch-routes.json`);
