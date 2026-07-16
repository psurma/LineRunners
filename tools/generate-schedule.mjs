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
function upcomingSundays(n) {
  const out = [];
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1);
  while (out.length < n) {
    const first = new Date(d);
    while (first.getDay() !== 0) first.setDate(first.getDate() + 1);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (first >= today) out.push(first);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function computeRuns(RUN_PLAN) {
  const autoCount = RUN_PLAN.filter((r) => !r.date).length;
  const pinned = RUN_PLAN.filter((r) => r.date).map((r) => parseISO(r.date));
  const nearPinned = (sun) => pinned.some((p) => Math.abs(p - sun) <= 2 * DAY);
  const sundays = upcomingSundays(autoCount + pinned.length + 3).filter((s) => !nearPinned(s)).slice(0, autoCount);
  const suggestFrom = new Date(); suggestFrom.setHours(0, 0, 0, 0); suggestFrom.setDate(1); suggestFrom.setMonth(suggestFrom.getMonth() + 1);

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
  const runs = computeRuns(RUN_PLAN);
  const out = {
    club: "Tube Run",
    site: "https://psurma.github.io/TubeRun/",
    generated: iso(new Date()),
    rule: "Regular runs are the first Sunday of each month, meeting 09:00 at the start station unless stated; dated specials are pinned. Runs beyond the current month are suggestions until confirmed a month out.",
    runs,
  };
  writeFileSync(join(ROOT, "data/schedule.json"), JSON.stringify(out, null, 1));
  console.log(`data/schedule.json: ${runs.length} runs, next = ${runs.find((r) => r.date >= iso(new Date()))?.date ?? "none"}`);
}
