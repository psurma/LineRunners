// Emit data/schedule.json — the run calendar as static, agent-readable data.
// RUN_PLAN stays defined in script.js (single source of truth); this extracts
// it and applies the same scheduling rule the site uses: entries with an
// explicit date are pinned, the rest fill upcoming first-Sundays in listed
// order, skipping weekends a pinned special already takes. Runs from next
// month on are tentative until the plan firms up a month out.
//
//   node tools/generate-schedule.mjs   (also run by the pre-commit hook)
//
// computeRuns is exported so tools/validate-data.mjs can diff the committed
// schedule.json against what RUN_PLAN currently produces.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { extractLiteral } from "./lib/extract.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Same rule as script.js's schedule builder.
const DAY = 86400000;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Reference "today", as a local midnight. SOURCE_DATE_EPOCH (the reproducible-
// builds convention) pins it, so the same commit regenerates the same file on
// any day and in any timezone: its calendar date is read in UTC and rebuilt as a
// local midnight, which keeps a CI box on UTC and a laptop on Europe/London in
// agreement. Unset, it means the real today.
function refToday() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch) { const u = new Date(+epoch * 1000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); }
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d;
}
// Calendar-day number, DST-free: two local midnights an hour apart across a BST
// transition are still one day apart here, where a raw millisecond delta isn't.
const dayNo = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);

function upcomingSundays(n) {
  const out = [];
  const today = refToday();
  const d = new Date(today); d.setDate(1);
  while (out.length < n) {
    const first = new Date(d);
    while (first.getDay() !== 0) first.setDate(first.getDate() + 1);
    if (first >= today) out.push(first);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function computeRuns(RUN_PLAN) {
  const autoCount = RUN_PLAN.filter((r) => !r.date).length;
  const pinned = RUN_PLAN.filter((r) => r.date).map((r) => parseISO(r.date));
  const nearPinned = (sun) => pinned.some((p) => Math.abs(dayNo(p) - dayNo(sun)) <= 2);
  const sundays = upcomingSundays(autoCount + pinned.length + 3).filter((s) => !nearPinned(s)).slice(0, autoCount);
  const suggestFrom = refToday(); suggestFrom.setDate(1); suggestFrom.setMonth(suggestFrom.getMonth() + 1);

  let si = 0;
  return RUN_PLAN.map((r) => {
    const date = r.date ? parseISO(r.date) : sundays[si++];
    return { r, date, pinnedRun: !!r.date };
  }).sort((a, b) => a.date - b.date).map(({ r, date, pinnedRun }) => ({
    date: iso(date),
    days: r.days ? r.days.length : 1,
    status: pinnedRun ? "confirmed" : date >= suggestFrom ? "suggested" : "confirmed",
    kind: r.type || "run",
    name: r.name || (r.line ? `${r.line} line` : "Run"),
    line: r.line || null,
    leg: r.leg || null,
    start: r.start || null,
    distance: r.distance || null,
    location: r.location || "London",
    routeLink: r.routeLink || null,
    notes: r.notes || null,
    exits: r.exits || null,
  }));
}

// CLI: extract RUN_PLAN and write the file (skipped when imported, e.g. by the validator).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const RUN_PLAN = extractLiteral(readFileSync(join(ROOT, "script.js"), "utf8"), "RUN_PLAN");
  const today = refToday();
  const runs = computeRuns(RUN_PLAN);
  const file = join(ROOT, "data/schedule.json");
  const out = {
    club: "Overland",
    site: "https://psurma.github.io/Overland/",
    generated: "",
    rule: "Regular runs are the first Sunday of each month, meeting 09:00 at the start station unless stated; dated specials are pinned. Runs beyond the current month are suggestions until confirmed a month out.",
    runs,
  };
  // Keep the previous stamp when nothing else moved. The pre-commit hook
  // regenerates on every script.js/data commit, so a fresh date here would leave
  // a one-line diff on commits that changed no run at all.
  let previous = null;
  try { previous = JSON.parse(readFileSync(file, "utf8")); } catch { /* first run */ }
  const same = previous && previous.club === out.club && previous.site === out.site &&
    previous.rule === out.rule && JSON.stringify(previous.runs) === JSON.stringify(runs);
  out.generated = same && previous.generated ? previous.generated : iso(today);
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`data/schedule.json: ${runs.length} runs, next = ${runs.find((r) => r.date >= iso(today))?.date ?? "none"}`);
}
