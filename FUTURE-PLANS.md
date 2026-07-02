# TubeRun — Future Plans

Ideas worth stealing, from a July 2026 research sweep of London running crews'
websites, route-planning web apps, and London route-content / tube-challenge
culture. Everything here is feasible on this static site (no backend, no
accounts, localStorage only). Effort: S = an evening, M = a weekend-ish,
L = several sessions.

Done so far: next-run hero card (v159).

## Quick wins

1. **GPX export per line run** (S) — serialize the traced polyline to a GPX 1.1
   `<trk>` Blob download, with stations as named `<wpt>` waypoints so watches
   show checkpoints. Pure client-side, no CSP change. The single most useful
   thing for runners on the day. (Model: gpx.studio, Plotaroute.)
2. **Subscribe-able calendar** (S) — a static `tuberun.ics` of upcoming
   first-Sunday runs (multi-day lines as multi-event blocks) + per-run
   "Add to Google Calendar" links. No London crew does this.
3. **"Your First TubeRun" page** (S) — parkrun-style first-timer briefing:
   what to expect, what to bring (contactless!), the regroup rule, and the
   built-in reassurance: bail at any station and take the train back.
4. **Km-split markers on route lines** (S) — small numbered divIcons every
   1000 m along traced routes; with the pace value they become projected
   regroup times ("km 4 ≈ Great Portland Street, ~28 min"). (Model:
   Plotaroute, London Marathon course maps.)
5. **WhatsApp invite + Strava club links** (S) — prominent join links; Strava
   club embed widget only as progressive enhancement (flaky since Jan 2026).
6. **Aggregate stats strip** (S) — "11 lines · 272 stations · 402 km of track
   · N runs done" computed from existing data. Numbers = credibility.
   (Model: Track Life LDN, GoodGym.)
7. **Ethos / About page** (S) — one strong paragraph of identity + origin
   story. (Model: Run Dem Crew, Chasing Lights.)

## Engagement backbone

8. **Percent-of-network lit/grey map** (M) — CityStrides adapted to a finite
   network: completed inter-station segments glow in line colour, unrun ones
   grey; "Victoria line 93% · whole network 38%". Tracks in localStorage at
   segment granularity; composes with the badge collector. The Tube is a
   cleaner completion graph than streets ever are.
9. **Meta-badges over the completion log** (M) — "Zone 1 complete", "all
   interchanges on a line", "longest connected streak", "all four Circle
   quadrants". Stops the badge collector plateauing. (Model: VeloViewer
   max-square, StatsHunters clusters.)
10. **Shareable achievement cards** (M) — canvas-rendered PNG (route
    silhouette drawn from coords, line colour, big stats, date) via
    `canvas.toBlob()` + Web Share API straight into the group WhatsApp.
    Draw vectors only — never rasterize map tiles (OSM policy + canvas taint).
11. **Per-line course pages, parkrun style** (M) — map, stage breakdown,
    bail-out stations, toilets/coffee, meeting-spot photo. Structural
    principle (TfL Capital Ring / Ramblers): every leg is station-to-station,
    independently joinable/leavable — make the **leg** the first-class data
    unit and hang POIs/toilets/coffee/terrain/bail-outs off it.
12. **Printable one-page run sheet** (S–M) — `@media print` template off route
    JSON: legs, distances, projected clock times, bail-outs, organizer phone.
    The run leader's laminated sheet. (Model: Inner London Ramblers PDFs.)
13. **Plan-in-a-URL deep links** (S–M) — encode line/direction/pace/start in
    the hash (`#line=victoria&pace=630&start=0900`) so "here's Sunday's plan"
    is one WhatsApp link opening the journey board pre-configured.
14. **Animated route playback** (M) — requestAnimationFrame dot tracing the
    course with station names popping and the ETA clock ticking; press play
    and watch Sunday's run at 60x. (Model: Plotaroute event route maps.)

## Culture and content (authoring-heavy, code-light)

15. **Highlights/POI strips per route** (S–M) — 5–10 hand-authored points of
    interest per route keyed to legs, as map pins + a numbered list. Turns a
    line into a story. (Model: Tubewalker, Mark Mason's Walk the Lines.)
16. **Station trivia one-liners** (M) — "did you know" per station passed
    (opened 1863, ghost station nearby, name origin); start with stations on
    existing routes. (Model: Diamond Geezer.)
17. **Run reports + verified ticks** (S–M) — routes get a lifecycle:
    proposed → recced → run → verified, plus a short structured report after
    each run. (Model: Slow Ways.)
18. **FKT-style honour board** (S–M) — hand-authored `fkt.json` per line:
    fastest known completion, first completion, most stations in a day, with
    names/dates/Strava links. Club folklore, zero backend. (Model:
    fastestknowntime.com.)
19. **Tube Challenge sub-formats** (S–M) — annual "Zone 1 Bottle Run" special
    (all stations inside the Circle), a cumulative club league table from
    hand-logged history JSON, and a playful published rulebook of what counts
    as "running a line". (Model: Guinness Tube Challenge culture, All The
    Stations' rules page.)
20. **Bail-out grading per leg** (S–M) — nearest mid-leg station, toilets,
    terrain (pavement/towpath/park/steps), rough grade. Answers the #1
    practical question: "can I drop out at Turnham Green?" (Model: Slow Ways
    surveys.)
21. **Pub / coffee / snack layer** (S–M) — per leg: coffee at the start, pub
    at the finish, mid-route snack, each with a one-line reason. Pairs with
    the toilets data as an amenities layer. (Model: Londonist canal walks.)
22. **Photo wall by line/run date** (S–M) — repo-hosted images + captions in
    JSON, each tile optionally linking to the Instagram post. Fills the
    gallery placeholder without waiting on an Instagram feed.
23. **Surface/character bar per route** (S) — Komoot-style stacked bar
    (x% pavement / park / towpath / heavy crossings); better shoe-choice info
    than an elevation profile in London.
24. **Elevation profiles** (M) — precompute from Open Topo Data (EU-DEM,
    no key) at authoring time and commit as JSON so the CSP never changes;
    hoverable chart synced to a map marker. (Model: gpx.studio.)
25. **Scrollytelling course page for one flagship line** (L) — scroll-driven
    map flyover with landmark cards. Beautiful but the most effort; do one
    line first. (Model: London Marathon course page.)
26. **Merch storefront link** (S site-side) — print-on-demand roundel-style
    "I ran the Bakerloo" designs, linked from earned badges. (Model: parkrun
    milestone shop.)
27. **Partner-crews page extension** (S) — clubs whose turf each line passes
    through: "running the Victoria line? Say hi to The Outrunners in Hackney."

## Rejected (checked, not feasible without a backend)

- Strava segments / club API embeds (auth-gated; widgets broken since
  Jan 2026 anyway) — plain links only.
- RSVP / booking / attendance (Heylo, GoodGym) — if ever wanted, create a free
  Heylo or Strava group and link out, like every major crew does.
- Auto route generation / snap-to-road drawing — needs a routing engine;
  routes are fixed and hand-authored anyway.
- Runtime elevation APIs — precompute and commit instead (see 24).

## Also parked (from the July 2026 code review)

- style.css two-theme merge (base + folded-in TfL Classic overlay, ~200–300
  lines reducible with zero visual change) — do as its own deliberate change.
- Walking-map markers 45/159/227 read 44/44/45 minutes — plausible long
  walks, verify against the source map sometime.
- External fetch timeouts (`AbortSignal.timeout`) — only if hangs ever annoy.
