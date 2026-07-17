// Build the London Landmarks Half Marathon course geometry from the official
// 2026 GPX (Garmin Connect export of the measured course, via goandrace.com's
// event page — 20.95 km against the 21.0975 certified distance). No routing
// engine and no sketch: the committed trace IS the course, so it just gets
// simplified and written into data/routes.geojson, with the strip's landmark
// access points into data/route-stops.json.
//
//   node tools/build-llhm-half.mjs [path/to/course.gpx]
//
// Course reading (matches the organisers' 2026 closure set): start on Whitehall
// by Parliament Square, a Westminster Bridge out-and-back past Big Ben, the
// Victoria Embankment east and Upper/Lower Thames Street to a Tower of London
// turnaround, back to Queen Victoria Street and up to Bank, City loops around
// Walbrook, Lombard Street, Threadneedle Street, Moorgate and Guildhall, up
// St Martin's Le Grand, Holborn Viaduct and a High Holborn out-and-back,
// Chancery Lane down to Fleet Street and the Strand with a Surrey Street /
// Temple Place riverside dip, Fleet Street again to a Fetter Lane turnaround
// and New Fetter Lane back up to Holborn Circus, St Paul's via New Change,
// Queen Victoria Street to the Embankment again, and Northumberland Avenue up
// to the Trafalgar Square finish.
//
// Each stop prints its along-course km + offset from the line — they must come
// out monotonic, or the strip's leg distances clamp to 0 (see snap-race-routes).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEOJSON = join(ROOT, "data/routes.geojson");
const STOPS = join(ROOT, "data/route-stops.json");
const GPX = process.argv[2] || join(ROOT, "tools/data/llhm-2026.gpx");
const ID = "london-landmarks-half";

const toR = Math.PI / 180;
const distM = (a, b) => 12742000 * Math.asin(Math.sqrt(Math.sin((b[0] - a[0]) * toR / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin((b[1] - a[1]) * toR / 2) ** 2));
function perp(p, a, b) {
  const dy = b[0] - a[0], dx = b[1] - a[1];
  if (!dx && !dy) return Math.hypot(p[1] - a[1], p[0] - a[0]);
  const t = ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p[1] - (a[1] + t * dx), p[0] - (a[0] + t * dy));
}
function simplify(pts, tol) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let md = 0, idx = -1;
    for (let i = s + 1; i < e; i++) { const d = perp(pts[i], pts[s], pts[e]); if (d > md) { md = d; idx = i; } }
    if (md > tol && idx > -1) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]); return out;
}
const r5 = (n) => Math.round(n * 1e5) / 1e5;

// Landmark access points for the strip, in running order. stops are [label, lat, lon].
const STOP_LIST = [
  ["Whitehall", 51.5014, -0.1261],
  ["Westminster Bridge", 51.5008, -0.1188],
  ["Tower of London", 51.5098, -0.0748],
  ["Bank", 51.5135, -0.0924],
  ["Guildhall", 51.5153, -0.0919],
  ["Holborn", 51.5174, -0.1132],
  ["Temple", 51.5112, -0.1147],
  ["St Paul's", 51.5131, -0.0978],
  ["Trafalgar Square", 51.5079, -0.1268],
];

const gpx = readFileSync(GPX, "utf8");
const pts = [...gpx.matchAll(/<trkpt lat="([\d.\-]+)" lon="([\d.\-]+)"/g)].map((m) => [+m[1], +m[2]]); // [lat, lon]
if (pts.length < 100) throw new Error(`only ${pts.length} trackpoints parsed from ${GPX}`);

// Simplify in [lon, lat] (geojson order) with the same tolerance snap-race-routes uses.
const lonlat = pts.map((p) => [p[1], p[0]]);
const simplified = simplify(lonlat, 0.00010).map((p) => [r5(p[0]), r5(p[1])]);
let km = 0;
for (let i = 1; i < simplified.length; i++) km += distM([simplified[i - 1][1], simplified[i - 1][0]], [simplified[i][1], simplified[i][0]]) / 1000;

// Per-stop projection diagnostic: nearest point on the simplified line, its
// cumulative km and offset. Monotonic or bust.
const cum = [0];
for (let i = 1; i < simplified.length; i++) cum.push(cum[i - 1] + distM([simplified[i - 1][1], simplified[i - 1][0]], [simplified[i][1], simplified[i][0]]) / 1000);
let prev = -1, mono = true;
for (const [label, la, lo] of STOP_LIST) {
  let best = { d: Infinity, km: 0 };
  for (let i = 1; i < simplified.length; i++) {
    const a = [simplified[i - 1][1], simplified[i - 1][0]], b = [simplified[i][1], simplified[i][0]];
    const dy = b[0] - a[0], dx = b[1] - a[1];
    const t = (!dx && !dy) ? 0 : Math.max(0, Math.min(1, ((lo - a[1]) * dx + (la - a[0]) * dy) / (dx * dx + dy * dy)));
    const p = [a[0] + t * dy, a[1] + t * dx];
    const d = distM([la, lo], p);
    if (d < best.d) best = { d, km: cum[i - 1] + distM(a, p) / 1000 };
  }
  if (best.km < prev) mono = false;
  prev = best.km;
  console.log(`${label.padEnd(20)} ${best.km.toFixed(2).padStart(5)} km  (${Math.round(best.d)} m off the line)`);
}
if (!mono) { console.error("stops are NOT monotonic along the course — fix STOP_LIST before writing"); process.exit(1); }

const gj = JSON.parse(readFileSync(GEOJSON, "utf8"));
let feat = gj.features.find((f) => f.properties.id === ID);
if (!feat) { feat = { type: "Feature", properties: { id: ID }, geometry: { type: "LineString", coordinates: [] } }; gj.features.push(feat); }
feat.geometry = { type: "LineString", coordinates: simplified };
const stopsOut = JSON.parse(readFileSync(STOPS, "utf8"));
stopsOut[ID] = STOP_LIST;
writeFileSync(GEOJSON, JSON.stringify(gj));
writeFileSync(STOPS, JSON.stringify(stopsOut));
console.log(`${ID}: ${simplified.length} pts, ${km.toFixed(2)} km — wrote data/routes.geojson + data/route-stops.json`);
