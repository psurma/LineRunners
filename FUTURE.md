# TubeRun — Future Ideas

Backlog of stealable and original ideas. Nothing here is committed work; ordering
within sections is roughly impact-per-effort.

## Top picks

1. **Station-naming quiz** (steal: [Metro Memory](https://metro-memory.com/), the viral
   [London edition](https://london.metro-memory.com/)) — type station names from memory,
   watch them pop onto a blank network map. Pure client-side over our own data; per-line
   and whole-network modes; shareable score.
2. **Eki stamp book** (steal: Japan's [eki stamps](https://en.wikipedia.org/wiki/Eki_stamp) and
   [stamp rallies](https://www.japanrailclub.com/stamp-rallies-fun-unique-way-to-explore-japan-by-train/)) —
   a unique generated stamp per station, collected when ticked (or GPS-visited), a stamp-book
   page, themed rallies with completion badges ("the 1863 originals", "every Thames crossing").
   Pairs with the heritage/Time Machine data.
3. **GPS auto-ticking + LifeMap** (steal: [CityStrides](https://citystrides.com/)) — Follow Live
   already tracks GPS: auto-tick stations you pass (25 m node radius, optional Hard Mode),
   per-line completion %, and a personal "everywhere you've run" heatmap layer on the map.

## From tuberun.app (leftovers not yet stolen)

- **Dark mode** — light/dark toggle; we are light-only. High visibility, pure CSS.
- **Pub crawl planner** — routes between FSA-verified pubs (we already have the FSA data
  per route): stop count, radius, hygiene rating filters, "Hair of the Dog" early-opening
  mode. Plus a **Pub Passport**: pubs bagged by borough/postcode.
- **Achievements/badges** — exploration, consistency and discovery milestones over the
  collector data, with a retroactive check for already-earned ones. localStorage only.
- **Random route generator** — "surprise me": distance range, zone filter
  (Central/North/South/East/West), random vs fixed start/end, line-focus mode.
- **Visit-frequency progress map** — stations shaded by times visited (1x, 2-3x, 6+),
  not just binary ticked/unticked.
- **Manual run log + export** — date/distance/time/notes per run; stats (longest run,
  streaks); JSON/CSV export of all local data.
- Skipped deliberately: accounts, leaderboards, Strava auto-sync (need a backend —
  against the static ethos), line-theme unlocks (cosmetic).

## From the international scout

- **Station punch splits** (steal: [MapRun](https://www.learnorienteering.com/maprunF.html)
  virtual orienteering) — Follow Live beeps/vibrates entering each station's radius and
  records a timestamped split. Tube Challenge-style split log for free.
- **Yamathon event mode** (steal: [Tokyo Yamathon](https://www.tokyo-yamathon.com/)) — timed
  all-stations challenge on a loop line (Circle line), any route you like, photo checklist,
  optional local leaderboard.
- **Printable route cards** (steal: Dutch Railways'
  [NS Wandelingen](https://www.ns.nl/dagje-uit/wandelen) packaging) — one print-friendly
  card per run/journey: start, finish, distance, escape points, pubs, toilets, GPX QR code.
- **Run isochrones** (steal: [Chronotrains](https://www.chronotrains.com/)) — hover a
  station: shade everywhere reachable on foot in 30/60/90 min using our pace model and
  walk-times data.
- **New-ground scoring** (steal: [Wandrer](https://wandrer.earth/)) — only km on paths never
  run before count; monthly new-km totals.
- **Explorer tiles** (steal: [VeloViewer Max Square](https://blog.veloviewer.com/veloviewer-explorer-tiles-global-heatmap/),
  [Squadrats](https://squadrats.com/)) — light up map tiles your runs cross; chase the
  biggest filled square over London.
- Skipped deliberately: [Turf](https://turfgame.com/)-style zone capture (multiplayer backend).

## Engineering / data

- **Widen the coverage box** — Thameslink officially reaches Bedford, Cambridge and
  Peterborough; ours clips at Luton/Stevenage/Brighton. Mostly regeneration time
  (BRouter), busier map.
- **TubeRun MCP server** — small Node package exposing next-run/route/station tools over
  the existing JSON, so AI agents can query the club directly.
- **Map tab route picker: NR branches** — Line by line now lists every branch; the Map
  tab's picker still shows one entry per NR line (would add ~90 entries — needs grouping).
- **Greater Anglia stopping-pattern main** — the current main has a real but ugly 25 km
  Stratford - Shenfield fast hop; a stopping pattern would read better on the strip.
