// Europe/London time helpers + clock arithmetic. All functions here take
// explicit instants/arguments, so no Date-freezing is needed and every
// assertion is deterministic in any host timezone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTubeRun, plain } from "./_load.mjs";

const t = loadTubeRun();

// BST 2026 starts Sun 29 Mar 01:00Z (clocks 01:00 → 02:00) and ends Sun 25 Oct
// 02:00 BST (01:00Z, clocks 02:00 → 01:00).

test("londonParts straddles the spring-forward boundary (29 Mar 2026)", () => {
  // 00:30Z is still GMT: wall clock 00:30.
  assert.deepEqual(plain(t.londonParts(Date.UTC(2026, 2, 29, 0, 30))), { y: 2026, mo: 3, d: 29, h: 0, mi: 30 });
  // 01:30Z is after the jump: wall clock 02:30 BST — the 01:xx hour never exists.
  assert.deepEqual(plain(t.londonParts(Date.UTC(2026, 2, 29, 1, 30))), { y: 2026, mo: 3, d: 29, h: 2, mi: 30 });
});

test("londonInstant resolves wall-clock times on both sides of the spring gap", () => {
  // GMT side: London == UTC.
  assert.equal(t.londonInstant(2026, 2, 29, 0, 30), Date.UTC(2026, 2, 29, 0, 30));
  // BST side: 02:30 London is 01:30Z.
  assert.equal(t.londonInstant(2026, 2, 29, 2, 30), Date.UTC(2026, 2, 29, 1, 30));
  // Mid-summer: 09:18 London (the Day-1 Chesham depart) is 08:18Z.
  assert.equal(t.londonInstant(2026, 6, 4, 9, 18), Date.UTC(2026, 6, 4, 8, 18));
});

test("londonHM shows the ambiguous 01:30 twice on fall-back day (25 Oct 2026)", () => {
  const bst = Date.UTC(2026, 9, 25, 0, 30); // 01:30 BST
  const gmt = Date.UTC(2026, 9, 25, 1, 30); // 01:30 GMT, one real hour later
  assert.equal(t.londonHM(bst), "01:30");
  assert.equal(t.londonHM(gmt), "01:30");
  assert.equal(gmt - bst, 3600000);
  assert.deepEqual(plain(t.londonParts(gmt)), { y: 2026, mo: 10, d: 25, h: 1, mi: 30 });
});

test("londonDayNo rolls at London midnight, not UTC midnight", () => {
  // 23:30Z on 4 Jul is already 00:30 on 5 Jul in London (BST).
  const lateZ = t.londonDayNo(Date.UTC(2026, 6, 4, 23, 30));
  const midday5th = t.londonDayNo(Date.UTC(2026, 6, 5, 10, 0));
  const evening4th = t.londonDayNo(Date.UTC(2026, 6, 4, 22, 30)); // 23:30 London, still 4 Jul
  assert.equal(lateZ, midday5th);
  assert.equal(lateZ, evening4th + 1);
});

test("parseClock reads am/pm blurbs and falls back to MEET_TIME otherwise", () => {
  assert.equal(t.parseClock("Chesham Underground Station, 9:18am"), "09:18");
  assert.equal(t.parseClock("12:00pm"), "12:00"); // noon stays 12
  assert.equal(t.parseClock("12:15am"), "00:15"); // midnight hour wraps to 00
  assert.equal(t.parseClock("7pm"), "19:00");     // minutes optional
  // The regex requires am/pm — a bare 24h clock or junk yields MEET_TIME ("09:00").
  assert.equal(t.parseClock("10:30"), "09:00");
  assert.equal(t.parseClock("brunch"), "09:00");
  assert.equal(t.parseClock(null), "09:00");
});

test("clockAdd wraps around midnight in both directions", () => {
  assert.equal(t.clockAdd("09:00", 30), "09:30");
  assert.equal(t.clockAdd("23:30", 45), "00:15");   // forward wrap
  assert.equal(t.clockAdd("00:10", -30), "23:40");  // backward wrap
  assert.equal(t.clockAdd(null, 15), "09:15");      // base defaults to MEET_TIME
  assert.equal(t.clockAdd("09:00", 29.6), "09:30"); // minutes are rounded
});

test("arrivalWindow brackets the ETA ±5 min with an en dash", () => {
  assert.equal(t.arrivalWindow(60, "09:00"), "09:55–10:05");
  assert.equal(t.arrivalWindow(30), "09:25–09:35");        // default base = MEET_TIME
  assert.equal(t.arrivalWindow(2, "23:59"), "23:56–00:06"); // window can straddle midnight
});

test("fmtTime renders minutes below the hour, h/m above", () => {
  assert.equal(t.fmtTime(59), "59 min");
  assert.equal(t.fmtTime(60), "1h 0m");
  assert.equal(t.fmtTime(171), "2h 51m");
  assert.equal(t.fmtTime(59.5), "1h 0m"); // rounds before splitting
  assert.equal(t.fmtTime(0), "0 min");
});

test("fmtPace converts decimal min/km to m:ss", () => {
  assert.equal(t.fmtPace(6.5), "6:30");
  assert.equal(t.fmtPace(6), "6:00");
  assert.equal(t.fmtPace(7.25), "7:15");
});
