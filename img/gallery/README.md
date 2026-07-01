# Run photos

Drop photos from the runs in this folder (JPG or PNG, ideally ~1200px wide), then
list them in `data/gallery.json` so they appear in the **From the runs** section.

Each entry:

```json
[
  { "src": "img/gallery/2026-07-first-sunday.jpg", "caption": "Metropolitan line — Chesham to Aldgate" }
]
```

- `src` — path to the image (relative to the site root).
- `caption` — optional line shown under the photo.

Leave `data/gallery.json` as `[]` to show the "Your photos here" placeholder.
A missing/broken image simply drops out; if none load, the placeholder returns.
