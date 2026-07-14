// Build National Rail line data for the London commuter operators from the
// TfL unified API (mode national-rail), in the same shape as tube-network.json
// and tube-lines.geojson so the site can render them like any other line:
//
//   data/nr-network.json   { <lineId>: { name, colour, stations: {<naptan>: {n, lat, lon}}, branches: [[naptan,...]] } }
//   data/nr-lines.geojson  FeatureCollection of MultiLineString, properties {line, name, colour}
//
//   node tools/generate-nr-lines.mjs
//
// Scope is the London commuter belt (roughly the fare-zone area plus the
// Reading–Shenfield / Broxbourne–Epsom fringe): each TfL route sequence is
// clipped to BBOX and branches that leave it are truncated, so intercity
// tails (Aylesbury, Brighton, Southend…) don't drag the map out of London.
// Re-run when TfL's route data changes. Defunct operators (Heathrow Connect,
// London Midland) are deliberately absent; Weaver is already an Overground line.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.tfl.gov.uk";
const BBOX = { minLat: 51.23, maxLat: 51.8, minLon: -1.0, maxLon: 0.4 };

// Display names + line colours (brand-inspired, adjusted for distinctness
// against the existing 18 tube/Overground colours — tweak freely).
const NR_LINES = {
  "chiltern-railways": { name: "Chiltern Railways", colour: "#00BFFF" },
  "thameslink": { name: "Thameslink", colour: "#E9438D" },
  "c2c": { name: "c2c", colour: "#B7007C" },
  "great-northern": { name: "Great Northern", colour: "#0072BC" },
  "greater-anglia": { name: "Greater Anglia", colour: "#8B1E3F" },
  "great-western-railway": { name: "Great Western Railway", colour: "#0A493E" },
  "heathrow-express": { name: "Heathrow Express", colour: "#532E63" },
  "southeastern": { name: "Southeastern", colour: "#00A3A9" },
  "southern": { name: "Southern", colour: "#8CC63E" },
  "south-western-railway": { name: "South Western Railway", colour: "#55595C" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inBox = (lat, lon) => lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const cleanName = (n) => n.replace(/ (Rail|Underground|DLR) Station$/i, "").replace(/ \(London\)$/i, "").trim();

async function getJson(path, tries = 3) {
  for (let t = 1; ; t++) {
    try {
      const res = await fetch(API + path, { headers: { "User-Agent": "TubeRun/1.0 (national rail build)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (t >= tries) throw new Error(`${path}: ${e.message}`);
      await sleep(1500 * t);
    }
  }
}

// Longest contiguous run of in-box stations in a sequence (routes radiate out
// of London, so clipping the out-of-box tail keeps the branch contiguous).
function clipRun(stops) {
  let best = [], cur = [];
  for (const s of stops) {
    if (inBox(s.lat, s.lon)) { cur.push(s); if (cur.length > best.length) best = cur; }
    else cur = [];
  }
  return best;
}

// Drop branches whose station sets are wholly contained in another branch —
// TfL returns one sequence per service pattern, which overlap heavily.
function dedupeBranches(branches) {
  const sets = branches.map((b) => new Set(b.map((s) => s.id)));
  return branches.filter((b, i) =>
    !sets.some((other, j) => j !== i && other.size >= sets[i].size &&
      (other.size > sets[i].size || j < i) && [...sets[i]].every((id) => other.has(id))));
}

// TfL splits some routes into chained patterns (Great Northern arrives as
// "Hertford North → Finsbury Park" plus "Finsbury Park → Moorgate"). Where one
// branch ends exactly where another starts, join them into the through route
// real trains run, so the displayed main branch reaches its true terminus.
function stitchBranches(branches) {
  const out = branches.map((b) => b.slice());
  for (let joined = true; joined; ) {
    joined = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue;
        const a = out[i], b = out[j];
        if (a[a.length - 1].id === b[0].id) {
          out[i] = a.concat(b.slice(1));
          out.splice(j, 1);
          joined = true;
          break outer;
        }
      }
    }
  }
  return out;
}

// Iterative Douglas-Peucker (same tolerance approach as the variant builder).
function perp(p, a, b) {
  const dy = b[1] - a[1], dx = b[0] - a[0];
  if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
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

// Split a [lon,lat] linestring into in-box contiguous chunks, simplified.
function clipLineString(coords) {
  const chunks = [];
  let cur = [];
  for (const c of coords) {
    if (inBox(c[1], c[0])) cur.push([r5(c[0]), r5(c[1])]);
    else if (cur.length) { chunks.push(cur); cur = []; }
  }
  if (cur.length) chunks.push(cur);
  return chunks.filter((ch) => ch.length > 1).map((ch) => simplify(ch, 0.0002));
}

const network = {};
const features = [];
const summary = [];

for (const [id, meta] of Object.entries(NR_LINES)) {
  const seq = await getJson(`/Line/${id}/Route/Sequence/inbound`);
  const rawBranches = (seq.stopPointSequences || []).map((sp) =>
    (sp.stopPoint || []).map((s) => ({ id: s.id, n: cleanName(s.name), lat: r5(s.lat), lon: r5(s.lon) })));
  const clipped = rawBranches.map(clipRun).filter((b) => b.length >= 2);
  const branches = dedupeBranches(stitchBranches(dedupeBranches(clipped)));

  const stations = {};
  for (const b of branches) for (const s of b) stations[s.id] = { n: s.n, lat: s.lat, lon: s.lon };
  if (Object.keys(stations).length < 2) { summary.push({ line: id, stations: 0, note: "skipped — nothing inside bbox" }); continue; }

  network[id] = { name: meta.name, colour: meta.colour, stations, branches: branches.map((b) => b.map((s) => s.id)) };

  const rings = (seq.lineStrings || []).flatMap((ls) => {
    let coords;
    try { coords = JSON.parse(ls); } catch { return []; }
    // TfL wraps the coordinate array once more than GeoJSON: [[[lon,lat],...]]
    const flat = Array.isArray(coords[0][0]) ? coords.flat() : coords;
    return clipLineString(flat);
  });
  features.push({ type: "Feature", properties: { line: id, name: meta.name, colour: meta.colour }, geometry: { type: "MultiLineString", coordinates: rings } });

  summary.push({ line: id, branches: branches.length, stations: Object.keys(stations).length, geomChunks: rings.length });
  await sleep(600); // stay friendly to the anonymous TfL rate limit
}

writeFileSync(join(ROOT, "data/nr-network.json"), JSON.stringify(network));
writeFileSync(join(ROOT, "data/nr-lines.geojson"), JSON.stringify({ type: "FeatureCollection", features }));
console.log("Wrote data/nr-network.json + data/nr-lines.geojson");
console.table(summary);
