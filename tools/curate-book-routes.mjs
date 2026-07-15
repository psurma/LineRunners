// Combine the six region extraction files (data/book-src/region-*.json) from the
// "Runner's Guide to London" PDF, drop the runs that duplicate routes already in
// the site, and auto-derive the ROUTES metadata (id/type/start/leg/distance/
// suitability) for each new run. Writes data/book-routes-input.json — the input
// the tracer (build-book-routes.mjs) turns into pavement geometry.
//
//   node tools/curate-book-routes.mjs
//
// Type assignment here is heuristic; eyeball the printed id→type map and hand-fix
// data/book-routes-input.json before tracing if any look wrong.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data/book-src");
const REGIONS = ["central", "southeast", "southwest", "northwest", "northeast", "thames"];

// Book run names that duplicate a route already in ROUTES — dropped.
const DUP = new Set([
  "Battersea Park", "Kensington Gardens & Hyde Park", "St James's Park & Green Park",
  "Regent's Park & Primrose Hill", "Southwark Park & Docks", "Victoria Park",
  "The Grand Tour", "Diana Memorial Run", "Regent's Canal",
  "Clapham Common", "Wandsworth Common", "Wimbledon Common & Putney", "Richmond Park", "Bushy Park",
  "Greenwich Park & Blackheath", "Crystal Palace Park",
  "Grand Union Canal: Paddington Branch", // == existing grand-union-paddington
]);

// Hand corrections to the keyword type guess, keyed by generated id.
const OVERRIDE_TYPE = {
  "royal-docks-and-beckton-district-park": "landmark", "tower-bridge-and-greenwich-loop": "river",
  "sutcliffe-park": "park", "scadbury-park": "trail", "petts-wood": "trail",
  "lesnes-abbey-and-thamesmead": "trail", "oxleas-woods-and-shooters-hill": "trail",
  "hounslow-heath": "trail", "harmondsworth-moor": "trail", "cranford-country-park": "park",
  "southall-park": "park", "muswell-hill-playing-fields": "trail", "broomfield-park": "park",
  "eastbrookend-country-park": "trail", "hornchurch-country-park": "trail", "danson-park": "park",
  "peckham-rye-and-nunhead-cemetery": "park", "grovelands-park": "park", "west-ham-park": "park",
  "two-palaces-and-a-canal": "park", "stockley-and-lake-farm-country-parks": "trail",
  "horsenden-hill": "trail", "celandine-route": "river", "hackney-marshes": "trail",
};

const decode = (s) => (s || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const kebab = (s) => decode(s).toLowerCase().replace(/&/g, " and ").replace(/[''.,()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const titleStation = (w) => decode(w).replace(/\s+station$/i, " Station");
const cleanPlace = (w) => decode(w).replace(/\s+(DLR\s+)?station$/i, "").trim();

// Generic map-label waypoints that geocode badly — dropped before routing.
const GENERIC = /^(the )?(lake|lakes|ponds?|bandstand|cafe|clubhouse|car park|sports? field|playing fields?|tennis courts?|cricket (pitch|ground)|golf course|athletics track|meadow|walled garden|nature reserve|formal gardens?|boating lake|visitor centre|children's farm|turnaround|farmhouse)$/i;

function reformatDistance(d) {
  if (!d) return null;
  const mi = (d.match(/([\d.]+)\s*mi/) || [])[1];
  const km = (d.match(/([\d.]+)\s*k/) || [])[1];
  if (mi && km) return { text: `${mi} mi (${km} km)`, km: +km };
  if (km) return { text: `${km} km`, km: +km };
  return null;
}

function assignType(r) {
  const hay = `${r.name} ${r.area} ${(r.waypoints || []).join(" ")}`;
  if (r.region === "thames") return /bridges?\b|footbridge/i.test(r.name) ? "landmark" : "river";
  if (/\bcanal\b|navigation|towpath|\bcut\b/i.test(hay)) return "canal";
  if (/\bbridges?\b|footbridge|maritime|grand tour/i.test(r.name)) return "landmark";
  if (/thames|riverway|waterlink|greenway|\briver\b|\bbrook\b|\blea\b|wandle|\bcray\b|celandine|beverley|dollis|pymmes|brent river|colne/i.test(hay)) return "river";
  if (/common|heath|\bwood|forest|\bdown|country park|\bmoor|marsh|\bhill\b|nature reserve|scrubs|\bflats\b|greenwalk|chase/i.test(hay)) return "trail";
  return "park";
}

function startOf(r) {
  const st = (r.waypoints || []).find((w) => /station$/i.test(w));
  if (st) return titleStation(st);
  const area = decode(r.area).split(/ (?:to|&|and) /)[0].trim();
  return area;
}

function legOf(r) {
  const wps = (r.waypoints || []).map(cleanPlace).filter(Boolean);
  if (!r.loop && wps.length >= 2) return `${wps[0]} → ${wps[wps.length - 1]}`;
  const area = decode(r.area).split(/ (?:to|&|and) /)[0].trim();
  return `${area} loop`;
}

function suitabilityOf(r) {
  const terr = r.terrain ? decode(r.terrain)[0].toUpperCase() + decode(r.terrain).slice(1) : "";
  return `${terr ? terr + ". " : ""}Indicative line traced from the Runner's Guide to London (2015).`;
}

const existingIds = new Set();
try {
  const gj = JSON.parse(readFileSync(join(ROOT, "data/routes.geojson"), "utf8"));
  for (const f of gj.features) existingIds.add(f.properties.id);
} catch { /* none */ }

const out = [];
const usedIds = new Set(existingIds);
for (const region of REGIONS) {
  const runs = JSON.parse(readFileSync(join(SRC, `region-${region}.json`), "utf8"));
  for (const r of runs) {
    if (DUP.has(r.name)) continue;
    if (!r.distance) continue; // skip composite non-routes (e.g. distance matrix)
    r.region = region;
    let id = kebab(r.name);
    while (usedIds.has(id)) id = id + "-x";
    usedIds.add(id);
    const dist = reformatDistance(r.distance);
    const wps = (r.waypoints || []).map(decode).filter((w) => !GENERIC.test(w.trim()));
    out.push({
      id,
      name: decode(r.name),
      type: OVERRIDE_TYPE[id] || assignType(r),
      region,
      area: decode(r.area),
      postcode: r.postcode ? decode(r.postcode).split(/[ ,]/)[0] : null, // outward code only
      start: startOf(r),
      leg: legOf(r),
      distance: dist ? dist.text : r.distance,
      bookKm: dist ? dist.km : null,
      loop: !!r.loop,
      highlights: decode(r.highlights),
      suitability: suitabilityOf(r),
      waypoints: wps,
    });
  }
}

writeFileSync(join(ROOT, "data/book-routes-input.json"), JSON.stringify(out, null, 2));
const byType = {};
for (const r of out) (byType[r.type] ||= []).push(r.id);
console.log(`${out.length} new routes -> data/book-routes-input.json\n`);
for (const [t, ids] of Object.entries(byType)) console.log(`${t} (${ids.length}): ${ids.join(", ")}`);
