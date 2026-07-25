// Merge the traced book routes into script.js's ROUTES array as inline entries,
// in the region that follows the last hand-written entry (id "vitality-10k").
// The merge is by id, so re-running is safe: a generated route replaces the
// entry with the same id in place, a genuinely new one is appended, and any
// entry already in the region that the generator no longer produces is left
// exactly as it is. Ids that a hand-written entry above the anchor already owns
// are skipped rather than appended, so ROUTES can never gain a duplicate id.
// Field order mirrors the existing entries. Run AFTER build-book-routes.mjs.
//
//   node tools/splice-routes.mjs [--dry-run]
//
// --dry-run reports what would be replaced / appended / kept / skipped and
// writes nothing.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "script.js");
const dryRun = process.argv.includes("--dry-run");
const gen = JSON.parse(readFileSync(join(ROOT, "data/book-routes-generated.json"), "utf8"));
if (!gen.length) { console.error("no generated routes; aborting"); process.exit(1); }

const s = (v) => JSON.stringify(v);
// A field the generator didn't produce is omitted rather than emitted as the
// literal `undefined` (JSON.stringify(undefined) is not a string).
const field = (k, v) => (v === undefined ? "" : `${k}: ${s(v)}, `);
const entry = (r) => {
  const path = "[" + r.path.map((p) => `[${p[0]}, ${p[1]}]`).join(", ") + "]";
  return `    { id: ${s(r.id)}, name: ${s(r.name)}, type: ${s(r.type)}, leg: ${s(r.leg)}, start: ${s(r.start)}, distance: ${s(r.distance)}, ${field("highlights", r.highlights)}${field("suitability", r.suitability)}loop: ${r.loop}, path: ${path} },`;
};

const src = readFileSync(SCRIPT, "utf8");
const lines = src.split("\n");
const open = lines.findIndex((l) => /^\s*const ROUTES = \[\s*$/.test(l));
if (open < 0) { console.error("ROUTES declaration not found"); process.exit(1); }
// Anchor on the last hand-written ROUTES entry; the book routes live between it
// and the array's closing "];".
const anchor = lines.findIndex((l) => l.includes('id: "vitality-10k"'));
if (anchor < 0) { console.error("anchor line (vitality-10k) not found"); process.exit(1); }
let close = -1;
for (let i = anchor + 1; i < lines.length; i++) { if (/^\s*\];\s*$/.test(lines[i])) { close = i; break; } }
if (close < 0) { console.error("ROUTES closing ]; not found"); process.exit(1); }

const idOf = (l) => { const m = l.match(/\bid:\s*"([^"]+)"/); return m ? m[1] : null; };

// Ids owned by the hand-written entries at or above the anchor. Those entries
// are outside the merge region and must never be duplicated below it.
const above = new Set();
for (let i = open + 1; i <= anchor; i++) { const id = idOf(lines[i]); if (id) above.add(id); }

// Where each id sits inside the region, so a regenerated route lands back on its
// own line instead of at the end.
const region = lines.slice(anchor + 1, close);
const at = new Map();
region.forEach((l, i) => { const id = idOf(l); if (id && !at.has(id)) at.set(id, i); });

const merged = region.slice();
const replaced = [], appended = [], skipped = [];
for (const r of gen) {
  if (at.has(r.id)) { merged[at.get(r.id)] = entry(r); replaced.push(r.id); }
  else if (above.has(r.id)) { skipped.push(r.id); }
  else { merged.push(entry(r)); appended.push(r.id); }
}
const genIds = new Set(gen.map((r) => r.id));
const kept = region.map(idOf).filter((id) => id && !genIds.has(id));
const changed = replaced.filter((id) => merged[at.get(id)] !== region[at.get(id)]);

const list = (a) => (a.length ? a.join(", ") : "none");
console.log(`replaced in place: ${replaced.length} (${changed.length} with different text)`);
console.log(`appended:          ${appended.length}${appended.length ? ` — ${list(appended)}` : ""}`);
console.log(`kept (hand-authored, not in the generated set): ${kept.length} — ${list(kept)}`);
console.log(`skipped (id already owned by an entry above the anchor): ${skipped.length} — ${list(skipped)}`);
console.log(`ROUTES entries in the region: ${region.length} → ${merged.length}`);

if (dryRun) {
  console.log("--dry-run: script.js not written");
  process.exit(0);
}
lines.splice(anchor + 1, region.length, ...merged);
writeFileSync(SCRIPT, lines.join("\n"));
console.log(`spliced ${gen.length} generated routes after the vitality-10k anchor`);
