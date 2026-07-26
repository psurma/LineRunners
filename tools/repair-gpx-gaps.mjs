// Re-trace stretches of a route GPX whose geometry is wrong. Two failure modes
// show up in the generated files, and both leave the follow-along distances and
// the "you're off the route" check reading from geometry that was never there:
//
//   * straight-line jumps — generate-nr-routes.mjs falls back to a two-point
//     chord when BRouter can't route a leg, so the file looks continuous while
//     skipping whole waypoints.
//   * coarse spliced stretches — a lower-resolution source pasted in at 5
//     decimal places and a few hundred metres between points, against ~17 m
//     for the rest of the file. The alignment is right, the sampling is not.
//
// Both are repaired the same way: re-route the stretch through BRouter using
// the file's own points as via-hints, so the intended corridor is preserved and
// only the sampling improves. Everything outside a repaired stretch is left
// byte-for-byte alone, so the diff shows exactly what was re-traced.
//
//   node tools/repair-gpx-gaps.mjs [--max-gap 600] [--dry-run] routes/x.gpx ...
//
// Geometry derives from OpenStreetMap (BRouter) — same ODbL terms as the files
// it repairs. Run it after generate-nr-routes.mjs, then re-run validate-data.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { brouterTry } from "./lib/brouter.mjs";
import { distM } from "./lib/geo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Overland/1.0 (gpx geometry repair; https://psurma.github.io/Overland)";
// hiking-beta first: it keeps to footways the way the rest of the file was
// routed. "shortest" is the generator's profile and the reliable fallback.
const PROFILES = [["shortest", 3], ["hiking-beta", 2]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const gi = args.indexOf("--max-gap");
const MAX_GAP = gi >= 0 ? +args[gi + 1] : 600;
const files = args.filter((a, i) => !a.startsWith("--") && !(gi >= 0 && i === gi + 1));
if (!files.length) { console.error("usage: node tools/repair-gpx-gaps.mjs [--max-gap 600] [--dry-run] routes/x.gpx ..."); process.exit(1); }

// A coarse run this long is a spliced-in stretch, not one stray rounded point.
const COARSE_MIN_RUN = 8;
const COARSE_DECIMALS = 5;
// Via-points per BRouter request. The whole stretch in one call would be a very
// long URL; chunks overlap by their shared endpoint so the joins stay seamless.
const VIAS_PER_CALL = 18;
// How far out to start a re-route, in points either side of the damage.
const WIDEN_STEPS = [1, 8, 30, 80];
// Reject a "repair" longer than this multiple of the stretch it replaces — that
// is a detour around an obstacle, not the corridor the route is meant to follow.
const DETOUR_MAX = 1.6;

const decimals = (s) => (s.split(".")[1] || "").length;
const r6 = (n) => +n.toFixed(6);

function parse(xml) {
  const pts = [];
  const re = /^(\s*)<trkpt lat="([-\d.]+)" lon="([-\d.]+)"(?:\s*\/>|>(.*?)<\/trkpt>)\s*$/gm;
  let m;
  while ((m = re.exec(xml))) {
    pts.push({
      indent: m[1], lat: +m[2], lon: +m[3], inner: m[4] ?? null,
      prec: Math.max(decimals(m[2]), decimals(m[3])),
      start: m.index, end: re.lastIndex,
    });
  }
  return pts;
}

const fmt = (indent, lat, lon, ele) => (Number.isFinite(ele)
  ? `${indent}<trkpt lat="${r6(lat)}" lon="${r6(lon)}"><ele>${+ele.toFixed(2)}</ele></trkpt>`
  : `${indent}<trkpt lat="${r6(lat)}" lon="${r6(lon)}"/>`);

// Bad stretches as { a, b, kind }, where a and b are the good points that
// bracket the damage and are themselves kept. `kind` decides how the re-route
// is asked for, and the distinction matters:
//   "gap"    — a straight-line chord. The points inside it are the generator's
//              raw station coordinates, which is exactly the geometry that
//              failed to route; feeding them back as via-hints just reproduces
//              the failure, so the stretch is routed endpoint to endpoint.
//   "coarse" — a real alignment sampled too sparsely. Here the inner points are
//              the useful part, so they are kept as via-hints and only the
//              sampling is improved.
function findRegions(pts) {
  const gapMarks = new Set(), coarseMarks = new Set();
  for (let i = 1; i < pts.length; i++) {
    if (distM([pts[i - 1].lat, pts[i - 1].lon], [pts[i].lat, pts[i].lon]) > MAX_GAP) { gapMarks.add(i - 1); gapMarks.add(i); }
  }
  let run = null;
  for (let i = 0; i <= pts.length; i++) {
    const coarse = i < pts.length && pts[i].prec <= COARSE_DECIMALS;
    if (coarse && run === null) run = i;
    else if (!coarse && run !== null) {
      if (i - run >= COARSE_MIN_RUN) for (let k = run; k < i; k++) coarseMarks.add(k);
      run = null;
    }
  }
  // A gap inside a coarse run is a symptom of the sparse sampling, not a
  // separate chord — let the coarse repair cover it.
  for (const i of coarseMarks) gapMarks.delete(i);
  const group = (set, kind) => {
    if (!set.size) return [];
    const idx = [...set].sort((a, b) => a - b);
    const out = [];
    let s = idx[0], p = idx[0];
    for (const i of idx.slice(1)) {
      if (i - p <= 3) { p = i; continue; } // stitch near-adjacent damage into one stretch
      out.push({ a: s, b: p, kind }); s = i; p = i;
    }
    out.push({ a: s, b: p, kind });
    return out;
  };
  return [...group(gapMarks, "gap"), ...group(coarseMarks, "coarse")].sort((x, y) => x.a - y.a);
}

async function routeVias(vias, profiles) {
  const out = [];
  for (let i = 0; i < vias.length - 1; i += VIAS_PER_CALL - 1) {
    const chunk = vias.slice(i, i + VIAS_PER_CALL);
    if (chunk.length < 2) break;
    const seg = await brouterTry(chunk, profiles, { userAgent: UA });
    if (!seg || seg.length < 2) return null;
    out.push(...(out.length ? seg.slice(1) : seg)); // [lon, lat, ele]
    await sleep(400);
  }
  return out.length >= 2 ? out : null;
}

const worstGap = (latlon) => {
  let w = 0;
  for (let i = 1; i < latlon.length; i++) w = Math.max(w, distM(latlon[i - 1], latlon[i]));
  return w;
};

// A profile that cannot connect two points returns a two-point beeline rather
// than an error, so brouterTry would accept that as success and never reach the
// next profile. Route each profile and keep whichever leaves the smallest jump.
async function routeBest(vias) {
  let best = null;
  for (const [profile, tries] of PROFILES) {
    const raw = await routeVias(vias, [[profile, tries]]);
    await sleep(300);
    if (!raw || raw.length < 2) continue;
    const latlon = raw.map((c) => [c[1], c[0], c[2]]);
    const w = worstGap(latlon);
    if (!best || w < best.worst) best = { latlon, worst: w, profile };
    if (w <= MAX_GAP) break; // good enough, don't burn another request
  }
  return best;
}

let anyChange = false, anyFail = false;
for (const file of files) {
  const path = file.startsWith("/") ? file : join(ROOT, file);
  const xml = readFileSync(path, "utf8");
  const pts = parse(xml);
  const regions = findRegions(pts);
  const name = basename(path);
  if (!regions.length) { console.log(`${name}: nothing to repair`); continue; }

  console.log(`\n${name}: ${pts.length} points, ${regions.length} stretch(es) to re-trace`);
  const pathKm = (a, b) => {
    let km = 0;
    for (let i = a + 1; i <= b; i++) km += distM([pts[i - 1].lat, pts[i - 1].lon], [pts[i].lat, pts[i].lon]) / 1000;
    return km;
  };
  const edits = [];
  for (const region of regions) {
    const { kind } = region;
    let had = 0;
    for (let i = region.a + 1; i <= region.b; i++) had = Math.max(had, distM([pts[i - 1].lat, pts[i - 1].lon], [pts[i].lat, pts[i].lon]));
    console.log(`  ${kind} idx ${region.a}..${region.b} (worst gap ${Math.round(had)} m)`);
    if (dryRun) continue;

    // Widen progressively. A chord's own endpoints are often the raw station
    // coordinates that failed to route in the first place, so starting the
    // re-route further out along known-good geometry is what makes it succeed.
    let done = null, note = "";
    for (const w of (kind === "coarse" ? [1] : WIDEN_STEPS)) {
      const a = Math.max(0, region.a - w), b = Math.min(pts.length - 1, region.b + w);
      const inner = pts.slice(a, b + 1);
      let vias;
      if (kind === "coarse") {
        // Thin first — every point as a via would over-constrain the router
        // onto the very sampling we are trying to replace.
        const step = Math.max(1, Math.ceil((inner.length - 1) / 40));
        vias = inner.filter((_, k) => k % step === 0 || k === inner.length - 1).map((p) => [p.lat, p.lon]);
      } else {
        vias = [[pts[a].lat, pts[a].lon], [pts[b].lat, pts[b].lon]];
      }
      process.stdout.write(`    widen ${String(w).padStart(2)} (${vias.length} vias) … `);
      const best = await routeBest(vias);
      if (!best) { console.log("no route"); continue; }
      const { latlon, worst, profile } = best;
      let km = 0;
      for (let i = 1; i < latlon.length; i++) km += distM(latlon[i - 1], latlon[i]) / 1000;
      const wasKm = pathKm(a, b);
      const endErr = Math.max(
        distM([pts[a].lat, pts[a].lon], latlon[0]),
        distM([pts[b].lat, pts[b].lon], latlon[latlon.length - 1]));
      const ratio = wasKm > 0.05 ? km / wasKm : 1;
      if (worst > MAX_GAP) { console.log(`${profile}: ${Math.round(worst)} m jump remains`); note = `${Math.round(worst)} m jump`; continue; }
      if (endErr > 120) { console.log(`${profile}: endpoint moved ${Math.round(endErr)} m`); note = "endpoint moved"; continue; }
      // A continuous route that doubles the distance is a detour around the
      // obstacle, not a repair of this stretch — widen further and look for a
      // path that follows the corridor instead.
      if (ratio > DETOUR_MAX) { console.log(`${profile}: ${km.toFixed(2)} km vs ${wasKm.toFixed(2)} km (x${ratio.toFixed(1)}) — detour, widening`); note = "detour only"; continue; }
      console.log(`${profile}: ${latlon.length} pts, ${km.toFixed(2)} km vs ${wasKm.toFixed(2)} km, worst gap ${Math.round(worst)} m`);
      done = { a, b, text: latlon.map((c) => fmt(pts[a].indent, c[0], c[1], c[2])).join("\n") };
      break;
    }
    if (!done) { console.log(`    left as is${note ? ` (best: ${note})` : ""}`); anyFail = true; continue; }
    edits.push(done);
    await sleep(400);
  }

  if (dryRun || !edits.length) continue;
  // Splice back to front so earlier offsets stay valid.
  let out = xml;
  for (const e of edits.slice().reverse()) out = out.slice(0, pts[e.a].start) + e.text + out.slice(pts[e.b].end);
  writeFileSync(path, out);
  anyChange = true;
  const after = parse(out);
  let worst = 0;
  for (let i = 1; i < after.length; i++) worst = Math.max(worst, distM([after[i - 1].lat, after[i - 1].lon], [after[i].lat, after[i].lon]));
  console.log(`  written: ${pts.length} -> ${after.length} points, worst gap now ${Math.round(worst)} m`);
}

if (anyFail) { console.error("\nSome stretches could not be repaired — see above."); process.exit(1); }
if (!dryRun && anyChange) console.log("\nDone. Re-run node tools/validate-data.mjs and drop the matching GAP_ALLOW entries.");
