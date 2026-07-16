// Station graph, Dijkstra routing, and circular-loop generation, on a small
// synthetic network shaped exactly like data/tube-network.json:
//   { lineId: { name, colour, branches: [[stationId…]…], stations: { id: { n, lat, lon } } } }
//
// Layout (A Line west→east along lat 51.5, B Line north→south through the
// shared "Central Cross" interchange, C Line closing a south-east cycle):
//
//   North Gate
//       |
//   Alpha - Beta - CENTRAL CROSS - Delta - Epsilon
//       (A Line)      |                      |
//                 South Gate ------------- Corner
//                              (C Line)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTubeRun, plain } from "./_load.mjs";

const t = loadTubeRun();

const NET = {
  a: {
    name: "A Line", colour: "#111111",
    branches: [["a1", "a2", "x", "a4", "a5"]],
    stations: {
      a1: { n: "Alpha", lat: 51.5, lon: -0.1 },
      a2: { n: "Beta", lat: 51.5, lon: -0.08 },
      x: { n: "Central Cross", lat: 51.5, lon: -0.06 },
      a4: { n: "Delta", lat: 51.5, lon: -0.04 },
      a5: { n: "Epsilon", lat: 51.5, lon: -0.02 },
    },
  },
  b: {
    name: "B Line", colour: "#222222",
    branches: [["b1", "bx", "b3"]],
    stations: {
      b1: { n: "North Gate", lat: 51.52, lon: -0.06 },
      bx: { n: "Central Cross", lat: 51.5, lon: -0.06 }, // same name+coords as A Line's — one node
      b3: { n: "South Gate", lat: 51.48, lon: -0.06 },
    },
  },
  c: {
    name: "C Line", colour: "#333333",
    branches: [["a5", "c2", "b3"]],
    stations: {
      a5: { n: "Epsilon", lat: 51.5, lon: -0.02 },
      c2: { n: "Corner", lat: 51.48, lon: -0.02 },
      b3: { n: "South Gate", lat: 51.48, lon: -0.06 },
    },
  },
};
const g = t.buildStationGraph(NET);
// Expected edge weight = crow-flies × ROAD_FACTOR, derived (not hardcoded) from
// the exported helpers so the test tracks the source of truth.
const road = (a, b) => t.legDistanceKm([["", a.lat, a.lon], ["", b.lat, b.lon]], 0, 1);
const S = NET.a.stations, SB = NET.b.stations;

test("buildStationGraph collapses the shared interchange into one node", () => {
  assert.deepEqual(Object.keys(g.nodes).sort(),
    ["alpha", "beta", "centralcross", "corner", "delta", "epsilon", "northgate", "southgate"]);
  assert.deepEqual([...g.adj.centralcross.keys()].sort(), ["beta", "delta", "northgate", "southgate"]);
  assert.deepEqual([...g.edgeLines[g.ekey("alpha", "beta")]], ["a"]);
  assert.deepEqual([...g.edgeLines[g.ekey("centralcross", "northgate")]], ["b"]);
  assert.deepEqual(plain(g.lines.c), { name: "C Line", colour: "#333333" });
  const w = g.adj.alpha.get("beta");
  assert.ok(Math.abs(w - road(S.a1, S.a2)) < 1e-9, "edge weight = crow-flies × road factor");
});

test("shortestPath changes lines at the shared station", () => {
  const r = t.shortestPath(g, "Alpha", "South Gate");
  assert.deepEqual(plain(r.path), ["alpha", "beta", "centralcross", "southgate"]);
  const want = road(S.a1, S.a2) + road(S.a2, S.x) + road(S.x, SB.b3);
  assert.ok(Math.abs(r.km - want) < 1e-9, `km ${r.km} vs ${want}`);
});

test("shortestPath handles trivial and unknown endpoints", () => {
  assert.deepEqual(plain(t.shortestPath(g, "Alpha", "Alpha")), { path: ["alpha"], km: 0 });
  assert.equal(t.shortestPath(g, "Alpha", "Narnia"), null);
  assert.equal(t.shortestPath(g, "Narnia", "Alpha"), null);
});

test("shortestPath respects the allowed-lines filter", () => {
  // North→South needs B Line edges; restricting to A Line disconnects them.
  assert.equal(t.shortestPath(g, "North Gate", "South Gate", new Set(["a"])), null);
  const viaB = t.shortestPath(g, "North Gate", "South Gate", new Set(["b"]));
  assert.deepEqual(plain(viaB.path), ["northgate", "centralcross", "southgate"]);
});

test("buildLoop never exceeds targetKm + 0.05 when a fitting loop exists", () => {
  // Pins the max-distance fix. buildLoop picks randomly among the best
  // under-ceiling options and there is no seed, so hammer it: every returned
  // loop must respect the ceiling, on every attempt. For each target below the
  // fixture guarantees at least one under-ceiling option (e.g. the Beta
  // out-and-back at ~3.6 km), so the shortest-overshoot fallback can't engage.
  for (const target of [4, 8, 12]) {
    for (let i = 0; i < 20; i++) {
      const loop = t.buildLoop(g, "Alpha", target);
      assert.ok(loop, `target ${target} run ${i}: a loop exists`);
      assert.ok(loop.km <= target + 0.05, `target ${target} run ${i}: ${loop.km} km within ceiling`);
      assert.equal(loop.path[0], "alpha", "starts at the start station");
      assert.equal(loop.path[loop.path.length - 1], "alpha", "returns to the start station");
      assert.equal(loop.loop, true);
      assert.ok(Object.values(g.nodes).some((n) => n.name === loop.turnaround), "turnaround is a real station");
    }
  }
});

test("buildLoop honours a crow-flies radius on the turnaround", () => {
  // Radius 3 km leaves Central Cross as the only in-band turnaround: the loop
  // is deterministically its out-and-back.
  for (let i = 0; i < 10; i++) {
    const loop = t.buildLoop(g, "Alpha", 12, 3);
    assert.equal(loop.turnaround, "Central Cross");
    const want = 2 * (road(S.a1, S.a2) + road(S.a2, S.x));
    assert.ok(Math.abs(loop.km - want) < 1e-9);
  }
});

test("buildLoop falls back to the shortest overshoot when nothing fits the ceiling", () => {
  // Documented behaviour (script.js ~5345): with target 3.5 the only candidate
  // loop is the ~3.6 km Beta out-and-back — over the ceiling, still returned.
  const loop = t.buildLoop(g, "Alpha", 3.5);
  const want = 2 * road(S.a1, S.a2);
  assert.ok(Math.abs(loop.km - want) < 1e-9, `got ${loop.km}`);
  assert.ok(loop.km > 3.5 + 0.05, "genuinely over the ceiling — the documented fallback");
});

test("buildLoop returns null when impossible", () => {
  assert.equal(t.buildLoop(g, "Alpha", 0.5), null, "no station within the candidate band");
  assert.equal(t.buildLoop(g, "Nowhere", 5), null, "unknown start");
});
