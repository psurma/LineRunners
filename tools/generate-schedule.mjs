// Emit data/schedule.json — the run calendar as static, agent-readable data.
// RUN_PLAN stays defined in script.js (single source of truth); this extracts
// it and applies the same scheduling rule the site uses: entries with an
// explicit date are pinned, the rest fill upcoming first-Sundays in listed
// order, skipping weekends a pinned special already takes. Runs from next
// month on are tentative until the plan firms up a month out.
//
//   node tools/generate-schedule.mjs   (also run by the pre-commit hook)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "script.js"), "utf8");

// Slice the RUN_PLAN array literal out of script.js and evaluate it alone.
const start = src.indexOf("const RUN_PLAN = [");
if (start === -1) throw new Error("RUN_PLAN not found in script.js");
let depth = 0, i = src.indexOf("[", start), end = -1;
for (; i < src.length; i++) {
  const c = src[i];
  if (c === "[") depth++;
  else if (c === "]") { depth--; if (!depth) { end = i; break; } }
  else if (c === '"' || c === "'" || c === "`") { const q = c; for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++; }
}
if (end === -1) throw new Error("RUN_PLAN array not closed");
const RUN_PLAN = new Function(`return ${src.slice(src.indexOf("[", start), end + 1)};`)();

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
const autoCount = RUN_PLAN.filter((r) => !r.date).length;
const pinned = RUN_PLAN.filter((r) => r.date).map((r) => parseISO(r.date));
const nearPinned = (sun) => pinned.some((p) => Math.abs(p - sun) <= 2 * DAY);
const sundays = upcomingSundays(autoCount + pinned.length + 3).filter((s) => !nearPinned(s)).slice(0, autoCount);
const suggestFrom = new Date(); suggestFrom.setHours(0, 0, 0, 0); suggestFrom.setDate(1); suggestFrom.setMonth(suggestFrom.getMonth() + 1);

let si = 0;
const runs = RUN_PLAN.map((r) => {
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

const out = {
  club: "Tube Run",
  site: "https://psurma.github.io/TubeRun/",
  generated: iso(new Date()),
  rule: "Regular runs are the first Sunday of each month, meeting 09:00 at the start station unless stated; dated specials are pinned. Runs beyond the current month are suggestions until confirmed a month out.",
  runs,
};
writeFileSync(join(ROOT, "data/schedule.json"), JSON.stringify(out, null, 1));
console.log(`data/schedule.json: ${runs.length} runs, next = ${runs.find((r) => r.date >= iso(new Date()))?.date ?? "none"}`);
