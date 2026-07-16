// iCalendar generation: escaping, RFC 5545 line folding, whole-event assembly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTubeRun } from "./_load.mjs";

const t = loadTubeRun();
const octets = (s) => new TextEncoder().encode(s).length;
const unfold = (s) => s.replace(/\r\n /g, "");

test("icsEsc escapes backslash, semicolon, comma and newline", () => {
  assert.equal(t.icsEsc("x\\y;z,w\nq"), "x\\\\y\\;z\\,w\\nq");
  assert.equal(t.icsEsc("plain text"), "plain text");
  assert.equal(t.icsEsc("Brixton stn (outside M&S), London"), "Brixton stn (outside M&S)\\, London");
});

test("icsFold folds multibyte content at the octet limit and round-trips", () => {
  const line = "SUMMARY:" + "·".repeat(100); // "·" is 2 UTF-8 octets
  const folded = t.icsFold(line);
  const phys = folded.split("\r\n");
  assert.ok(phys.length > 1, "long line actually folded");
  for (const p of phys) assert.ok(octets(p) <= 75, `physical line is ${octets(p)} octets`);
  for (const p of phys.slice(1)) assert.ok(p.startsWith(" "), "continuation lines start with a space");
  // Folding never splits a multibyte character: every physical line must decode alone.
  const strict = new TextDecoder("utf-8", { fatal: true });
  for (const p of phys) strict.decode(new TextEncoder().encode(p));
  assert.equal(unfold(folded), line, "unfolding restores the input exactly");
});

test("icsFold leaves a short ASCII line untouched", () => {
  assert.equal(t.icsFold("BEGIN:VEVENT"), "BEGIN:VEVENT");
});

test("runIcs builds a valid single-day event at MEET_TIME", () => {
  const r = {
    key: "Victoria", badge: "Victoria line", date: new Date(2026, 7, 2),
    leg: "Brixton → Walthamstow Central", distance: "~26 km",
    start: "Brixton stn (outside M&S)", location: "London",
  };
  const ics = t.runIcs(r);
  const lines = ics.split("\r\n");
  for (const l of lines) assert.ok(octets(l) <= 75, `folded output line ≤75 octets: ${l}`);
  const u = unfold(ics).split("\r\n");
  assert.equal(u[0], "BEGIN:VCALENDAR");
  assert.equal(u[u.length - 1], "END:VCALENDAR");
  assert.ok(u.includes("BEGIN:VEVENT") && u.includes("END:VEVENT"));
  assert.ok(u.includes("DTSTART:20260802T090000"), "starts at MEET_TIME on the run's date");
  assert.ok(u.includes("DTEND:20260802T113000"), "2h30 block");
  assert.ok(u.includes("UID:20260802-victoria@tuberun"));
  assert.ok(u.includes("SUMMARY:Tube Run · Victoria line"));
  assert.ok(u.includes("LOCATION:Brixton stn (outside M&S)\\, London"), "location comma escaped");
  assert.ok(u.some((l) => /^DTSTAMP:\d{8}T\d{6}Z$/.test(l)), "DTSTAMP is a UTC timestamp");
  const desc = u.find((l) => l.startsWith("DESCRIPTION:"));
  assert.ok(desc.includes("Brixton → Walthamstow Central\\n~26 km\\nMeet 09:00"), "description carries leg/distance/meet");
});

test("runIcs uses all-day DTSTART/DTEND (exclusive end) for multi-day events", () => {
  const r = {
    key: "Metropolitan", badge: "Metropolitan line", date: new Date(2026, 6, 4),
    leg: "Chesham → Aldgate", distance: "2 days · ~59 km",
    start: "Chesham Underground Station", location: "London",
    days: [{ title: "d1" }, { title: "d2" }],
  };
  const u = unfold(t.runIcs(r)).split("\r\n");
  assert.ok(u.includes("DTSTART;VALUE=DATE:20260704"));
  assert.ok(u.includes("DTEND;VALUE=DATE:20260706"), "DTEND is the day AFTER the last day");
  assert.ok(!u.some((l) => l.includes("Meet 09:00")), "no meet time in a multi-day description");
});
