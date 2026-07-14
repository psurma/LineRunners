// Named access points for the non-disused routes, so every route gets the same
// horizontal strip map the disused railways have. Each curated [name, lat, lon]
// is snapped to the nearest vertex of its route's real geometry (routes.geojson)
// so it sits exactly on the path — then ordered by distance along the path.
// Writes data/route-stops.json: { <routeId>: [[name, lat, lon], ...] }.
// The 6 disused routes keep their inline stops in script.js and are not here.
//
//   node tools/generate-route-stops.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEO = JSON.parse(readFileSync(join(ROOT, "data/routes.geojson"), "utf8"));
const geomById = {};
for (const f of GEO.features) geomById[f.properties.id] = f.geometry;

const toR = Math.PI / 180;
const km = (a, b) => 12742 * Math.asin(Math.sqrt(Math.sin((b[0] - a[0]) * toR / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin((b[1] - a[1]) * toR / 2) ** 2));

// Curated access points/features, [name, lat, lon] roughly on each route.
// Linear routes read start->end; loops read once around the circuit.
const CURATED = {
  // --- Canals & rivers (linear) ---
  "regents-canal": [
    ["Limehouse Basin", 51.5127, -0.0400], ["Mile End", 51.5270, -0.0330],
    ["Victoria Park", 51.5350, -0.0440], ["Broadway Market", 51.5375, -0.0620],
    ["Kingsland Basin", 51.5372, -0.0760], ["King's Cross", 51.5347, -0.1240],
    ["Camden Lock", 51.5410, -0.1400], ["Little Venice", 51.5223, -0.1830],
  ],
  "grand-union-paddington": [
    ["Little Venice", 51.5223, -0.1830], ["Kensal Green", 51.5300, -0.2234],
    ["Old Oak Common", 51.5363, -0.2527], ["Park Royal", 51.5373, -0.2757],
    ["Alperton", 51.5407, -0.2997],
  ],
  "lea-navigation": [
    ["Springfield Marina", 51.5616, -0.0450], ["Lea Bridge", 51.5560, -0.0345],
    ["Middlesex Filter Beds", 51.5510, -0.0300], ["Hackney Marshes", 51.5470, -0.0250],
    ["Old Ford Lock", 51.5385, -0.0220],
  ],
  "thames-putney-richmond": [
    ["Putney Bridge", 51.4669, -0.2156], ["Barnes", 51.4712, -0.2440],
    ["Chiswick Bridge", 51.4700, -0.2680], ["Kew Gardens", 51.4676, -0.2878],
    ["Richmond", 51.4612, -0.3014],
  ],
  "thames-barrier": [
    ["Greenwich (Cutty Sark)", 51.4827, -0.0098], ["The O2", 51.5002, 0.0022],
    ["Charlton riverside", 51.4905, 0.0180], ["Thames Barrier", 51.4960, 0.0340],
  ],
};

function flatCoords(geom) {
  const c = geom.type === "MultiLineString" ? geom.coordinates.flat() : geom.coordinates;
  return c.map((p) => [p[1], p[0]]); // -> [lat, lon]
}
function cumKm(path) { const cum = [0]; for (let i = 1; i < path.length; i++) cum[i] = cum[i - 1] + km(path[i - 1], path[i]); return cum; }
// Nearest vertex on the path to a point, with its along-path km.
function snap(pt, path, cum) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < path.length; i++) { const d = km(pt, path[i]); if (d < bd) { bd = d; best = i; } }
  return { lat: path[best][0], lon: path[best][1], alongKm: cum[best], offM: bd * 1000 };
}

const out = {};
for (const id in CURATED) {
  const geom = geomById[id];
  if (!geom) { console.log(`!! no geometry for ${id}`); continue; }
  const path = flatCoords(geom), cum = cumKm(path);
  const pts = CURATED[id].map(([n, lat, lon]) => { const s = snap([lat, lon], path, cum); return { n, lat: s.lat, lon: s.lon, alongKm: s.alongKm, offM: s.offM }; });
  const maxOff = Math.max(...pts.map((p) => p.offM));
  pts.sort((a, b) => a.alongKm - b.alongKm);
  // Drop points that collapsed onto the same vertex (0 m apart) after snapping.
  const kept = pts.filter((p, i) => i === 0 || p.alongKm - pts[i - 1].alongKm > 0.03);
  out[id] = kept.map((p) => [p.n, Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]);
  const flag = maxOff > 400 ? `  <-- MAX OFFSET ${maxOff.toFixed(0)}m (check curation)` : "";
  console.log(`${id}: ${kept.length}/${CURATED[id].length} stops, maxOff ${maxOff.toFixed(0)}m${flag}`);
}

writeFileSync(join(ROOT, "data/route-stops.json"), JSON.stringify(out));
console.log(`\nWrote data/route-stops.json (${Object.keys(out).length} routes)`);
