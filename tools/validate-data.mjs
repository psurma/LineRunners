// Offline integrity validator for the derived data/ + routes/ artifacts.
// Everything the site serves is generated from literals in script.js plus the
// network JSON; the generators run manually, so alignment can silently rot.
// This recomputes the cheap side of every contract and exits non-zero on a
// breach. No network, runs in well under 2 s — the pre-commit hook calls it
// whenever script.js or data/ files are in the commit.
//
//   node tools/validate-data.mjs
//
// TUBERUN_DATA_DIR overrides the data/ directory and TUBERUN_SCRIPT the
// script.js path (tests point them at doctored copies instead of touching the
// real files). routes/ always comes from the repo.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { extractLiteral } from "./lib/extract.mjs";
import { distM } from "./lib/geo.mjs";
import { computeRuns } from "./generate-schedule.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.TUBERUN_DATA_DIR || join(ROOT, "data");

const failures = [];
const warnings = [];
const ok = (msg) => console.log(`ok    ${msg}`);
const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);

try {
  const src = readFileSync(process.env.TUBERUN_SCRIPT || join(ROOT, "script.js"), "utf8");
  const J = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));
  const tube = J("tube-network.json");
  const nrNet = J("nr-network.json");

  const LINE_VARIANTS = extractLiteral(src, "LINE_VARIANTS");
  const ROUTES = extractLiteral(src, "ROUTES");
  const GPX_LINES = new Set(extractLiteral(src, "GPX_LINES"));
  const RUN_PLAN = extractLiteral(src, "RUN_PLAN");
  const WAYPOINTS = extractLiteral(src, "WAYPOINTS");
  const rfMatch = src.match(/const ROAD_FACTOR = ([\d.]+)/);
  if (!rfMatch) throw new Error("ROAD_FACTOR not found in script.js");
  const ROAD_FACTOR = +rfMatch[1];

  // --- a. variant-routes.json aligned to LINE_VARIANTS -------------------------
  // Same assembly as script.js assembleVariant / tools/generate-variants.mjs:
  // stitch the variant's branch segments, dropping the shared join station.
  function assembleVariant(id, variant) {
    const ln = tube[id];
    if (!ln || !ln.branches) return null;
    const ids = [];
    for (const [bi, rev] of variant.segs) {
      const branch = ln.branches[bi];
      if (!branch) continue;
      const seg = rev ? [...branch].reverse() : branch;
      for (const sid of seg) {
        if (ids.length && ids[ids.length - 1] === sid) continue;
        ids.push(sid);
      }
    }
    return ids.map((sid) => ln.stations[sid]).filter(Boolean);
  }
  {
    const VR = J("variant-routes.json");
    let geoms = 0, aligned = true;
    for (const [id, variants] of Object.entries(LINE_VARIANTS)) {
      const arr = VR[id];
      if (!Array.isArray(arr) || arr.length !== variants.length) {
        fail(`variant-routes.json: ${id} stores ${Array.isArray(arr) ? arr.length : "no"} geometries for ${variants.length} LINE_VARIANTS entries — the picker pairs them by index; re-run tools/generate-variants.mjs`);
        aligned = false;
        continue;
      }
      variants.forEach((v, vi) => {
        const g = arr[vi];
        if (!g) return; // null = variant couldn't be routed; the site draws station hops
        const st = assembleVariant(id, v);
        if (!st || st.length < 2) return;
        geoms++;
        const d0 = distM(g[0], [st[0].lat, st[0].lon]);
        const d1 = distM(g[g.length - 1], [st[st.length - 1].lat, st[st.length - 1].lon]);
        if (d0 > 300 || d1 > 300) {
          fail(`variant-routes.json: ${id} v${vi} geometry ends ${Math.round(d0)} m / ${Math.round(d1)} m from ${st[0].n} → ${st[st.length - 1].n} — misaligned with LINE_VARIANTS; re-run tools/generate-variants.mjs`);
          aligned = false;
        }
      });
    }
    if (aligned) ok(`variant-routes.json: ${Object.keys(LINE_VARIANTS).length} lines, ${geoms} geometries end within 300 m of their variant's termini`);
  }

  // --- b. branch geometries aligned to the skip rule ---------------------------
  // The rule shared by script.js buildBranchOptions and the branch generators:
  // keep branches that aren't the main route (either direction) and have >=2
  // resolvable stations. The runtime advances its geometry index once per kept
  // branch, so a stored array shorter than the recomputed count mis-pairs every
  // later branch (the generators silently drop geometries that simplify to <=1
  // point — that latent divergence is exactly what this catches).
  function branchCount(net, id) {
    const ln = net[id];
    if (!ln || !(ln.branches || []).length) return 0;
    const mainKey = (ln.route || []).join("|");
    const mainRev = [...(ln.route || [])].reverse().join("|");
    let n = 0;
    for (const b of ln.branches) {
      if (b.join("|") === mainKey || b.join("|") === mainRev || b.length < 2) continue;
      if (b.map((sid) => ln.stations[sid]).filter(Boolean).length < 2) continue;
      n++;
    }
    return n;
  }
  {
    const sets = [
      ["nr-branch-routes.json", J("nr-branch-routes.json"), nrNet],
      ["tube-branch-routes.json", J("tube-branch-routes.json"), tube],
    ];
    let branches = 0, alignedLines = 0, spurs = 0, bad = false;
    for (const [file, stored, net] of sets) {
      for (const [id, arr] of Object.entries(stored)) {
        if (!net[id]) { fail(`${file}: ${id} is not in its network file`); bad = true; continue; }
        // Lines with curated LINE_VARIANTS never reach buildBranchOptions (variants
        // win), so their entries here feed only segmentPavement, which spreads all
        // polylines order-free — the positional count contract doesn't apply. Just
        // sanity-check each polyline (e.g. district/piccadilly/elizabeth spur arms).
        if (LINE_VARIANTS[id]) {
          for (const [i, line] of arr.entries()) {
            if (!Array.isArray(line) || line.length < 2 || line.some((p) => !Array.isArray(p) || !isFinite(p[0]) || !isFinite(p[1]))) {
              fail(`${file}: ${id} spur ${i} is not a valid polyline`);
              bad = true;
            }
          }
          spurs += arr.length;
          continue;
        }
        const want = branchCount(net, id);
        if (arr.length !== want) {
          fail(`${file}: ${id} stores ${arr.length} geometries but the branch skip rule yields ${want} — branch options would mis-pair; a regeneration is needed (re-run the ${file.startsWith("nr") ? "generate-nr-branches" : "generate-dlr-branches"} tool)`);
          bad = true;
          continue;
        }
        branches += arr.length;
        alignedLines++;
      }
    }
    for (const id of Object.keys(nrNet)) if (!(id in sets[0][1])) { fail(`nr-branch-routes.json: line ${id} missing entirely — re-run tools/generate-nr-branches.mjs`); bad = true; }
    if (!bad) ok(`branch routes: ${branches} geometries across ${alignedLines} lines match the skip-rule counts${spurs ? ` (+${spurs} order-free spur polylines on variant lines)` : ""}`);
  }

  // --- c. referential integrity: ROUTES / geojson / stops / GPX ----------------
  {
    const geo = J("routes.geojson");
    const geoIds = new Set(geo.features.map((f) => f.properties.id));
    const stops = J("route-stops.json");
    const noGeo = ROUTES.filter((r) => !geoIds.has(r.id)).map((r) => r.id);
    if (noGeo.length) fail(`routes.geojson: ${noGeo.length} ROUTES id(s) have no feature: ${noGeo.join(", ")}`);
    const noStops = ROUTES.filter((r) => !(r.id in stops) && !(r.stops && r.stops.length)).map((r) => r.id);
    if (noStops.length) fail(`route-stops.json: ${noStops.length} ROUTES id(s) have neither a stops entry nor an inline stops array: ${noStops.join(", ")}`);
    const orphans = [...geoIds].filter((id) => !ROUTES.some((r) => r.id === id));
    if (orphans.length) warn(`routes.geojson: ${orphans.length} feature(s) with no ROUTES card: ${orphans.join(", ")}`);
    if (!noGeo.length && !noStops.length) ok(`ROUTES: all ${ROUTES.length} ids have geojson geometry and stops (file or inline)`);

    const onDisk = new Set(readdirSync(join(ROOT, "routes")).filter((f) => f.endsWith(".gpx")).map((f) => basename(f, ".gpx")));
    const noFile = [...GPX_LINES].filter((id) => !onDisk.has(id));
    const noSet = [...onDisk].filter((id) => !GPX_LINES.has(id));
    if (noFile.length) fail(`GPX_LINES: no routes/<id>.gpx for: ${noFile.join(", ")}`);
    if (noSet.length) fail(`routes/: gpx files not in GPX_LINES: ${noSet.join(", ")}`);
    if (!noFile.length && !noSet.length) ok(`GPX_LINES: ${GPX_LINES.size} ids match routes/*.gpx exactly`);
  }

  // --- d. freshness drift: boroughs (fail >10%) / pubs (warn) ------------------
  {
    const bor = J("boroughs.json");
    const missingB = ROUTES.filter((r) => !((bor.routes || {})[r.id])).map((r) => r.id);
    if (missingB.length > ROUTES.length * 0.10) {
      fail(`boroughs.json: ${missingB.length}/${ROUTES.length} routes untagged (${missingB.slice(0, 5).join(", ")}${missingB.length > 5 ? ", …" : ""}) — re-run tools/generate-boroughs.mjs`);
    } else {
      if (missingB.length) warn(`boroughs.json: ${missingB.length} route(s) untagged: ${missingB.join(", ")}`);
      ok(`boroughs.json: ${ROUTES.length - missingB.length}/${ROUTES.length} routes tagged (${(bor.names || []).length} boroughs)`);
    }
    const pubs = J("route-pubs.json");
    const missingP = ROUTES.filter((r) => !(r.id in pubs)).map((r) => r.id);
    if (missingP.length) warn(`route-pubs.json: ${missingP.length}/${ROUTES.length} routes missing (${missingP.slice(0, 5).join(", ")}${missingP.length > 5 ? ", …" : ""}) — re-run tools/generate-pubs.mjs`);
    else ok(`route-pubs.json: all ${ROUTES.length} routes present`);
  }

  // --- e. schedule.json in step with RUN_PLAN ----------------------------------
  {
    const sched = J("schedule.json");
    const computed = computeRuns(RUN_PLAN);
    if (JSON.stringify(computed) !== JSON.stringify(sched.runs)) {
      fail(`schedule.json: runs don't match what RUN_PLAN currently produces (hand-edited, or the calendar rolled over) — re-commit to regenerate: the pre-commit hook rebuilds it when script.js is in the commit, or run node tools/generate-schedule.mjs and stage data/schedule.json`);
    } else {
      ok(`schedule.json: ${computed.length} runs match RUN_PLAN`);
    }
  }

  // --- f. RUN_PLAN tube distances vs waypoints ---------------------------------
  // The authored "~N km" strings drift (a line's length in MILES once landed in
  // one) — recompute each tube leg from WAYPOINTS the way the journey board
  // does (consecutive haversine × ROAD_FACTOR) and flag anything >25% off.
  {
    const norm = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
    let checked = 0, bad = false;
    for (const r of RUN_PLAN) {
      if (r.type !== "tube") continue;
      const label = `run-plan: ${r.line} "${r.leg}"`;
      const m = String(r.distance || "").match(/([\d.]+)\s*km/);
      if (!m) { warn(`${label}: no "N km" in distance "${r.distance}" — drift check skipped`); continue; }
      const wp = WAYPOINTS[r.line];
      if (!wp) { warn(`${label}: no WAYPOINTS entry for line — drift check skipped`); continue; }
      const legEnds = String(r.leg || "").split(/\s*(?:→|->)\s*/);
      if (legEnds.length !== 2) { warn(`${label}: leg is not "A → B" — drift check skipped`); continue; }
      // Endpoint → waypoint index. Exact name first; the loose substring form is
      // only trusted when exactly one waypoint matches, because it collides on
      // real data ("Kenton" also matches "South Kenton", "Northwood" also matches
      // "Northwood Hills") and findIndex would silently take whichever came first.
      const idxOf = (name) => {
        const n = norm(name);
        const exact = wp.findIndex((w) => norm(w[0]) === n);
        if (exact >= 0) return { i: exact, hits: [wp[exact][0]] };
        const hits = wp.filter((w) => norm(w[0]).includes(n) || n.includes(norm(w[0])));
        return { i: hits.length === 1 ? wp.indexOf(hits[0]) : -1, hits: hits.map((w) => w[0]) };
      };
      const ends = [idxOf(legEnds[0]), idxOf(legEnds[1])];
      const ambiguous = ends.findIndex((e) => e.i < 0 && e.hits.length > 1);
      if (ambiguous >= 0) {
        fail(`${label}: endpoint "${legEnds[ambiguous]}" matches ${ends[ambiguous].hits.length} WAYPOINTS entries (${ends[ambiguous].hits.join(", ")}) — ambiguous, so the leg could be measured between the wrong stations; name the station exactly as WAYPOINTS spells it`);
        bad = true;
        continue;
      }
      const ia = ends[0].i, ib = ends[1].i;
      if (ia < 0 || ib < 0) { warn(`${label}: endpoint "${legEnds[ia < 0 ? 0 : 1]}" not found in WAYPOINTS — drift check skipped`); continue; }
      const slice = wp.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
      let km = 0;
      for (let i = 1; i < slice.length; i++) km += distM([slice[i - 1][1], slice[i - 1][2]], [slice[i][1], slice[i][2]]) / 1000;
      const computed = km * ROAD_FACTOR;
      const authored = +m[1];
      if (Math.abs(authored - computed) / computed > 0.25) {
        fail(`${label}: distance says ${authored} km but the waypoints compute ${computed.toFixed(1)} km (crow-flies × ${ROAD_FACTOR}, the journey board's figure) — suggest "~${Math.round(computed)} km"`);
        bad = true;
      } else {
        checked++;
      }
    }
    if (!bad) ok(`run-plan distances: ${checked} tube leg(s) within 25% of waypoint-computed km`);
  }

  // --- g. GPX contract: one trk, one trkseg, ends at the line's termini, and no
  // hole in the middle. Same main-route derivation as the site's rtStations:
  // WAYPOINTS by line name first, else the network entry's route, else its
  // longest branch.
  {
    // Consecutive trkpts further apart than this mean the track jumps: a
    // waypoint the tracer couldn't route through leaves a straight line across
    // whatever is in between, and every importer draws it as real. Checking only
    // the two termini (below) never saw those.
    const MAX_GAP_M = 600;
    // Gaps that are genuinely in the data, keyed by the gap's START point rather
    // than its index so re-simplifying a file can't silently invalidate an entry
    // — a moved crossing stops matching and fails loudly instead.
    //   [lat, lon, maxMetres, why]
    const GAP_ALLOW = {
      // Under the northern runway into the Central Terminal Area; there is no
      // surface route across a live runway, so the tunnel is the real geometry.
      "heathrow-express.gpx": [
        [51.479771, -0.452846, 700, "Heathrow runway tunnel, southbound"],
        [51.474094, -0.453106, 700, "Heathrow runway tunnel, northbound"],
      ],
      "piccadilly.gpx": [
        [51.479771, -0.452846, 700, "Heathrow runway tunnel, southbound"],
        [51.474094, -0.453106, 700, "Heathrow runway tunnel, northbound"],
      ],
      // Brunel's Thames Tunnel: Wapping to Rotherhithe, under the river.
      "windrush.gpx": [
        [51.511282, -0.056929, 800, "Thames Tunnel, Wapping to Rotherhithe"],
      ],
    };
    function termini(id) {
      const ln = tube[id] || nrNet[id];
      if (!ln) return null;
      const wp = WAYPOINTS[ln.name];
      if (wp) return [[wp[0][1], wp[0][2]], [wp[wp.length - 1][1], wp[wp.length - 1][2]]];
      const br = ln.route || ln.branches.reduce((a, b) => (b.length > a.length ? b : a), ln.branches[0] || []);
      const s0 = ln.stations[br[0]], s1 = ln.stations[br[br.length - 1]];
      return s0 && s1 ? [[s0.lat, s0.lon], [s1.lat, s1.lon]] : null;
    }
    let checked = 0, bad = false;
    for (const f of readdirSync(join(ROOT, "routes")).filter((n) => n.endsWith(".gpx")).sort()) {
      const text = readFileSync(join(ROOT, "routes", f), "utf8");
      const trks = (text.match(/<trk>/g) || []).length;
      const segs = (text.match(/<trkseg>/g) || []).length;
      if (trks !== 1 || segs !== 1) { fail(`routes/${f}: ${trks} <trk> / ${segs} <trkseg> — must be exactly 1/1 (importers treat extra segments as extra routes); run tools/trim-gpx.mjs`); bad = true; continue; }
      const pts = [...text.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
      if (pts.length < 2) { fail(`routes/${f}: fewer than 2 trkpts`); bad = true; continue; }
      const ends = termini(basename(f, ".gpx"));
      if (!ends) { fail(`routes/${f}: no matching line in the network files to check termini against`); bad = true; continue; }
      const d0 = distM(pts[0], ends[0]);
      const d1 = distM(pts[pts.length - 1], ends[1]);
      if (d0 > 500 || d1 > 500) { fail(`routes/${f}: track ends ${Math.round(d0)} m / ${Math.round(d1)} m from the line's termini — wrong segment kept or stale route`); bad = true; continue; }
      const allow = GAP_ALLOW[f] || [];
      const gaps = [];
      for (let i = 1; i < pts.length; i++) {
        const d = distM(pts[i - 1], pts[i]);
        if (d <= MAX_GAP_M) continue;
        if (allow.some((a) => d <= a[2] && distM(pts[i - 1], [a[0], a[1]]) < 250)) continue;
        gaps.push(`${Math.round(d)} m at point ${i} ([${pts[i - 1]}] → [${pts[i]}])`);
      }
      if (gaps.length) {
        fail(`routes/${f}: ${gaps.length} gap(s) over ${MAX_GAP_M} m between consecutive trkpts — the track jumps, so importers draw a straight line through whatever is in between: ${gaps.slice(0, 3).join("; ")}${gaps.length > 3 ? ", …" : ""}. Re-trace the leg, or add it to GAP_ALLOW if it is a genuine tunnel/water crossing`);
        bad = true;
        continue;
      }
      checked++;
    }
    if (!bad) ok(`routes/*.gpx: ${checked} files are single-trk/single-trkseg, end within 500 m of their termini and have no unlisted gap over ${MAX_GAP_M} m`);
  }

  // --- h. runtime JSON: every data/*.json|geojson parses, plus the shapes ------
  // script.js fetches at runtime. The sections above only JSON.parse the files
  // they cross-check, so a truncated/corrupt regen of a purely-fetched artifact
  // (the default map among them) sails through the hook and breaks the feature
  // live. Parse everything cheaply, then assert only the keys the consumers read.
  {
    const dataFiles = readdirSync(DATA).filter((f) => f.endsWith(".json") || f.endsWith(".geojson")).sort();
    const parsed = {};
    let parseBad = false;
    for (const f of dataFiles) {
      try {
        parsed[f] = JSON.parse(readFileSync(join(DATA, f), "utf8"));
      } catch (e) {
        fail(`data/${f}: not valid JSON (truncated or corrupt regen?) — ${e.message}`);
        parseBad = true;
      }
    }
    if (!parseBad) ok(`data/: all ${dataFiles.length} .json/.geojson files parse`);

    // undefined = the file failed to parse above; its failure is already reported.
    const has = (o, keys) => o && typeof o === "object" && keys.every((k) => k in o);
    const isFC = (g) => g && g.type === "FeatureCollection" && Array.isArray(g.features) && g.features.length > 0;

    // tube-lines.geojson (the default map) + nr-lines.geojson: the map pushes/
    // iterates .features, so an empty or non-FeatureCollection draws nothing.
    for (const f of ["tube-lines.geojson", "nr-lines.geojson"]) {
      const g = parsed[f];
      if (g === undefined) continue;
      if (isFC(g)) ok(`${f}: FeatureCollection with ${g.features.length} features`);
      else fail(`${f}: not a non-empty FeatureCollection — the map source would be empty`);
    }

    // secrets.json: the route-secrets layer reads .n/.lat/.lon/.d off each item.
    const secrets = parsed["secrets.json"];
    if (secrets !== undefined) {
      if (Array.isArray(secrets) && secrets.every((p) => has(p, ["n", "lat", "lon", "d"]))) ok(`secrets.json: array of ${secrets.length}, each with n/lat/lon/d`);
      else fail(`secrets.json: must be an array whose items each carry n/lat/lon/d (the route-secrets layer reads those)`);
    }

    // route-pubs.json: object routeId → array; the pubs layer reads .n/.lat/.lon/.r/.end.
    const pubs = parsed["route-pubs.json"];
    if (pubs !== undefined) {
      const vals = pubs && typeof pubs === "object" && !Array.isArray(pubs) ? Object.values(pubs) : null;
      if (vals && vals.every((a) => Array.isArray(a) && a.every((p) => has(p, ["n", "lat", "lon", "r", "end"])))) ok(`route-pubs.json: ${Object.keys(pubs).length} routes → items with n/lat/lon/r/end`);
      else fail(`route-pubs.json: must be an object of routeId → array of items with n/lat/lon/r/end (the pubs layer reads those)`);
    }

    // walk-times.json: loadWalkTimes reads .markers and each marker's walk/x/y.
    const wt = parsed["walk-times.json"];
    if (wt !== undefined) {
      const ms = wt && Array.isArray(wt.markers) ? wt.markers : null;
      if (ms && ms.length && ms.every((m) => has(m, ["walk", "x", "y"]))) ok(`walk-times.json: ${ms.length} markers with walk/x/y`);
      else fail(`walk-times.json: must be an object with a non-empty markers array whose items carry walk/x/y`);
    }

    // superloop.json: renderSuperloop reads .routes[], each with id + segs
    // ([[lat,lon],…] polylines) + stops ([name,lat,lon]). A malformed regen would
    // draw an empty or mislocated orbital, so assert the shape and London bounds.
    const sl = parsed["superloop.json"];
    if (sl !== undefined) {
      const routes = sl && Array.isArray(sl.routes) ? sl.routes : null;
      const inLondon = (lat, lon) => lat > 51.2 && lat < 51.8 && lon > -0.7 && lon < 0.4;
      const okRoute = (r) =>
        has(r, ["id", "segs", "stops"]) && typeof r.id === "string" &&
        Array.isArray(r.segs) && r.segs.length > 0 &&
        r.segs.every((s) => Array.isArray(s) && s.length > 1 && s.every((p) => Array.isArray(p) && p.length === 2 && inLondon(p[0], p[1]))) &&
        Array.isArray(r.stops) && r.stops.length >= 2 &&
        r.stops.every((s) => Array.isArray(s) && s.length === 3 && typeof s[0] === "string" && inLondon(s[1], s[2]));
      if (routes && routes.length && routes.every(okRoute)) ok(`superloop.json: ${routes.length} routes, each with in-bounds segs + stops`);
      else fail(`superloop.json: must be { routes: [ { id, segs:[[[lat,lon],…]], stops:[[name,lat,lon],…] } ] } with all coords inside Greater London — re-run tools/generate-superloop.mjs`);
    }

    // tramlink.json: renderTramlink reads .segs ([[lat,lon],…] polylines) + .stops
    // ([name,lat,lon]) for the whole Croydon Tramlink network. Assert shape + bounds
    // so a malformed regen can't draw an empty or mislocated network.
    const tl = parsed["tramlink.json"];
    if (tl !== undefined) {
      const inLondon = (lat, lon) => lat > 51.2 && lat < 51.8 && lon > -0.7 && lon < 0.4;
      const segsOk = Array.isArray(tl && tl.segs) && tl.segs.length > 0 &&
        tl.segs.every((s) => Array.isArray(s) && s.length > 1 && s.every((p) => Array.isArray(p) && p.length === 2 && inLondon(p[0], p[1])));
      const stopsOk = Array.isArray(tl && tl.stops) && tl.stops.length >= 2 &&
        tl.stops.every((s) => Array.isArray(s) && s.length === 3 && typeof s[0] === "string" && inLondon(s[1], s[2]));
      if (segsOk && stopsOk) ok(`tramlink.json: ${tl.stops.length} stops + ${tl.segs.length} segments, all in-bounds`);
      else fail(`tramlink.json: must be { segs:[[[lat,lon],…]], stops:[[name,lat,lon],…] } with all coords inside Greater London — re-run tools/generate-tramlink.mjs`);
    }

    // london-loop.json: renderLondonLoop reads .sections[], each with n + from/to
    // + geom ([[lat,lon],…] footpath). Assert shape + London bounds so a malformed
    // regen can't draw an empty or mislocated orbital.
    const ll = parsed["london-loop.json"];
    if (ll !== undefined) {
      const inLondon = (lat, lon) => lat > 51.2 && lat < 51.8 && lon > -0.7 && lon < 0.4;
      const secs = ll && Array.isArray(ll.sections) ? ll.sections : null;
      const okSec = (s) =>
        has(s, ["n", "from", "to", "geom", "stops"]) && typeof s.n === "number" &&
        typeof s.from === "string" && typeof s.to === "string" &&
        Array.isArray(s.geom) && s.geom.length > 1 &&
        s.geom.every((p) => Array.isArray(p) && p.length === 2 && inLondon(p[0], p[1])) &&
        Array.isArray(s.stops) && s.stops.length >= 2 &&
        s.stops.every((p) => Array.isArray(p) && p.length === 4 && typeof p[0] === "string" && inLondon(p[1], p[2]) && typeof p[3] === "number");
      if (secs && secs.length >= 20 && secs.every(okSec)) ok(`london-loop.json: ${secs.length} sections, each with in-bounds geom + stops`);
      else fail(`london-loop.json: must be { sections:[{ n, from, to, geom:[[lat,lon],…], stops:[[name,lat,lon,alongKm],…] }] } (>=20 sections) inside Greater London — re-run tools/generate-london-loop.mjs`);
    }

    // capital-ring.json: same shape as london-loop.json (renderTrailSections reads
    // both). The Capital Ring is the LOOP's inner sibling — 15 sections.
    const cr = parsed["capital-ring.json"];
    if (cr !== undefined) {
      const inLondon = (lat, lon) => lat > 51.2 && lat < 51.8 && lon > -0.7 && lon < 0.4;
      const secs = cr && Array.isArray(cr.sections) ? cr.sections : null;
      const okSec = (s) =>
        has(s, ["n", "from", "to", "geom", "stops"]) && typeof s.n === "number" &&
        typeof s.from === "string" && typeof s.to === "string" &&
        Array.isArray(s.geom) && s.geom.length > 1 &&
        s.geom.every((p) => Array.isArray(p) && p.length === 2 && inLondon(p[0], p[1])) &&
        Array.isArray(s.stops) && s.stops.length >= 2 &&
        s.stops.every((p) => Array.isArray(p) && p.length === 4 && typeof p[0] === "string" && inLondon(p[1], p[2]) && typeof p[3] === "number");
      if (secs && secs.length >= 12 && secs.every(okSec)) ok(`capital-ring.json: ${secs.length} sections, each with in-bounds geom + stops`);
      else fail(`capital-ring.json: must be { sections:[{ n, from, to, geom:[[lat,lon],…], stops:[[name,lat,lon,alongKm],…] }] } (>=12 sections) inside Greater London — re-run tools/generate-capital-ring.mjs`);
    }

    // Remaining fetched artifacts are consumed as plain top-level arrays:
    // station-toilets → new Set(ids), facilities-water → [[lat,lon],…], bus-routes → id list.
    for (const f of ["station-toilets.json", "facilities-water.json", "bus-routes.json"]) {
      const v = parsed[f];
      if (v === undefined) continue;
      if (Array.isArray(v)) ok(`${f}: array of ${v.length}`);
      else fail(`${f}: expected a top-level array`);
    }
  }

  // --- i. WAYPOINTS vs the network JSON ---------------------------------------
  // The 4 lines with no `route` in tube-network.json hold their station
  // coordinates twice: in script.js WAYPOINTS, which the GPX tracer follows, and
  // in the network file, which the map draws. tools/generate-routes.mjs already
  // warns about the split, but that tool needs BRouter and is run by hand, so on
  // a normal commit nothing looks. Ported here with the same 40 m tolerance and
  // a second band: past 40 m the two sources disagree by more than the survey
  // noise between one entrance and another (warn); past 150 m they are naming
  // different places — a moved station or a mistyped digit — and the GPX starts
  // its leg from somewhere the runner isn't (fail).
  {
    const WP_SLUG = { Victoria: "victoria", Bakerloo: "bakerloo", Central: "central", Metropolitan: "metropolitan" };
    const TOL_WARN = 40, TOL_FAIL = 150; // metres
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    let checked = 0, drifted = 0, serious = 0, worst = 0, worstAt = "";
    for (const [key, slug] of Object.entries(WP_SLUG)) {
      const ln = tube[slug];
      if (!ln) { fail(`WAYPOINTS: ${key} has no "${slug}" entry in tube-network.json — the tracer and the map would be drawing different lines`); continue; }
      const byName = {};
      for (const id in ln.stations) byName[norm(ln.stations[id].n)] = ln.stations[id];
      for (const [name, lat, lon] of WAYPOINTS[key] || []) {
        const st = byName[norm(name)];
        if (!st) { fail(`WAYPOINTS: ${key} waypoint "${name}" is not a station in tube-network.json — one source has been renamed or re-ordered without the other`); continue; }
        checked++;
        const d = distM([lat, lon], [st.lat, st.lon]);
        if (d > worst) { worst = d; worstAt = `${key} "${name}"`; }
        if (d <= TOL_WARN) continue;
        drifted++;
        const where = `WAYPOINTS: ${key} "${name}" — script.js and tube-network.json place it ${Math.round(d)} m apart`;
        if (d > TOL_FAIL) {
          serious++;
          fail(`${where}, past the ${TOL_FAIL} m band where the two are no longer the same place — pick whichever is right and copy it into the other`);
        } else {
          warn(`${where} (over ${TOL_WARN} m)`);
        }
      }
    }
    if (!drifted) ok(`WAYPOINTS: ${checked} waypoints across ${Object.keys(WP_SLUG).length} lines sit within ${TOL_WARN} m of tube-network.json`);
    else ok(`WAYPOINTS: ${checked} waypoints checked, ${drifted} drifted over ${TOL_WARN} m (${serious} over ${TOL_FAIL} m; worst ${Math.round(worst)} m — ${worstAt})`);
  }

  // --- j. generated pages in step with index.html and sitemap.xml -------------
  // tools/generate-pages.mjs bakes index.html's ?v= into all 157 static pages
  // and rewrites sitemap.xml from exactly the set it wrote. Both couplings are
  // one-way and silent: a page left on an older ?v= serves whatever style.css a
  // returning visitor already has cached, and a sitemap that disagrees with the
  // directory either advertises 404s to the crawler or hides pages from it.
  {
    const pages = [];
    for (const dir of ["lines", "routes"]) {
      const base = join(ROOT, dir);
      if (!existsSync(base)) continue;
      if (existsSync(join(base, "index.html"))) pages.push(`${dir}/index.html`);
      for (const e of readdirSync(base, { withFileTypes: true })) {
        if (e.isDirectory() && existsSync(join(base, e.name, "index.html"))) pages.push(`${dir}/${e.name}/index.html`);
      }
    }
    if (!pages.length) {
      ok("generated pages: none on disk — nothing to check (run tools/generate-pages.mjs)");
    } else {
      const verOf = (text) => (text.match(/style\.css\?v=(\d+)/) || [, null])[1];
      const siteVer = verOf(readFileSync(join(ROOT, "index.html"), "utf8"));
      const byVer = new Map();
      for (const rel of pages) {
        const v = verOf(readFileSync(join(ROOT, rel), "utf8"));
        if (!byVer.has(v)) byVer.set(v, []);
        byVer.get(v).push(rel);
      }
      const spread = [...byVer.entries()].sort((a, b) => b[1].length - a[1].length);
      if (spread.length > 1) {
        // Mixed versions mean a regeneration was interrupted or only half staged:
        // some pages point at a stylesheet the rest don't.
        fail(`generated pages: ${pages.length} pages carry ${spread.length} different ?v= values (${spread.map(([v, f]) => `${f.length}×v=${v}`).join(", ")}) — a partial regeneration; re-run tools/generate-pages.mjs`);
      } else if (spread[0][0] !== siteVer) {
        // Uniformly behind is the known one-commit lag, not corruption: the hook
        // validates before it bumps, so failing here would block the very commit
        // that heals it. The hook now rewrites the pages too, so it converges.
        warn(`generated pages: all ${pages.length} are on ?v=${spread[0][0]} while index.html is on ?v=${siteVer} — the next commit touching them levels the two up`);
        ok(`generated pages: ${pages.length} pages agree on one ?v=`);
      } else {
        ok(`generated pages: ${pages.length} pages all on index.html's ?v=${siteVer}`);
      }
      const smPath = join(ROOT, "sitemap.xml");
      if (!existsSync(smPath)) fail("sitemap.xml: missing — the generated pages have no crawl path; re-run tools/generate-pages.mjs");
      else {
        const locs = (readFileSync(smPath, "utf8").match(/<loc>/g) || []).length;
        // +1 for the home page, which has no directory of its own.
        if (locs !== pages.length + 1) fail(`sitemap.xml: lists ${locs} URLs for ${pages.length} pages on disk + the home page (expected ${pages.length + 1}) — it advertises pages that aren't there or omits ones that are; re-run tools/generate-pages.mjs`);
        else ok(`sitemap.xml: ${locs} URLs = ${pages.length} generated pages + the home page`);
      }
    }
  }

  // --- k. routes/dlr.gpx carries the main branch only -------------------------
  // Two tools can write this file. tools/generate-dlr.mjs owns it: one <wpt> per
  // station of the DLR's MAIN branch (20 of the line's 45) over a de-spurred
  // track. tools/generate-routes.mjs skips the line for that reason, but the skip
  // is one line in a loop and section g passes either way — single trk/trkseg,
  // right termini, no long gaps all hold for the wrong file too. The waypoint
  // count is the one fingerprint that tells them apart: 45 means the other tool
  // ran. Expect this number to move only when the DLR itself gains a station.
  {
    const dlr = join(ROOT, "routes", "dlr.gpx");
    const WANT = 20;
    if (!existsSync(dlr)) {
      fail("routes/dlr.gpx: missing — re-run tools/generate-dlr.mjs");
    } else {
      const wpts = (readFileSync(dlr, "utf8").match(/<wpt\s/g) || []).length;
      if (wpts === WANT) ok(`routes/dlr.gpx: ${wpts} <wpt> — the main branch, as tools/generate-dlr.mjs writes it`);
      else fail(`routes/dlr.gpx: ${wpts} <wpt>, expected ${WANT} — that is the whole station list, not the main branch, so tools/generate-routes.mjs has overwritten the file (its de-spur pass is missing too); re-run tools/generate-dlr.mjs`);
    }
  }
} catch (e) {
  fail(e.message);
}

for (const w of warnings) console.error(`warn  ${w}`); // stderr, so the hook's quiet mode still shows them
if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`\nvalidate-data: ${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`\nvalidate-data: all checks passed${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`);
