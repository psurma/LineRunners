// Inject the traced book routes as inline ROUTES entries in script.js, right after
// the last existing entry (id "vitality-10k"). Idempotent: refuses to run twice.
// Field order mirrors the existing entries. Run AFTER build-book-routes.mjs.
//
//   node tools/splice-routes.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "script.js");
const gen = JSON.parse(readFileSync(join(ROOT, "data/book-routes-generated.json"), "utf8"));
if (!gen.length) { console.error("no generated routes; aborting"); process.exit(1); }

const s = (v) => JSON.stringify(v);
const entry = (r) => {
  const path = "[" + r.path.map((p) => `[${p[0]}, ${p[1]}]`).join(", ") + "]";
  return `    { id: ${s(r.id)}, name: ${s(r.name)}, type: ${s(r.type)}, leg: ${s(r.leg)}, start: ${s(r.start)}, distance: ${s(r.distance)}, highlights: ${s(r.highlights)}, suitability: ${s(r.suitability)}, loop: ${r.loop}, path: ${path} },`;
};

const src = readFileSync(SCRIPT, "utf8");
const lines = src.split("\n");
// Anchor on the last hand-written ROUTES entry; the book routes live between it
// and the array's closing "];". Replacing that whole region is idempotent — it
// updates paths/types and adds new routes without duplicating on re-runs.
const anchor = lines.findIndex((l) => l.includes('id: "vitality-10k"'));
if (anchor < 0) { console.error("anchor line (vitality-10k) not found"); process.exit(1); }
let close = -1;
for (let i = anchor + 1; i < lines.length; i++) { if (/^\s*\];\s*$/.test(lines[i])) { close = i; break; } }
if (close < 0) { console.error("ROUTES closing ]; not found"); process.exit(1); }

const block = gen.map(entry);
const replaced = close - (anchor + 1);
lines.splice(anchor + 1, replaced, ...block);
writeFileSync(SCRIPT, lines.join("\n"));
console.log(`spliced ${gen.length} routes (replaced ${replaced} existing lines) after the vitality-10k anchor`);
