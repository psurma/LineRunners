// Pull a top-level data literal (`const NAME = [...]` / `{...}` / `new Set([...])`)
// straight out of script.js, so the page stays the single source of truth for
// RUN_PLAN, ROUTES, LINE_VARIANTS, WAYPOINTS, GPX_LINES and friends. Every tool
// used to carry its own copy of this scan — one of them wasn't string-aware and
// would break on a bracket inside a quoted string — so the one good version
// (generate-schedule.mjs's) now lives here.
//
// The scan balances only the literal's own bracket kind and skips over string
// bodies ('…', "…", `…`, with \ escapes) and comments (// to end of line, /* to
// */), which is safe because these literals hold plain data: strings, numbers,
// arrays, nested objects and the odd annotating comment — no regex literals, no
// template interpolation. Comments have to be skipped before strings, or an
// apostrophe in a `// each line's main route` comment opens a "string" that
// swallows the literal's closing bracket.

import vm from "node:vm";

// The literal's source text: from the `[` / `{` that opens NAME's initialiser
// to its balanced close. The opener must sit on the declaration line (it always
// does — `new Set([` included), so a stray match can't scan off into the file.
export function sliceLiteral(src, name) {
  const at = src.indexOf(`const ${name} = `);
  if (at === -1) throw new Error(`${name} not found in script.js`);
  let start = at;
  while (start < src.length && src[start] !== "[" && src[start] !== "{" && src[start] !== "\n") start++;
  const open = src[start];
  if (open !== "[" && open !== "{") throw new Error(`${name}: no [ or { on its declaration line`);
  const close = open === "[" ? "]" : "}";
  let depth = 0, i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; }
    else if (c === "/" && src[i + 1] === "*") { const end = src.indexOf("*/", i + 2); if (end === -1) break; i = end + 1; }
    else if (c === open) depth++;
    else if (c === close) { if (!--depth) return src.slice(start, i + 1); }
    else if (c === '"' || c === "'" || c === "`") { const q = c; for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++; }
  }
  throw new Error(`${name} literal not closed`);
}

// The literal, evaluated alone in an isolated context. For `new Set([...])`
// declarations this returns the inner ARRAY (the scan starts at the `[`).
export function extractLiteral(src, name) {
  return vm.runInNewContext(`(${sliceLiteral(src, name)})`);
}
