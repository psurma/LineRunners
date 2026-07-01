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

Map images live in `img/` (converted from PDFs with `pdftocairo`). The standard map is an SVG so a single line can be highlighted; the rest are PNGs. TfL map artwork is © Transport for London — fine for club use, but a public deployment should use openly-licensed alternatives or a TfL licence.
