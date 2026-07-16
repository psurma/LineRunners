// Build the Run Shoreditch 10K course geometry from real OSM street geometry,
// following the official route map (dated 21 September 2025, hosted on
// runshoreditch.com/route) street by street. No routing engine: each leg walks
// the named street's own OSM ways between junctions, so the line is exactly the
// streets the organisers drew. Input: an Overpass extract of the named streets
// (see QUERY below); writes the course into data/routes.geojson and its strip
// access points into data/route-stops.json.
//
//   node tools/build-shoreditch-10k.mjs [path/to/overpass.json]
//
// Course reading (official map): Bridport Place start north over the canal,
// Shepperton Road west, Rotherfield Street and Ecclesbourne Road (1k) north,
// Elmore Street east, one block south on Cleveland Road and east on Downham
// Road, then the long climb north on Southgate Road (2k) and Mildmay Park to
// Newington Green (3k); east on Matthias Road, south-east on Boleyn Road, west
// on Mildmay Road (4k), south on Wolsey Road and west on Mildmay Grove North
// back to Mildmay Park; south again and east on Balls Pond Road to Culford Road
// (5k), south to Tottenham Road, the Ufton Grove/Ufton Road hook up to Tottenham
// Road, east on Buckingham Road (6k), south-west on Stamford Road, round
// De Beauvoir Square, west on Englefield Road (7k), south on Lawford Road, the
// Downham Road out-and-back to the Southgate corner, east on Downham to
// Hertford Road (8k), south to De Beauvoir Crescent and over the canal on
// Whitmore Road, Hoxton Street south past the market (9k), Fanshaw Street west,
// Pitfield Street north and Mintern Street west to the finish by Shoreditch Park.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEOJSON = join(ROOT, "data/routes.geojson");
const STOPS = join(ROOT, "data/route-stops.json");
const OVERPASS = process.argv[2] || join(ROOT, "tools/data/shoreditch-streets.json");

const QUERY = `[out:json][timeout:60];(way[highway][name~"^(Bridport Place|Shepperton Road|Rotherfield Street|Ecclesbourne Road|Elmore Street|Cleveland Road|Downham Road|Southgate Road|Mildmay Park|Newington Green|Newington Green Road|Matthias Road|Boleyn Road|Mildmay Road|Wolsey Road|Mildmay Grove North|Balls Pond Road|Culford Road|Culford Grove|Tottenham Road|Ufton Road|Ufton Grove|Buckingham Road|Stamford Road|Englefield Road|De Beauvoir Square|Lawford Road|Hertford Road|De Beauvoir Crescent|Whitmore Road|Whitmore Bridge|Hoxton Street|Fanshaw Street|Pitfield Street|Mintern Street)$"](51.528,-0.097,51.556,-0.072););out geom;`;

if (!existsSync(OVERPASS)) {
  console.error(`Overpass extract not found at ${OVERPASS}.\nFetch it with:\n  curl -s https://overpass.kumi.systems/api/interpreter --data-urlencode 'data=${QUERY}' -o ${OVERPASS}`);
  process.exit(1);
}

const osm = JSON.parse(readFileSync(OVERPASS, "utf8"));
const toR = Math.PI / 180;
const dKm = (a, b) => 12742 * Math.asin(Math.sqrt(Math.sin((b[0] - a[0]) * toR / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin((b[1] - a[1]) * toR / 2) ** 2));

// Graph over OSM nodes; edges carry the street name so legs can be restricted.
const nodes = new Map(); // id -> [lat, lon]
const adj = new Map();   // id -> [{to, km, name}]
for (const way of osm.elements) {
  if (way.type !== "way" || !way.geometry) continue;
  const name = way.tags.name;
  for (let i = 0; i < way.nodes.length; i++) {
    const id = way.nodes[i], g = way.geometry[i];
    if (!nodes.has(id)) { nodes.set(id, [g.lat, g.lon]); adj.set(id, []); }
  }
  for (let i = 1; i < way.nodes.length; i++) {
    const a = way.nodes[i - 1], b = way.nodes[i];
    const km = dKm(nodes.get(a), nodes.get(b));
    adj.get(a).push({ to: b, km, name });
    adj.get(b).push({ to: a, km, name });
  }
}

function nearest(pt, streets) {
  let best = null, bd = Infinity;
  for (const [id, ll] of nodes) {
    if (streets && !adj.get(id).some((e) => streets.includes(e.name))) continue;
    const d = dKm(ll, pt);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
function dijkstra(from, to, streets) {
  const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
  while (true) {
    let u = null, du = Infinity;
    for (const [k, v] of dist) if (!done.has(k) && v < du) { du = v; u = k; }
    if (u === null) return null;
    if (u === to) break;
    done.add(u);
    for (const e of adj.get(u)) {
      if (streets && !streets.includes(e.name)) continue;
      const nd = du + e.km;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, u); }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path;
}

// Legs: [streets or null (any street), toPoint]. Each walks from the previous
// leg's end. Junction points are the exact OSM junction coordinates.
const START = [51.5352, -0.0864]; // Bridport Place, start gantry south of the canal
const LEGS = [
  [["Bridport Place"], [51.53740, -0.08660]],                              // north to the canal (Shepperton/Southgate corner)
  [["Shepperton Road"], [51.53790, -0.08893]],                             // west along the canal side
  [["Rotherfield Street"], [51.54069, -0.09297]],                          // north-west to Ecclesbourne
  [["Ecclesbourne Road"], [51.54224, -0.09032]],                           // 1k
  [["Elmore Street"], [51.54141, -0.08623]],                               // east to Cleveland
  [["Cleveland Road"], [51.53954, -0.08671]],                              // one block south
  [["Downham Road"], [51.53953, -0.08573]],                                // one block east to Southgate
  [["Southgate Road", "Mildmay Park"], [51.55105, -0.08478]],              // 2k; the long climb to Newington Green
  [["Mildmay Park", "Newington Green"], [51.55204, -0.08483]],             // 3k; green's west side to Matthias
  [["Matthias Road"], [51.55169, -0.07941]],                               // east along the green
  [["Boleyn Road"], [51.54949, -0.07768]],                                 // south-east
  [["Mildmay Road"], [51.55050, -0.08332]],                                // 4k; back west
  [["Wolsey Road"], [51.54889, -0.08300]],                                 // south
  [["Mildmay Grove North"], [51.54898, -0.08435]],                         // west to Mildmay Park
  [["Mildmay Park", "Southgate Road"], [51.54581, -0.08366]],              // second pass south to Tottenham Rd
  [["Tottenham Road"], [51.5454, -0.0795]],                                // 5k; east along Tottenham past Culford (hook out)
  [["Tottenham Road"], [51.54556, -0.08089]],                              // and back — the map's hook connector is an unmapped path
  [["Culford Road"], [51.54485, -0.08104]],                                // a step south to Buckingham
  [["Buckingham Road"], [51.54444, -0.07700]],                             // 6k at Stamford
  [["Stamford Road"], [51.54272, -0.08023]],                               // the diagonal to Englefield
  [["Englefield Road"], [51.54247, -0.07774]],                             // east to Hertford
  [["Hertford Road"], [51.54155, -0.07806]],                               // south to the square
  [["De Beauvoir Square"], [51.54160, -0.08050]],                          // round De Beauvoir Square garden
  [["De Beauvoir Square", "Hertford Road", "Englefield Road"], [51.54284, -0.08149]], // back to Englefield, west to Culford
  [["Culford Road"], [51.54117, -0.08190]],                                // 7k; south to Lawford
  [["Lawford Road"], [51.53933, -0.08236]],                                // south-west to Downham
  [["Downham Road"], [51.53954, -0.08671]],                                // the westward stub to the Cleveland corner (turnaround)
  [["Downham Road"], [51.53912, -0.07871]],                                // back east the length of Downham; 8k at Hertford
  [["Hertford Road"], [51.53727, -0.07925]],                               // south to the canal side
  [["De Beauvoir Crescent"], [51.53749, -0.08171]],                        // west along the canal
  [["Whitmore Road", "Whitmore Bridge"], [51.53556, -0.08225]],            // over the canal to the Hoxton/Pitfield corner
  [["Hoxton Street"], [51.52966, -0.08009]],                               // 9k; south past the market
  [["Fanshaw Street"], [51.52979, -0.08324]],                              // west
  [["Pitfield Street"], [51.53320, -0.08302]],                             // north to Mintern
  [["Mintern Street"], [51.5332, -0.0850]],                                // west to the finish by Shoreditch Park
];

let course = [];
let cur = nearest(START, LEGS[0][0]);
course.push(cur);
for (const [streets, toPt] of LEGS) {
  const to = nearest(toPt, streets);
  const path = dijkstra(cur, to, streets);
  if (!path) { console.error(`no path to ${toPt} via ${streets}`); process.exit(1); }
  for (let i = 1; i < path.length; i++) course.push(path[i]);
  cur = to;
}

const line = course.map((id) => nodes.get(id));
let km = 0;
for (let i = 1; i < line.length; i++) km += dKm(line[i - 1], line[i]);
console.log(`assembled ${line.length} pts, ${km.toFixed(2)} km (official course ~10.4 km + markers 1-9)`);

// Marker sanity: cumulative distance at each official kilometre-marker location.
const MARKERS = { 1: [51.5413, -0.0921], 2: [51.5438, -0.0846], 3: [51.5511, -0.0848], 4: [51.5505, -0.0805], 5: [51.5462, -0.0820], 6: [51.5444, -0.0770], 7: [51.5412, -0.0819], 8: [51.5391, -0.0787], 9: [51.5330, -0.0810] };
const cum = [0];
for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dKm(line[i - 1], line[i]));
for (const [k, pt] of Object.entries(MARKERS)) {
  let bi = 0, bd = Infinity;
  line.forEach((p, i) => { const d = dKm(p, pt); if (d < bd) { bd = d; bi = i; } });
  const delta = cum[bi] - k;
  console.log(`  marker ${k}k -> ${cum[bi].toFixed(2)} km (delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`);
}

const r5 = (n) => Math.round(n * 1e5) / 1e5;
const coords = line.map((p) => [r5(p[1]), r5(p[0])]); // geojson [lon,lat]
const gj = JSON.parse(readFileSync(GEOJSON, "utf8"));
let feat = gj.features.find((f) => f.properties.id === "run-shoreditch-10k");
if (!feat) { feat = { type: "Feature", properties: { id: "run-shoreditch-10k" }, geometry: {} }; gj.features.push(feat); }
feat.geometry = { type: "LineString", coordinates: coords };
const stops = JSON.parse(readFileSync(STOPS, "utf8"));
stops["run-shoreditch-10k"] = [
  ["Shoreditch Park", 51.5352, -0.0864], ["Ecclesbourne Road", 51.5413, -0.0921], ["Newington Green", 51.5515, -0.0848],
  ["Mildmay Road", 51.5505, -0.0805], ["De Beauvoir Square", 51.5418, -0.0795], ["Hoxton Street", 51.5330, -0.0810],
];
writeFileSync(GEOJSON, JSON.stringify(gj));
writeFileSync(STOPS, JSON.stringify(stops));
console.log("wrote data/routes.geojson + data/route-stops.json");
