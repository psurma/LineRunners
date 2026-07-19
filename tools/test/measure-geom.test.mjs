// Pure geometry behind the "measure a stretch" + elevation features:
//   pathCumKm(path)             cumulative km along a [[lat,lon],...] line
//   projectOnPath(lat,lon,path,cum)  nearest point → { off, alongKm }
//   elevProfile(pts)            climb/drop with a 3 m hysteresis; pts=[[dist,ele],...]
// These drive the measured-stretch distances and the strip/route elevation, and
// were previously untested (the interaction that uses them is DOM-only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTubeRun } from "./_load.mjs";

const t = loadTubeRun();

// A due-north path: each 0.01° of latitude ≈ 1.11 km, so the cumulative
// distances are ~equal steps we can check against haversine directly.
const NORTH = [[51.50, -0.10], [51.51, -0.10], [51.52, -0.10]];

test("pathCumKm starts at 0, is monotonic, and sums the legs", () => {
  const cum = t.pathCumKm(NORTH);
  assert.equal(cum[0], 0);
  assert.equal(cum.length, NORTH.length);
  assert.ok(cum[1] > 0 && cum[2] > cum[1], "strictly increasing");
  const leg = t.haversineKm([0, 51.50, -0.10], [0, 51.51, -0.10]);
  assert.ok(Math.abs(cum[1] - leg) < 1e-9, "first entry is the first leg");
  assert.ok(Math.abs(cum[2] - 2 * cum[1]) < 1e-3, "equal legs accumulate");
});

test("projectOnPath: a point on a vertex projects there with ~0 offset", () => {
  const cum = t.pathCumKm(NORTH);
  const pr = t.projectOnPath(51.51, -0.10, NORTH, cum);
  assert.ok(pr.off < 0.02, `on-path offset tiny, got ${pr.off}`);
  assert.ok(Math.abs(pr.alongKm - cum[1]) < 0.02, `alongKm at the vertex, got ${pr.alongKm}`);
});

test("projectOnPath: alongKm increases as the query point walks down the path (monotonic)", () => {
  const cum = t.pathCumKm(NORTH);
  const a = t.projectOnPath(51.505, -0.10, NORTH, cum).alongKm;
  const b = t.projectOnPath(51.515, -0.10, NORTH, cum).alongKm;
  assert.ok(b > a, `later point is further along (${b} > ${a})`);
});

test("projectOnPath: an off-path point reports the perpendicular offset", () => {
  const cum = t.pathCumKm(NORTH);
  // ~0.005° east of the line ≈ 0.35 km at this latitude.
  const pr = t.projectOnPath(51.51, -0.095, NORTH, cum);
  assert.ok(pr.off > 0.2 && pr.off < 0.5, `perpendicular offset ~0.35 km, got ${pr.off}`);
});

test("elevProfile: needs at least 3 points", () => {
  assert.equal(t.elevProfile(null), null);
  assert.equal(t.elevProfile([[0, 10], [1, 20]]), null);
});

test("elevProfile: sums climb and drop above the 3 m threshold", () => {
  const p = t.elevProfile([[0, 10], [1, 20], [2, 15]]);
  assert.equal(p.gain, 10);
  assert.equal(p.loss, 5);
  assert.equal(p.min, 10);
  assert.equal(p.max, 20);
  assert.equal(p.maxD, 2, "maxD is the last point's distance");
});

test("elevProfile: ignores wiggles smaller than the 3 m hysteresis", () => {
  const p = t.elevProfile([[0, 10], [1, 12], [2, 10]]);
  assert.equal(p.gain, 0, "a +2 m bump is below threshold");
  assert.equal(p.loss, 0);
  assert.equal(p.max, 12, "min/max still track the raw extremes");
});
