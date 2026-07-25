// Shared BRouter client for the route-generation tools. Ten scripts used to
// carry their own copy-pasted fetch helper with slightly different retry and
// profile handling; the most battle-tested variant (snap-race-routes /
// build-book-routes) lives here and the rest parameterise it. Callers keep
// their own pacing sleeps and any straight-chord fallback loops — those are
// per-script policy, not client behaviour.
//
//   brouterRaw(points, profile, opts)   one request; throws kind-tagged errors:
//     "island" = permanently unroutable point ("target island detected", not
//     mapped, unreachable...), "route" = valid reply with no route, "net" =
//     transient (retry-worthy). Returns [[lon, lat, ele], ...].
//   brouterTry(points, profiles, opts)  profiles is an ordered [profile, tries]
//     list: try each in turn, retrying only transient failures with backoff,
//     moving to the next profile on a permanent one. Resolves null when all fail.
//   routeThrough(points, profiles, opts) whole path in one request; on failure a
//     greedy per-leg pass that SKIPS unroutable waypoints (never draws a chord).
//     routeThrough.lastSkipped reports how many were skipped. Null if <2 legs land.
//
// Points are [lat, lon] pairs or { lat, lon } objects. `opts.userAgent` names
// the calling tool to the public brouter.de instance.

const BROUTER = "https://brouter.de/brouter";
const DEFAULT_UA = "Overland/1.0 (route tools; https://psurma.github.io/Overland)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lonlat = (p) => (Array.isArray(p) ? `${p[1]},${p[0]}` : `${p.lon},${p.lat}`);

export async function brouterRaw(points, profile, { userAgent = DEFAULT_UA } = {}) {
  const lonlats = points.map(lonlat).join("|");
  const res = await fetch(`${BROUTER}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`, { headers: { "User-Agent": userAgent } });
  const text = await res.text();
  if (text[0] === "{") {
    let gj;
    try { gj = JSON.parse(text); } catch { throw Object.assign(new Error(`non-JSON (${res.status}): ${text.slice(0, 120)}`), { kind: "net" }); }
    if (gj.features && gj.features[0]) return gj.features[0].geometry.coordinates; // [lon, lat, ele]
    throw Object.assign(new Error(`no route: ${text.slice(0, 120)}`), { kind: "route" });
  }
  // BRouter emits plain-text errors like "target island detected for section 0"
  const permanent = /island|not mapped|not routable|unreachable|too far/i.test(text);
  throw Object.assign(new Error(text.slice(0, 90) || `HTTP ${res.status}`), { kind: permanent ? "island" : "net" });
}

export async function brouterTry(points, profiles, opts = {}) {
  for (const [profile, tries] of profiles) {
    for (let a = 0; a < tries; a++) {
      try { return await brouterRaw(points, profile, opts); }
      catch (e) {
        if (e.kind === "island" || e.kind === "route") break; // permanent — try the next profile
        await sleep(800 * (a + 1)); // transient — back off
      }
    }
  }
  return null;
}

export async function routeThrough(pts, profiles, opts = {}) {
  const full = await brouterTry(pts, profiles, opts);
  if (full) { routeThrough.lastSkipped = 0; return full; }
  // Always route from `cur` — the last successfully-placed point — so skipping an
  // unroutable waypoint never leaves a straight-line jump; the path stays continuous.
  const out = [];
  let skipped = 0, cur = pts[0];
  for (let k = 1; k < pts.length; k++) {
    const seg = await brouterTry([cur, pts[k]], profiles, opts);
    await sleep(200);
    if (seg && seg.length >= 2) { out.push(...(out.length ? seg.slice(1) : seg)); cur = pts[k]; }
    else if (out.length === 0) { cur = pts[k]; skipped++; } // the seed itself islanded — reseed
    else skipped++; // cur is known-good, so pts[k] is the island — skip it, keep cur
  }
  routeThrough.lastSkipped = skipped;
  return out.length >= 2 ? out : null;
}
