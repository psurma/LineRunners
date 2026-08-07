// Write a compact JSON copy of each route beside its GPX, for the site to read.
//
// GitHub Pages compresses CSS, JavaScript and JSON, but not .gpx — that type is
// not on its compressible list and the list cannot be configured. So the 29 files
// in routes/ ship exactly as they sit on disk: 4.5 MB in total, and viewing one
// National Rail line downloads up to 432 KB. The site does not even want the XML.
// loadRouteGpx in script.js parses each file down to arrays of [lat, lon, ele]
// and throws the document away, so every byte of tag overhead is paid for nothing.
//
// This writes routes/<slug>.json holding exactly the structure loadRouteGpx
// builds — an array of track segments, each an array of points — so the site can
// fetch that instead and get it gzipped. The .gpx files are left untouched and
// remain the download format, because that is what running watches import.
//
//   node tools/generate-route-json.mjs [--dry-run]
//
// Derived from the GPX on disk rather than from the routing API, so it is fast,
// needs no network, and cannot disagree with the file it came from. Re-run it
// after any tool rewrites a GPX.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_DIR = join(ROOT, "routes");
const dry = process.argv.includes("--dry-run");

// Five decimal places is about 1.1 m at London's latitude — finer than the
// routing itself resolves, and the precision every other generated file here
// uses. Elevation to one decimal is well inside the source data's accuracy.
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const r1 = (n) => Math.round(n * 10) / 10;

function segmentsFromGpx(xml) {
  const out = [];
  // The files are machine-written with one trkpt per line, so a scan is enough
  // and avoids pulling in an XML parser for a build step that has no dependencies.
  for (const block of xml.split("<trkseg>").slice(1)) {
    const seg = block.split("</trkseg>")[0];
    const pts = [];
    const re = /<trkpt lat="([-\d.]+)" lon="([-\d.]+)"(?:\s*\/>|>(?:<ele>([-\d.]+)<\/ele>)?)/g;
    let m;
    while ((m = re.exec(seg))) {
      const lat = r5(+m[1]), lon = r5(+m[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      // A point with no elevation is written as a pair, so reading index 2 gives
      // undefined exactly as the XML path did.
      pts.push(m[3] !== undefined ? [lat, lon, r1(+m[3])] : [lat, lon]);
    }
    if (pts.length > 1) out.push(pts);
  }
  return out;
}

const gpxFiles = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".gpx")).sort();
let written = 0, rawIn = 0, rawOut = 0;
const rows = [];

for (const file of gpxFiles) {
  const slug = file.replace(/\.gpx$/, "");
  const gpxPath = join(ROUTES_DIR, file);
  const xml = readFileSync(gpxPath, "utf8");
  const segs = segmentsFromGpx(xml);
  if (!segs.length) {
    console.error(`generate-route-json: ${file} yielded no track segments — aborting, existing JSON left untouched.`);
    process.exit(1);
  }
  const json = JSON.stringify(segs);
  const inB = statSync(gpxPath).size;
  rawIn += inB;
  rawOut += Buffer.byteLength(json);
  rows.push([slug, inB, Buffer.byteLength(json), segs.length, segs.reduce((n, s) => n + s.length, 0)]);
  if (!dry) { writeFileSync(join(ROUTES_DIR, `${slug}.json`), json); written++; }
}

rows.sort((a, b) => b[1] - a[1]);
for (const [slug, inB, outB, nSeg, nPts] of rows.slice(0, 6)) {
  console.log(`  ${slug.padEnd(24)} ${(inB / 1024).toFixed(0).padStart(5)} KB gpx -> ${(outB / 1024).toFixed(0).padStart(5)} KB json  (${nSeg} segs, ${nPts} pts)`);
}
console.log(`  … ${rows.length} files total`);
console.log(`\ngpx on disk:  ${(rawIn / 1024 / 1024).toFixed(2)} MB (served uncompressed)`);
console.log(`json written: ${(rawOut / 1024 / 1024).toFixed(2)} MB (served gzipped)`);
console.log(dry ? "\ndry run — nothing written" : `\n${written} JSON files written.`);
