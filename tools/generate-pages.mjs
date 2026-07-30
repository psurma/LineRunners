// Generate the static, crawlable pages the single-page app can't be.
//
// Everything the site knows lives behind JavaScript: a crawler asking for the
// home page gets the hero and the nav, and none of the 29 line routes or 126
// named routes underneath. One URL can only rank for one intent, so somebody
// searching "running the victoria line" has nowhere to land. This writes a real
// page per line and per route from the data the app already ships:
//
//   lines/            hub listing every line
//   lines/<slug>/     one line: distance, stations end to end, GPX, map link
//   routes/           hub listing every named route, grouped by kind
//   routes/<id>/      one route: distance, terrain notes, nearby pubs
//
// Each page is plain HTML with no script — the content is in the markup, which
// is the whole point. They link back into the app (routes deep-link straight to
// their card via #routes/<id>) and sideways to their siblings, so a crawler that
// finds one finds all of them. sitemap.xml is rewritten to match.
//
// Run after any change to ROUTES or the network data:
//   node tools/generate-pages.mjs
//
// Regenerating is safe and idempotent: every managed directory is rewritten from
// scratch, so a renamed or deleted route stops having a page.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractLiteral } from "./lib/extract.mjs";
import { distM } from "./lib/geo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://psurma.github.io/LineRunners";
const BRAND = "Line Runners";

const src = readFileSync(join(ROOT, "script.js"), "utf8");
const ROUTES = extractLiteral(src, "ROUTES");
const LINE_STATS = extractLiteral(src, "LINE_STATS");
const GPX_LINES = new Set(extractLiteral(src, "GPX_LINES"));
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const tube = readJson("data/tube-network.json");
const nr = readJson("data/nr-network.json");
const pubs = readJson("data/route-pubs.json");

// Share the app's cache-buster so a style change reaches these pages too — the
// pre-commit hook only rewrites index.html.
const ver = (/style\.css\?v=(\d+)/.exec(readFileSync(join(ROOT, "index.html"), "utf8")) || [, "1"])[1];

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// JSON-LD goes inside a <script> block, and JSON.stringify escapes neither "<"
// nor "</script" — a route name or description carrying one would close the
// block early and spill the rest of the schema into the document as markup.
// esc() is the wrong tool here: HTML entities inside a ld+json block corrupt the
// JSON for the crawler that reads it. The < escape stays valid JSON, parses
// back to "<", and cannot close the tag.
const ldJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
// The data carries HTML entities (&mdash;, &rsquo;) written for innerHTML. They
// are already valid in markup, so unescape them back after the blanket escape.
const rich = (s) => esc(s).replace(/&amp;([a-z]+|#\d+);/gi, "&$1;");
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Strip the markup entities out of a data string so it reads as plain prose in a
// <title> or description, where they would otherwise show up literally.
const plain = (s) => String(s == null ? "" : s)
  .replace(/<[^>]*>/g, "")
  .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&rsquo;/g, "’")
  .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
  .replace(/&[a-z]+;/gi, " ")
  .replace(/\s+/g, " ").trim();
// Google truncates descriptions around 155 characters, so cut at a word boundary
// rather than letting it clip mid-sentence in the results page.
function clamp(s, max = 155) {
  const t = plain(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:—–-]$/, "") + "…";
}

// --- distances --------------------------------------------------------------
// Track 0 of each GPX is the stitched main route, so its length is the real
// pavement distance rather than a crow-flies estimate.
function gpxKm(slug) {
  const p = join(ROOT, "routes", `${slug}.gpx`);
  if (!existsSync(p)) return null;
  const xml = readFileSync(p, "utf8");
  const seg = xml.split("<trkseg>")[1];
  if (!seg) return null;
  const pts = [...seg.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
  if (pts.length < 2) return null;
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += distM(pts[i - 1], pts[i]) / 1000;
  return km;
}
const statKm = new Map(LINE_STATS.map((s) => [s[0], s[1]]));
const km2mi = (km) => km / 1.609344;
const fmtDist = (km) => `${km.toFixed(1)} km (${km2mi(km).toFixed(1)} miles)`;

// --- lines ------------------------------------------------------------------
// route[] is the curated end-to-end run where it exists; where it is absent the
// longest branch is the line's spine, which is the same fallback the app uses.
function lineSpine(line) {
  if (Array.isArray(line.route) && line.route.length > 1) return line.route;
  return (line.branches || []).reduce((a, b) => (b.length > (a || []).length ? b : a), []);
}

const lines = [];
for (const [slug, line] of [...Object.entries(tube), ...Object.entries(nr)]) {
  const spine = lineSpine(line);
  const names = spine.map((id) => line.stations[id] && line.stations[id].n).filter(Boolean);
  if (names.length < 2) continue;
  const km = gpxKm(slug) ?? statKm.get(line.name) ?? null;
  lines.push({
    slug, name: line.name, colour: line.colour || "#0b1236",
    kind: tube[slug] ? "tfl" : "rail",
    stations: Object.keys(line.stations).length,
    spineStations: names, from: names[0], to: names[names.length - 1],
    branches: (line.branches || []).length, km,
    gpx: GPX_LINES.has(slug) ? `routes/${slug}.gpx` : null,
  });
}
lines.sort((a, b) => a.name.localeCompare(b.name));

// --- routes -----------------------------------------------------------------
const TYPE_LABEL = {
  canal: "Canal towpath", river: "Riverside", park: "Park", trail: "Trail",
  landmark: "Landmark", disused: "Disused railway", race: "Race route",
};
const routes = ROUTES.filter((r) => r.id && r.name).map((r) => ({
  ...r,
  typeLabel: TYPE_LABEL[r.type] || titleCase(r.type || "route"),
  pubs: (pubs[r.id] || []).slice(0, 4),
}));

// --- page shell -------------------------------------------------------------
// depth is how many directories down the page sits, so the asset links resolve
// from lines/<slug>/ as well as from lines/.
//
// The CSP is a <meta> rather than a header because GitHub Pages serves these
// files with no security headers at all and gives us nowhere to set one. It can
// be this strict — script-src 'none' and no frames, forms or plugins — because
// the pages deliberately run no script of their own; the only <script> here is
// the application/ld+json data block, which is not executable content and so is
// not governed by script-src (index.html already ships the same pairing).
// 'unsafe-inline' on style-src is unavoidable: the shell carries an inline
// <style> and the body sets inline background colours on the line swatches.
function shell({ depth, title, desc, canonical, schema, body, crumbs }) {
  const up = "../".repeat(depth);
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${BRAND}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${SITE}/img/icon-512.png" />
  <meta name="twitter:card" content="summary" />
  <link rel="icon" href="${up}img/favicon-32.png" sizes="32x32" type="image/png" />
  <link rel="icon" href="${up}img/logo.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="${up}vendor/fonts/fonts.css?v=${ver}" />
  <link rel="stylesheet" href="${up}style.css?v=${ver}" />
  <style>
    /* The app pads the body for its fixed header from JavaScript; these pages run
       no script, so a fixed header would sit on top of the h1. Their header also
       carries no text inputs, so the typing-scroll bug that fixed positioning
       exists to avoid cannot apply here. */
    .site-header { position: static; }
    .pg { max-width: 860px; margin: 0 auto; padding: 28px 20px 64px; }
    .pg-crumbs { font-size: 13.5px; color: #5a6572; margin-bottom: 18px; }
    .pg-crumbs a { color: #5a6572; }
    .pg h1 { font-family: var(--font-display); font-size: clamp(30px, 5vw, 44px); line-height: 1.1; margin-bottom: 10px; }
    .pg .lede { font-size: 17px; color: #2b3140; margin-bottom: 22px; }
    .pg h2 { font-family: var(--font-display); font-size: 22px; margin: 30px 0 12px; }
    .pg-facts { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 6px; padding: 0; list-style: none; }
    .pg-facts li { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 9px 13px; font-size: 14px; }
    .pg-facts b { display: block; font-size: 12px; color: #5a6572; font-weight: 600; }
    .pg-stops { columns: 3 190px; gap: 18px; padding-left: 20px; font-size: 14.5px; line-height: 1.75; }
    .pg-cta { display: flex; flex-wrap: wrap; gap: 10px; margin: 24px 0 8px; }
    .pg-list { list-style: none; padding: 0; display: grid; gap: 8px; }
    .pg-list a { display: block; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 11px 14px; text-decoration: none; }
    .pg-list a:hover { border-color: var(--tfl-blue); }
    .pg-list .m { color: #5a6572; font-size: 13.5px; }
    .pg-swatch { display: inline-block; width: 11px; height: 11px; border-radius: 3px; vertical-align: -1px; margin-right: 7px; }
    .pg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
    @media (max-width: 640px) { .pg-stops { columns: 1; } }
  </style>
  <script type="application/ld+json">${ldJson(schema)}</script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="${up}" aria-label="${BRAND} — home">
      <img class="brand-icon" src="${up}img/logo.svg" alt="" width="42" height="42" />
      <span class="brand-word">${BRAND}</span>
    </a>
    <nav class="nav">
      <a href="${up}">Home</a>
      <a href="${up}lines/">Lines</a>
      <a href="${up}routes/">Routes</a>
      <a href="${up}#network">Map</a>
      <a href="${up}#journey">Plan a run</a>
    </nav>
  </header>
  <main class="pg">
    <nav class="pg-crumbs" aria-label="Breadcrumb">${crumbs}</nav>
${body}
  </main>
  <footer class="site-footer">
    <p>${BRAND} &middot; a guide to running London above ground.</p>
  </footer>
</body>
</html>
`;
}

const crumb = (up, trail) =>
  [`<a href="${up}">${BRAND}</a>`, ...trail].join(" &rsaquo; ");

// --- write ------------------------------------------------------------------
const urls = [];
function emit(relDir, html) {
  const dir = join(ROOT, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
  urls.push(`${SITE}/${relDir}/`);
}
// Nothing past this point is recoverable: the loop below clears every managed
// directory and the writes rebuild them from `lines` and `routes`. Neither array
// is asserted anywhere upstream — an empty or malformed-but-parseable
// tube-network.json parses fine, yields nothing, and this would then delete 157
// tracked pages, shrink sitemap.xml to the home page and patch index.html's
// footer to "all 0 lines", all on a zero exit. Refuse to destroy what we cannot
// rebuild, the same way the TfL fetchers do (generate-tramlink, generate-superloop).
if (!lines.length || !routes.length) {
  console.error(`generate-pages: parsed ${lines.length} lines and ${routes.length} routes from script.js + data/ — aborting before the rewrite. Existing lines/, routes/, sitemap.xml and index.html left untouched.`);
  process.exit(1);
}
// Rewrite from scratch so a deleted route loses its page instead of lingering.
for (const d of ["lines", "routes"]) {
  const p = join(ROOT, d);
  if (!existsSync(p)) continue;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.isDirectory()) rmSync(join(p, e.name), { recursive: true, force: true });
  }
}
if (existsSync(join(ROOT, "lines", "index.html"))) rmSync(join(ROOT, "lines", "index.html"));
if (existsSync(join(ROOT, "routes", "index.html"))) rmSync(join(ROOT, "routes", "index.html"));

// ---- line pages
for (const l of lines) {
  const sibs = lines.filter((x) => x.slug !== l.slug && x.kind === l.kind).slice(0, 12);
  const dist = l.km ? fmtDist(l.km) : null;
  const desc = clamp(`Run the ${l.name} ${l.kind === "tfl" ? "line" : "route"} above ground: ${l.from} to ${l.to}`
    + (dist ? `, ${dist}` : "") + `, ${l.spineStations.length} stations. Free street-by-street route and GPX for your watch.`);
  const title = `Running the ${l.name} line${dist ? ` — ${l.km.toFixed(1)} km` : ""} | ${BRAND}`;
  const body = `    <h1>Running the ${esc(l.name)} line</h1>
    <p class="lede">${esc(l.from)} to ${esc(l.to)}, traced street by street above ground${dist ? ` — ${esc(dist)}` : ""}. Run it end to end, or pick up any stretch you like: the route passes a station the whole way, so you can join and leave wherever suits.</p>
    <ul class="pg-facts">
      ${dist ? `<li><b>Distance</b>${esc(dist)}</li>` : ""}
      <li><b>Stations end to end</b>${l.spineStations.length}</li>
      <li><b>Stations on the line</b>${l.stations}</li>
      ${l.branches > 1 ? `<li><b>Branches</b>${l.branches}</li>` : ""}
      <li><b>Start</b>${esc(l.from)}</li>
      <li><b>Finish</b>${esc(l.to)}</li>
    </ul>
    <div class="pg-cta">
      <a class="btn btn-primary" href="../../#network">Open the interactive map</a>
      ${l.gpx ? `<a class="btn btn-outline" href="../../${l.gpx}" download>Download the GPX</a>` : ""}
    </div>
    <h2>Every station, end to end</h2>
    <ol class="pg-stops">${l.spineStations.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>
    <h2>Plan your run</h2>
    <p>Use the <a href="../../#journey">journey planner</a> to trace a route between any two stations on the network, or the <a href="../../#plan">distance planner</a> to work out how long a stretch of the ${esc(l.name)} line will take at your pace. Every route is free, self-guided and has no signup.</p>
    <h2>Other ${l.kind === "tfl" ? "lines" : "rail routes"} to run</h2>
    <ul class="pg-list pg-grid">
      ${sibs.map((s) => `<li><a href="../${esc(s.slug)}/"><span class="pg-swatch" style="background:${esc(s.colour)}"></span>${esc(s.name)}${s.km ? ` <span class="m">${s.km.toFixed(1)} km</span>` : ""}</a></li>`).join("\n      ")}
    </ul>
    <p style="margin-top:18px"><a href="../">All ${lines.length} lines</a> &middot; <a href="../../routes/">All ${routes.length} named routes</a></p>`;
  emit(`lines/${l.slug}`, shell({
    depth: 2, title, desc, canonical: `${SITE}/lines/${l.slug}/`,
    crumbs: crumb("../../", [`<a href="../">Lines</a>`, esc(l.name)]),
    schema: {
      "@context": "https://schema.org", "@type": "ExercisePlan",
      name: `Running the ${l.name} line`, description: desc,
      url: `${SITE}/lines/${l.slug}/`, isAccessibleForFree: true,
      activityDuration: undefined, exerciseType: "Running",
      ...(l.km ? { distance: `${l.km.toFixed(1)} km` } : {}),
    },
    body,
  }));
}

// ---- route pages
for (const r of routes) {
  const sibs = routes.filter((x) => x.id !== r.id && x.type === r.type).slice(0, 12);
  const desc = clamp(`${plain(r.name)}: ${plain(r.leg) || r.typeLabel} in London`
    + (r.distance ? `, ${plain(r.distance)}` : "") + `. ${plain(r.highlights)}`);
  // Nesting the distance in brackets reads badly when the value already carries
  // its own — "(4.5 mi (7.3 km))" — so keep the title clean and let the
  // description carry the number.
  const title = `${plain(r.name)} — London running route | ${BRAND}`;
  const body = `    <h1>${rich(r.name)}</h1>
    <p class="lede">${rich(r.highlights || "")}</p>
    <ul class="pg-facts">
      <li><b>Type</b>${esc(r.typeLabel)}</li>
      ${r.distance ? `<li><b>Distance</b>${rich(r.distance)}</li>` : ""}
      ${r.leg ? `<li><b>Route</b>${rich(r.leg)}</li>` : ""}
      ${r.start ? `<li><b>Start</b>${rich(r.start)}</li>` : ""}
      <li><b>Shape</b>${r.loop ? "Loop — finishes where it starts" : "Point to point"}</li>
    </ul>
    <div class="pg-cta">
      <a class="btn btn-primary" href="../../#routes/${esc(r.id)}">See it on the map</a>
    </div>
    ${r.suitability ? `<h2>Who it suits</h2>\n    <p>${rich(r.suitability)}</p>` : ""}
    ${r.pubs.length ? `<h2>A pint at the end</h2>
    <ul class="pg-list">${r.pubs.map((p) => `<li><a href="../../#routes/${esc(r.id)}">${rich(p.n)}<span class="m"> &middot; near the ${esc(p.end === "start" ? "start" : "finish")}</span></a></li>`).join("")}</ul>` : ""}
    <h2>More ${esc(r.typeLabel.toLowerCase())} routes</h2>
    <ul class="pg-list pg-grid">
      ${sibs.map((s) => `<li><a href="../${esc(s.id)}/">${rich(s.name)}${s.distance ? ` <span class="m">${rich(s.distance)}</span>` : ""}</a></li>`).join("\n      ")}
    </ul>
    <p style="margin-top:18px"><a href="../">All ${routes.length} routes</a> &middot; <a href="../../lines/">All ${lines.length} lines</a></p>`;
  emit(`routes/${r.id}`, shell({
    depth: 2, title, desc, canonical: `${SITE}/routes/${r.id}/`,
    crumbs: crumb("../../", [`<a href="../">Routes</a>`, rich(r.name)]),
    schema: {
      "@context": "https://schema.org", "@type": "ExercisePlan",
      name: r.name, description: desc, url: `${SITE}/routes/${r.id}/`,
      isAccessibleForFree: true, exerciseType: "Running",
    },
    body,
  }));
}

// ---- hubs
const linesByKind = { tfl: lines.filter((l) => l.kind === "tfl"), rail: lines.filter((l) => l.kind === "rail") };
emit("lines", shell({
  depth: 1,
  title: `Run every London line — all ${lines.length} routes above ground | ${BRAND}`,
  desc: `Street-by-street running routes for all ${lines.length} London lines: every Tube, Overground, DLR and Elizabeth line plus the National Rail commuter routes. Distances, stations and free GPX.`,
  canonical: `${SITE}/lines/`,
  crumbs: crumb("../", ["Lines"]),
  schema: {
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: "Every London line, run above ground", url: `${SITE}/lines/`,
    numberOfItems: lines.length,
  },
  body: `    <h1>Run every line, above ground</h1>
    <p class="lede">All ${lines.length} London lines traced street by street: every Tube, Overground, DLR and Elizabeth line, plus the National Rail commuter routes out of town. Pick one, take the distance and the GPX, and run it end to end at your own pace.</p>
    <h2>TfL lines (${linesByKind.tfl.length})</h2>
    <ul class="pg-list pg-grid">
      ${linesByKind.tfl.map((l) => `<li><a href="${esc(l.slug)}/"><span class="pg-swatch" style="background:${esc(l.colour)}"></span>${esc(l.name)}<span class="m"> &middot; ${l.km ? `${l.km.toFixed(1)} km &middot; ` : ""}${l.spineStations.length} stations</span></a></li>`).join("\n      ")}
    </ul>
    <h2>National Rail routes (${linesByKind.rail.length})</h2>
    <ul class="pg-list pg-grid">
      ${linesByKind.rail.map((l) => `<li><a href="${esc(l.slug)}/"><span class="pg-swatch" style="background:${esc(l.colour)}"></span>${esc(l.name)}<span class="m"> &middot; ${l.km ? `${l.km.toFixed(1)} km &middot; ` : ""}${l.spineStations.length} stations</span></a></li>`).join("\n      ")}
    </ul>
    <p style="margin-top:20px">Looking for parks, canals and riverside instead? See <a href="../routes/">all ${routes.length} named routes</a>.</p>`,
}));

const byType = {};
for (const r of routes) (byType[r.typeLabel] = byType[r.typeLabel] || []).push(r);
emit("routes", shell({
  depth: 1,
  title: `${routes.length} London running routes — parks, canals, rivers and trails | ${BRAND}`,
  desc: `${routes.length} free running routes across London: park loops, canal towpaths, riverside paths, disused railways and long-distance trails, each with distance, terrain notes and a map.`,
  canonical: `${SITE}/routes/`,
  crumbs: crumb("../", ["Routes"]),
  schema: {
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: "London running routes", url: `${SITE}/routes/`, numberOfItems: routes.length,
  },
  body: `    <h1>${routes.length} London running routes</h1>
    <p class="lede">Park loops, canal towpaths, riverside paths, disused railways and long-distance trails — every one free, self-guided and mapped street by street.</p>
${Object.entries(byType).sort((a, b) => b[1].length - a[1].length).map(([label, rs]) => `    <h2>${esc(label)} (${rs.length})</h2>
    <ul class="pg-list pg-grid">
      ${rs.map((r) => `<li><a href="${esc(r.id)}/">${rich(r.name)}${r.distance ? `<span class="m"> &middot; ${rich(r.distance)}</span>` : ""}</a></li>`).join("\n      ")}
    </ul>`).join("\n")}
    <p style="margin-top:20px">Want to run the network itself? See <a href="../lines/">all ${lines.length} lines</a>.</p>`,
}));

// ---- sitemap
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${urls.sort().map((u) => `  <url>
    <loc>${u}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${/\/(lines|routes)\/$/.test(u) ? "0.8" : "0.6"}</priority>
  </url>`).join("\n")}
</urlset>
`);

// Keep the home page's footer counts honest — it is the only crawl path into the
// hubs, and a hand-typed number here goes stale the moment a route is added.
const idxPath = join(ROOT, "index.html");
const idx = readFileSync(idxPath, "utf8");
const browse = `<p class="foot-browse">Browse every route: <a href="lines/">all ${lines.length} lines</a> &middot; <a href="routes/">all ${routes.length} named routes</a></p>`;
const patched = idx.replace(/<p class="foot-browse">.*?<\/p>/s, browse);
if (patched !== idx) writeFileSync(idxPath, patched);
else if (!idx.includes("foot-browse")) console.warn("generate-pages: WARNING no .foot-browse in index.html — hubs are unlinked and will not be crawled");

console.log(`generate-pages: ${lines.length} line pages, ${routes.length} route pages, 2 hubs`);
console.log(`generate-pages: sitemap.xml now lists ${urls.length + 1} URLs`);
