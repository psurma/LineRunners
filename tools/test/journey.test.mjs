// journeySegments(run, wp): slices a run's waypoints into per-day segments by
// parsing "Day N · <date> — <From> → <To>" titles. WAYPOINTS itself isn't
// exported, so the fixture mirrors its shape ([name, lat, lon]) with real
// Metropolitan-line names — including the Northwood / Northwood Hills pair that
// exercises longest-partial-match binding.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTubeRun, plain } from "./_load.mjs";

const t = loadTubeRun();

const WP = [
  ["Chesham", 51.7052, -0.611],
  ["Chalfont & Latimer", 51.6679, -0.56],
  ["Chorleywood", 51.6543, -0.5183],
  ["Rickmansworth", 51.6404, -0.4733],
  ["Moor Park", 51.6299, -0.4327],
  ["Northwood", 51.6111, -0.4237],
  ["Northwood Hills", 51.6004, -0.4092],
  ["Wembley Park", 51.5635, -0.2795],
];

test("multi-day titles split the waypoints into per-day segments", () => {
  const run = {
    leg: "Chesham → Wembley Park",
    days: [
      { title: "Day 1 · Sat 4 July — Chesham → Northwood", start: "Chesham Underground Station, 9:18am" },
      { title: "Day 2 · Sun 5 July — Northwood → Wembley Park", start: "Northwood Station, 9:35am" },
    ],
  };
  assert.deepEqual(plain(t.journeySegments(run, WP)), [
    { label: "Day 1 · Sat 4 July", leg: "Chesham → Northwood", from: 0, to: 5, start: "09:18" },
    { label: "Day 2 · Sun 5 July", leg: "Northwood → Wembley Park", from: 5, to: 7, start: "09:35" },
  ]);
});

test("a single-day run (or a 1-element days array) is one whole-route segment at MEET_TIME", () => {
  assert.deepEqual(plain(t.journeySegments({ leg: "Chesham → Wembley Park" }, WP)),
    [{ label: null, leg: "Chesham → Wembley Park", from: 0, to: 7, start: "09:00" }]);
  assert.deepEqual(plain(t.journeySegments({ leg: "A → B", days: [{ title: "only day" }] }, WP.slice(0, 2))),
    [{ label: null, leg: "A → B", from: 0, to: 1, start: "09:00" }]);
});

test("station names resolve without an em-dash and despite 'Underground Station' suffixes", () => {
  // Plain hyphen means the from-name is the whole prefix — the suffix partial
  // match must still bind, and "Northwood Hills" must not collapse to "Northwood".
  const run = {
    days: [
      { title: "Day 1 - Chesham Underground Station → Northwood Hills", start: "x, 9:18am" },
      { title: "Day 2 - Northwood Hills → Wembley Park", start: "y, 9:35am" },
    ],
  };
  const segs = t.journeySegments(run, WP);
  assert.equal(segs[0].from, 0);
  assert.equal(segs[0].to, 6, "binds Northwood Hills (index 6), not Northwood (5)");
  assert.equal(segs[1].from, 6);
  assert.equal(segs[1].to, 7);
});

test("unparseable day plans return null", () => {
  const day2 = { title: "Day 2 — Chesham → Northwood", start: "" };
  assert.equal(t.journeySegments({ days: [{ title: "Day 1 no arrow", start: "" }, day2] }, WP), null, "a day title without →");
  assert.equal(t.journeySegments({ days: [{ title: "D1 — Wembley Park → Chesham", start: "" }, day2] }, WP), null, "backwards segment (to ≤ from)");
  assert.equal(t.journeySegments({ days: [{ title: "D1 — Atlantis → Northwood", start: "" }, day2] }, WP), null, "unknown station");
});
