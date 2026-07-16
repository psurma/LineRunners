// Geometry + GPX/TCX export. haversineKm/legDistanceKm take waypoint-shaped
// points ([name, lat, lon]); gpx/tcxFromPoints take route-shaped points
// ([lat, lon, ele?]).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTubeRun } from "./_load.mjs";

const t = loadTubeRun();
const BRIXTON = ["Brixton", 51.4627, -0.1145];
const WALTHAMSTOW = ["Walthamstow Central", 51.5830, -0.0195];

test("haversineKm: Brixton → Walthamstow Central crow-flies ≈ 14.9 km", () => {
  const km = t.haversineKm(BRIXTON, WALTHAMSTOW);
  assert.ok(Math.abs(km - 14.9) <= 0.3, `got ${km}`);
  assert.equal(t.haversineKm(WALTHAMSTOW, BRIXTON), km, "symmetric");
  assert.equal(t.haversineKm(BRIXTON, BRIXTON), 0);
});

test("legDistanceKm applies the on-street factor over crow-flies", () => {
  const pts = [BRIXTON, WALTHAMSTOW];
  const road = t.legDistanceKm(pts, 0, 1);
  const crow = t.haversineKm(BRIXTON, WALTHAMSTOW);
  assert.ok(road > crow, "roads are longer than crow-flies");
  assert.ok(Math.abs(road / crow - 1.3) < 1e-9, "ROAD_FACTOR is 1.3");
  // Multi-hop legs sum pairwise hops.
  const mid = ["Mid", 51.52, -0.07];
  const threeHop = t.legDistanceKm([BRIXTON, mid, WALTHAMSTOW], 0, 2);
  const summed = t.legDistanceKm([BRIXTON, mid], 0, 1) + t.legDistanceKm([mid, WALTHAMSTOW], 0, 1);
  assert.ok(Math.abs(threeHop - summed) < 1e-9);
});

const ROUTE = [[51.5, -0.1, 30.123], [51.51, -0.11], [51.52, -0.12, 45.678]];

test("gpxFromPoints emits one trkpt per point, elevation when present", () => {
  const gpx = t.gpxFromPoints(ROUTE, "Loop & back");
  assert.equal((gpx.match(/<trkpt /g) || []).length, 3);
  assert.ok(gpx.includes('<trkpt lat="51.5" lon="-0.1"><ele>30.1</ele></trkpt>'));
  assert.ok(gpx.includes('<trkpt lat="51.51" lon="-0.11"></trkpt>'), "no <ele> without an elevation");
  assert.ok(gpx.includes("<name>Loop &amp; back</name>"), "name is HTML-escaped");
  assert.ok(gpx.startsWith('<?xml version="1.0"') && gpx.includes("</gpx>"));
});

test("gpxFromPoints returns null when fewer than 2 valid points survive", () => {
  assert.equal(t.gpxFromPoints([[51.5, -0.1]], "x"), null);
  assert.equal(t.gpxFromPoints([[51.5, NaN], [NaN, 0], [51.5, -0.1]], "x"), null, "non-finite coords are dropped first");
});

test("tcxFromPoints synthesises a course with monotonic DistanceMeters", () => {
  const tcx = t.tcxFromPoints(ROUTE, "TubeRun victoria-super-long", false);
  assert.equal((tcx.match(/<Trackpoint>/g) || []).length, 3);
  assert.ok(tcx.includes("<Name>TubeRun victori</Name>"), "course name capped at 15 chars");
  const dists = [...tcx.matchAll(/<DistanceMeters>(\d+)<\/DistanceMeters>/g)].map((m) => +m[1]);
  assert.equal(dists.length, 4, "3 trackpoints + the lap total");
  const pointDists = dists.slice(1); // first match is the Lap's total
  assert.equal(pointDists[0], 0);
  for (let i = 1; i < pointDists.length; i++) assert.ok(pointDists[i] > pointDists[i - 1], "strictly increasing along the track");
  assert.equal(dists[0], pointDists[pointDists.length - 1], "lap total equals final trackpoint distance");
  assert.ok(tcx.includes("<AltitudeMeters>30.1</AltitudeMeters>"));
});

test("tcxFromPoints reverse=true flips begin/end positions", () => {
  const fwd = t.tcxFromPoints(ROUTE, "c", false);
  const rev = t.tcxFromPoints(ROUTE, "c", true);
  const begin = (s) => /<BeginPosition><LatitudeDegrees>([\d.]+)/.exec(s)[1];
  const end = (s) => /<EndPosition><LatitudeDegrees>([\d.]+)/.exec(s)[1];
  assert.equal(begin(fwd), "51.5");
  assert.equal(end(fwd), "51.52");
  assert.equal(begin(rev), "51.52");
  assert.equal(end(rev), "51.5");
  assert.equal(t.tcxFromPoints([[51.5, -0.1]], "c", false), null);
});

test("reverseGpxText flips trackpoint order, leaves waypoints, double-reverse is identity", () => {
  // Fixture built in reverseGpxText's own emitted trkseg layout, so reversing
  // twice must reproduce the input byte-for-byte.
  const pts = [
    '<trkpt lat="51.1" lon="-0.1"><ele>10.0</ele></trkpt>',
    '<trkpt lat="51.2" lon="-0.2"/>',
    '<trkpt lat="51.3" lon="-0.3"><ele>12.0</ele></trkpt>',
  ];
  const seg = "<trkseg>\n" + pts.map((p) => "      " + p).join("\n") + "\n    </trkseg>";
  const gpx = `<gpx><wpt lat="1" lon="2"><name>Pub</name></wpt><trk><name>T</name>${seg}</trk></gpx>`;
  const once = t.reverseGpxText(gpx);
  const order = (s) => [...s.matchAll(/<trkpt lat="([\d.]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order(once), ["51.3", "51.2", "51.1"]);
  assert.ok(once.includes('<wpt lat="1" lon="2"><name>Pub</name></wpt>'), "waypoints untouched");
  assert.ok(once.includes("<ele>10.0</ele>") && once.includes("<ele>12.0</ele>"), "elevations preserved");
  assert.equal(t.reverseGpxText(once), gpx, "reverse twice == identity");
});

test("reverseGpxText also reverses gpxFromPoints output", () => {
  const rev = t.reverseGpxText(t.gpxFromPoints(ROUTE, "x"));
  const lats = [...rev.matchAll(/<trkpt lat="([\d.]+)"/g)].map((m) => m[1]);
  assert.deepEqual(lats, ["51.52", "51.51", "51.5"]);
});
