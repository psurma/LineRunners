// eraLineStyle(feature, year, opts): the Leaflet style shared by the Time
// Machine section (opts { ghostOpacity: 0.06 }) and the geo map's scrubber
// (opts { ghostOpacity: 0.07, on, dimmed }) — see the two call sites in
// script.js (~4636 and ~4834). Uses the real HERITAGE data: victoria opened
// 1968, last infill (Pimlico) 1972.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTubeRun, plain } from "./_load.mjs";

const t = loadTubeRun();
const vic = { properties: { line: "victoria", colour: "#0098D4", nr: false } };
const nr = { properties: { line: "thameslink", colour: "#C00000", nr: true } };

test("a line opened after the year renders as a ghost", () => {
  // Time Machine call-site opts.
  assert.deepEqual(plain(t.eraLineStyle(vic, 1900, { ghostOpacity: 0.06 })),
    { color: "#0098D4", weight: 1, opacity: 0.06, dashArray: "2 6", lineJoin: "round", lineCap: "round" });
  // Geo-map call-site opts use a slightly stronger ghost.
  assert.equal(t.eraLineStyle(vic, 1900, { ghostOpacity: 0.07 }).opacity, 0.07);
  // Default when no ghostOpacity is passed.
  assert.equal(t.eraLineStyle(vic, 1900, {}).opacity, 0.06);
  // opts itself is optional.
  assert.equal(t.eraLineStyle(vic, 1900).weight, 1);
});

test("a line mid-construction is hidden (the era layer draws its built extent)", () => {
  // 1968 ≤ 1970 < 1972 (Pimlico infill): hide the modern geometry entirely.
  assert.deepEqual(plain(t.eraLineStyle(vic, 1970, { ghostOpacity: 0.06 })), { color: "#0098D4", weight: 0, opacity: 0 });
});

test("a fully-open line renders modern geometry from its last opening year", () => {
  assert.deepEqual(plain(t.eraLineStyle(vic, 1972, {})),
    { color: "#0098D4", weight: 3, opacity: 0.9, dashArray: null, lineJoin: "round", lineCap: "round" });
  assert.equal(t.eraLineStyle(vic, 9999, {}).opacity, 0.9);
});

test("geo-map highlight and dim options", () => {
  const on = t.eraLineStyle(vic, 9999, { ghostOpacity: 0.07, on: true, dimmed: true });
  assert.equal(on.weight, 5);
  assert.equal(on.opacity, 1, "highlight beats dimming");
  const dim = t.eraLineStyle(vic, 9999, { ghostOpacity: 0.07, on: false, dimmed: true });
  assert.equal(dim.weight, 3);
  assert.equal(dim.opacity, 0.3);
});

test("National Rail features are thinner, fainter and dashed — unless highlighted", () => {
  assert.deepEqual(plain(t.eraLineStyle(nr, 9999, {})),
    { color: "#C00000", weight: 2, opacity: 0.6, dashArray: "6 5", lineJoin: "round", lineCap: "round" });
  const lit = t.eraLineStyle(nr, 9999, { on: true });
  assert.equal(lit.weight, 5);
  assert.equal(lit.opacity, 1);
  assert.equal(lit.dashArray, "6 5", "stays dashed even when highlighted");
});

test("lines without heritage data always exist", () => {
  const s = t.eraLineStyle({ properties: { line: "mystery", colour: "#123456", nr: false } }, 1800, {});
  assert.equal(s.weight, 3);
  assert.equal(s.opacity, 0.9);
});
