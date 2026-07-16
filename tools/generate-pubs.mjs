// Build the "finish-line pint" dataset: well-rated pubs near each curated
// route's two ends, from the Food Standards Agency ratings API (open data).
//
//   node tools/generate-pubs.mjs   ->   data/route-pubs.json
//   { <routeId>: [ { n, lat, lon, r, end: "start"|"finish" }, ... ] }
//
// Ends come from each route's real geometry in data/routes.geojson (falling
// back to the sketched path in script.js's ROUTES). Loops get one end. Only
// pubs with a numeric FSA hygiene rating of 4+ within ~700 m are kept — the
// "proper standards" cut. Re-run occasionally; pubs come and go.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractLiteral } from "./lib/extract.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FSA = "https://api.ratings.food.gov.uk/Establishments";
const PUB_TYPE = 7843; // FSA business type: Pub/bar/nightclub
const MAX_M = 700, MIN_RATING = 4, PER_END = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = extractLiteral(readFileSync(join(ROOT, "script.js"), "utf8"), "ROUTES");
const geo = JSON.parse(readFileSync(join(ROOT, "data/routes.geojson"), "utf8"));
const geomById = {};
for (const f of geo.features) geomById[f.properties.id] = f.geometry;

const toR = Math.PI / 180;
function distM(aLat, aLon, bLat, bLon) {
  const dLa = (bLat - aLat) * toR, dLo = (bLon - aLon) * toR;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLo / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(s));
}

// A route's end coordinates as [lat, lon] pairs (one for loops).
function routeEnds(r) {
  const g = geomById[r.id];
  let first, last;
  if (g) {
    const coords = g.type === "MultiLineString" ? g.coordinates.flat() : g.coordinates;
    first = [coords[0][1], coords[0][0]];
    const c = coords[coords.length - 1];
    last = [c[1], c[0]];
  } else if (r.path && r.path.length) {
    first = r.path[0]; last = r.path[r.path.length - 1];
  } else return [];
  if (r.loop || distM(first[0], first[1], last[0], last[1]) < 250) return [{ at: first, end: "start" }];
  return [{ at: first, end: "start" }, { at: last, end: "finish" }];
}

async function pubsNear(lat, lon) {
  const url = `${FSA}?latitude=${lat}&longitude=${lon}&maxDistanceLimit=1&businessTypeId=${PUB_TYPE}&pageSize=25&sortOptionKey=distance`;
  for (let t = 1; ; t++) {
    try {
      const res = await fetch(url, { headers: { "x-api-version": "2", "User-Agent": "TubeRun/1.0 (finish-line pints)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).establishments || [];
    } catch (e) {
      if (t >= 3) throw e;
      await sleep(1500 * t);
    }
  }
}

const out = {};
const summary = [];
for (const r of ROUTES) {
  const pubs = [];
  const seen = new Set();
  for (const { at, end } of routeEnds(r)) {
    const found = await pubsNear(at[0], at[1]);
    let kept = 0;
    for (const e of found) {
      const rating = parseInt(e.RatingValue, 10); // skips "AwaitingInspection" etc.
      const g = e.geocode || {};
      const lat = parseFloat(g.latitude), lon = parseFloat(g.longitude);
      if (!(rating >= MIN_RATING) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (distM(at[0], at[1], lat, lon) > MAX_M) continue;
      if (seen.has(e.FHRSID)) continue;
      seen.add(e.FHRSID);
      pubs.push({ n: e.BusinessName.trim(), lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, r: rating, end });
      if (++kept >= PER_END) break;
    }
    await sleep(350);
  }
  out[r.id] = pubs;
  summary.push({ route: r.id, pubs: pubs.length });
}

writeFileSync(join(ROOT, "data/route-pubs.json"), JSON.stringify(out));
console.log("Wrote data/route-pubs.json");
console.table(summary);
