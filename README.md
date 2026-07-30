# Line Runners

**▶ Live site: [psurma.github.io/LineRunners](https://psurma.github.io/LineRunners/)**

Website for **Line Runners** — a free, self-guided guide to running London's whole transport network above ground: every Tube, Overground, DLR and Elizabeth line, the National Rail commuter routes out of town, the trams and the Superloop, plus bus routes, the London LOOP, the Capital Ring and a library of river, canal, park and landmark routes. Pick a line, see the distance and the route, then follow it end to end — on foot or by bike, at your own pace, whenever you like. Nothing to join, nothing to pay.

Plain HTML/CSS/JS. No build step.

## Screenshots

| Home | Journey &amp; loop planner |
| --- | --- |
| [![Line Runners home page](screenshots/hero.png)](https://psurma.github.io/LineRunners/) | [![Journey and loop route planner](screenshots/journey-planner.png)](https://psurma.github.io/LineRunners/#journey) |

[![Route library traced on the map](screenshots/routes.png)](https://psurma.github.io/LineRunners/#routes)

*Route library — tap a card to trace a route on the interactive map (Regent's Canal shown).*

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000 (opening `index.html` via `file://` is blocked by the browser).

## Features

- **Plan** — pick your start and finish on the next route for running distance, pace-adjusted finish time and a km/miles toggle, then follow the run live with the GPS tracker
- **Map** — tabbed viewer led by our own real geographic Leaflet map (the next line lit up with running times and toilet pins), plus Running/Walking times, Tube map, Overground, Rail connections, Trams, Superloop, London LOOP and Capital Ring views
- **Time machine** — scrub 190 years of London's railways and watch the network appear and creep outward, era by era
- **Journey** — shortest above-ground route between any two stations, hopping lines wherever they meet, or a loop generated from a spot; distance plus run, cycle and walk times
- **Lines** — every line ranked by length with run/walk times: Underground, Overground, Elizabeth, DLR, trams and the ten National Rail commuter operators
- **Schedule** — a suggested calendar of runs, auto-dated to first Sundays, plus multi-day adventures; also emitted as `data/schedule.json` and downloadable as .ics
- **Route ideas** — a library of London routes (parks, rivers, canals, disused railways, landmark tours), each traced on an interactive Leaflet map (tap a card to draw its route)
- **Buses** — all 676 London bus routes as runs, both directions, traced live from the TfL API, plus the 12 Superloop orbital routes
- **London LOOP / Capital Ring** — both signed orbitals section by section, with a GPX per section for your watch
- **Progress** — line collector (both directions of every line) and borough bagger
- Site-wide search, nearest-station lookup, per-line GPX downloads, live-now banner, new-runner guide and friends/other London clubs

## Editing

Everything data-driven lives at the top of `script.js`:

- `RUN_PLAN` — the suggested run calendar (tube / river / canal / bus / adventure)
- `WAYPOINTS` — ordered stations (with coords) for the planner + running-times
- `LINE_DIRS` — line-collector progress
- `LIVE` — live-now banner (flip `active` on run day, paste Garmin/Strava links)
- `ROUTES` — the route-ideas library

The `?v=` cache-buster on the `style.css` / `script.js` links in `index.html` is bumped automatically by the pre-commit hook whenever a commit touches the files it references — no hand-editing needed. The hook also syntax-checks `script.js`, regenerates `data/schedule.json` and runs `tools/validate-data.mjs` over the derived data. It lives tracked at `tools/pre-commit`; install it after a fresh clone with:

```
cp tools/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

## Maps

The map viewer (`#network`) has several tabs:

- **Map** — *our own* real geographic map: a [Leaflet](https://leafletjs.com) slippy map on the openly-licensed CARTO Voyager basemap (streets, parks, the Thames, place names), with every tube line drawn over real geography from `data/tube-lines.geojson`. The next run's line is lit up with cumulative running (or walking) times at each stop; other lines dim back. Interchanges show as white rings, toilets as teal WC pins. Scroll to zoom, drag to pan, hover a station.
- **Tube map** — the official TfL schematic (vector SVG) with the next line highlighted. TfL artwork, © Transport for London.
- **Running / Walking times, Toilets, Overground, Rail connections** — computed table and reference images.

### Data & attribution

- `data/tube-network.json` — 19 TfL lines / 470 stations with real coordinates, compiled from the [TfL Unified API](https://api.tfl.gov.uk) (open data). Drives station markers, interchange detection and running-time calculations.
- `data/nr-network.json` + `data/nr-lines.geojson` — the ten National Rail commuter operators (stations, branches and track geometry, clipped to the commuter belt), also from the TfL Unified API via `tools/generate-nr-lines.mjs`. Together the site covers 29 lines / ~1,000 stations, out to Portsmouth, Southend and Luton.
- `data/tube-lines.geojson` — real track geometry for the 19 TfL lines (`MultiLineString` per line), drawn as the coloured line overlay on the Leaflet map.
- `data/station-toilets.json` — stations with confirmed toilets, from TfL StopPoint facility data.
- `data/boroughs.json` — station/route → London borough tagging for the Borough bagger, from [ONS Open Geography](https://geoportal.statistics.gov.uk/) boundaries (OGL) via `tools/generate-boroughs.mjs`.
- `data/route-pubs.json` — well-rated pubs near each curated route's ends, from the [Food Standards Agency API](https://ratings.food.gov.uk) (open data) via `tools/generate-pubs.mjs`.
- Basemap tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, © [CARTO](https://carto.com/attributions); Leaflet is BSD-2-licensed.

Static image maps in `img/` were converted from PDFs with `pdftocairo`. TfL map artwork is © Transport for London — fine for club use, but a public deployment should prefer the openly-licensed / own-drawn maps above.
