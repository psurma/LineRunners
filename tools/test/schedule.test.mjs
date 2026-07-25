// Schedule building: firstSunday / upcomingSundays / pickNextRun.
//
// upcomingSundays() and pickNextRun() close over the real current date (and the
// module-level schedule built from RUN_PLAN at boot), so they can't be
// parameterised through their signatures. The loader's { now } option injects a
// frozen Date class into the vm sandbox before the IIFE boots, which makes the
// whole schedule — and both functions — deterministic for those contexts.
// The default-context tests stick to date-invariant properties.
//
// The pickNextRun tests additionally boot against a fixture RUN_PLAN
// (loadWithPlan below). They used to assert real entries on real dates —
// "Metropolitan on 2026-07-04", "Victoria is the first date-less entry" — which
// meant deleting a run that had happened broke tests that were never about that
// run. The rule is what's under test, so the tests now supply their own plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { loadTubeRun, plain } from "./_load.mjs";
import { sliceLiteral } from "../lib/extract.mjs";

const t = loadTubeRun();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Boot script.js with its RUN_PLAN literal swapped for `plan`. _load.mjs reads
// the real script.js at import and offers no hook for a doctored source, so the
// sandbox is mirrored here — same DOM stubs, same dead timers, same frozen Date.
const SRC = readFileSync(new URL("../../script.js", import.meta.url), "utf8");
function loadWithPlan(plan, now) {
  const src = SRC.replace(sliceLiteral(SRC, "RUN_PLAN"), () => JSON.stringify(plan));
  const noop = () => {};
  const sandbox = {
    __TUBERUN_TEST__: true,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop,
      removeEventListener: noop,
      createElement: () => ({ style: {}, setAttribute: noop, addEventListener: noop, appendChild: noop }),
      body: { classList: { add: noop, remove: noop, toggle: noop }, style: {}, appendChild: noop, contains: () => true },
      documentElement: { style: { setProperty: noop } },
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { userAgent: "node-test", language: "en-GB" },
    addEventListener: noop,
    removeEventListener: noop,
    fetch: () => new Promise(noop),
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    TextEncoder, TextDecoder, URL, URLSearchParams, Blob, performance,
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
    Date: class FrozenDate extends Date {
      constructor(...args) { if (args.length === 0) super(new Date(now).getTime()); else super(...args); }
      static now() { return new Date(now).getTime(); }
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "script.js" });
  if (!sandbox.__tuberunTest) throw new Error("script.js ran but did not set window.__tuberunTest");
  return sandbox.__tuberunTest;
}

// Two pinned specials (one a two-day weekend) and two date-less entries that
// fall onto upcoming first Sundays — enough to exercise both behaviours below.
const FIXTURE_PLAN = [
  {
    type: "tube", line: "Metropolitan", date: "2026-07-04",
    leg: "Chesham → Aldgate", start: "Chesham Underground Station", distance: "2 days · ~59 km",
    days: [
      { title: "Day 1 · Chesham → Wembley Park", start: "Chesham Underground Station", finish: "Wembley Park Underground Station" },
      { title: "Day 2 · Wembley Park → Aldgate", start: "Wembley Park Underground Station", finish: "Aldgate" },
    ],
  },
  { type: "tube", line: "Northern", date: "2026-07-11", leg: "Morden → High Barnet", start: "Morden", distance: "~32 km" },
  { type: "tube", line: "Victoria", leg: "Brixton → Walthamstow Central", start: "Brixton stn", distance: "~26 km" },
  { type: "tube", line: "Bakerloo", leg: "Elephant & Castle → Harrow & Wealdstone", start: "Elephant & Castle", distance: "~24 km" },
];

test("firstSunday finds the first Sunday of a month (0-based month)", () => {
  assert.equal(iso(t.firstSunday(2026, 2)), "2026-03-01"); // the 1st itself is a Sunday
  assert.equal(iso(t.firstSunday(2026, 7)), "2026-08-02");
  assert.equal(iso(t.firstSunday(2026, 10)), "2026-11-01");
  assert.equal(iso(t.firstSunday(2027, 0)), "2027-01-03"); // year rollover
  for (const [y, m] of [[2026, 0], [2026, 5], [2026, 11], [2028, 1]]) {
    const d = t.firstSunday(y, m);
    assert.equal(d.getDay(), 0, `${y}-${m + 1} first Sunday`);
    assert.ok(d.getDate() <= 7, "a first Sunday falls on day 1-7");
    assert.equal(d.getMonth(), m);
  }
});

test("upcomingSundays returns count first-Sundays, ordered, none in the past", () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = t.upcomingSundays(8);
  assert.equal(out.length, 8);
  for (let i = 0; i < out.length; i++) {
    const d = out[i];
    assert.equal(d.getDay(), 0, `${iso(d)} is a Sunday`);
    assert.ok(d >= today, `${iso(d)} is not in the past`);
    assert.equal(iso(d), iso(t.firstSunday(d.getFullYear(), d.getMonth())), "is the FIRST Sunday of its month");
    if (i) assert.ok(out[i] > out[i - 1], "strictly ascending");
  }
});

test("upcomingSundays skips a first-Sunday that has already passed (frozen 16 Jul 2026)", () => {
  const f = loadTubeRun({ now: "2026-07-16T09:00:00Z" });
  // July's first Sunday (5 Jul) is gone, so the list starts in August.
  assert.deepEqual(plain(f.upcomingSundays(4).map(iso)), ["2026-08-02", "2026-09-06", "2026-10-04", "2026-11-01"]);
});

test("pickNextRun keeps a pinned multi-day run current through its final day (frozen Sun 5 Jul 2026)", () => {
  // The fixture's pinned two-day weekend starts 2026-07-04. On day 2 the run's
  // start date is in the past but its END isn't, so it must still be "next"
  // rather than rolling over to the following run.
  const f = loadWithPlan(FIXTURE_PLAN, "2026-07-05T10:00:00Z");
  const next = f.pickNextRun();
  assert.equal(next.key, "Metropolitan");
  assert.equal(next.pinned, true);
  assert.equal(iso(next.date), "2026-07-04");
  assert.equal(next.days.length, 2);
});

test("pickNextRun rolls to the next auto first-Sunday run once pinned dates pass (frozen 16 Jul 2026)", () => {
  // Both of the fixture's pinned runs (4 Jul + 5 Jul, and 11 Jul) are over, so
  // the next run is its first date-less entry, auto-scheduled onto the next free
  // first Sunday — 2 August, the first one that isn't within 2 days of a pin.
  const f = loadWithPlan(FIXTURE_PLAN, "2026-07-16T09:00:00Z");
  const next = f.pickNextRun();
  assert.equal(next.pinned, false);
  assert.equal(next.key, "Victoria");
  assert.equal(iso(next.date), "2026-08-02");
  assert.equal(next.date.getDay(), 0);
  assert.equal(next.suggested, true); // beyond the start of next month = still tentative
});

test("pickNextRun in the live (unfrozen) context returns a plausible run", () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = t.pickNextRun();
  assert.ok(next && typeof next.key === "string" && next.key.length > 0);
  assert.ok(next.badge && next.leg && next.colour, "normalised shape");
  const days = next.days ? next.days.length : 1;
  const end = new Date(next.date.getTime() + (days - 1) * 86400000);
  assert.ok(end >= today, "the chosen run has not finished yet");
});
