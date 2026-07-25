// Canary: the data generators (generate-schedule, generate-variants,
// generate-pubs, generate-routes, validate-data) don't import script.js — they
// scrape data literals out of its SOURCE TEXT via extractLiteral() and eval them
// in a vm. That silently breaks the instant a scraped literal stops being
// self-contained data (a spread, a reference to another const, any computed
// value). This round-trips every literal the tools depend on so such an edit
// fails loudly HERE instead of with a cryptic vm ReferenceError inside a
// generator that only runs under the pre-commit hook.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractLiteral } from "../lib/extract.mjs";
import { plain } from "./_load.mjs";

const SRC = readFileSync(new URL("../../script.js", import.meta.url), "utf8");

// Every `const NAME = ` literal that a tools/*.mjs generator extracts.
const LITERALS = ["RUN_PLAN", "ROUTES", "WAYPOINTS", "LINE_VARIANTS", "GPX_LINES"];

for (const name of LITERALS) {
  test(`extractLiteral(${name}) evaluates to self-contained data`, () => {
    let value;
    assert.doesNotThrow(() => { value = extractLiteral(SRC, name); },
      `${name} is no longer a self-contained literal — a generator's extractLiteral() will throw. Keep it plain data (no spreads / const references / computed values), or move it out of script.js.`);
    assert.ok(value !== undefined && value !== null, `${name} extracted as null/undefined`);
    assert.ok(Array.isArray(value) || typeof value === "object", `${name} should be an array/object`);
  });
}

test("RUN_PLAN and ROUTES extract as non-empty arrays", () => {
  assert.ok(Array.isArray(extractLiteral(SRC, "RUN_PLAN")) && extractLiteral(SRC, "RUN_PLAN").length > 0);
  assert.ok(Array.isArray(extractLiteral(SRC, "ROUTES")) && extractLiteral(SRC, "ROUTES").length > 0);
});

// An apostrophe inside a comment used to open a "string" that ran on past the
// literal's closing bracket ("literal not closed"). LINE_STATS and LINE_COLOURS
// already carry such comments; the day one lands inside ROUTES the pre-commit
// hook would fail with no obvious cause.
test("a // comment containing an apostrophe does not swallow the closing bracket", () => {
  const src = [
    'const WITH_COMMENT = [',
    '  // each line\'s main route, north to south',
    '  { id: "a", n: 1 }, // it\'s the first',
    '  { id: "b", n: 2 },',
    '];',
    'const AFTER = [{ id: "c" }];',
  ].join("\n");
  assert.deepEqual(plain(extractLiteral(src, "WITH_COMMENT")), [{ id: "a", n: 1 }, { id: "b", n: 2 }]);
  assert.deepEqual(plain(extractLiteral(src, "AFTER")), [{ id: "c" }]);
});

test("a /* */ comment with an apostrophe or a stray bracket is skipped", () => {
  const src = 'const BLOCK = [\n  /* the line\'s stops — [not a real array] */\n  { id: "a" },\n];\n';
  assert.deepEqual(plain(extractLiteral(src, "BLOCK")), [{ id: "a" }]);
});

test("apostrophes and brackets inside string values still scan correctly", () => {
  const src = `const STRINGS = [{ n: "St James's Park", leg: "A [x] B", q: 'it\\'s fine' }];\n`;
  assert.deepEqual(plain(extractLiteral(src, "STRINGS")), [{ n: "St James's Park", leg: "A [x] B", q: "it's fine" }]);
});
