#!/usr/bin/env node
// Bakes data/superloop.json from the live TfL Unified API: the Superloop — the
// express-bus orbital (routes SLn) around outer London. This is an OFFLINE build
// step; the browser only ever reads the baked artifact, never TfL. Re-run to
// refresh when TfL extends the network (SL12, SL13, …) or reroutes a service:
//
//   node tools/generate-superloop.mjs
//
// Each route stores its stop list (ordered, from the longest through-sequence)
// and its road geometry as [lat,lon] segments. The renderer draws every route
// in the Superloop teal, merges shared stops, and badges each route mid-line.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "superloop.json");
const COLOUR = "#12ABB6"; // TfL Superloop teal (approximate brand colour)
// The Superloop family is 12 express routes: the SL orbital/radial services plus
// the BL "Bakerloop" (BL1, Waterloo–Lewisham) TfL counts under the same network.
// Probe a generous range; ids that don't exist 404 and are simply skipped.
const CANDIDATE_IDS = [
  ...Array.from({ length: 15 }, (_, i) => `sl${i + 1}`),
  ...Array.from({ length: 3 }, (_, i) => `bl${i + 1}`),
];
const api = (id, dir) => `https://api.tfl.gov.uk/Line/${id}/Route/Sequence/${dir}?serviceTypes=Regular&excludeCrowding=true`;

// Sort key: SL routes first in numeric order, then the BL routes — so SL1..SL11
// stay in sequence and BL1 lands at the end rather than colliding with SL1.
function rank(id) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(id) || [];
  return [(m[1] || id).toUpperCase() === "SL" ? 0 : 1, parseInt(m[2] || "0", 10)];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tidy a TfL stop name into a clean map label: drop the "(Stop H)" tags and the
// " Bus Station" / " Station" suffixes that clutter an orbital diagram.
function tidy(name) {
  return String(name || "")
    .replace(/\s*\(Stop [A-Za-z0-9]+\)\s*$/i, "")
    .replace(/\s+Bus Station$/i, "")
    .replace(/\s+Station$/i, "")
    .trim();
}

// TfL lineStrings are an array of JSON strings, each parsing to [[[lon,lat],…],…]
// (occasionally a single [[lon,lat],…]). Return [[ [lat,lon], … ], …] segments.
function toSegs(lineStrings) {
  const segs = [];
  for (const ls of lineStrings || []) {
    let parsed;
    try { parsed = JSON.parse(ls); } catch { continue; }
    const lines = Array.isArray(parsed && parsed[0] && parsed[0][0]) ? parsed : [parsed];
    for (const line of lines) {
      const seg = (line || [])
        .map((p) => [+p[1], +p[0]])
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (seg.length > 1) segs.push(seg);
    }
  }
  return segs;
}

async function fetchDir(id, dir) {
  const res = await fetch(api(id, dir), { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const j = await res.json();
  const seqs = j.stopPointSequences || [];
  if (!seqs.length) return null;
  // Longest stop sequence = the through route; short branch stubs are ignored.
  const seq = seqs.slice().sort((a, b) => (b.stopPoint ? b.stopPoint.length : 0) - (a.stopPoint ? a.stopPoint.length : 0))[0];
  const stops = (seq.stopPoint || [])
    .map((s) => [tidy(s.name), +s.lat, +s.lon])
    .filter((s) => s[0] && Number.isFinite(s[1]) && Number.isFinite(s[2]));
  const segs = toSegs(j.lineStrings);
  if (stops.length < 2 || !segs.length) return null;
  return {
    id: String(j.lineName || id).toUpperCase(),
    from: stops[0][0],
    to: stops[stops.length - 1][0],
    segs,
    stops,
  };
}

// Prefer the outbound corridor; fall back to inbound for outbound-only gaps.
async function fetchRoute(id) {
  for (const dir of ["outbound", "inbound"]) {
    try {
      const r = await fetchDir(id, dir);
      if (r) return r;
    } catch (_) { /* try the other direction */ }
  }
  return null;
}

async function main() {
  const routes = [];
  for (const id of CANDIDATE_IDS) {
    process.stdout.write(`  ${id.toUpperCase()} … `);
    const r = await fetchRoute(id);
    if (r) {
      routes.push(r);
      const pts = r.segs.reduce((a, s) => a + s.length, 0);
      console.log(`${r.from} → ${r.to}  (${r.stops.length} stops, ${pts} pts)`);
    } else {
      console.log("—");
    }
    await sleep(250);
  }
  if (!routes.length) {
    console.error("No Superloop routes fetched — aborting (TfL API down?). Existing data/superloop.json left untouched.");
    process.exit(1);
  }
  routes.sort((a, b) => { const ra = rank(a.id), rb = rank(b.id); return ra[0] - rb[0] || ra[1] - rb[1]; });
  const out = { generated: new Date().toISOString().slice(0, 10), colour: COLOUR, source: "TfL Unified API", routes };
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  const uniqueStops = new Set(routes.flatMap((r) => r.stops.map((s) => s[0])));
  console.log(`\nWrote ${OUT}`);
  console.log(`  ${routes.length} routes (${routes.map((r) => r.id).join(", ")}), ${uniqueStops.size} unique stops.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
