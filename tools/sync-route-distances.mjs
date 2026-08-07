// Make each named route's stated distance match the line the site actually draws.
//
// A route card in script.js carries a `distance` string written by hand, while the
// line drawn on the map comes from data/routes.geojson. Nothing ever compared the
// two, and 57 of the 126 routes disagreed by more than 15% — in both directions,
// from claiming twice what is drawn to claiming barely half. The number is not
// only shown to the reader: renderRouteCards parses the kilometre value out of it
// to decide which distance filter a route belongs to, so a wrong figure also files
// the route under the wrong length.
//
// The drawn line is the thing a reader follows, so it is the figure that can be
// checked and the one that wins here. Where a trace is rough the number inherits
// that roughness — improving a trace is a separate job, and re-running this after
// one will simply restate the new length.
//
//   node tools/sync-route-distances.mjs --dry-run   report what would change
//   node tools/sync-route-distances.mjs             rewrite script.js
//
// Only the `distance:` value inside a route-library entry is touched. Entries in
// the run schedule use the same field name with free-form values ("2 days · ~59
// km") and are matched by route id, so they are never rewritten.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractLiteral } from "./lib/extract.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry-run");

const SCRIPT = join(ROOT, "script.js");
let src = readFileSync(SCRIPT, "utf8");
const ROUTES = extractLiteral(src, "ROUTES");
const geo = JSON.parse(readFileSync(join(ROOT, "data/routes.geojson"), "utf8"));

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
function segKm(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// routes.geojson stores coordinates [lng, lat]; everything else here is [lat, lon].
const drawnKm = new Map();
for (const f of geo.features) {
  const id = f.properties && f.properties.id;
  if (!id) continue;
  const parts = f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates];
  let total = 0;
  for (const ls of parts) {
    const p = ls.map((c) => [c[1], c[0]]);
    for (let i = 1; i < p.length; i++) total += segKm(p[i - 1], p[i]);
  }
  drawnKm.set(id, total);
}

// Match the existing house format: one decimal place, and no pointless ".0".
const num = (n) => n.toFixed(1).replace(/\.0$/, "");
const MI_PER_KM = 1 / 1.609344;

let changed = 0, same = 0, missing = 0;
const rows = [];

for (const r of ROUTES) {
  // A race distance is set by the organiser, not by our trace: the Vitality
  // London 10,000 is 10 km because it is certified as 10 km, and a trace that
  // measures 9.2 km means the trace is short, not that the race is. Rewriting
  // these would replace a correct published figure with an approximation, so
  // races keep their stated distance and their traces are a separate job.
  if (r.type === "race") { same++; continue; }

  const km = drawnKm.get(r.id);
  if (km == null || !(km > 0)) { missing++; rows.push([r.id, "NO GEOMETRY — left alone", ""]); continue; }

  // Anything after the bracketed kilometre figure is a hand-written note
  // ("+ Blackheath") describing extra ground; keep it exactly as written.
  const tail = /\)\s*(.+)$/.exec(String(r.distance || ""));
  const next = `${num(km * MI_PER_KM)} mi (${num(km)} km)${tail ? " " + tail[1] : ""}`;
  if (next === r.distance) { same++; continue; }

  // Rewrite only within this route's own object. Every route-library entry is a
  // single line beginning `{ id: "<id>",`, which is what keeps schedule entries
  // that share the field name out of range.
  const line = new RegExp(`(\\{ id: "${r.id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}",[^\\n]*?distance: ")([^"]*)(")`);
  const m = line.exec(src);
  if (!m) { rows.push([r.id, "NO SOURCE LINE MATCHED — left alone", ""]); missing++; continue; }
  rows.push([r.id, m[2], next]);
  if (!dry) src = src.replace(line, `$1${next}$3`);
  changed++;
}

rows.sort((a, b) => a[0].localeCompare(b[0]));
for (const [id, from, to] of rows) {
  console.log(to ? `  ${id.padEnd(38)} ${from.padEnd(22)} -> ${to}` : `  ${id.padEnd(38)} ${from}`);
}
console.log(`\n${changed} rewritten, ${same} already correct, ${missing} skipped${dry ? "  (dry run — nothing written)" : ""}`);

if (!dry && changed) {
  writeFileSync(SCRIPT, src);
  // Re-extract from what was actually written: a bad edit here would corrupt the
  // literal the whole site is built from.
  const after = extractLiteral(readFileSync(SCRIPT, "utf8"), "ROUTES");
  if (after.length !== ROUTES.length) {
    console.error(`ROUTES length changed ${ROUTES.length} -> ${after.length} — script.js may be corrupt.`);
    process.exit(1);
  }
  console.log(`verified: ROUTES still parses with ${after.length} entries.`);
}
