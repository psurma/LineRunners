// Add the DLR as a full line (it was only ever an interchange tag). Fetches the
// Docklands Light Railway from the TfL unified API, builds it in the same shape
// as the other tube lines, and merges it into data/tube-network.json and
// data/tube-lines.geojson. Then routes its main branch on OpenStreetMap
// pavements (BRouter) to routes/dlr.gpx, like every other line.
//
//   node tools/generate-dlr.mjs
//
// Geometry: TfL (network) + OpenStreetMap via BRouter (GPX, ODbL).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { brouterRaw } from "./lib/brouter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.tfl.gov.uk";
const ID = "dlr", NAME = "DLR", COLOUR = "#00A4A7";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Strip the mode suffix and the "(for ...)" tourist tags DLR names carry.
const cleanName = (n) => n.replace(/ (Rail|Underground|DLR) Station$/i, "").replace(/ \(for .*?\)/i, "").replace(/ \(London\)$/i, "").trim();

async function getJson(path, tries = 3) {
  for (let t = 1; ; t++) {
    try {
      const res = await fetch(API + path, { headers: { "User-Agent": "TubeRun/1.0 (dlr build)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (t >= tries) throw e; await sleep(1500 * t); }
  }
}

const toRad = Math.PI / 180;
const distKm = (a, b) => 12742 * Math.asin(Math.sqrt(Math.sin((b.lat - a.lat) * toRad / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin((b.lon - a.lon) * toRad / 2) ** 2));

// Drop branches wholly contained in a longer one (TfL returns overlapping patterns).
function dedupe(branches) {
  const sets = branches.map((b) => new Set(b.map((s) => s.id)));
  return branches.filter((b, i) => !sets.some((o, j) => j !== i && o.size >= sets[i].size && (o.size > sets[i].size || j < i) && [...sets[i]].every((id) => o.has(id))));
}
// Join patterns that end where another starts, into the through routes trains run.
function stitch(branches) {
  const out = branches.map((b) => b.slice());
  for (let joined = true; joined;) {
    joined = false;
    outer: for (let i = 0; i < out.length; i++) for (let j = 0; j < out.length; j++) {
      if (i === j) continue;
      if (out[i][out[i].length - 1].id === out[j][0].id) { out[i] = out[i].concat(out[j].slice(1)); out.splice(j, 1); joined = true; break outer; }
    }
  }
  return out;
}
function perp(p, a, b) { const dy = b[1] - a[1], dx = b[0] - a[0]; if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]); const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy); return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); }
function simplify(pts, tol) {
  const n = pts.length; if (n < 3) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const stack = [[0, n - 1]];
  while (stack.length) { const [s, e] = stack.pop(); let md = 0, idx = -1; for (let i = s + 1; i < e; i++) { const d = perp(pts[i], pts[s], pts[e]); if (d > md) { md = d; idx = i; } } if (md > tol && idx > -1) { keep[idx] = 1; stack.push([s, idx], [idx, e]); } }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]); return out;
}

// --- Fetch + build the network ---
const seq = await getJson(`/Line/${ID}/Route/Sequence/inbound`);
const rawBranches = (seq.stopPointSequences || []).map((sp) => (sp.stopPoint || []).map((s) => ({ id: s.id, n: cleanName(s.name), lat: r5(s.lat), lon: r5(s.lon) })));
const branches = stitch(dedupe(rawBranches.filter((b) => b.length >= 2)));
const stations = {};
for (const b of branches) for (const s of b) stations[s.id] = { n: s.n, lat: s.lat, lon: s.lon };
const brKm = (b) => { let km = 0; for (let i = 1; i < b.length; i++) km += distKm(b[i - 1], b[i]); return km; };
const main = branches.reduce((a, b) => (brKm(b) > brKm(a) ? b : a), branches[0]);
console.log(`DLR: ${Object.keys(stations).length} stations, ${branches.length} branches, main ${main[0].n} -> ${main[main.length - 1].n} (${main.length} stops, ${brKm(main).toFixed(1)} km)`);

// --- Merge into tube-network.json ---
const netPath = join(ROOT, "data/tube-network.json");
const net = JSON.parse(readFileSync(netPath, "utf8"));
net[ID] = { name: NAME, colour: COLOUR, stations, branches: branches.map((b) => b.map((s) => s.id)), route: main.map((s) => s.id) };
writeFileSync(netPath, JSON.stringify(net));

// --- Merge geometry into tube-lines.geojson ---
const geoPath = join(ROOT, "data/tube-lines.geojson");
const geo = JSON.parse(readFileSync(geoPath, "utf8"));
const rings = (seq.lineStrings || []).flatMap((ls) => { let c; try { c = JSON.parse(ls); } catch { return []; } const flat = Array.isArray(c[0][0]) ? c.flat() : c; return [simplify(flat.map((p) => [r5(p[0]), r5(p[1])]), 0.0002)]; }).filter((r) => r.length > 1);
geo.features = geo.features.filter((f) => f.properties.line !== ID);
geo.features.push({ type: "Feature", properties: { line: ID, name: NAME, colour: COLOUR }, geometry: { type: "MultiLineString", coordinates: rings } });
writeFileSync(geoPath, JSON.stringify(geo));
console.log(`merged into tube-network.json + tube-lines.geojson (${rings.length} geometry chunks)`);

// --- BRouter the main branch -> routes/dlr.gpx ---
// Single attempt, throws on failure — routeStations' per-leg fallback handles it.
const brouter = (points) => brouterRaw(points, "shortest", { userAgent: "TubeRun/1.0 (dlr route)" });
async function routeStations(st) {
  try { return await brouter(st); } catch (_) { /* per-leg fallback */ }
  const out = []; for (let i = 0; i < st.length - 1; i++) { let seg; try { seg = await brouter([st[i], st[i + 1]]); } catch { seg = [[st[i].lon, st[i].lat, 0], [st[i + 1].lon, st[i + 1].lat, 0]]; } out.push(...(out.length ? seg.slice(1) : seg)); await sleep(300); } return out;
}
const distM = (a, b) => distKm({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }) * 1000;
function deSpur(pts, eps = 12, minDev = 30, win = 300) {
  const kept = []; let i = 0;
  while (i < pts.length) { kept.push(pts[i]); let jump = -1; for (let j = Math.min(i + win, pts.length - 1); j > i + 2; j--) { if (distM(pts[i], pts[j]) >= eps) continue; let maxDev = 0; for (let k = i + 1; k < j && maxDev <= minDev; k++) maxDev = Math.max(maxDev, distM(pts[i], pts[k])); if (maxDev > minDev) { jump = j; break; } } i = jump > -1 ? jump : i + 1; }
  return kept;
}
const coords = await routeStations(main);
const latlonele = deSpur(coords.map((c) => [c[1], c[0], c[2]]));
const when = new Date().toISOString();
const wpts = main.map((s) => `  <wpt lat="${s.lat}" lon="${s.lon}"><name>${esc(s.n)}</name></wpt>`).join("\n");
const trkpts = latlonele.map((c) => (Number.isFinite(c[2]) ? `      <trkpt lat="${c[0]}" lon="${c[1]}"><ele>${c[2]}</ele></trkpt>` : `      <trkpt lat="${c[0]}" lon="${c[1]}"/>`)).join("\n");
const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TubeRun route generator" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${NAME} — TubeRun</name>
    <desc>Above-ground running route tracing the ${NAME} line, station to station. Routed on pavements and footways from OpenStreetMap data (BRouter, shortest).</desc>
    <author><name>TubeRun</name></author>
    <copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/1-0/</license></copyright>
    <link href="https://www.openstreetmap.org/copyright"><text>© OpenStreetMap contributors</text></link>
    <time>${when}</time>
  </metadata>
${wpts}
  <trk>
    <name>${NAME} — TubeRun</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
writeFileSync(join(ROOT, "routes/dlr.gpx"), gpx);
let km = 0; for (let i = 1; i < latlonele.length; i++) km += distM(latlonele[i - 1], latlonele[i]) / 1000;
console.log(`routes/dlr.gpx: ${latlonele.length} pts, ${km.toFixed(1)} km`);
