/* Line Runners — MapLibre GL JS evaluation spike (throwaway, not wired into the app).
 *
 * Renders the whole rail network as ONE data-driven vector source over an
 * OpenFreeMap vector basemap, with Esri hillshade relief + the style's native
 * 3D buildings, and one sample "run" with an animated flow line — so we can
 * eyeball crisp labels and the hills a runner feels before deciding whether to
 * migrate the app's ~7 Leaflet raster surfaces. Everything here is keyless and
 * CORS-clean, so it also works deployed on GitHub Pages.
 *
 * Spike finding: a true elevation *mesh* (map.setTerrain) needs a CORS-enabled
 * DEM. The only keyless *global* DEM (AWS Terrarium) sends no CORS header, and
 * MapLibre's demotiles DEM only covers an Alps demo cell — so production terrain
 * would use OS Terrain / MapTiler free tier / a self-hosted DEM. Relief here is
 * therefore a shaded raster (Esri), which is keyless and needs no pixel read.
 */
(function () {
  "use strict";

  // Hilliest corner of the network (Hampstead / Highgate) — best place to judge relief.
  // Default is top-down (a clean vector network hero); the 3D tilt is opt-in.
  const START_VIEW = { center: [-0.155, 51.565], zoom: 12.4, pitch: 0, bearing: 0 };
  const TILT = { pitch: 58, bearing: -17 };
  const HILLSHADE = "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"; // Esri, CORS *

  const $ = (id) => document.getElementById(id);
  const setStatus = (msg, bad) => {
    const el = $("status");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("bad", !!bad);
  };

  if (typeof maplibregl === "undefined") {
    setStatus("MapLibre failed to load", true);
    return;
  }

  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: START_VIEW.center,
    zoom: START_VIEW.zoom,
    pitch: START_VIEW.pitch,
    bearing: START_VIEW.bearing,
    maxPitch: 80,
    hash: true, // shareable view in the URL
    attributionControl: { compact: true },
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

  // Surface tile/source failures instead of failing silently.
  map.on("error", (e) => {
    const msg = e && e.error && e.error.message ? e.error.message : String(e && e.type);
    console.error("[maplibre]", msg);
  });

  // Marching-dash sequence for the flow line (MapLibre's canonical animate-a-line pattern).
  const DASH_SEQ = [
    [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5],
    [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5],
    [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2],
    [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
  ];

  function distanceKm(lnglats) {
    const R = 6371, toR = Math.PI / 180;
    let d = 0;
    for (let i = 1; i < lnglats.length; i++) {
      const [lo1, la1] = lnglats[i - 1], [lo2, la2] = lnglats[i];
      const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR;
      const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) ** 2;
      d += 2 * R * Math.asin(Math.sqrt(a));
    }
    return d;
  }

  // First label (symbol) layer — insert our data below labels so place/station
  // names stay crisp on top of the lines and relief.
  function firstSymbolId() {
    const layers = map.getStyle().layers || [];
    for (const l of layers) if (l.type === "symbol") return l.id;
    return undefined;
  }

  map.on("load", async () => {
    const before = firstSymbolId();

    // --- Esri hillshade relief, shading the land beneath roads/labels ---
    map.addSource("hillshade", { type: "raster", tiles: [HILLSHADE], tileSize: 256, maxzoom: 16, attribution: "Hillshade &copy; Esri" });
    map.addLayer({ id: "hillshade", type: "raster", source: "hillshade", paint: { "raster-opacity": 0.3 } }, before);

    // Sky/atmosphere for the pitched horizon (the style already ships 3D buildings).
    map.setSky({ "sky-color": "#8fb2e6", "horizon-color": "#e4edf8", "fog-color": "#eef3fa", "sky-horizon-blend": 0.7, "horizon-fog-blend": 0.5 });

    // --- the whole rail network as ONE data-driven source (colour baked per feature) ---
    map.addSource("network", { type: "geojson", data: "data/tube-lines.geojson", attribution: "Lines &copy; TfL" });
    map.addLayer({
      id: "network",
      type: "line",
      source: "network",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": ["coalesce", ["get", "colour"], "#0019a8"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 13, 3.2, 16, 6],
        "line-opacity": 0.9,
      },
    }, before);

    // --- one sample run: base stroke + animated flow line on top ---
    try {
      const vr = await fetch("data/variant-routes.json").then((r) => r.json());
      const latlon = (vr.northern && vr.northern[0]) || [];
      const coords = latlon.map(([la, lo]) => [lo, la]); // [lat,lon] -> [lon,lat]
      if (coords.length < 2) throw new Error("no sample run geometry");
      const feature = { type: "Feature", geometry: { type: "LineString", coordinates: coords } };

      map.addSource("run", { type: "geojson", data: feature });
      map.addLayer({ id: "run-base", type: "line", source: "run", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#0b0b0b", "line-width": 6, "line-opacity": 0.32 } }, before);
      map.addLayer({ id: "run-flow", type: "line", source: "run", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffd200", "line-width": 4, "line-dasharray": [0, 4, 3] } }, before);

      new maplibregl.Marker({ color: "#00843d" }).setLngLat(coords[0]).setPopup(new maplibregl.Popup({ offset: 24 }).setText("Start")).addTo(map);
      new maplibregl.Marker({ color: "#dc241f" }).setLngLat(coords[coords.length - 1]).setPopup(new maplibregl.Popup({ offset: 24 }).setText("Finish")).addTo(map);

      const chip = $("runKm");
      if (chip) chip.textContent = distanceKm(coords).toFixed(1) + " km sample run";
      if (!location.hash) map.jumpTo({ center: coords[Math.floor(coords.length / 2)], zoom: START_VIEW.zoom, pitch: START_VIEW.pitch, bearing: START_VIEW.bearing });

      let step = 0;
      const animate = (t) => {
        const s = Math.floor((t / 55) % DASH_SEQ.length);
        if (s !== step) { map.setPaintProperty("run-flow", "line-dasharray", DASH_SEQ[s]); step = s; }
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
      setStatus("Live · vector basemap · hillshade relief · " + coords.length + "-pt flow line");
    } catch (err) {
      setStatus("Network drawn — sample run unavailable (" + err.message + ")", true);
    }
  });

  // --- toggles (stable label, aria-pressed = on) ---
  $("t3d").addEventListener("click", () => {
    const tilt = map.getPitch() < 12; // currently flat -> tilt on
    map.easeTo({ pitch: tilt ? TILT.pitch : 0, bearing: tilt ? TILT.bearing : 0, duration: 700 });
    $("t3d").setAttribute("aria-pressed", String(tilt));
  });

  $("trelief").addEventListener("click", () => {
    const on = map.getLayoutProperty("hillshade", "visibility") !== "none";
    map.setLayoutProperty("hillshade", "visibility", on ? "none" : "visible");
    $("trelief").setAttribute("aria-pressed", String(!on));
  });
})();
