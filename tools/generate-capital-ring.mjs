#!/usr/bin/env node
// Bakes data/capital-ring.json from OpenStreetMap: the Capital Ring — the ~78-mile
// signed walking orbital through inner London, in its 15 official sections (the
// London LOOP's smaller sibling). OFFLINE build step; the browser only reads the
// baked artifact. Re-run to refresh:
//
//   node tools/generate-capital-ring.mjs
//
// Unlike the LOOP, the Ring's OSM relations carry no ref and duplicate/alternative
// relations exist per section — so we select the one main "Capital Ring (Section
// NN)" relation per number (preferring the complete one) before stitching.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { overpassJson } from "./lib/overpass.mjs";
import { distKm as haversineKm } from "./lib/geo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "capital-ring.json");
const COLOUR = "#2166AC"; // Capital Ring waymark blue
// All Capital Ring route relations (main + alternatives); we filter in code.
const QUERY = `[out:json][timeout:180];
rel["name"~"Capital Ring",i]["type"="route"];
out geom;`;
// Stations across the Ring's bounding box — the strip ticks.
const STATIONS_QUERY = `[out:json][timeout:180];
(node["railway"="station"](51.39,-0.35,51.61,0.11);node["railway"="halt"](51.39,-0.35,51.61,0.11););
out;`;
// Only the exact "Capital Ring (Section NN)" relations — never the "alternative"/
// "alternate" variants that share a section number.
const MAIN_RE = /^Capital Ring \(Section \d+\)$/i;

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const near = (a, b) => dist2(a, b) < 1e-8;

// Chain member ways by connectivity (member order can't be trusted). Same as the
// LOOP builder: from ways[0], append the unused way whose nearest end meets the tail.
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
    if (near(seg[0], tail)) seg = seg.slice(1);
    path.push(...seg);
  }
  return path;
}

const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function tidyStation(name) {
  return String(name || "")
    .replace(/\s*\((?:for )?[^)]*\)\s*$/i, "")
    .replace(/\s+(?:Underground|Rail|DLR|Tram|Railway)?\s*Station$/i, "")
    .trim();
}
function cumKm(geom) {
  const cum = [0];
  for (let i = 1; i < geom.length; i++) cum[i] = cum[i - 1] + haversineKm(geom[i - 1], geom[i]);
  return cum;
}
function nearestVertex(geom, lat, lon) {
  let bi = 0, best = Infinity;
  for (let i = 0; i < geom.length; i++) { const d = haversineKm(geom[i], [lat, lon]) * 1000; if (d < best) { best = d; bi = i; } }
  return { i: bi, d: best };
}
function sectionNo(name) {
  const m = /\(Section\s+(\d+)\)/i.exec(name || "");
  return m ? parseInt(m[1], 10) : 0;
}

// One main relation per section number (skip alternatives; prefer the relation
// that has from/to tags and the most geometry).
function selectSections(rels) {
  const byN = new Map();
  for (const rel of rels) {
    const name = (rel.tags && rel.tags.name) || "";
    if (!MAIN_RE.test(name)) continue;
    const n = sectionNo(name);
    if (!n) continue;
    const t = rel.tags || {};
    const ways = (rel.members || []).filter((m) => m.type === "way" && Array.isArray(m.geometry) && m.geometry.length > 1);
    const score = (t.from && t.to ? 100000 : 0) + ways.reduce((a, w) => a + w.geometry.length, 0);
    const prev = byN.get(n);
    if (!prev || score > prev.score) byN.set(n, { n, from: t.from || "", to: t.to || "", ways, score });
  }
  return [...byN.values()].sort((a, b) => a.n - b.n);
}

// Attach ordered strip stops (from/to + intermediate stations, along-trail km).
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
  const j = await overpassJson(QUERY).catch((e) => { console.error(`Overpass (routes) failed: ${e.message} — aborting. Existing data/capital-ring.json left untouched.`); process.exit(1); });
  const rels = (j.elements || []).filter((e) => e.type === "relation");
  const picked = selectSections(rels);

  const sections = [];
  for (const p of picked) {
    const geom = stitch(p.ways);
    if (geom.length < 2) { console.log(`  Section ${p.n}: no usable geometry — skipped`); continue; }
    let km = 0;
    for (let i = 1; i < geom.length; i++) km += haversineKm(geom[i - 1], geom[i]);
    const rounded = geom.map((pt) => [+pt[0].toFixed(5), +pt[1].toFixed(5)]);
    sections.push({ n: p.n, from: p.from, to: p.to, km: +km.toFixed(1), geom: rounded });
  }
  if (sections.length < 12) { console.error(`Only ${sections.length} sections built — aborting (bad Overpass response?).`); process.exit(1); }

  const sj = await overpassJson(STATIONS_QUERY).catch((e) => { console.error(`Overpass (stations) failed: ${e.message}`); return { elements: [] }; });
  const stations = (sj.elements || [])
    .filter((e) => e.tags && e.tags.name && Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map((e) => ({ name: e.tags.name, lat: e.lat, lon: e.lon }));
  sections.forEach((s) => attachStops(s, stations));

  const data = {
    generated: new Date().toISOString().slice(0, 10),
    colour: COLOUR,
    source: "OpenStreetMap (Capital Ring route relations + stations)",
    name: "Capital Ring",
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
