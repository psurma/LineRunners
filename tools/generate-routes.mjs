// Generate a runnable street-level GPX per tube line.
//
// One-off / occasional build-time step (NOT part of the served site): reads the
// ordered station sequences we already hold, routes each consecutive pair on the
// OpenStreetMap *pedestrian* network via BRouter (so it follows pavements/footways
// and stays off the rails and out of tunnels), and writes one attributed GPX per
// line into routes/. The site then loads those static files — no backend, no CSP
// change. Re-run when station orderings change.
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
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NET = JSON.parse(readFileSync(join(ROOT, "data/tube-network.json"), "utf8"));

// Pull the WAYPOINTS literal straight out of script.js so it stays the single
// source of truth. Station names hold no braces, so a balanced-brace scan is safe;
// vm evaluates just that one object expression in an isolated context.
function loadWaypoints() {
  const s = readFileSync(join(ROOT, "script.js"), "utf8");
  const i = s.indexOf("const WAYPOINTS = {");
  if (i < 0) throw new Error("WAYPOINTS not found in script.js");
  const start = s.indexOf("{", i);
  let depth = 0, j = start;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { j++; break; }
  }
  return vm.runInNewContext("(" + s.slice(start, j) + ")");
}
const WP = loadWaypoints();

// The 4 lines with no `route` in tube-network.json are exactly the WAYPOINTS lines.
const WP_SLUG = { Victoria: "victoria", Bakerloo: "bakerloo", Central: "central", Metropolitan: "metropolitan" };

// Ordered [{name, lat, lon}] per line, from whichever source carries the ordering.
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
    out.push({ slug, name: ln.name, colour: ln.colour, stations });
  }
  return out;
}

const BROUTER = "https://brouter.de/brouter";
const PROFILE = "hiking-beta"; // BRouter's foot profile
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Route through the given points as hard via-points; returns [[lon,lat(,ele)], ...].
async function brouter(points) {
  const lonlats = points.map((p) => `${p.lon},${p.lat}`).join("|");
  const url = `${BROUTER}?lonlats=${lonlats}&profile=${PROFILE}&alternativeidx=0&format=geojson`;
  const res = await fetch(url);
  const text = await res.text();
  let gj;
  try { gj = JSON.parse(text); } catch { throw new Error(`non-JSON (${res.status}): ${text.slice(0, 120)}`); }
  if (!gj.features || !gj.features[0]) throw new Error(`no route: ${text.slice(0, 120)}`);
  return gj.features[0].geometry.coordinates;
}

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

function toGpx(line, coords, when) {
  const wpts = line.stations
    .map((s) => `  <wpt lat="${s.lat}" lon="${s.lon}"><name>${esc(s.name)}</name></wpt>`)
    .join("\n");
  const trkpts = coords
    .map((c) => (c.length > 2
      ? `      <trkpt lat="${c[1]}" lon="${c[0]}"><ele>${c[2]}</ele></trkpt>`
      : `      <trkpt lat="${c[1]}" lon="${c[0]}"/>`))
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TubeRun route generator" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(line.name)} line — TubeRun</name>
    <desc>Above-ground running route tracing the ${esc(line.name)} line, station to station. Routed on pavements and footways from OpenStreetMap data (BRouter, ${PROFILE}).</desc>
    <author><name>TubeRun</name></author>
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
const lines = loadLines();
const when = new Date().toISOString();
console.log(`Generating GPX for ${lines.length} lines via BRouter (${PROFILE})...\n`);
const summary = [];
for (const line of lines) {
  process.stdout.write(`${line.slug.padEnd(18)} ${String(line.stations.length).padStart(2)} stns  … `);
  const { coords, mode } = await routeLine(line);
  const km = distKm(coords);
  writeFileSync(join(ROOT, "routes", `${line.slug}.gpx`), toGpx(line, coords, when));
  console.log(`${String(coords.length).padStart(4)} pts  ${km.toFixed(1).padStart(5)} km  [${mode}]`);
  summary.push({ line: line.slug, stations: line.stations.length, points: coords.length, km: +km.toFixed(1), mode });
  await sleep(400);
}
console.log("\nDone -> routes/*.gpx");
console.table(summary);
