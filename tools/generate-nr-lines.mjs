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
// The "further afield" belt: the commuter box widened to reach Portsmouth
// Harbour (the Portsmouth Direct line through Liss), Southend, Brighton-way
// and Luton — adventure-run territory the club actually travels to.
const BBOX = { minLat: 50.75, maxLat: 51.95, minLon: -1.15, maxLon: 0.75 };

// Display names + line colours (brand-inspired, adjusted for distinctness
// against the existing 18 tube/Overground colours — tweak freely).
// termini: the operator's London terminus station names (post-cleanName) —
// the displayed main route must be anchored at one so strips read London-out.
const NR_LINES = {
  "chiltern-railways": { name: "Chiltern Railways", colour: "#00BFFF", termini: ["London Marylebone"] },
  "thameslink": { name: "Thameslink", colour: "#E9438D", termini: ["London St Pancras International", "London Blackfriars"], through: true },
  "c2c": { name: "c2c", colour: "#B7007C", termini: ["London Fenchurch Street"] },
  "great-northern": { name: "Great Northern", colour: "#0072BC", termini: ["Moorgate", "London King's Cross"] },
  "greater-anglia": { name: "Greater Anglia", colour: "#8B1E3F", termini: ["London Liverpool Street"] },
  "great-western-railway": { name: "Great Western Railway", colour: "#0A493E", termini: ["London Paddington"] },
  "heathrow-express": { name: "Heathrow Express", colour: "#532E63", termini: ["London Paddington"] },
  "southeastern": { name: "Southeastern", colour: "#00A3A9", termini: ["London Charing Cross", "London Cannon Street", "London Victoria", "London Bridge", "London St Pancras International", "London Blackfriars"] },
  // splice: also consider two patterns joined at a shared station even though
  // terminus-anchored patterns exist — Southern's Victoria arms are short but
  // the Arun Valley pattern reaches Portsmouth, so the spliced main reads
  // Victoria to the coast instead of stopping at Tonbridge.
  "southern": { name: "Southern", colour: "#8CC63E", termini: ["London Victoria", "London Bridge"], splice: true },
  "south-western-railway": { name: "South Western Railway", colour: "#55595C", termini: ["London Waterloo"] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inBox = (lat, lon) => lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const cleanName = (n) => n.replace(/ (Rail|Underground|DLR) Station$/i, "").replace(/ \(London\)$/i, "").trim();

async function getJson(path, tries = 3) {
  for (let t = 1; ; t++) {
    try {
      const res = await fetch(API + path, { headers: { "User-Agent": "LineRunners/1.0 (national rail build)" } });
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
  // Refuse joins that fold a route back on itself (length >> end-to-end
  // distance) — chaining Southeastern's fragments end-to-start once produced
  // a 159 km Queenborough–Gillingham "branch" whose ends are 15 km apart.
  const toRad = Math.PI / 180;
  const dKm = (a, b) => 12742 * Math.asin(Math.sqrt(Math.sin((b.lat - a.lat) * toRad / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin((b.lon - a.lon) * toRad / 2) ** 2));
  const runKm = (b) => { let s = 0; for (let i = 1; i < b.length; i++) s += dKm(b[i - 1], b[i]); return s; };
  const degenerate = (b) => { const l = runKm(b); return l > 25 && dKm(b[0], b[b.length - 1]) < l / 4; };
  const out = branches.map((b) => b.slice());
  for (let joined = true; joined; ) {
    joined = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue;
        const a = out[i], b = out[j];
        if (a[a.length - 1].id === b[0].id) {
          const merged = a.concat(b.slice(1));
          if (degenerate(merged)) continue;
          out[i] = merged;
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

  // The line's displayed main route: the longest run anchored at the
  // operator's London terminus, so a fast pattern to the coast beats a
  // stop-heavy suburban one but a stray non-London pattern (SWR's
  // Portsmouth–Byfleet fragment, GWR's North Downs line) can't win.
  // Candidates are terminus-containing branches plus single splices — a
  // non-terminus branch joined to a terminus branch at a shared station,
  // for operators whose full main line never appears as one pattern.
  // The result is oriented London-first so strips read out of town.
  const toRad = Math.PI / 180;
  const brKm = (b) => { let km = 0; for (let i = 1; i < b.length; i++) { const a = b[i - 1], c = b[i];
    km += 12742 * Math.asin(Math.sqrt(Math.sin((c.lat - a.lat) * toRad / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(c.lat * toRad) * Math.sin((c.lon - a.lon) * toRad / 2) ** 2)); } return km; };
  const termini = meta.termini || [];
  let candidates = [];
  if (meta.through) {
    // Through-London line (Thameslink): the terminus sits mid-route, any
    // pattern passing it qualifies and keeps its own orientation. The API
    // fragments the long through-runs (Brighton's arm stops at Earlswood),
    // so also splice pattern pairs at a shared station, keeping results
    // that still pass through the core.
    candidates = branches.filter((b) => b.some((s) => termini.includes(s.n)));
    for (const base of branches) {
      for (const tb of branches) {
        if (base === tb) continue;
        for (let bi = 0; bi < base.length; bi++) {
          const si = tb.findIndex((s) => s.id === base[bi].id);
          if (si === -1) continue;
          for (const head of [base.slice(0, bi + 1), base.slice(bi).reverse()]) {
            for (const tail of [tb.slice(si), tb.slice(0, si + 1).reverse()]) {
              if (tail.length < 2) continue;
              const cand = [...head, ...tail.slice(1)];
              if (new Set(cand.map((s) => s.id)).size !== cand.length) continue;
              if (!cand.some((s) => termini.includes(s.n))) continue;
              candidates.push(cand);
            }
          }
        }
      }
    }
  } else {
    // Terminus operator: split each terminus-touching pattern at the
    // terminus into arms, each reading terminus-first. This also
    // dismembers degenerate stitched loops that only pass through London.
    for (const b of branches) {
      const ti = b.findIndex((s) => termini.includes(s.n));
      if (ti === -1) continue;
      const armA = b.slice(0, ti + 1).reverse(), armB = b.slice(ti);
      if (armA.length > 1) candidates.push(armA);
      if (armB.length > 1) candidates.push(armB);
    }
  }
  if (!candidates.length || meta.splice) {
    // No pattern reaches the terminus (or the line opts in): splice branches
    // with a terminus-touching one at a shared station (kept terminus-first).
    for (const base of branches) {
      for (const tb of branches) {
        const ti = tb.findIndex((s) => termini.includes(s.n));
        if (ti === -1) continue;
        for (let bi = 0; bi < base.length; bi++) {
          const si = tb.findIndex((s) => s.id === base[bi].id);
          if (si === -1) continue;
          const tail = si <= ti ? tb.slice(si, ti + 1) : tb.slice(ti, si + 1).reverse();
          for (const head of [base.slice(0, bi + 1), base.slice(bi).reverse()]) {
            const cand = [...head, ...tail.slice(1)].reverse();
            if (new Set(cand.map((s) => s.id)).size === cand.length) candidates.push(cand);
          }
        }
      }
    }
  }
  if (!candidates.length) candidates = branches;
  const main = candidates.reduce((a, b) => (brKm(b) > brKm(a) ? b : a), candidates[0]);

  network[id] = { name: meta.name, colour: meta.colour, stations, branches: branches.map((b) => b.map((s) => s.id)), route: main.map((s) => s.id) };

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
