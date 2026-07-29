// Tag every station and curated route with the London borough(s) it sits in,
// for the "Borough Bagger" progress card.
//
//   node tools/generate-boroughs.mjs   ->   data/boroughs.json
//   { names: ["Barking and Dagenham", ...33],       alphabetical
//     lines:  { <lineId>:  [boroughIdx, ...] },      boroughs a line's stations touch
//     routes: { <routeId>: [boroughIdx, ...] } }     boroughs a route's geometry passes through
//
// Boundaries: ONS Open Geography portal — Local Authority Districts (May 2023,
// 20 m generalised, OGL), filtered to the 33 London borough codes E09*. (The
// London Datastore's "geojson" download is actually a GeoPackage.) Stations
// outside all 33 boroughs (the commuter-belt fringe — Reading, Watford,
// Epping...) simply don't tag; the card is a London-boroughs game.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOUNDARIES = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_May_2023_UK_BGC_V2/FeatureServer/0/query?where=LAD23CD%20LIKE%20%27E09%25%27&outFields=LAD23NM&outSR=4326&f=geojson";

const res = await fetch(BOUNDARIES, { headers: { "User-Agent": "LineRunners/1.0 (borough tagging)" }, redirect: "follow" });
if (!res.ok) throw new Error(`boundaries fetch: HTTP ${res.status}`);
const gj = await res.json();

// Boroughs as { name, rings: [ [ [lon,lat], ... ] ] } — every ring of every
// polygon; even-odd ray casting across all rings handles holes correctly.
const boroughs = gj.features.map((f) => {
  const p = f.properties || {};
  const name = p.LAD23NM || p.name || p.NAME || p.lad11nm || p.borough || "?";
  const g = f.geometry;
  const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  return { name: String(name).trim(), rings: polys.flat() };
}).sort((a, b) => a.name.localeCompare(b.name));
if (boroughs.length !== 33) console.warn(`warning: expected 33 boroughs, got ${boroughs.length}`);

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function boroughAt(lon, lat) {
  for (let b = 0; b < boroughs.length; b++) {
    let inside = false;
    for (const ring of boroughs[b].rings) if (inRing(lon, lat, ring)) inside = !inside; // even-odd: holes cancel
    if (inside) return b;
  }
  return -1;
}

// Lines: union of their stations' boroughs (tube + Overground + National Rail).
const lines = {};
for (const file of ["data/tube-network.json", "data/nr-network.json"]) {
  const net = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
  for (const id in net) {
    const set = new Set(lines[id] || []);
    for (const sid in net[id].stations) {
      const s = net[id].stations[sid];
      const b = boroughAt(s.lon, s.lat);
      if (b >= 0) set.add(b);
    }
    lines[id] = [...set].sort((a, b) => a - b);
  }
}

// Routes: sample the geometry (every ~4th point) so a towpath crossing a
// borough between stations still counts it.
const routesGeo = JSON.parse(readFileSync(join(ROOT, "data/routes.geojson"), "utf8"));
const routes = {};
for (const f of routesGeo.features) {
  const g = f.geometry;
  const coords = g.type === "MultiLineString" ? g.coordinates.flat() : g.coordinates;
  const set = new Set();
  for (let i = 0; i < coords.length; i += 4) {
    const b = boroughAt(coords[i][0], coords[i][1]);
    if (b >= 0) set.add(b);
  }
  const last = coords[coords.length - 1];
  const lb = boroughAt(last[0], last[1]);
  if (lb >= 0) set.add(lb);
  routes[f.properties.id] = [...set].sort((a, b) => a - b);
}

const out = { names: boroughs.map((b) => b.name), lines, routes };
writeFileSync(join(ROOT, "data/boroughs.json"), JSON.stringify(out));
console.log(`Wrote data/boroughs.json — ${boroughs.length} boroughs, ${Object.keys(lines).length} lines, ${Object.keys(routes).length} routes`);
console.log("sample:", JSON.stringify({ victoria: lines.victoria, "regents-canal": routes["regents-canal"] }));
