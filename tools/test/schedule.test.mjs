// Schedule building: firstSunday / upcomingSundays / pickNextRun.
//
// upcomingSundays() and pickNextRun() close over the real current date (and the
// module-level schedule built from RUN_PLAN at boot), so they can't be
// parameterised through their signatures. The loader's { now } option injects a
// frozen Date class into the vm sandbox before the IIFE boots, which makes the
// whole schedule — and both functions — deterministic for those contexts.
// The default-context tests stick to date-invariant properties.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTubeRun, plain } from "./_load.mjs";

const t = loadTubeRun();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
  // Data-coupled to RUN_PLAN's pinned Metropolitan weekend (2026-07-04, 2 days):
  // on day 2 the run's start date is in the past but its END isn't, so it must
  // still be "next" rather than rolling over to the following run.
  const f = loadTubeRun({ now: "2026-07-05T10:00:00Z" });
  const next = f.pickNextRun();
  assert.equal(next.key, "Metropolitan");
  assert.equal(next.pinned, true);
  assert.equal(iso(next.date), "2026-07-04");
  assert.equal(next.days.length, 2);
});

test("pickNextRun rolls to the next auto first-Sunday run once pinned dates pass (frozen 16 Jul 2026)", () => {
  // Both pinned runs (4 Jul, 11 Jul) are over; the next run is the first
  // unpinned RUN_PLAN entry, auto-scheduled onto the next free first Sunday.
  const f = loadTubeRun({ now: "2026-07-16T09:00:00Z" });
  const next = f.pickNextRun();
  assert.equal(next.pinned, false);
  assert.equal(iso(next.date), "2026-08-02");
  assert.equal(next.date.getDay(), 0);
  assert.equal(next.suggested, true); // beyond the start of next month = still tentative
  assert.equal(next.key, "Victoria"); // data-coupled: first date-less RUN_PLAN entry
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
