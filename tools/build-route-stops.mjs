// Merge the book routes' named access points (geocoded waypoints, emitted by
// build-book-routes.mjs into each generated record's `stops`) into
// data/route-stops.json, so the Route ideas strip (renderRouteStrip) renders a
// horizontal access-point map for them like the original routes. Preserves the
// existing hand-curated entries.
//
//   node tools/build-route-stops.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STOPS = join(ROOT, "data/route-stops.json");
const gen = JSON.parse(readFileSync(join(ROOT, "data/book-routes-generated.json"), "utf8"));

const out = existsSync(STOPS) ? JSON.parse(readFileSync(STOPS, "utf8")) : {};
let added = 0;
for (const r of gen) {
  // De-dupe consecutive identical labels and require ≥2 points for a strip.
  const stops = (r.stops || []).filter((s, i, a) => i === 0 || s[0] !== a[i - 1][0]);
  if (stops.length >= 2) { out[r.id] = stops; added++; }
}
writeFileSync(STOPS, JSON.stringify(out));
console.log(`merged ${added} book routes into data/route-stops.json (now ${Object.keys(out).length} total)`);
