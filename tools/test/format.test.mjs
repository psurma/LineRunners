// Distance formatting, line slugs, colour clamping.
//
// fmtKm/distText consult the module-internal `distUnit`, which is set once at
// boot from localStorage ("tuberun_units"). The loader's { units: "mi" } option
// makes the localStorage stub answer "mi", so BOTH unit modes are genuinely
// reachable — each in its own booted context.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTubeRun } from "./_load.mjs";

const t = loadTubeRun();          // km mode (default)
const mi = loadTubeRun({ units: "mi" });

test("fmtKm: 1dp under 20, whole numbers from 20 up, explicit dp wins", () => {
  assert.equal(t.fmtKm(15), "15.0 km");
  assert.equal(t.fmtKm(19.96), "20.0 km"); // still <20 before rounding, so 1dp
  assert.equal(t.fmtKm(20), "20 km");
  assert.equal(t.fmtKm(26), "26 km");
  assert.equal(t.fmtKm(5.25, 2), "5.25 km");
  assert.equal(t.fmtKm(26, 1), "26.0 km");
});

test("fmtKm converts in the mi context", () => {
  assert.equal(mi.fmtKm(15), "9.3 mi");
  assert.equal(mi.fmtKm(42.195), "26 mi"); // ≥20 in the active unit → whole number
});

test("distText normalises distance mentions to the active unit (km mode)", () => {
  assert.equal(t.distText("~26 km"), "~26 km");                 // already km: unchanged
  assert.equal(t.distText("9.3 mi (15 km)"), "15.0 km");        // dual-unit collapses to one
  assert.equal(t.distText("15 km (9.3 mi)"), "15.0 km");        // either order
  assert.equal(t.distText("46 miles"), "74 km");                // plain miles converted
  assert.equal(t.distText("2 days · ~59 km"), "2 days · ~59 km");
  assert.equal(t.distText("~6:00/km, 2 pitstops"), "~6:00/km, 2 pitstops"); // pace strings untouched
  assert.equal(t.distText(""), "");   // falsy passthrough
  assert.equal(t.distText(null), null);
});

test("distText converts to miles in the mi context", () => {
  assert.equal(mi.distText("~26 km"), "~16.2 mi");
  assert.equal(mi.distText("9.3 mi (15 km)"), "9.3 mi");
});

test("lineSlug slugs line names, & and punctuation included", () => {
  const cases = [
    ["Hammersmith & City", "hammersmith-city"],
    ["Waterloo & City", "waterloo-city"],
    ["Victoria", "victoria"],
    ["King's Cross St Pancras", "king-s-cross-st-pancras"],
    ["London Overground: Windrush", "london-overground-windrush"],
    ["  Circle  ", "circle"],           // outer whitespace → trimmed dashes
    ["N/A - test.", "n-a-test"],        // trailing punctuation dropped
    ["Route 66!", "route-66"],
    ["A&B", "a-b"],                     // & without spaces
    ["Jubilee line", "jubilee-line"],
    ["--Weird--", "weird"],
    ["", ""],
    [null, ""],                         // nullish coerced to empty
  ];
  for (const [input, want] of cases) assert.equal(t.lineSlug(input), want, `lineSlug(${JSON.stringify(input)})`);
});

test("safeColour passes 3/6/8-digit hex through and clamps everything else", () => {
  assert.equal(t.safeColour("#E32"), "#E32");
  assert.equal(t.safeColour("#E32017"), "#E32017");
  assert.equal(t.safeColour("#E32017CC"), "#E32017CC"); // 8-digit (alpha) allowed
  assert.equal(t.safeColour("javascript:x"), "#0019A8");
  assert.equal(t.safeColour('"><img src=x onerror=alert(1)>'), "#0019A8");
  assert.equal(t.safeColour("red"), "#0019A8"); // named colours clamp too
});
