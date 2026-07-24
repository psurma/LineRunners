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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "london-loop.json");
const COLOUR = "#3C8C40"; // walking-route green — the LOOP's waymark colour
const OVERPASS = "https://overpass-api.de/api/interpreter";
// The 24 section route relations (type=route, ref=LOOP), not the superroute
// wrappers or the unsigned alternatives/diversions (those carry no ref).
const QUERY = `[out:json][timeout:180];
rel["ref"="LOOP"]["type"="route"]["network"="rwn"];
out geom;`;

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}
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

async function main() {
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TubeRun/1.0 (running club map)" },
    body: "data=" + encodeURIComponent(QUERY),
  });
  if (!res.ok) { console.error(`Overpass ${res.status} — aborting. Existing data/london-loop.json left untouched.`); process.exit(1); }
  const j = await res.json();
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

  const data = {
    generated: new Date().toISOString().slice(0, 10),
    colour: COLOUR,
    source: "OpenStreetMap (London LOOP route relations)",
    name: "London LOOP",
    sections,
  };
  writeFileSync(OUT, JSON.stringify(data) + "\n");
  const totalKm = sections.reduce((a, s) => a + s.km, 0);
  const pts = sections.reduce((a, s) => a + s.geom.length, 0);
  console.log(`Wrote ${OUT}`);
  console.log(`  ${sections.length} sections, ${totalKm.toFixed(0)} km total, ${pts} points.`);
  sections.forEach((s) => console.log(`    ${String(s.n).padStart(2)}. ${s.from} → ${s.to}  (${s.km} km)`));
}

main().catch((e) => { console.error(e); process.exit(1); });
