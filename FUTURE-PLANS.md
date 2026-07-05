# TubeRun — Future Plans

Ideas worth stealing, from a July 2026 research sweep of London running crews'
websites, route-planning web apps, and London route-content / tube-challenge
culture. Everything here is feasible on this static site (no backend, no
accounts, localStorage only). Effort: S = an evening, M = a weekend-ish,
L = several sessions.

Done so far: next-run hero card (v159); live run clock + active-day card (v163).

## Quick wins

1. **GPX export per line run** (S) — serialize the traced polyline to a GPX 1.1
   `<trk>` Blob download, with stations as named `<wpt>` waypoints so watches
   show checkpoints. Pure client-side, no CSP change. The single most useful
   thing for runners on the day. (Model: gpx.studio, Plotaroute.) Generating the
   underlying real street-level route geometry is covered in the platforms/GPX
   section below.
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
5. **WhatsApp invite + Strava club links** (S) — prominent join links (plain
   `<a>`, no CSP cost). Do NOT embed the Strava club widget — it broke Jan 2026
   for logged-out visitors and needs a CSP hole; see the platforms section.
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

## Fitness platforms + generating the tube-line GPX (researched July 2026)

Deep-dived **Strava, Garmin, Komoot and AllTrails** for whether any can add live
features. Verdict: on a no-backend, strict-CSP static site, **none is usable as
a live integration — link to them, or export a file; never depend on them.**

- **Every live API is out.** All need a server to hold an OAuth secret (a static
  site can't), and each adds its own wall: Strava *bans* showing one member's
  data to any other user (Nov 2024), removes its club endpoints on 1 Sept 2026,
  and now charges for API access; Garmin is enterprise-only with the developer
  signup form on hold; Komoot is partner-gated (OAuth example repo archived Mar
  2026; Bending Spoons cut ~85% of staff after the 2025 buyout — don't build
  *on* it); AllTrails has no public API, anti-bot-walls its site, and its ToS
  bans automation *and* republishing exports.
- **Every embed is CSP-blocked out of the box** and not worth allowing. Strava's
  is the worst — an external `embed.js` needs a `script-src` hole. Garmin,
  Komoot and AllTrails are script-free iframes needing only `frame-src <host>`,
  but all drag a tracked third-party frame onto an accounts-free site and are
  redundant once we self-host our own routes. If we ever want one "last run"
  card, Garmin's activity iframe is the cleanest (`frame-src` only).
- **The one real win = self-hosted GPX generated from OpenStreetMap** — we own
  it (ODbL, attribution only, which we already show), zero runtime dependency,
  no CSP change.

### Generate runnable GPX for all 11 lines (buildable, ~2–3 h for a v1)

No reusable open GPX set exists (the "walked every line" project, Tubewalker, is
KMZ + All Rights Reserved; AllTrails exports are ToS-locked; Komoot routes are
user-owned). Generate instead — we already hold the ordered station coordinates
per line (the `route` orderings in tube-network.json + `WAYPOINTS`).

Pipeline (one-off, build-time, no backend, no CSP change):
1. For each line, call a free OSM **foot-router** once per consecutive station
   pair. It routes on pavements/footways, so it auto-avoids tunnels and rails
   (the `tube-lines.geojson` track geometry is NOT runnable — that's the point).
2. Concatenate the segments into one `<trk>` per line in a small local Node
   script → write `routes/<line>.gpx` with a `© OpenStreetMap contributors`
   `<metadata>` block. Commit the files; draw them on the existing Leaflet map.
3. Optionally polish each line ~20–40 min in gpx.studio, dragging it onto the
   club's real scenic route and fixing the artefacts below.

- **Engine:** OpenRouteService `foot-walking` (free key, native GPX out, best
  pedestrian tuning) or **BRouter** (no signup, no key). Skip Mapbox
  (proprietary terms muddy the OSM-only licensing).
- **Caveats:** Thames crossings divert to the nearest bridge / foot tunnel
  (correct, but diverges from the line there); a few stations snap to a platform
  and need a nudge; the odd leg returns no route (log it and hand-fix).
- **Feeds two features at once:** upgrades the on-site line geometry from
  straight station-hops to real street routes, AND gives idea #1 (GPX export)
  real files to hand out. Komoot/AllTrails can *draw* these too but add nothing
  over the free OSM routers (their street routing IS OSM) at the cost of
  login / paywall / vendor risk.

### Hosting note

Making the site "more dynamic" does NOT require leaving GitHub Pages: everything
built and planned runs client-side (the GPX step is build-time; files load
same-origin). The *only* thing that would need a server is exactly the API
integrations rejected above. If a genuine server need ever appears (an RSVP
form, or — against the advice above — an OAuth bit), add one small serverless
function (Cloudflare Worker free tier) and keep the site on Pages; don't migrate.

## Rejected (checked, not feasible without a backend)

- Strava / Garmin / Komoot / AllTrails live API or embeds — see the platforms
  section above; link-and-file only.
- RSVP / booking / attendance (Heylo, GoodGym) — if ever wanted, create a free
  Heylo or Strava group and link out, like every major crew does.
- *Runtime* auto-routing / snap-to-road in the browser — still out. But
  *build-time* GPX generation from OSM is now the recommended way to make the
  tube-line route geometry (see the GPX section above).
- Runtime elevation APIs — precompute and commit instead (see 24).

## Also parked (from the July 2026 code review)

- style.css two-theme merge (base + folded-in TfL Classic overlay, ~200–300
  lines reducible with zero visual change) — do as its own deliberate change.
- Walking-map markers 45/159/227 read 44/44/45 minutes — plausible long
  walks, verify against the source map sometime.
- External fetch timeouts (`AbortSignal.timeout`) — only if hangs ever annoy.
