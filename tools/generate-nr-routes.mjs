// Generate real pavement running routes for the National Rail lines —
// the same treatment the tube lines got from generate-routes.mjs: each line's
// main branch (longest, matching the site's rtStations rule) is routed
// station-to-station on OpenStreetMap's pedestrian network via BRouter,
// de-spurred (run past stations, not into their forecourts and back), and
// written as routes/<id>.gpx with station waypoints — ready to follow on a
// watch. Add each id to GPX_LINES in script.js so the site uses the file.
//
//   node tools/generate-nr-routes.mjs [id ...]   (default: every NR line)
//
// Geometry derives from OpenStreetMap (BRouter) — ODbL attribution as in the
// existing files. Re-run when data/nr-network.json changes.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { brouterRaw } from "./lib/brouter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NET = JSON.parse(readFileSync(join(ROOT, "data/nr-network.json"), "utf8"));
const PROFILE = "shortest"; // most direct — hugs the rail corridor, matches the tube GPX builds
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Single attempt, throws on failure — routeStations' per-segment fallback handles it.
const brouter = (points) => brouterRaw(points, PROFILE, { userAgent: "TubeRun/1.0 (national rail routes)" }); // [lon, lat, ele]

// Whole line in one request; per-segment fallback so one un-snappable station
// doesn't lose the line (that leg becomes a straight-line placeholder).
async function routeStations(stations) {
  try {
    return { coords: await brouter(stations), mode: "whole" };
  } catch (_) { /* fall through */ }
  const coords = [];
  let straight = 0;
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    let seg;
    try { seg = await brouter([a, b]); }
    catch { straight++; seg = [[a.lon, a.lat, 0], [b.lon, b.lat, 0]]; }
    coords.push(...(coords.length ? seg.slice(1) : seg));
    await sleep(300);
  }
  return { coords, mode: `segments${straight ? ` (${straight} straight)` : ""}` };
}

const toR = Math.PI / 180;
function distM(a, b) {
  const dLa = (b[0] - a[0]) * toR, dLo = (b[1] - a[1]) * toR;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLo / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(s));
}
// Station buildings sit off the road as hard via-points, so BRouter spurs in
// to touch them and back out. Drop those out-and-back excursions (leaves the
// road, goes >30 m out, returns within ~12 m) so the route runs past instead.
// Points are [lat, lon, ele] — the extra element rides along untouched.
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

function toGpx(name, stations, latlonele, when) {
  const wpts = stations.map((s) => `  <wpt lat="${s.lat}" lon="${s.lon}"><name>${esc(s.n)}</name></wpt>`).join("\n");
  const trkpts = latlonele.map((c) => (Number.isFinite(c[2])
    ? `      <trkpt lat="${c[0]}" lon="${c[1]}"><ele>${c[2]}</ele></trkpt>`
    : `      <trkpt lat="${c[0]}" lon="${c[1]}"/>`)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TubeRun route generator" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(name)} — TubeRun</name>
    <desc>Above-ground running route tracing the ${esc(name)} line, station to station. Routed on pavements and footways from OpenStreetMap data (BRouter, ${PROFILE}).</desc>
    <author><name>TubeRun</name></author>
    <copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/1-0/</license></copyright>
    <link href="https://www.openstreetmap.org/copyright"><text>© OpenStreetMap contributors</text></link>
    <time>${when}</time>
  </metadata>
${wpts}
  <trk>
    <name>${esc(name)} — TubeRun</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

const only = process.argv.slice(2);
const ids = Object.keys(NET).filter((id) => !only.length || only.includes(id));
const when = new Date().toISOString();
const summary = [];
for (const id of ids) {
  const ln = NET[id];
  // Same main-branch rule as the site's rtStations: the declared route first.
  const br = ln.route && ln.route.length > 1 ? ln.route : ln.branches.reduce((a, b) => (b.length > a.length ? b : a), ln.branches[0] || []);
  const stations = br.map((sid) => ln.stations[sid]).filter(Boolean);
  if (stations.length < 2) { summary.push({ line: id, note: "skipped" }); continue; }
  process.stdout.write(`${id.padEnd(24)} ${String(stations.length).padStart(3)} stations … `);
  const r = await routeStations(stations);
  const latlonele = deSpur(r.coords.map((c) => [c[1], c[0], c[2]]));
  writeFileSync(join(ROOT, "routes", `${id}.gpx`), toGpx(ln.name, stations, latlonele, when));
  let km = 0;
  for (let i = 1; i < latlonele.length; i++) km += distM(latlonele[i - 1], latlonele[i]) / 1000;
  console.log(`${latlonele.length} pts, ${km.toFixed(1)} km [${r.mode}]`);
  summary.push({ line: id, stations: stations.length, pts: latlonele.length, km: Math.round(km * 10) / 10, mode: r.mode });
  await sleep(500);
}
console.log("\nDone -> routes/<id>.gpx");
console.table(summary);
