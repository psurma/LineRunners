// Generate a runnable street-level GPX per tube line.
//
// One-off / occasional build-time step (NOT part of the served site): reads the
// ordered station sequences we already hold, routes each consecutive pair on the
// OpenStreetMap *pedestrian* network via BRouter (so it follows pavements/footways
// and stays off the rails and out of tunnels), and writes one attributed GPX per
// line into routes/. The site then loads those static files — no backend, no CSP
// change. Re-run when station orderings change.
//
// Each GPX carries the line's MAIN route only — one <trk>, one <trkseg>. GPX
// importers (Komoot and friends) treat extra track segments as extra routes and
// make the user pick, so branches are deliberately NOT bundled here; their
// pavement geometry ships separately (data/variant-routes.json and the
// *-branch-routes.json files) and nothing consumed the bundled segments.
//
//   node tools/generate-routes.mjs
//
// Data sources (the same two the site uses, so the GPX matches what it draws):
//   - data/tube-network.json  -> the 7 lines that carry a `route` ordering
//   - script.js WAYPOINTS      -> the 4 lines routed by hand-authored waypoints
//
// Output geometry derives from OpenStreetMap, so it is an ODbL "produced work":
// attribution only. Every GPX credits "© OpenStreetMap contributors".

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractLiteral } from "./lib/extract.mjs";
import { brouterRaw } from "./lib/brouter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NET = JSON.parse(readFileSync(join(ROOT, "data/tube-network.json"), "utf8"));

// WAYPOINTS stays defined in script.js (single source of truth).
const WP = extractLiteral(readFileSync(join(ROOT, "script.js"), "utf8"), "WAYPOINTS");

// The 4 lines with no `route` in tube-network.json are exactly the WAYPOINTS lines.
const WP_SLUG = { Victoria: "victoria", Bakerloo: "bakerloo", Central: "central", Metropolitan: "metropolitan" };

// Guard against silent drift: those 4 lines duplicate station coordinates that
// also live in tube-network.json. Warn loudly at build time if any diverge beyond
// ~40 m, or if a waypoint names a station the network JSON doesn't know — either
// means the two sources have fallen out of sync (the site draws one, the GPX the
// other). Doesn't block: reconciling is a data decision, but it can't go unseen.
function checkWaypointDrift() {
  const R = 6371000, toR = Math.PI / 180;
  const distM = (aLat, aLon, bLat, bLon) => {
    const dLa = (bLat - aLat) * toR, dLo = (bLon - aLon) * toR;
    const s = Math.sin(dLa / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const TOL = 40; // metres
  let issues = 0;
  for (const [key, slug] of Object.entries(WP_SLUG)) {
    const ln = NET[slug];
    if (!ln) { console.warn(`! drift: ${key} has no "${slug}" in tube-network.json`); issues++; continue; }
    const byName = {};
    for (const id in ln.stations) byName[norm(ln.stations[id].n)] = ln.stations[id];
    for (const [name, lat, lon] of WP[key]) {
      const st = byName[norm(name)];
      if (!st) { console.warn(`! drift: ${key} waypoint "${name}" is not in tube-network.json`); issues++; continue; }
      const d = distM(lat, lon, st.lat, st.lon);
      if (d > TOL) { console.warn(`! drift: ${key} "${name}" — WAYPOINTS and JSON differ by ${Math.round(d)} m`); issues++; }
    }
  }
  if (issues) console.warn(`\n${issues} WAYPOINTS/network drift issue(s) — reconcile the two sources.\n`);
  else console.log("Waypoint/network coordinates consistent.\n");
}

// Ordered [{name, lat, lon}] per line, from whichever source carries the ordering.
// `stations` is the main route (the single routed track); `allStations` is the
// full de-duplicated waypoint set (branch stations included, as POIs only).
// Branches are deliberately not routed here — see the header note.
function loadLines() {
  const out = [];
  for (const [slug, ln] of Object.entries(NET)) {
    let stations;
    if (Array.isArray(ln.route)) {
      stations = ln.route.map((id) => {
        const st = ln.stations[id];
        return { name: st.n, lat: st.lat, lon: st.lon };
      });
    } else {
      const key = Object.keys(WP_SLUG).find((k) => WP_SLUG[k] === slug);
      if (!key) { console.warn(`! ${slug}: no route and no WAYPOINTS mapping — skipped`); continue; }
      stations = WP[key].map(([name, lat, lon]) => ({ name, lat, lon }));
    }
    const seen = new Set(), allStations = [];
    for (const st of Object.values(ln.stations)) {
      if (seen.has(st.n)) continue;
      seen.add(st.n);
      allStations.push({ name: st.n, lat: st.lat, lon: st.lon });
    }
    out.push({ slug, name: ln.name, colour: ln.colour, stations, allStations });
  }
  return out;
}

const PROFILE = "shortest"; // BRouter shortest-distance profile — most direct route (follows the line's road corridor rather than detouring for green/quiet paths)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Route through the given points as hard via-points; returns [[lon,lat(,ele)], ...].
// Single attempt, throws on failure — routeLine's per-segment fallback handles it.
const brouter = (points) => brouterRaw(points, PROFILE, { userAgent: "Overland/1.0 (line routes)" });

// Whole-line in one request; if any station won't snap, fall back to per-segment
// so one bad leg (a straight-line placeholder) doesn't lose the whole line.
async function routeLine(line) {
  try {
    return { coords: await brouter(line.stations), mode: "whole" };
  } catch (e) {
    console.warn(`  whole-line failed (${e.message}) — per-segment`);
  }
  const coords = [];
  let straight = 0;
  for (let i = 0; i < line.stations.length - 1; i++) {
    const a = line.stations[i], b = line.stations[i + 1];
    let seg;
    try {
      seg = await brouter([a, b]);
    } catch {
      straight++;
      seg = [[a.lon, a.lat], [b.lon, b.lat]];
      console.warn(`    ${a.name} -> ${b.name}: straight-line placeholder`);
    }
    coords.push(...(coords.length ? seg.slice(1) : seg)); // drop shared join point
    await sleep(350);
  }
  return { coords, mode: `segments${straight ? ` (${straight} straight)` : ""}` };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function distKm(coords) {
  const R = 6371000, toR = Math.PI / 180;
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lo1, la1] = coords[i - 1], [lo2, la2] = coords[i];
    const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR;
    const s = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) ** 2;
    m += 2 * R * Math.asin(Math.sqrt(s));
  }
  return m / 1000;
}

// One <trk>, one <trkseg> — the main route only. Importers treat each extra
// trkseg as another route to choose between, so nothing else goes in the file.
function toGpx(line, coords, when) {
  const wpts = line.allStations
    .map((s) => `  <wpt lat="${s.lat}" lon="${s.lon}"><name>${esc(s.name)}</name></wpt>`)
    .join("\n");
  const trkpts = coords
    .map((c) => (c.length > 2
      ? `      <trkpt lat="${c[1]}" lon="${c[0]}"><ele>${c[2]}</ele></trkpt>`
      : `      <trkpt lat="${c[1]}" lon="${c[0]}"/>`))
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Overland route generator" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(line.name)} line — Overland</name>
    <desc>Above-ground running route tracing the ${esc(line.name)} line, station to station. Routed on pavements and footways from OpenStreetMap data (BRouter, ${PROFILE}).</desc>
    <author><name>Overland</name></author>
    <copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/1-0/</license></copyright>
    <link href="https://www.openstreetmap.org/copyright"><text>© OpenStreetMap contributors</text></link>
    <time>${when}</time>
  </metadata>
${wpts}
  <trk>
    <name>${esc(line.name)} line</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

mkdirSync(join(ROOT, "routes"), { recursive: true });
checkWaypointDrift();
const lines = loadLines();
const when = new Date().toISOString();
console.log(`Generating GPX for ${lines.length} lines via BRouter (${PROFILE})...\n`);
const summary = [];
for (const line of lines) {
  process.stdout.write(`${line.slug.padEnd(18)} main ${String(line.stations.length).padStart(2)} stations  … `);
  const main = await routeLine({ stations: line.stations });
  await sleep(400);
  const km = distKm(main.coords);
  writeFileSync(join(ROOT, "routes", `${line.slug}.gpx`), toGpx(line, main.coords, when));
  console.log(`${String(main.coords.length).padStart(5)} pts  ${km.toFixed(1)} km  [${main.mode}]`);
  summary.push({ line: line.slug, points: main.coords.length, km: +km.toFixed(1) });
}
console.log("\nDone -> routes/*.gpx (main route, single trkseg)");
console.table(summary);
