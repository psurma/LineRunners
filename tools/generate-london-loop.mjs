#!/usr/bin/env node
// Bakes data/london-loop.json from OpenStreetMap: the London LOOP (London Outer
// Orbital Path) — the ~150-mile signed walking orbital around outer London, in
// its 24 official sections. OFFLINE build step; the browser only ever reads the
// baked artifact. Re-run to refresh when the OSM route relations change:
//
//   node tools/generate-london-loop.mjs
//
// Each section is one OSM route relation (ref=LOOP, "London LOOP (Section N)")
// carrying from/to tags and ordered member ways. We stitch the ways into one
// ordered [lat,lon] path per section (for the map + a GPX a watch can follow).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { overpassJson } from "./lib/overpass.mjs";
import { distKm as haversineKm } from "./lib/geo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "london-loop.json");
const COLOUR = "#3C8C40"; // walking-route green — the LOOP's waymark colour
// The 24 section route relations (type=route, ref=LOOP), not the superroute
// wrappers or the unsigned alternatives/diversions (those carry no ref).
const QUERY = `[out:json][timeout:180];
rel["ref"="LOOP"]["type"="route"]["network"="rwn"];
out geom;`;
// Rail/Tube/Overground/DLR stations across the LOOP's bounding box — the join/
// leave points that become the strip's ticks. Bounds bracket the outer orbital.
const STATIONS_QUERY = `[out:json][timeout:180];
(node["railway"="station"](51.28,-0.52,51.69,0.27);node["railway"="halt"](51.28,-0.52,51.69,0.27););
out;`;

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const near = (a, b) => dist2(a, b) < 1e-8; // ~1e-4 deg ≈ 11 m

// Stitch a relation's member ways into one continuous [lat,lon] path. Member
// order can't be trusted (some LOOP sections list ways out of order, with stubs),
// so we chain by connectivity: from member[0], repeatedly append the unused way
// whose nearest end meets the running tail, flipping it to match. This follows
// the real geography and closes the member-order jumps.
function stitch(ways) {
  const segs = ways
    .filter((w) => Array.isArray(w.geometry) && w.geometry.length > 1)
    .map((w) => w.geometry.map((p) => [p.lat, p.lon]));
  if (!segs.length) return [];
  const used = new Array(segs.length).fill(false);
  used[0] = true;
  let path = segs[0].slice();
  for (let k = 1; k < segs.length; k++) {
    const tail = path[path.length - 1];
    let best = -1, bestD = Infinity, flip = false;
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      const s = segs[i];
      const dS = dist2(s[0], tail), dE = dist2(s[s.length - 1], tail);
      if (dS < bestD) { bestD = dS; best = i; flip = false; }
      if (dE < bestD) { bestD = dE; best = i; flip = true; }
    }
    if (best < 0) break;
    used[best] = true;
    let seg = flip ? segs[best].slice().reverse() : segs[best];
    if (near(seg[0], tail)) seg = seg.slice(1); // drop the shared node
    path.push(...seg);
  }
  return path;
}

function sectionNo(name) {
  const m = /Section\s+(\d+)/i.exec(name || "");
  return m ? parseInt(m[1], 10) : 0;
}

const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Tidy an OSM station name to a clean tick label: drop the "(for …)" notes and
// the " Underground/Rail/DLR/Tram Station" suffixes.
function tidyStation(name) {
  return String(name || "")
    .replace(/\s*\((?:for )?[^)]*\)\s*$/i, "")
    .replace(/\s+(?:Underground|Rail|DLR|Tram|Railway)?\s*Station$/i, "")
    .trim();
}
// Cumulative trail distance (km) at each geom vertex.
function cumKm(geom) {
  const cum = [0];
  for (let i = 1; i < geom.length; i++) cum[i] = cum[i - 1] + haversineKm(geom[i - 1], geom[i]);
  return cum;
}
// Nearest geom vertex to a point → { i, d(metres) }.
function nearestVertex(geom, lat, lon) {
  let bi = 0, best = Infinity;
  for (let i = 0; i < geom.length; i++) { const d = haversineKm(geom[i], [lat, lon]) * 1000; if (d < best) { best = d; bi = i; } }
  return { i: bi, d: best };
}
// Attach an ordered `stops` list to a section: its from/to endpoints plus every
// railway station within ~500 m of the path, in path order. Each stop carries
// its along-trail distance (km) so the strip measures a real winding sub-stretch,
// not a crow-flies underestimate. The geom is first oriented from → to.
function attachStops(s, stations) {
  const geom = s.geom;
  const byName = new Map();
  for (const st of stations) { const k = norm(tidyStation(st.name)); if (!byName.has(k)) byName.set(k, st); }
  const fromSt = byName.get(norm(s.from)), toSt = byName.get(norm(s.to));
  const anchor = fromSt || toSt;
  if (anchor) {
    const dStart = haversineKm([anchor.lat, anchor.lon], geom[0]);
    const dEnd = haversineKm([anchor.lat, anchor.lon], geom[geom.length - 1]);
    if ((fromSt && dEnd < dStart) || (!fromSt && dStart < dEnd)) geom.reverse();
  }
  const cum = cumKm(geom);
  const total = cum[cum.length - 1];
  const seen = new Set([norm(s.from), norm(s.to)]);
  const inter = [];
  for (const st of stations) {
    const name = tidyStation(st.name), k = norm(name);
    if (!k || seen.has(k)) continue;
    const nv = nearestVertex(geom, st.lat, st.lon);
    if (nv.d > 500) continue;
    const alongKm = cum[nv.i];
    // Skip a station sitting on an endpoint — it's the from/to under another
    // name (e.g. "Rainham" vs "Rainham rail station"), not a real intermediate.
    if (alongKm < 0.15 || alongKm > total - 0.15) continue;
    seen.add(k);
    inter.push({ name, lat: st.lat, lon: st.lon, alongKm });
  }
  inter.sort((a, b) => a.alongKm - b.alongKm);
  const stop = (name, lat, lon, alongKm) => [name, +lat.toFixed(5), +lon.toFixed(5), +alongKm.toFixed(2)];
  s.stops = [
    stop(s.from, geom[0][0], geom[0][1], 0),
    ...inter.map((h) => stop(h.name, h.lat, h.lon, h.alongKm)),
    stop(s.to, geom[geom.length - 1][0], geom[geom.length - 1][1], cum[geom.length - 1]),
  ];
}

async function main() {
  const j = await overpassJson(QUERY).catch((e) => { console.error(`Overpass (routes) failed: ${e.message} — aborting. Existing data/london-loop.json left untouched.`); process.exit(1); });
  const rels = (j.elements || []).filter((e) => e.type === "relation" && sectionNo(e.tags && e.tags.name) >= 1);

  const sections = [];
  for (const rel of rels) {
    const t = rel.tags || {};
    const n = sectionNo(t.name);
    const ways = (rel.members || []).filter((m) => m.type === "way");
    const geom = stitch(ways);
    if (geom.length < 2) { console.log(`  Section ${n}: no usable geometry — skipped`); continue; }
    let km = 0;
    for (let i = 1; i < geom.length; i++) km += haversineKm(geom[i - 1], geom[i]);
    // Round to 5 dp (~1 m) to keep the artifact small — plenty for a map + watch.
    const rounded = geom.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]);
    sections.push({ n, from: t.from || "", to: t.to || "", km: +km.toFixed(1), geom: rounded });
  }
  sections.sort((a, b) => a.n - b.n);
  if (sections.length < 20) { console.error(`Only ${sections.length} sections fetched — aborting (bad Overpass response?).`); process.exit(1); }

  // Fetch stations and attach the strip ticks (orients each section's geom too).
  const sj = await overpassJson(STATIONS_QUERY).catch((e) => { console.error(`Overpass (stations) failed: ${e.message}`); return { elements: [] }; });
  const stations = (sj.elements || [])
    .filter((e) => e.tags && e.tags.name && Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map((e) => ({ name: e.tags.name, lat: e.lat, lon: e.lon }));
  sections.forEach((s) => attachStops(s, stations));

  const data = {
    generated: new Date().toISOString().slice(0, 10),
    colour: COLOUR,
    source: "OpenStreetMap (London LOOP route relations + stations)",
    name: "London LOOP",
    sections,
  };
  writeFileSync(OUT, JSON.stringify(data) + "\n");
  const totalKm = sections.reduce((a, s) => a + s.km, 0);
  const pts = sections.reduce((a, s) => a + s.geom.length, 0);
  console.log(`Wrote ${OUT}`);
  console.log(`  ${sections.length} sections, ${totalKm.toFixed(0)} km total, ${pts} points, ${stations.length} stations available.`);
  sections.forEach((s) => console.log(`    ${String(s.n).padStart(2)}. ${s.from} → ${s.to}  (${s.km} km, ${s.stops.length} stops: ${s.stops.map((x) => x[0]).join(" · ").slice(0, 70)})`));
}

main().catch((e) => { console.error(e); process.exit(1); });
