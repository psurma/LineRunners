#!/usr/bin/env node
// Bakes data/tramlink.json from the live TfL Unified API: London Trams (the
// Croydon Tramlink network). OFFLINE build step — the browser only ever reads
// the baked artifact, never TfL. Re-run to refresh when TfL extends the network
// or reroutes a branch:
//
//   node tools/generate-tramlink.mjs
//
// Tramlink is a single branched network (unlike the Superloop's separate routes),
// so we bake the whole network's geometry as [lat,lon] segments plus one merged,
// ordered stop list. The three service patterns are kept only for the caption.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "tramlink.json");
const COLOUR = "#5FA524"; // TfL tram green (TfL Colour Standard)
const api = (dir) => `https://api.tfl.gov.uk/Line/tram/Route/Sequence/${dir}?serviceTypes=Regular&excludeCrowding=true`;

// Tidy a TfL tram-stop name into a clean map label: drop the " Tram Stop" suffix
// and any "(Stop X)" tag so the network reads like the Tube map.
function tidy(name) {
  return String(name || "")
    .replace(/\s*\(Stop [A-Za-z0-9]+\)\s*$/i, "")
    .replace(/\s+Tram Stop$/i, "")
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

async function fetchDir(dir) {
  const res = await fetch(api(dir), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`TfL ${dir} ${res.status}`);
  return res.json();
}

// Clean the &harr;-separated ordered route names into "A ↔ B" service patterns.
function routeNames(j) {
  return (j.orderedLineRoutes || [])
    .map((r) => tidy(String(r.name || "").replace(/&harr;/gi, "↔")).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function main() {
  const [out, inb] = await Promise.all([fetchDir("outbound"), fetchDir("inbound")]);

  // Merge every stop from both directions into one unique, ordered list.
  const byName = new Map();
  for (const j of [out, inb]) {
    for (const seq of j.stopPointSequences || []) {
      for (const s of seq.stopPoint || []) {
        const name = tidy(s.name);
        if (!name || !Number.isFinite(+s.lat) || !Number.isFinite(+s.lon)) continue;
        if (!byName.has(name)) byName.set(name, [name, +s.lat, +s.lon]);
      }
    }
  }
  const stops = [...byName.values()];

  // Network geometry from both directions' lineStrings, de-duplicated by a cheap
  // endpoint+length signature so overlapping branches aren't drawn many times.
  const segs = [];
  const seen = new Set();
  for (const j of [out, inb]) {
    for (const seg of toSegs(j.lineStrings)) {
      const a = seg[0], b = seg[seg.length - 1];
      const sig = `${a[0].toFixed(4)},${a[1].toFixed(4)}|${b[0].toFixed(4)},${b[1].toFixed(4)}|${seg.length}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      segs.push(seg);
    }
  }

  if (stops.length < 2 || !segs.length) {
    console.error("No tram data fetched — aborting (TfL API down?). Existing data/tramlink.json left untouched.");
    process.exit(1);
  }

  const data = {
    generated: new Date().toISOString().slice(0, 10),
    colour: COLOUR,
    source: "TfL Unified API",
    name: "London Trams",
    routes: routeNames(out),
    segs,
    stops,
  };
  writeFileSync(OUT, JSON.stringify(data) + "\n");
  const pts = segs.reduce((a, s) => a + s.length, 0);
  console.log(`Wrote ${OUT}`);
  console.log(`  ${stops.length} stops, ${segs.length} segments (${pts} pts), ${data.routes.length} service patterns.`);
  data.routes.forEach((r) => console.log(`    ${r}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
