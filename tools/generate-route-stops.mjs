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
  // --- Parks, commons & landmark loops (read once around the circuit) ---
  // Coordinates sit on each loop's geometry; names are the feature nearest that
  // point on the perimeter.
  "hyde-kensington": [
    ["Hyde Park Corner", 51.5026, -0.1516], ["Queen's Gate", 51.5016, -0.1803],
    ["Kensington Palace", 51.5104, -0.1836], ["Victoria Gate", 51.5095, -0.1555],
  ],
  "grand-tour": [
    ["Trafalgar Square", 51.5074, -0.1278], ["Blackfriars", 51.5085, -0.1041],
    ["Tower of London", 51.5089, -0.0814], ["Tower Bridge", 51.5046, -0.0789],
  ],
  "regents-park": [
    ["Clarence Gate", 51.5296, -0.1647], ["Hanover Gate", 51.5304, -0.1614],
    ["Gloucester Gate", 51.5333, -0.1526], ["Chester Road", 51.5310, -0.1464],
  ],
  "diana-memorial": [
    ["Hyde Park Corner", 51.5027, -0.1489], ["St James's Park", 51.5026, -0.1398],
    ["Serpentine Bridge", 51.5072, -0.1706], ["Diana Fountain", 51.5034, -0.1759],
  ],
  "victoria-park": [
    ["Grove Road Gate", 51.5398, -0.0285], ["Bonner Gate", 51.5379, -0.0303],
    ["Victoria Park Lake", 51.5412, -0.0375], ["Crown Gate", 51.5447, -0.0333],
  ],
  "battersea-park": [
    ["Chelsea Gate", 51.4766, -0.1527], ["The Boating Lake", 51.4831, -0.1498],
    ["Rosery Gate", 51.4833, -0.1517], ["Peace Pagoda", 51.4797, -0.1654],
  ],
  "greenwich-park": [
    ["Cutty Sark Gate", 51.4759, 0.0091], ["National Maritime Museum", 51.4763, -0.0054],
    ["Royal Observatory", 51.4796, -0.0067], ["Blackheath Gate", 51.4821, 0.0005],
  ],
  "hampstead-heath": [
    ["Parliament Hill", 51.5548, -0.1640], ["Highgate Ponds", 51.5651, -0.1458],
    ["Kenwood House", 51.5717, -0.1713], ["The Vale of Health", 51.5627, -0.1818],
  ],
  "stjames-green": [
    ["Horse Guards", 51.5027, -0.1379], ["St James's Park Lake", 51.5014, -0.1300],
    ["The Mall", 51.5060, -0.1415], ["Green Park", 51.5031, -0.1496],
  ],
  "southwark-docks": [
    ["Surrey Quays", 51.4916, -0.0530], ["Greenland Dock", 51.4950, -0.0586],
    ["Russia Dock Woodland", 51.4977, -0.0555], ["Canada Water", 51.4948, -0.0510],
  ],
  "wormwood-scrubs": [
    ["Scrubs Lane", 51.5182, -0.2384], ["Braybrook Street", 51.5202, -0.2362],
    ["The Nature Reserve", 51.5232, -0.2324], ["Old Oak Common Lane", 51.5237, -0.2433],
  ],
  "richmond-park": [
    ["Richmond Gate", 51.4206, -0.2868], ["Roehampton Gate", 51.4438, -0.2995],
    ["Sheen Gate", 51.4569, -0.2670], ["Isabella Plantation", 51.4415, -0.2551],
  ],
  "bushy-park": [
    ["Hampton Court Gate", 51.4248, -0.3360], ["The Diana Fountain", 51.4118, -0.3325],
    ["Chestnut Avenue", 51.4096, -0.3455], ["Teddington Gate", 51.4196, -0.3463],
  ],
  "brockwell-park": [
    ["Herne Hill Gate", 51.4509, -0.1129], ["Brockwell Lido", 51.4550, -0.1111],
    ["The Walled Garden", 51.4520, -0.1018], ["Tulse Hill Gate", 51.4466, -0.1056],
  ],
  "dulwich-park": [
    ["College Gate", 51.4469, -0.0846], ["Rosebery Gate", 51.4481, -0.0778],
    ["Court Lane Gate", 51.4435, -0.0738], ["Dulwich Park Lake", 51.4438, -0.0803],
  ],
  "crystal-palace-park": [
    ["Penge Gate", 51.4223, -0.0728], ["The Dinosaurs", 51.4176, -0.0691],
    ["National Sports Centre", 51.4169, -0.0751], ["Crystal Palace Bowl", 51.4207, -0.0783],
  ],
  "alexandra-park": [
    ["Alexandra Palace", 51.5945, -0.1326], ["The Grove", 51.5920, -0.1342],
    ["Boating Lake", 51.5908, -0.1276], ["Muswell Hill Gate", 51.5976, -0.1205],
  ],
  "finsbury-park": [
    ["Manor House Gate", 51.5749, -0.1020], ["Boating Lake", 51.5674, -0.1057],
    ["American Gardens", 51.5692, -0.0982], ["Station Gate", 51.5734, -0.0976],
  ],
  "olympic-park": [
    ["Olympic Stadium", 51.5427, -0.0120], ["Aquatics Centre", 51.5395, -0.0134],
    ["ArcelorMittal Orbit", 51.5397, -0.0194], ["Lee Valley VeloPark", 51.5482, -0.0190],
  ],
  "wimbledon-common": [
    ["The Windmill", 51.4344, -0.2352], ["Queensmere", 51.4269, -0.2401],
    ["Rushmere Pond", 51.4270, -0.2286], ["Putney Heath", 51.4408, -0.2318],
  ],
  "clapham-common": [
    ["Clapham Common (Holy Trinity)", 51.4623, -0.1500], ["The Bandstand", 51.4610, -0.1389],
    ["Mount Pond", 51.4530, -0.1474], ["Long Pond", 51.4610, -0.1488],
  ],
  "wandsworth-common": [
    ["The Scope", 51.4502, -0.1677], ["The Lake", 51.4440, -0.1679],
    ["Bellevue", 51.4475, -0.1695], ["Three Island Pond", 51.4518, -0.1745],
  ],
};

function flatCoords(geom) {
  const c = geom.type === "MultiLineString" ? geom.coordinates.flat() : geom.coordinates;
  return c.map((p) => [p[1], p[0]]); // -> [lat, lon]
}
function cumKm(path) { const cum = [0]; for (let i = 1; i < path.length; i++) cum[i] = cum[i - 1] + km(path[i - 1], path[i]); return cum; }
// Nearest vertex on the path to a point (used as the on-path stop coordinate).
function snap(pt, path) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < path.length; i++) { const d = km(pt, path[i]); if (d < bd) { bd = d; best = i; } }
  return { lat: path[best][0], lon: path[best][1], offM: bd * 1000 };
}
// Distance along the path to a point — the SAME planar per-segment projection
// the client's projectOnPath uses, so the generator's ordering matches exactly
// what the strip renders (no negative/backward legs on thin loops).
function alongPathKm(pt, path, cum) {
  let bestOff = Infinity, along = 0;
  const kLat = 111.32, kLon = 111.32 * Math.cos((pt[0] * Math.PI) / 180);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const bx = (b[1] - a[1]) * kLon, by = (b[0] - a[0]) * kLat;
    const px = (pt[1] - a[1]) * kLon, py = (pt[0] - a[0]) * kLat;
    const len2 = bx * bx + by * by || 1e-9;
    let t = (px * bx + py * by) / len2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const off = Math.hypot(px - t * bx, py - t * by);
    if (off < bestOff) { bestOff = off; along = cum[i] + t * (cum[i + 1] - cum[i]); }
  }
  return along;
}

const out = {};
for (const id in CURATED) {
  const geom = geomById[id];
  if (!geom) { console.log(`!! no geometry for ${id}`); continue; }
  const path = flatCoords(geom), cum = cumKm(path);
  const pts = CURATED[id].map(([n, lat, lon]) => { const s = snap([lat, lon], path); return { n, lat: s.lat, lon: s.lon, offM: s.offM, alongKm: alongPathKm([s.lat, s.lon], path, cum) }; });
  const maxOff = Math.max(...pts.map((p) => p.offM));
  pts.sort((a, b) => a.alongKm - b.alongKm);
  // Drop points projecting within 120 m of the previous — too close to show a
  // distinct leg (and the source of "0 m" legs on tight loops).
  const kept = pts.filter((p, i) => i === 0 || p.alongKm - pts[i - 1].alongKm > 0.12);
  out[id] = kept.map((p) => [p.n, Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]);
  const flags = [maxOff > 400 ? `MAXOFF ${maxOff.toFixed(0)}m` : "", kept.length < 3 ? "ONLY " + kept.length : ""].filter(Boolean).join(" ");
  console.log(`${id}: ${kept.length}/${CURATED[id].length} stops, maxOff ${maxOff.toFixed(0)}m${flags ? "  <-- " + flags : ""}`);
}

writeFileSync(join(ROOT, "data/route-stops.json"), JSON.stringify(out));
console.log(`\nWrote data/route-stops.json (${Object.keys(out).length} routes)`);
