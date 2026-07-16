// Trim every routes/*.gpx down to its MAIN route — one <trk>, one <trkseg>.
//
// The tube GPX files used to bundle every branch as an extra <trkseg>; GPX
// importers (Komoot: "Your file contains more than one route") treat each
// segment as another route and make the user pick, and nothing consumes the
// bundled branches — the site only ever draws segment 0, and per-branch/variant
// export is served from the per-variant pavement blobs. Two files (victoria,
// bakerloo) even carried the SAME journey twice: their tube-network entry has
// no `route`, so the old generator failed to recognise the single branch as the
// main route and routed it again. generate-routes.mjs now writes main-only;
// this trims the files already on disk without re-routing (offline, no network).
//
//   node tools/trim-gpx.mjs
//
// Keeps segment 0, the <wpt> station waypoints and <name>/<desc> (rewording the
// desc's "and its branches" — the file is main-route-only now). Before writing,
// asserts segment 0 actually IS the main route: its first/last trkpt must sit
// within ~0.5 km of the line's termini (main route derived the way the site's
// rtStations does — WAYPOINTS[name] first, else ln.route, else longest branch).

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { extractLiteral } from "./lib/extract.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_END_M = 500;

const tube = JSON.parse(readFileSync(join(ROOT, "data/tube-network.json"), "utf8"));
const nr = JSON.parse(readFileSync(join(ROOT, "data/nr-network.json"), "utf8"));
const WAYPOINTS = extractLiteral(readFileSync(join(ROOT, "script.js"), "utf8"), "WAYPOINTS");

const toR = Math.PI / 180;
const distM = (a, b) => 12742000 * Math.asin(Math.sqrt(Math.sin((b[0] - a[0]) * toR / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin((b[1] - a[1]) * toR / 2) ** 2));

// The line's termini as [[lat, lon], [lat, lon]] — same derivation as rtStations.
function termini(id) {
  const ln = tube[id] || nr[id];
  if (!ln) return null;
  const wp = WAYPOINTS[ln.name];
  if (wp) return [[wp[0][1], wp[0][2]], [wp[wp.length - 1][1], wp[wp.length - 1][2]]];
  const br = ln.route || ln.branches.reduce((a, b) => (b.length > a.length ? b : a), ln.branches[0] || []);
  const s0 = ln.stations[br[0]], s1 = ln.stations[br[br.length - 1]];
  return s0 && s1 ? [[s0.lat, s0.lon], [s1.lat, s1.lon]] : null;
}

const files = readdirSync(join(ROOT, "routes")).filter((f) => f.endsWith(".gpx")).sort();
let trimmed = 0, failed = 0;
for (const f of files) {
  const path = join(ROOT, "routes", f);
  const text = readFileSync(path, "utf8");
  const segs = [...text.matchAll(/<trkseg>[\s\S]*?<\/trkseg>/g)];
  const before = Buffer.byteLength(text);
  if (segs.length <= 1) { console.log(`${f.padEnd(28)} ${String(segs.length)} seg  ${String(before).padStart(7)} B  (already single-seg)`); continue; }

  // Sanity: segment 0 must be the main route before the rest is thrown away.
  const pts = [...segs[0][0].matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
  const ends = termini(basename(f, ".gpx"));
  if (!ends || pts.length < 2) { console.error(`${f}: no termini/trkpts to check — left unchanged`); failed++; continue; }
  const d0 = distM(pts[0], ends[0]), d1 = distM(pts[pts.length - 1], ends[1]);
  if (d0 > MAX_END_M || d1 > MAX_END_M) {
    console.error(`${f}: segment 0 is not the main route (ends ${Math.round(d0)} m / ${Math.round(d1)} m from termini) — left unchanged`);
    failed++;
    continue;
  }

  const cutStart = segs[0].index + segs[0][0].length;
  const cutEnd = segs[segs.length - 1].index + segs[segs.length - 1][0].length;
  const out = (text.slice(0, cutStart) + text.slice(cutEnd))
    .replace(" line and its branches, station to station", " line, station to station");
  writeFileSync(path, out);
  trimmed++;
  console.log(`${f.padEnd(28)} ${segs.length} seg -> 1  ${String(before).padStart(7)} B -> ${String(Buffer.byteLength(out)).padStart(7)} B  (ends ${Math.round(d0)} m / ${Math.round(d1)} m)`);
}
console.log(`\n${trimmed} file(s) trimmed, ${files.length - trimmed - failed} already single-seg${failed ? `, ${failed} FAILED` : ""}`);
if (failed) process.exit(1);
