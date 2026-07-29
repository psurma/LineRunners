// Re-trace the two on-road race routes (The Big Half, Vitality London 10,000) so
// they follow real streets instead of straight chords. Their inline `path` in
// script.js is a hand-drawn sketch of the course; earlier geocoded-waypoint tracing
// detoured badly (Big Half 47 km vs 21 km real). Here we feed BRouter the EXACT
// on-course sketch coords as waypoints — no geocoding — so each leg snaps to the
// road corridor it already sits on. Writes the geometry into data/routes.geojson
// and named landmark stops into data/route-stops.json (for the Route ideas strip).
//
//   node tools/snap-race-routes.mjs
//
// Uses the shared BRouter helpers in lib/brouter.mjs (full-route first,
// per-leg fallback that skips islands rather than drawing a chord). deSpur is
// deliberately skipped: these courses are precise and genuinely double back
// (Big Half runs out The Highway and returns), which deSpur would wrongly collapse.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { routeThrough } from "./lib/brouter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEOJSON = join(ROOT, "data/routes.geojson");
const STOPS = join(ROOT, "data/route-stops.json");

const UA = "LineRunners/1.0 (race route snapping; https://psurma.github.io/LineRunners)";
// `profiles` lists below are ordered [profile, retries] pairs (see lib/brouter.mjs):
// a road race prefers "shortest" (tracks the carriageway); a foot/park route
// prefers "hiking-beta".

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
const lineKm = (lonlat) => { let k = 0; for (let i = 1; i < lonlat.length; i++) k += distM([lonlat[i - 1][1], lonlat[i - 1][0]], [lonlat[i][1], lonlat[i][0]]) / 1000; return k; };

// The two race routes: exact on-course sketch waypoints (from script.js) + named
// landmark access points for the strip (positioned along the course, matching each
// route's highlights). stops are [label, lat, lon].
const RACES = [
  {
    // Eastern waypoints track The Highway's real NE rise (lat 51.5075 -> 51.5108
    // heading to Limehouse) and return via the continuous Narrow St / Wapping
    // riverside corridor. The original flat-51.5085 sketch snapped north of the
    // road/railway barrier and detoured 8 km; this traces to 20.9 km (99%).
    id: "big-half", km: 21.1,
    path: [[51.5030, -0.0785], [51.5055, -0.0754], [51.5075, -0.0705], [51.5083, -0.0616], [51.5090, -0.0522], [51.5100, -0.0430], [51.5108, -0.0355], [51.5095, -0.0270], [51.5085, -0.0400], [51.5060, -0.0520], [51.5045, -0.0615], [51.5055, -0.0730], [51.5030, -0.0754], [51.4990, -0.0670], [51.5008, -0.0520], [51.4990, -0.0455], [51.4935, -0.0480], [51.4880, -0.0475], [51.4835, -0.0330], [51.4818, -0.0210], [51.4827, -0.0098]],
    // Stops sit on the OUTBOUND leg (Tower Bridge start, then east along The
    // Highway) so they project monotonically start→finish. The course doubles
    // back through Wapping/Tower Bridge on the return; placing these two stops on
    // the return leg instead makes the strip's leg distances clamp to 0.
    stops: [
      ["Tower Bridge", 51.5030, -0.0785], ["Wapping", 51.5083, -0.0616], ["Limehouse", 51.5108, -0.0355],
      ["Rotherhithe", 51.4935, -0.0480], ["Deptford", 51.4835, -0.0330], ["Cutty Sark", 51.4827, -0.0098],
    ],
  },
  {
    id: "vitality-10k", km: 10.0,
    path: [[51.5045, -0.1330], [51.5065, -0.1290], [51.5079, -0.1281], [51.5104, -0.1200], [51.5113, -0.1105], [51.5140, -0.1110], [51.5155, -0.0975], [51.5138, -0.0932], [51.5133, -0.0886], [51.5122, -0.0910], [51.5115, -0.0975], [51.5110, -0.1080], [51.5100, -0.1200], [51.5079, -0.1281], [51.5065, -0.1245], [51.5030, -0.1265], [51.5010, -0.1330]],
    stops: [
      ["The Mall", 51.5055, -0.1300], ["Trafalgar Square", 51.5079, -0.1281], ["Strand", 51.5113, -0.1105],
      ["St Paul's", 51.5138, -0.0975], ["Bank", 51.5133, -0.0886], ["Buckingham Palace", 51.5010, -0.1330],
    ],
  },
  {
    // The full 26.2-mile course: Blackheath start, east to the Woolwich turn,
    // back to the Cutty Sark, round Rotherhithe, over Tower Bridge, the Isle of
    // Dogs loop (down Westferry Rd, round Island Gardens, up Manchester Rd,
    // through Canary Wharf), back to the Tower, then the Embankment to Westminster
    // and the Mall finish. Uses the "shortest" profile — it's an on-road race, so
    // tracking the carriageway beats hiking-beta's pavement detours (45.6 vs 47 km).
    id: "london-marathon", km: 42.2, profile: "shortest",
    path: [
      [51.4690, 0.0120], [51.4735, 0.0330], [51.4800, 0.0510], [51.4865, 0.0645], [51.4888, 0.0655],
      [51.4900, 0.0450], [51.4880, 0.0230], [51.4840, 0.0030], [51.4808, -0.0075], [51.4820, -0.0096],
      [51.4815, -0.0230], [51.4855, -0.0335], [51.4915, -0.0455], [51.4975, -0.0510], [51.5012, -0.0520],
      [51.5015, -0.0445], [51.4988, -0.0575], [51.4990, -0.0670], [51.5015, -0.0740],
      [51.5033, -0.0754], [51.5079, -0.0760],
      [51.5083, -0.0616], [51.5095, -0.0470], [51.5108, -0.0355],
      [51.5075, -0.0255], [51.5000, -0.0245], [51.4930, -0.0250], [51.4880, -0.0180], [51.4872, -0.0110],
      [51.4905, -0.0078], [51.4970, -0.0075], [51.5025, -0.0095],
      [51.5050, -0.0170], [51.5045, -0.0220], [51.5072, -0.0245], [51.5098, -0.0300],
      [51.5100, -0.0430], [51.5085, -0.0616], [51.5079, -0.0760],
      [51.5095, -0.0800], [51.5090, -0.0870], [51.5100, -0.0960], [51.5110, -0.1035],
      [51.5098, -0.1120], [51.5072, -0.1205], [51.5045, -0.1235], [51.5012, -0.1243],
      [51.5003, -0.1295], [51.5008, -0.1352], [51.5010, -0.1412], [51.5024, -0.1400], [51.5040, -0.1345],
    ],
    // One stop per landmark, each passed once, in running order (so the strip's
    // authored order stays monotonic on this point-to-point course).
    stops: [
      ["Blackheath", 51.4690, 0.0120], ["Woolwich", 51.4888, 0.0655], ["Cutty Sark", 51.4820, -0.0096],
      ["Rotherhithe", 51.5012, -0.0520], ["Tower Bridge", 51.5033, -0.0754], ["Canary Wharf", 51.5045, -0.0220],
      ["Embankment", 51.5072, -0.1205], ["Westminster", 51.5012, -0.1243], ["The Mall", 51.5040, -0.1345],
    ],
  },
  {
    // Saucony London 10K (the ex-ASICS/British 10K, July): Piccadilly start, the
    // Regent Street out-and-back (1k viewing), Trafalgar Square (3k), Strand and
    // Aldwych down to the Victoria Embankment past Somerset House (5k), a
    // Blackfriars turnaround, back west along the Embankment (7k), a Westminster
    // Bridge out-and-back past Big Ben, then up Whitehall to the finish.
    id: "saucony-london-10k", km: 10.0, profile: "shortest",
    path: [
      [51.5065, -0.1444], [51.5074, -0.1416], [51.5089, -0.1367], [51.5101, -0.1340],
      [51.5125, -0.1394], [51.5152, -0.1418],
      [51.5125, -0.1394], [51.5101, -0.1340],
      [51.5085, -0.1322], [51.5074, -0.1310], [51.5079, -0.1281],
      [51.5104, -0.1200], [51.5130, -0.1163], [51.5136, -0.1112],
      [51.5115, -0.1173], [51.5107, -0.1155],
      [51.5111, -0.1080], [51.5110, -0.1044],
      [51.5100, -0.1170], [51.5073, -0.1223], [51.5030, -0.1236],
      [51.5008, -0.1220], [51.5006, -0.1188],
      [51.5008, -0.1240], [51.5007, -0.1262],
      [51.5033, -0.1263], [51.5049, -0.1260],
    ],
    stops: [
      ["Green Park", 51.5065, -0.1444], ["Piccadilly Circus", 51.5101, -0.1340], ["Trafalgar Square", 51.5079, -0.1281],
      ["Temple", 51.5111, -0.1080], ["Embankment", 51.5073, -0.1223], ["Westminster", 51.5010, -0.1240],
      ["Whitehall", 51.5049, -0.1260],
    ],
  },
  {
    // London Winter Run 10K (Cancer Research UK, February): Trafalgar Square north
    // terrace start, Strand and Aldwych, up Kingsway and east along Holborn (its
    // closure set names Kingsway/High Holborn/Fetter Lane), down to Fleet Street
    // and Ludgate Hill past St Paul's, Cheapside to Bank and a short City loop
    // (Threadneedle/Old Broad/Lothbury), Cannon Street and Queen Victoria Street
    // to Blackfriars, then the Victoria Embankment to Westminster and the
    // Whitehall finish by Downing Street.
    id: "london-winter-run", km: 10.0, profile: "shortest",
    path: [
      [51.5086, -0.1280], [51.5090, -0.1250], [51.5104, -0.1200], [51.5130, -0.1163],
      [51.5152, -0.1190], [51.5175, -0.1120], [51.5178, -0.1090],
      [51.5152, -0.1078], [51.5142, -0.1070],
      [51.5138, -0.1040], [51.5139, -0.1005], [51.5138, -0.0984],
      [51.5136, -0.0930], [51.5133, -0.0900], [51.5133, -0.0886],
      [51.5140, -0.0866], [51.5152, -0.0846], [51.5155, -0.0870], [51.5150, -0.0890], [51.5140, -0.0895],
      [51.5133, -0.0886], [51.5127, -0.0880], [51.5115, -0.0940], [51.5120, -0.0965],
      [51.5117, -0.1000], [51.5112, -0.1030], [51.5105, -0.1043],
      [51.5112, -0.1105], [51.5100, -0.1170], [51.5073, -0.1223], [51.5030, -0.1236],
      [51.5010, -0.1240], [51.5007, -0.1262], [51.5040, -0.1262],
    ],
    stops: [
      ["Trafalgar Square", 51.5086, -0.1280], ["Holborn", 51.5175, -0.1120], ["St Paul's", 51.5138, -0.0984],
      ["Bank", 51.5133, -0.0886], ["Blackfriars", 51.5105, -0.1043], ["Embankment", 51.5073, -0.1223],
      ["Whitehall", 51.5040, -0.1262],
    ],
  },
  {
    // Saucony Run Shoreditch Half (September, upgraded from the 10K in 2025):
    // a single loop from Shoreditch Park. The southern miles follow the exact
    // street grid of the event's official (10K-era) course map — Shepperton Rd,
    // Rotherfield St, the Essex Rd corner, Elmore St, Southgate/Boleyn Rd up to
    // Matthias Rd, and on the way home the De Beauvoir grid (Buckingham /
    // Tottenham / Stamford / Englefield / Lawford / Downham / Hertford), Whitmore
    // Rd over the Regent's Canal, Hoxton St past the market, Fanshaw and Pitfield
    // to a Mintern St finish. The half's confirmed northern extension (St Paul's
    // Rd, Highbury, Queen's Drive, Clissold Park, Church St, Albion Rd) hangs off
    // Newington Green, which the course touches on three sides — the organisers'
    // "spectators see runners at three different points". The real closed-road
    // course packs more turns in; this is the faithful corridor.
    id: "run-shoreditch-half", km: 21.1, profile: "shortest",
    path: [
      [51.5362, -0.0890], [51.5390, -0.0940], [51.5400, -0.0963],
      [51.5428, -0.0928], [51.5436, -0.0895], [51.5445, -0.0855],
      [51.5480, -0.0840], [51.5505, -0.0822], [51.5528, -0.0842],
      [51.5530, -0.0862],
      [51.5520, -0.0875], [51.5482, -0.0975], [51.5470, -0.1010],
      [51.5520, -0.1000], [51.5562, -0.0988], [51.5612, -0.1000], [51.5652, -0.0952],
      [51.5638, -0.0892], [51.5622, -0.0885], [51.5636, -0.0830],
      [51.5623, -0.0790],
      [51.5592, -0.0827], [51.5556, -0.0849],
      [51.5522, -0.0865], [51.5512, -0.0828],
      [51.5498, -0.0800], [51.5468, -0.0808], [51.5450, -0.0812],
      [51.5445, -0.0835], [51.5448, -0.0790],
      [51.5455, -0.0785], [51.5452, -0.0765], [51.5438, -0.0768],
      [51.5430, -0.0795], [51.5420, -0.0800], [51.5424, -0.0815],
      [51.5435, -0.0845], [51.5410, -0.0845],
      [51.5404, -0.0815], [51.5400, -0.0772],
      [51.5380, -0.0778], [51.5370, -0.0790], [51.5360, -0.0795], [51.5348, -0.0798],
      [51.5346, -0.0780], [51.5320, -0.0787], [51.5299, -0.0800],
      [51.5297, -0.0818], [51.5312, -0.0824], [51.5340, -0.0836],
      [51.5347, -0.0852], [51.5358, -0.0860],
    ],
    stops: [
      ["Shoreditch Park", 51.5362, -0.0890], ["Essex Road", 51.5400, -0.0963], ["Newington Green", 51.5530, -0.0862],
      ["Clissold Park", 51.5622, -0.0885], ["Stoke Newington", 51.5623, -0.0790], ["De Beauvoir", 51.5445, -0.0835],
      ["Hoxton", 51.5320, -0.0787],
    ],
  },
  // The Run Shoreditch 10K (2025 course) is built street-exact from OSM geometry
  // by tools/build-shoreditch-10k.mjs — not BRouter-traced. Do not re-add it here.
  {
    // HOKA Hackney Half (May, Hackney Moves festival): starts and finishes at the
    // Hackney Marshes festival village. Official narrative order: south-west
    // through Homerton to Hackney Downs, Hackney Town Hall and the Empire on
    // Mare Street, west into Dalston and up Kingsland High Street, south through
    // London Fields and Broadway Market, a Haggerston loop picking up Cambridge
    // Heath Road briefly, Victoria Park around halfway with a long stretch of its
    // avenues, then east through Hackney Wick, skirting the Olympic Park north
    // back to the Marshes.
    id: "hackney-half", km: 21.1, profile: "shortest",
    path: [
      [51.5545, -0.0330], [51.5520, -0.0395], [51.5470, -0.0450], [51.5462, -0.0520],
      [51.5510, -0.0555], [51.5535, -0.0560], [51.5545, -0.0640], [51.5530, -0.0680],
      [51.5490, -0.0640], [51.5455, -0.0555],
      [51.5468, -0.0640], [51.5478, -0.0720], [51.5462, -0.0755],
      [51.5480, -0.0755], [51.5520, -0.0745],
      [51.5462, -0.0755], [51.5420, -0.0768],
      [51.5412, -0.0700], [51.5410, -0.0625], [51.5390, -0.0605], [51.5378, -0.0615],
      [51.5362, -0.0620], [51.5360, -0.0680], [51.5330, -0.0700],
      [51.5305, -0.0640], [51.5320, -0.0565], [51.5330, -0.0530],
      [51.5355, -0.0490], [51.5340, -0.0400], [51.5352, -0.0320],
      [51.5385, -0.0420], [51.5378, -0.0430], [51.5400, -0.0310],
      [51.5410, -0.0295], [51.5435, -0.0245], [51.5445, -0.0220],
      [51.5490, -0.0195], [51.5520, -0.0260], [51.5545, -0.0325],
    ],
    stops: [
      ["Hackney Marshes", 51.5545, -0.0330], ["Homerton", 51.5470, -0.0450], ["Hackney Downs", 51.5530, -0.0680],
      ["Hackney Central", 51.5455, -0.0555], ["Dalston", 51.5462, -0.0755], ["London Fields", 51.5410, -0.0625],
      ["Victoria Park", 51.5355, -0.0490], ["Hackney Wick", 51.5435, -0.0245],
    ],
  },
];

const gj = JSON.parse(readFileSync(GEOJSON, "utf8"));
const stopsOut = JSON.parse(readFileSync(STOPS, "utf8"));

// Optional id filter (node tools/snap-race-routes.mjs saucony-london-10k …) so a
// new course can be traced without re-hitting BRouter for the verified ones.
const only = process.argv.slice(2);
const races = only.length ? RACES.filter((r) => only.includes(r.id)) : RACES;

for (const race of races) {
  process.stdout.write(`tracing ${race.id} (${race.path.length} waypoints)... `);
  const profiles = race.profile === "shortest"
    ? [["shortest", 3], ["hiking-beta", 2]]
    : [["hiking-beta", 3], ["shortest", 2]];
  const coords = await routeThrough(race.path, profiles, { userAgent: UA }); // [lon,lat]
  if (!coords) { console.log("FAILED — left unchanged"); continue; }
  const simplified = simplify(coords, 0.00010).map((p) => [r5(p[0]), r5(p[1])]);
  const km = lineKm(simplified);
  let feat = gj.features.find((f) => f.properties.id === race.id);
  if (!feat) { feat = { type: "Feature", properties: { id: race.id }, geometry: { type: "LineString", coordinates: [] } }; gj.features.push(feat); }
  feat.geometry = { type: "LineString", coordinates: simplified };
  stopsOut[race.id] = race.stops.map((s) => [s[0], s[1], s[2]]);
  console.log(`${simplified.length} pts, ${km.toFixed(2)} km (target ${race.km} km, ${Math.round((km / race.km) * 100)}%)`);
}

writeFileSync(GEOJSON, JSON.stringify(gj));
writeFileSync(STOPS, JSON.stringify(stopsOut));
console.log("wrote data/routes.geojson + data/route-stops.json");
