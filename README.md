# Tube Run

Website for **London Tube Run** — a free, social running club that runs the course of London Underground lines above ground, once a month (sometimes more). Also does river/canal, landmark and out-of-town adventure routes.

Plain HTML/CSS/JS. No build step.

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000 (opening `index.html` via `file://` is blocked by the browser).

## Features

- **Next run** card with live weather (Open-Meteo) and a Google Maps meeting-point link
- **Plan** — station-to-station distance/time planner with run + walk times and a km/miles toggle
- **Map** — tabbed, zoomable viewer: Standard (next line highlighted), Running times, Walking times, Toilets, Overground, Rail connections
- **Lines** — every Underground line ranked by length with run/walk times
- **Schedule** — monthly runs, auto-dated to first Sundays, plus multi-day adventures
- **Route ideas** — a library of group-friendly London routes
- **Line collector** — gamified progress (both directions of every line)
- Live-now banner, photo gallery, new-runner guide, friends/other clubs, join form, socials

## Editing

Everything data-driven lives at the top of `script.js`:

- `CONNECT` — social links
- `RUN_PLAN` — the monthly schedule (tube / river / canal / bus / adventure)
- `WAYPOINTS` — ordered stations (with coords) for the planner + running-times
- `LINES_DONE` / `LINE_DIRS` — line-collector progress
- `LIVE` — live-now banner (flip `active` on run day, paste Garmin/Strava links)
- `ROUTES` — the route-ideas library
- `GALLERY` — photos

Bump the `?v=` query on the `style.css` / `script.js` links in `index.html` after edits to bust the browser cache during local dev.

## Maps

The map viewer (`#network`) has several tabs:

- **Tube map** — the official TfL schematic (vector SVG) with the next line highlighted. TfL artwork, © Transport for London.
- **Schematic ✦** — *our own* semantic Beck-style schematic (`data/schematic.json`), drawn from data so we control every station element: our labels, per-station run/walk times, precise line highlighting. Beta, central zone, expanding line by line.
- **Geographic** — our own map from real coordinates (`data/tube-network.json`), with run/walk time badges and toilet pins.
- **Running / Walking times, Toilets, Overground, Rail connections** — computed table and reference images.

### Data & attribution

- `data/tube-network.json` — 11 lines / 272 stations with real coordinates, compiled from the [TfL Unified API](https://api.tfl.gov.uk) (open data).
- `data/station-toilets.json` — stations with confirmed toilets, from TfL StopPoint facility data.
- `data/schematic.json` — Beck-style schematic coordinates, seeded from [`d3-tube-map`](https://github.com/johnwalley/d3-tube-map) by John Walley (**MIT licence**), extended over time.

Static image maps in `img/` were converted from PDFs with `pdftocairo`. TfL map artwork is © Transport for London — fine for club use, but a public deployment should prefer the openly-licensed / own-drawn maps above.
