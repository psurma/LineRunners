/* Tube Run — schedule, distance planner, route map, weather, socials.
   ---------------------------------------------------------------------------
   EDIT THESE to run the group:
     • CONNECT      — your Strava + WhatsApp links
     • RUN_PLAN     — the rolling monthly plan (tube OR river/canal/bus routes)
     • WAYPOINTS    — ordered points (with coords) for any route you want to
                      show on the map / use in the distance planner
   Dates auto-assign to upcoming first-Sundays, so you never type a date. */
(() => {
  "use strict";

  // --- Your links --------------------------------------------------------
  const CONNECT = {
    strava: "https://www.strava.com/clubs/ldntuberun",
    instagram: "https://www.instagram.com/ldntuberun",
    facebook: "https://www.facebook.com/LdnTubeRun/",
    twitter: "https://twitter.com/LdnTubeRun",
    eventbrite: "http://london-tube-run.eventbrite.co.uk",
    whatsapp: "", // TODO: paste the WhatsApp group invite link when ready
  };

  // --- LIVE NOW ----------------------------------------------------------
  // On run day, set active:true and paste the share links a runner generates
  // from Garmin LiveTrack and/or Strava Beacon. A red "LIVE NOW" banner then
  // shows at the top of the site linking straight to the live map.
  // Set active:false again after the run (or add ?live to the URL to preview).
  const LIVE = {
    active: false,
    label: "Victoria line run",   // what's happening right now
    startedAt: "09:04",           // optional, shown on the banner
    garmin: "",                   // e.g. https://livetrack.garmin.com/session/...
    strava: "",                   // e.g. https://www.strava.com/beacon/...
  };

  // --- LINE COLLECTOR ----------------------------------------------------
  // Direction matters: running a line one way is a different run from running
  // it back, so every line has TWO collectible directions (22 in total).
  // LINE_DIRS gives each line's two direction labels [dir0, dir1].
  const TUBE_LINES = [
    "Bakerloo", "Central", "Circle", "District", "Hammersmith & City",
    "Jubilee", "Metropolitan", "Northern", "Piccadilly", "Victoria", "Waterloo & City",
  ];
  const LINE_DIRS = {
    Bakerloo: ["→ Harrow & Wealdstone", "→ Elephant & Castle"],
    Central: ["→ Epping", "→ Ealing Broadway"],
    Circle: ["Clockwise ↻", "Anticlockwise ↺"],
    District: ["→ Upminster", "→ Richmond / Wimbledon"],
    "Hammersmith & City": ["→ Barking", "→ Hammersmith"],
    Jubilee: ["→ Stratford", "→ Stanmore"],
    Metropolitan: ["→ Aldgate", "→ Amersham / Uxbridge"],
    Northern: ["→ Morden", "→ High Barnet / Edgware"],
    Piccadilly: ["→ Cockfosters", "→ Heathrow / Uxbridge"],
    Victoria: ["→ Walthamstow Central", "→ Brixton"],
    "Waterloo & City": ["→ Bank", "→ Waterloo"],
  };
  // Tick off directions you've run, as "Line|0" or "Line|1" (index into LINE_DIRS).
  const LINES_DONE = ["Victoria|0", "Central|0", "Jubilee|0"]; // TODO: set your real tally

  // --- GALLERY -----------------------------------------------------------
  // Drop in photos: { src: "photos/xyz.jpg", caption: "..." }. Leave empty to
  // show a friendly "share your photos" placeholder.
  const GALLERY = [];

  const MEET_TIME = "09:00";
  const ROAD_FACTOR = 1.3;   // streets are longer than crow-flies between points
  const WALK_MIN_PER_KM = 12; // ~5 km/h walking pace
  const LONDON = { lat: 51.5033, lon: -0.1145 };

  // Official-ish TfL line colours.
  const LINE_COLOURS = {
    Bakerloo: "#B36305", Central: "#E32017", Circle: "#FFD300", District: "#00782A",
    "Hammersmith & City": "#F3A9BB", Jubilee: "#A0A5A9", Metropolitan: "#9B0056",
    Northern: "#000000", Piccadilly: "#003688", Victoria: "#0098D4",
    "Waterloo & City": "#95CDBA", Elizabeth: "#6950A1", Overground: "#EE7C0E", DLR: "#00A4A7",
  };
  // Colours + labels for non-tube run types.
  const TYPE_STYLE = {
    river: { colour: "#1CA6C4", label: "River run" },
    canal: { colour: "#2E8B57", label: "Canal run" },
    bus:   { colour: "#E2231A", label: "Bus route" },
    trail: { colour: "#5A7D2A", label: "Trail run" },
    adventure: { colour: "#5A7D2A", label: "Adventure" },
    other: { colour: "#0019A8", label: "Special run" },
  };

  // The rolling plan. `type: "tube"` uses the line's colour + station list.
  // For river/canal/bus/adventure/etc. give a `name` and optional `colour`; add
  // matching WAYPOINTS below if you want it on the map / in the planner.
  //
  // Regular runs auto-assign to the next first-Sundays (in listed order).
  // Give an entry an explicit `date: "YYYY-MM-DD"` for one-off events (e.g. an
  // out-of-London or multi-day adventure) — those slot into the calendar by date.
  //
  // Optional rich fields (all optional):
  //   location   — shown when it's not "London"
  //   routeLink  — external route (Garmin/Strava/komoot)
  //   days       — [{ title, start, distance, finish, pitstops }] for multi-day
  //   exits      — [{ name, at }] escape points partway (name + distance marker)
  //   stay       — [{ name, url }] accommodation options
  //   notes      — free text
  const RUN_PLAN = [
    { type: "tube", line: "Victoria", leg: "Brixton → Walthamstow Central", start: "Brixton stn (outside M&S)", distance: "~13 km" },
    {
      type: "adventure", name: "Shipwrights Way", colour: "#5A7D2A",
      date: "2026-07-18", location: "East Hampshire → Portsmouth",
      leg: "Bentley Station → Historic Dockyard", start: "Bentley Station (60 min from Waterloo)",
      distance: "46 miles over 2 days",
      routeLink: "https://connect.garmin.com/app/course/481185821",
      notes: "Phil's birthday adventure across the South Downs to the sea. Bag drop + return supported by Brompton.",
      days: [
        { title: "Day 1 — Bentley to Queen Elizabeth Country Park", start: "Bentley Station", distance: "27 miles", pitstops: "3 pitstops", finish: "Campsite, or lift back to Petersfield stn" },
        { title: "Day 2 — QECP to Portsmouth", start: "Queen Elizabeth Country Park", distance: "19 miles", finish: "Historic Dockyard — trains to London ~1 hr" },
      ],
      exits: [
        { name: "Liss", at: "14.2 mi" }, { name: "Petersfield", at: "18 mi" },
        { name: "Rowlands Castle", at: "30 mi" }, { name: "Havant", at: "34 mi" },
      ],
      stay: [
        { name: "Upper Parsonage Farm (hut / tent / self-catering)", url: "https://www.upperparsonagefarm.co.uk/farm-history" },
        { name: "Rising Sun Inn", url: "https://risingsunclanfield.co.uk/" },
      ],
    },
    { type: "tube", line: "Bakerloo", leg: "Elephant & Castle → Harrow & Wealdstone", start: "Elephant & Castle stn", distance: "~15 km" },
    { type: "canal", name: "Regent's Canal towpath", leg: "Little Venice → Limehouse Basin", start: "Warwick Ave stn", distance: "~14 km" },
    { type: "tube", line: "Central", leg: "Liverpool St → Ealing Broadway", start: "Liverpool Street stn (main entrance)", distance: "~14 km" },
    { type: "river", name: "Thames Path", leg: "Putney Bridge → Tower Bridge", start: "Putney Bridge stn", distance: "~16 km" },
    { type: "bus", name: "Route 38", leg: "Clapton Pond → Victoria", start: "Clapton Pond", distance: "~11 km" },
  ];

  // Ordered stops/waypoints for the planner + map. Keyed by tube line name or
  // by a non-tube route's `name`. Approximate coords (good to a few %).
  const WAYPOINTS = {
    Victoria: [
      ["Brixton", 51.4627, -0.1145], ["Stockwell", 51.4723, -0.1229], ["Vauxhall", 51.4861, -0.1253],
      ["Pimlico", 51.4893, -0.1334], ["Victoria", 51.4965, -0.1447], ["Green Park", 51.5067, -0.1428],
      ["Oxford Circus", 51.5152, -0.1418], ["Warren Street", 51.5247, -0.1384], ["Euston", 51.5282, -0.1337],
      ["King's Cross St Pancras", 51.5308, -0.1238], ["Highbury & Islington", 51.5464, -0.1031],
      ["Finsbury Park", 51.5642, -0.1065], ["Seven Sisters", 51.5828, -0.0749], ["Tottenham Hale", 51.5882, -0.0594],
      ["Blackhorse Road", 51.5867, -0.0410], ["Walthamstow Central", 51.5830, -0.0195],
    ],
    Bakerloo: [
      ["Elephant & Castle", 51.4943, -0.1001], ["Lambeth North", 51.4991, -0.1115], ["Waterloo", 51.5036, -0.1143],
      ["Embankment", 51.5074, -0.1223], ["Charing Cross", 51.5074, -0.1278], ["Piccadilly Circus", 51.5100, -0.1337],
      ["Oxford Circus", 51.5152, -0.1418], ["Regent's Park", 51.5234, -0.1466], ["Baker Street", 51.5226, -0.1571],
      ["Marylebone", 51.5225, -0.1631], ["Edgware Road", 51.5203, -0.1701], ["Paddington", 51.5154, -0.1755],
      ["Warwick Avenue", 51.5232, -0.1838], ["Maida Vale", 51.5299, -0.1855], ["Kilburn Park", 51.5350, -0.1944],
      ["Queen's Park", 51.5341, -0.2047], ["Kensal Green", 51.5304, -0.2249], ["Willesden Junction", 51.5320, -0.2438],
      ["Harlesden", 51.5362, -0.2575], ["Stonebridge Park", 51.5439, -0.2755], ["Wembley Central", 51.5519, -0.2963],
      ["North Wembley", 51.5621, -0.3037], ["South Kenton", 51.5700, -0.3081], ["Kenton", 51.5816, -0.3162],
      ["Harrow & Wealdstone", 51.5925, -0.3346],
    ],
    // Non-tube example — add coords for your canal/river/bus routes the same way:
    "Regent's Canal towpath": [
      ["Little Venice", 51.5218, -0.1830], ["Camden Lock", 51.5416, -0.1465], ["King's Cross", 51.5350, -0.1240],
      ["Islington Tunnel (Angel)", 51.5330, -0.1030], ["Victoria Park", 51.5362, -0.0400],
      ["Mile End", 51.5250, -0.0330], ["Limehouse Basin", 51.5122, -0.0390],
    ],
  };

  // --- Date helpers ------------------------------------------------------
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function firstSunday(year, month) {
    const d = new Date(year, month, 1);
    return new Date(year, month, 1 + ((7 - d.getDay()) % 7));
  }
  function upcomingSundays(count) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const out = []; let y = now.getFullYear(), m = now.getMonth();
    while (out.length < count) {
      const fs = firstSunday(y, m);
      if (fs >= now) out.push(fs);
      if (++m > 11) { m = 0; y++; }
    }
    return out;
  }
  function daysUntil(date) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((date - now) / 86400000);
  }
  function countdownText(date) {
    const d = daysUntil(date);
    if (d === 0) return "Today — let's run!";
    if (d === 1) return "Tomorrow";
    if (d < 7) return `In ${d} days`;
    const w = Math.round(d / 7);
    return `In ${w} week${w > 1 ? "s" : ""}`;
  }
  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  // --- Route normalisation ----------------------------------------------
  // Turn a RUN_PLAN entry into a uniform shape the UI can render.
  function normalise(entry) {
    const rich = {
      location: entry.location || "London",
      map: entry.map || null,            // optional explicit Google Maps URL for the meeting point
      routeLink: entry.routeLink || null,
      days: entry.days || null,
      exits: entry.exits || null,
      stay: entry.stay || null,
      notes: entry.notes || null,
      leg: entry.leg, start: entry.start, distance: entry.distance,
    };
    if (entry.type === "tube") {
      return { ...rich, key: entry.line, badge: `${entry.line} line`, colour: LINE_COLOURS[entry.line] || "#0019A8" };
    }
    const style = TYPE_STYLE[entry.type] || TYPE_STYLE.other;
    return { ...rich, key: entry.name, badge: `${entry.name} · ${style.label}`, colour: entry.colour || style.colour };
  }
  function isDark(hex) {
    const c = hex.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 140;
  }
  function contrastText(hex) { return hex === "#FFD300" ? "#10131c" : (isDark(hex) ? "#fff" : "#10131c"); }
  // Google Maps link for a run's meeting point — explicit `map` URL if given,
  // otherwise a search built from the start point + its location.
  function meetMapUrl(r) {
    if (r.map && /^https?:\/\//i.test(r.map)) return r.map;
    const where = r.location && r.location !== "London" ? r.location : "London";
    const q = `${r.start}, ${where}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  // --- Build schedule ----------------------------------------------------
  // Entries with an explicit `date` are pinned; the rest fill the upcoming
  // first-Sundays in listed order. Everything is then sorted chronologically.
  function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  const autoCount = RUN_PLAN.filter((r) => !r.date).length;
  const sundays = upcomingSundays(autoCount);
  let si = 0;
  const runs = RUN_PLAN
    .map((r) => ({ ...normalise(r), date: r.date ? parseISO(r.date) : sundays[si++] }))
    .sort((a, b) => a.date - b.date);
  const nextRun = runs[0];

  // --- Distance maths ----------------------------------------------------
  function haversineKm(a, b) {
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]), dLon = toRad(b[2] - a[2]);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(s));
  }
  function legDistanceKm(pts, i, j) {
    let km = 0;
    for (let k = i; k < j; k++) km += haversineKm(pts[k], pts[k + 1]);
    return km * ROAD_FACTOR;
  }
  function fmtTime(mins) {
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h ? `${h}h ${m}m` : `${m} min`;
  }

  // --- Render: Next run card + weather ----------------------------------
  function renderNext() {
    const el = document.getElementById("nextCard");
    if (!el || !nextRun) return;
    const c = nextRun.colour, tc = contrastText(c);
    el.style.borderLeftColor = c;
    el.innerHTML = `
      <div class="date-badge">
        <div class="dow">${DOW[nextRun.date.getDay()]}</div>
        <div class="day">${nextRun.date.getDate()}</div>
        <div class="mon">${MON[nextRun.date.getMonth()]} ${nextRun.date.getFullYear()}</div>
        <div class="cd">${countdownText(nextRun.date)}</div>
      </div>
      <div class="next-body">
        <span class="line-tag" style="background:${c};color:${tc}">${escapeHtml(nextRun.badge)}</span>
        <h3>${escapeHtml(nextRun.leg)}</h3>
        <div class="next-meta">
          <div><strong>Meet</strong> ${MEET_TIME} · <a class="meet-link" href="${escapeAttr(meetMapUrl(nextRun))}" target="_blank" rel="noopener">${escapeHtml(nextRun.start)} ↗</a></div>
          <div><strong>Distance</strong> ${escapeHtml(nextRun.distance)}</div>
          ${nextRun.location !== "London" ? `<div><strong>Where</strong> ${escapeHtml(nextRun.location)}</div>` : ""}
        </div>
        ${routeLinksHtml(nextRun)}
      </div>`;
  }

  // --- Render: Schedule --------------------------------------------------
  function hasDetails(r) { return r.days || r.exits || r.stay || r.notes || r.routeLink; }

  function detailsHtml(r) {
    const days = r.days ? `<div class="d-block"><h4>Itinerary</h4>${r.days.map((d) => `
      <div class="d-day">
        <strong>${escapeHtml(d.title)}</strong>
        <span>${[d.start && `Start: ${d.start}`, d.distance, d.pitstops, d.finish && `Finish: ${d.finish}`]
          .filter(Boolean).map(escapeHtml).join(" · ")}</span>
      </div>`).join("")}</div>` : "";
    const exits = r.exits ? `<div class="d-block"><h4>Escape points</h4>
      <div class="d-tags">${r.exits.map((e) => `<span class="d-tag">${escapeHtml(e.name)} · ${escapeHtml(e.at)}</span>`).join("")}</div></div>` : "";
    const stay = r.stay ? `<div class="d-block"><h4>Where to stay</h4><ul class="d-list">${r.stay.map((s) =>
      `<li><a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.name)} ↗</a></li>`).join("")}</ul></div>` : "";
    const link = routeLinksHtml(r);
    const notes = r.notes ? `<p class="d-notes">${escapeHtml(r.notes)}</p>` : "";
    return `<div class="run-details">${notes}${days}${exits}${stay}${link}</div>`;
  }

  function renderList() {
    const el = document.getElementById("runList");
    if (!el) return;
    el.innerHTML = runs.map((r, i) => {
      const loc = r.location !== "London" ? `<span class="r-loc">${escapeHtml(r.location)}</span>` : "";
      const toggle = hasDetails(r) ? `<button class="r-toggle" data-i="${i}" aria-expanded="false">Details</button>` : "";
      return `
      <div class="run-row">
        <div class="r-date">${r.date.getDate()} ${MON[r.date.getMonth()]}
          <small>${DOW[r.date.getDay()]} · ${r.date.getFullYear()}</small>
        </div>
        <div class="r-swatch" style="background:${r.colour}"></div>
        <div class="r-title">${escapeHtml(r.badge)} ${loc}
          <small>${escapeHtml(r.leg)}</small>
        </div>
        <div class="r-dist">${escapeHtml(r.distance)}${toggle}</div>
      </div>
      ${hasDetails(r) ? `<div class="run-details-wrap" id="det-${i}" hidden>${detailsHtml(r)}</div>` : ""}`;
    }).join("");

    el.querySelectorAll(".r-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wrap = document.getElementById(`det-${btn.dataset.i}`);
        const open = !wrap.hidden;
        wrap.hidden = open;
        btn.setAttribute("aria-expanded", String(!open));
        btn.textContent = open ? "Details" : "Hide";
      });
    });
  }

  // --- Distance planner + line/route diagram -----------------------------
  const pts = WAYPOINTS[nextRun ? nextRun.key : ""];
  const fromSel = document.getElementById("fromStn");
  const toSel = document.getElementById("toStn");
  const paceSel = document.getElementById("pace");
  const unitsSel = document.getElementById("units");
  const MI_PER_KM = 0.621371;
  let firstPick = true;

  function fmtPace(minPerUnit) {
    const mm = Math.floor(minPerUnit);
    const ss = Math.round((minPerUnit - mm) * 60);
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }

  function setupPlanner() {
    const diagram = document.getElementById("lineDiagram");
    const result = document.getElementById("calcResult");
    const calc = document.getElementById("calc");
    if (!pts) {
      // No station-by-station data (e.g. an adventure or a route not yet mapped).
      if (calc) calc.style.display = "none";
      if (nextRun.exits || nextRun.routeLink) {
        // Show escape points + route link instead of the tube-style planner.
        const exits = nextRun.exits ? `<div class="d-block"><h4>Escape points to bail early</h4>
          <div class="d-tags">${nextRun.exits.map((e) => `<span class="d-tag">${escapeHtml(e.name)} · ${escapeHtml(e.at)}</span>`).join("")}</div></div>` : "";
        const link = routeLinksHtml(nextRun);
        if (diagram) diagram.innerHTML = `<div class="adventure-plan">${exits}${link}</div>`;
      } else if (diagram) {
        diagram.innerHTML =
          `<p class="diagram-empty">Route map for <strong>${escapeHtml(nextRun.key)}</strong>
           coming soon. Add its waypoints in <code>WAYPOINTS</code> to enable the planner.</p>`;
      }
      if (result) result.innerHTML = "";
      return;
    }
    // Populate selects.
    fromSel.innerHTML = pts.map((p, i) => `<option value="${i}">${escapeHtml(p[0])}</option>`).join("");
    toSel.innerHTML = pts.map((p, i) => `<option value="${i}">${escapeHtml(p[0])}</option>`).join("");
    fromSel.value = 0;
    toSel.value = pts.length - 1;
    // Remember the runner's preferred units across visits.
    try {
      const saved = localStorage.getItem("tuberun_units");
      if (saved && unitsSel) unitsSel.value = saved;
    } catch (_) { /* ignore */ }
    if (unitsSel) unitsSel.addEventListener("change", () => {
      try { localStorage.setItem("tuberun_units", unitsSel.value); } catch (_) { /* ignore */ }
    });
    [fromSel, toSel, paceSel, unitsSel].filter(Boolean).forEach((s) => s.addEventListener("change", update));
    renderDiagram();
    update();
  }

  function renderDiagram() {
    const diagram = document.getElementById("lineDiagram");
    if (!diagram || !pts) return;
    let a = +fromSel.value, b = +toSel.value;
    if (a > b) [a, b] = [b, a];
    diagram.style.setProperty("--line-col", nextRun.colour);
    diagram.innerHTML = `<div class="line-track">${pts.map((p, i) => {
      const active = i >= a && i <= b;
      const endpoint = i === +fromSel.value || i === +toSel.value;
      return `<button class="stn${active ? " active" : ""}${endpoint ? " endpoint" : ""}"
                data-i="${i}" title="${escapeHtml(p[0])}">
                <span class="rail"><span class="dot"></span></span>
                <span class="stn-name">${escapeHtml(p[0])}</span>
              </button>`;
    }).join("")}</div>`;
    diagram.querySelectorAll(".stn").forEach((btn) => {
      btn.addEventListener("click", () => onStationClick(+btn.dataset.i));
    });
  }

  function onStationClick(idx) {
    if (firstPick) {
      fromSel.value = idx;
      if (+toSel.value <= idx) toSel.value = Math.min(idx + 1, pts.length - 1);
    } else if (idx >= +fromSel.value) {
      toSel.value = idx;
    } else {
      toSel.value = fromSel.value; fromSel.value = idx;
    }
    firstPick = !firstPick;
    update();
  }

  function update() {
    if (!pts) return;
    let a = +fromSel.value, b = +toSel.value;
    if (a === b) { b = Math.min(a + 1, pts.length - 1); }
    if (a > b) [a, b] = [b, a];
    const km = legDistanceKm(pts, a, b);
    const paceKm = parseFloat(paceSel.value);
    const runMins = km * paceKm;          // running time at the chosen pace
    const walkMins = km * WALK_MIN_PER_KM; // walking time at ~5 km/h
    const stops = Math.max(0, b - a - 1);

    const unit = unitsSel ? unitsSel.value : "km";
    const dist = unit === "mi"
      ? `${(km * MI_PER_KM).toFixed(1)} mi`
      : `${km.toFixed(1)} km`;
    const paceStr = unit === "mi"
      ? `${fmtPace(paceKm / MI_PER_KM)} /mi`
      : `${fmtPace(paceKm)} /km`;

    const result = document.getElementById("calcResult");
    result.innerHTML = `
      <div class="cr-main"><span class="cr-km">${dist}</span></div>
      <div class="cr-times">
        <span class="cr-run">🏃 run ~${fmtTime(runMins)}</span>
        <span class="cr-walk">🚶 walk ~${fmtTime(walkMins)}</span>
      </div>
      <div class="cr-detail">
        ${escapeHtml(pts[a][0])} → ${escapeHtml(pts[b][0])}
        · ${b - a} leg${b - a > 1 ? "s" : ""}${stops ? ` · passes ${stops} stop${stops > 1 ? "s" : ""}` : ""}
        · at ${paceStr}
      </div>
      <div class="cr-note">Estimate: crow-flies distance × ${ROAD_FACTOR} for streets. Add time for stops, photos and coffee.</div>`;
    renderDiagram();
  }

  // --- Weather (Open-Meteo, no key) --------------------------------------
  const WMO = {
    0: ["Clear", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
    45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"], 51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"],
    55: ["Heavy drizzle", "🌧️"], 61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
    71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 80: ["Rain showers", "🌦️"],
    81: ["Showers", "🌧️"], 82: ["Violent showers", "⛈️"], 95: ["Thunderstorm", "⛈️"], 96: ["Storm + hail", "⛈️"],
  };
  function describe(code) { return WMO[code] || ["—", "🌡️"]; }

  async function loadWeather() {
    const el = document.getElementById("weather");
    if (!el || !nextRun) return;
    const dateStr = isoDate(nextRun.date);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LONDON.lat}&longitude=${LONDON.lon}` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=Europe%2FLondon&forecast_days=16`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("weather fetch failed");
      const data = await res.json();
      const hIdx = data.hourly.time.indexOf(`${dateStr}T${MEET_TIME}`);
      let code, temp, feels, pop, wind;
      if (hIdx !== -1) {
        code = data.hourly.weather_code[hIdx];
        temp = data.hourly.temperature_2m[hIdx];
        feels = data.hourly.apparent_temperature[hIdx];
        pop = data.hourly.precipitation_probability[hIdx];
        wind = data.hourly.wind_speed_10m[hIdx];
      } else {
        const dIdx = data.daily.time.indexOf(dateStr);
        if (dIdx === -1) {
          el.innerHTML = `<span class="wx-soft">Weather forecast will appear closer to the day.</span>`;
          return;
        }
        code = data.daily.weather_code[dIdx];
        temp = data.daily.temperature_2m_max[dIdx];
        pop = data.daily.precipitation_probability_max[dIdx];
      }
      const [desc, icon] = describe(code);
      el.innerHTML = `
        <span class="wx-icon">${icon}</span>
        <span class="wx-main">${Math.round(temp)}°C · ${desc}</span>
        <span class="wx-sub">
          ${feels != null ? `feels ${Math.round(feels)}° · ` : ""}${pop != null ? `${pop}% rain` : ""}${wind != null ? ` · ${Math.round(wind)} km/h wind` : ""}
        </span>
        <span class="wx-tag">forecast for ${DOW[nextRun.date.getDay()]} ${MEET_TIME}</span>`;
    } catch (_) {
      el.innerHTML = `<span class="wx-soft">Couldn't load the forecast right now.</span>`;
    }
  }

  // --- Socials -----------------------------------------------------------
  function wireSocials() {
    const wrap = document.getElementById("socialLinks");
    if (!wrap) return;
    const items = [
      ["Strava", CONNECT.strava, "#FC4C02", "#fff"],
      ["Instagram", CONNECT.instagram, "#E1306C", "#fff"],
      ["Facebook", CONNECT.facebook, "#1877F2", "#fff"],
      ["X / Twitter", CONNECT.twitter, "#111", "#fff"],
      ["Eventbrite", CONNECT.eventbrite, "#F05537", "#fff"],
      ["WhatsApp", CONNECT.whatsapp, "#25D366", "#05331a"],
    ];
    wrap.innerHTML = items
      .filter(([, url]) => url && /^https?:\/\//i.test(url))
      .map(([label, url, bg, fg]) =>
        `<a class="btn btn-social" style="background:${bg};color:${fg}" href="${escapeAttr(url)}" target="_blank" rel="noopener">${label}</a>`)
      .join("");
  }

  // --- Join form ---------------------------------------------------------
  function wireForm() {
    const form = document.getElementById("joinForm");
    const note = document.getElementById("formNote");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      const email = form.email.value.trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!name || !emailOk) {
        note.className = "form-note err";
        note.textContent = "Please add your name and a valid email.";
        return;
      }
      try {
        const list = JSON.parse(localStorage.getItem("tuberun_signups") || "[]");
        list.push({ name, email, at: new Date().toISOString() });
        localStorage.setItem("tuberun_signups", JSON.stringify(list));
      } catch (_) { /* ignore */ }
      note.className = "form-note ok";
      note.textContent = `Thanks ${name.split(" ")[0]} — see you on the first Sunday!`;
      form.reset();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }
  // For image src etc. (author-controlled) — allow relative paths, just neutralise quotes.
  function attrVal(s) { return String(s).replace(/"/g, "%22"); }
  // For href/attribute values — only allow http(s), else drop to "#".
  function escapeAttr(url) {
    const u = String(url);
    return /^https?:\/\//i.test(u) ? u.replace(/"/g, "%22") : "#";
  }
  // Route resources — routeLink may be a single URL or an array. Label each by
  // provider so runners know whether it's Strava, Garmin, komoot, etc.
  function providerOf(url) {
    if (/strava\.com/i.test(url)) return "Strava";
    if (/garmin\./i.test(url)) return "Garmin Connect";
    if (/komoot\./i.test(url)) return "komoot";
    if (/ridewithgps\.com/i.test(url)) return "Ride with GPS";
    if (/plotaroute\.com/i.test(url)) return "plotaroute";
    return "route";
  }
  function routeLinksHtml(r, extraClass) {
    if (!r.routeLink) return "";
    const urls = Array.isArray(r.routeLink) ? r.routeLink : [r.routeLink];
    return urls.map((u) =>
      `<a class="route-link${extraClass ? " " + extraClass : ""}" href="${escapeAttr(u)}" target="_blank" rel="noopener">View route on ${escapeHtml(providerOf(u))} ↗</a>`
    ).join("");
  }

  // --- Render: Live now banner ------------------------------------------
  function renderLive() {
    const el = document.getElementById("liveBanner");
    if (!el) return;
    const preview = new URLSearchParams(location.search).has("live");
    if (!LIVE.active && !preview) { el.hidden = true; return; }
    const link = (u, t) => `<a href="${escapeAttr(u)}" target="_blank" rel="noopener">${escapeHtml(t)} ↗</a>`;
    const btns = [];
    if (LIVE.garmin) btns.push(link(LIVE.garmin, "Follow on Garmin LiveTrack"));
    if (LIVE.strava) btns.push(link(LIVE.strava, "Follow on Strava Beacon"));
    if (!btns.length && CONNECT.strava) btns.push(link(CONNECT.strava, "Follow on Strava"));
    el.hidden = false;
    el.innerHTML = `
      <span class="live-dot" aria-hidden="true"></span>
      <span class="live-text"><strong>Live now</strong> — ${escapeHtml(LIVE.label)}${LIVE.startedAt ? ` · started ${escapeHtml(LIVE.startedAt)}` : ""}</span>
      <span class="live-btns">${btns.join("")}</span>`;
  }

  // --- Route ideas library (adapted from a runners' guide to London) -----
  const ROUTE_COLOURS = { river: "#1CA6C4", canal: "#2E8B57", park: "#3AA655", landmark: "#9B0056", trail: "#5A7D2A", loop: "#B36305", tube: "#0098D4" };
  const ROUTES = [
    { name: "Regent's Canal Towpath", type: "canal", leg: "Limehouse Basin → Little Venice", start: "Limehouse (DLR/c2c)", distance: "9.3 mi (15 km)", highlights: "Largely traffic-free towpath past Mile End Park, Victoria Park, Camden Lock and the narrowboats of Little Venice; flat.", suitability: "Ideal sociable long run — flat, easy to follow, splittable into shorter chunks." },
    { name: "Hyde Park & Kensington Gardens Loop", type: "park", leg: "Perimeter of both royal parks", start: "Hyde Park Corner / Lancaster Gate", distance: "4.3 mi (7 km)", highlights: "Sealed paths around the Serpentine, Italian Gardens and Diana Memorial; mild undulations.", suitability: "Very group-friendly — flat loop with 1mi/2mi markers built in for mixed paces." },
    { name: "The Grand Tour (Thames Landmarks)", type: "landmark", leg: "Trafalgar Sq → Tower Bridge & back, both banks", start: "Charing Cross", distance: "7.0 mi (11.25 km)", highlights: "Westminster, the London Eye, Tate Modern, the Globe, St Paul's, the Tower — the Thames Path both banks.", suitability: "Perfect landmark tour — allow 2–3× time for photos; can be congested." },
    { name: "Regent's Park & Primrose Hill", type: "park", leg: "Outer Circle loop + Primrose Hill", start: "Baker Street / Great Portland Street", distance: "4.0 mi (6.5 km)", highlights: "Gardens, boating lake, an old cinder track and the famous city view from Primrose Hill.", suitability: "Something for everyone — flat 2.7mi loop with an optional hill for keen legs." },
    { name: "Diana Memorial Run", type: "landmark", leg: "Figure-of-eight through four royal parks", start: "Hyde Park Corner", distance: "7.2 mi (11.6 km)", highlights: "Way-marked with 90 brass plates past Buckingham Palace, St James's, Green & Hyde Parks.", suitability: "Easy navigation, splittable into two loops; some road crossings by the Palace." },
    { name: "Victoria Park Loop", type: "park", leg: "Perimeter of the 'People's Park'", start: "Hackney Wick / Cambridge Heath", distance: "2.7 mi (4.4 km)", highlights: "Tree-lined avenues with parallel dirt bridle paths, ponds and gardens; flanked by two canals.", suitability: "Sociable and popular — flat, wide paths, lots of runners for company." },
    { name: "Battersea Park Circuit", type: "park", leg: "Loop via Carriage Drive", start: "Battersea Park Rail / Queenstown Road", distance: "2.2 mi (3.5 km)", highlights: "Riverside park from Albert to Chelsea Bridge with crushed-limestone paths and a track; flat.", suitability: "Great all-paces park — flat, no traffic (track only before 8am)." },
    { name: "Greenwich Park & Blackheath", type: "park", leg: "Park circuit onto Blackheath", start: "Cutty Sark DLR / Greenwich Rail", distance: "2 mi (3.2 km) + Blackheath", highlights: "Royal Observatory, the Meridian, sweeping city views, then the open expanse of Blackheath.", suitability: "Scenery plus a hill challenge — flat north, then three climbs." },
    { name: "Hampstead Heath", type: "trail", leg: "Loop over Parliament Hill & the ponds", start: "Hampstead / Gospel Oak (Overground)", distance: "8.0 mi (13 km)", highlights: "320 hectares of woodland, heath and ponds crowned by the Parliament Hill view.", suitability: "For a confident group — hilly, easy to get lost, keep together; muddy when wet." },
    { name: "St James's & Green Park", type: "park", leg: "Loop around both parks and the lake", start: "Green Park / St James's Park", distance: "2.4 mi (3.9 km)", highlights: "Green oasis on Buckingham Palace's doorstep with a photo-ready lake and The Mall.", suitability: "Easy short social loop, very photogenic; heavy foot traffic." },
    { name: "Southwark Park & the Docks", type: "river", leg: "Park out to Greenland Dock & Thames Path", start: "Surrey Quays / Canada Water", distance: "1.4 mi (2.25 km), extendable", highlights: "Victorian park linking to Greenland Dock, Russia Dock Woodland and a rare south-bank river corridor.", suitability: "Flexible — flat, quiet, easily lengthened along the docks and river." },
    { name: "Wormwood Scrubs", type: "park", leg: "Perimeter loop of 'The Scrubs'", start: "East Acton (Central)", distance: "2.4 mi (3.85 km)", highlights: "Vast open grass with a 960m sealed loop and Grand Union Canal access next door; flat.", suitability: "Roomy and flat for all paces, with the canal as an add-on." },
  ];

  function renderRoutes() {
    const el = document.getElementById("routeList");
    if (!el) return;
    el.innerHTML = ROUTES.map((r) => {
      const c = ROUTE_COLOURS[r.type] || "#0019A8";
      return `<div class="route-card" style="border-top-color:${c}">
        <div class="rc-top"><span class="rc-type" style="background:${c}">${escapeHtml(r.type)}</span><span class="rc-dist">${escapeHtml(r.distance)}</span></div>
        <h3>${escapeHtml(r.name)}</h3>
        <p class="rc-leg">${escapeHtml(r.leg)}</p>
        <p class="rc-meta"><strong>Start</strong> ${escapeHtml(r.start)}</p>
        <p class="rc-hi">${escapeHtml(r.highlights)}</p>
        ${r.suitability ? `<p class="rc-suit">${escapeHtml(r.suitability)}</p>` : ""}
      </div>`;
    }).join("");
  }

  // --- Render: Line stats ------------------------------------------------
  // Real end-to-end line data [name, length km, station count].
  const LINE_STATS = [
    ["Bakerloo", 23.2, 25], ["Central", 74, 49], ["Circle", 27, 36], ["District", 64, 60],
    ["Hammersmith & City", 25.5, 29], ["Jubilee", 36.2, 27], ["Metropolitan", 66.7, 34],
    ["Northern", 58, 50], ["Piccadilly", 71, 53], ["Victoria", 21, 16], ["Waterloo & City", 2.5, 2],
  ];

  function renderLineStats() {
    const el = document.getElementById("lineStats");
    if (!el) return;
    const kms = LINE_STATS.map((s) => s[1]);
    const stns = LINE_STATS.map((s) => s[2]);
    const maxKm = Math.max(...kms), minKm = Math.min(...kms);
    const maxSt = Math.max(...stns), minSt = Math.min(...stns);
    const active = nextRun ? nextRun.key : null;
    const rows = [...LINE_STATS].sort((a, b) => b[1] - a[1]).map(([name, km, stations]) => {
      const c = LINE_COLOURS[name] || "#0019A8";
      const badges = [];
      if (km === maxKm) badges.push(["Longest", "tough"]);
      if (km === minKm) badges.push(["Shortest", "easy"]);
      if (stations === maxSt) badges.push(["Most stops", ""]);
      if (stations === minSt) badges.push(["Fewest stops", ""]);
      const badgeHtml = badges.map(([t, cls]) => `<span class="ls-badge ${cls}">${t}</span>`).join("");
      return `<tr class="${name === active ? "ls-active" : ""}">
        <td class="ls-name"><span class="ls-dot" style="background:${c}"></span>${escapeHtml(name)}${name === active ? ' <span class="ls-next">next run</span>' : ""}${badgeHtml}</td>
        <td>${(km * MI_PER_KM).toFixed(1)} mi<small>${km} km</small></td>
        <td>${stations}</td>
        <td>${fmtTime(km * 6.5)}</td>
        <td>${fmtTime(km * WALK_MIN_PER_KM)}</td>
      </tr>`;
    }).join("");
    el.innerHTML = `
      <table class="ls-table">
        <thead><tr><th>Line</th><th>Length</th><th>Stops</th><th>Run</th><th>Walk</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="ls-foot">Run times at a steady 6:30/km, walk at ~5 km/h, end to end. Longest = toughest tick; little Waterloo &amp; City is the gentlest.</p>`;
  }

  // --- Render: Line collector (two directions per line) -----------------
  function renderLineCollector() {
    const el = document.getElementById("lineCollector");
    if (!el) return;
    const done = new Set(LINES_DONE);
    const total = TUBE_LINES.length * 2;
    let n = 0;

    const rows = TUBE_LINES.map((name) => {
      const c = LINE_COLOURS[name] || "#0019A8";
      const dirs = LINE_DIRS[name] || ["→ one way", "→ the other"];
      const chips = dirs.map((label, i) => {
        const isDone = done.has(`${name}|${i}`);
        if (isDone) n++;
        const style = isDone
          ? `background:${c};color:${contrastText(c)};border-color:${c}`
          : `color:#2b3140;border-color:${c}`;
        return `<span class="lc-dir${isDone ? " done" : ""}" style="${style}">${isDone ? "✓ " : ""}${escapeHtml(label)}</span>`;
      }).join("");
      return `<div class="lc-row">
        <span class="lc-name" style="border-color:${c}"><i style="background:${c}"></i>${escapeHtml(name)}</span>
        <span class="lc-dirs">${chips}</span>
      </div>`;
    }).join("");

    const pct = Math.round((n / total) * 100);
    el.innerHTML = `
      <div class="lc-head">
        <span class="lc-count">${n} / ${total} directions run</span>
        <div class="lc-bar"><div class="lc-fill" style="width:${pct}%"></div></div>
      </div>
      <p class="lc-hint">Each line counts twice &mdash; once each way. ${TUBE_LINES.length} lines, ${total} runs to collect them all.</p>
      <div class="lc-rows">${rows}</div>`;
  }

  // --- Render: Gallery ---------------------------------------------------
  function renderGallery() {
    const el = document.getElementById("galleryGrid");
    if (!el) return;
    if (GALLERY.length) {
      el.innerHTML = GALLERY.map((g) => `<figure class="gal-item">
        <img src="${attrVal(g.src)}" alt="${escapeHtml(g.caption || "")}" loading="lazy" />
        ${g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ""}</figure>`).join("");
    } else {
      const tints = ["Victoria", "Central", "Piccadilly", "Northern", "Jubilee", "Bakerloo"];
      el.innerHTML = tints.map((n) =>
        `<div class="gal-item gal-empty" style="--t:${LINE_COLOURS[n]}"><span>Your photos here</span></div>`).join("") +
        (CONNECT.instagram ? `<a class="gal-cta" href="${escapeAttr(CONNECT.instagram)}" target="_blank" rel="noopener">Tag <strong>#TubeRun</strong> on Instagram →</a>` : "");
    }
  }

  // --- Render: Standard tube map (real map, one line highlighted) --------
  // img/tube-map.svg is the official map converted from PDF; each line is drawn
  // as filled paths in its colour. We highlight the next run's line by dimming
  // every path that isn't that colour. LINE_FILL maps our line names to the
  // exact rgb() fill strings the SVG uses (read straight out of the file).
  const LINE_FILL = {
    Victoria: "rgb(10.00061%, 71.055603%, 94.355774%)",
    Central: "rgb(93.292236%, 15.174866%, 13.412476%)",
    Northern: "rgb(13.729858%, 12.159729%, 12.548828%)",
    Bakerloo: "rgb(68.330383%, 32.385254%, 5.485535%)",
    Circle: "rgb(98.869324%, 81.472778%, 2.258301%)",
    District: "rgb(3.797913%, 50.65918%, 21.754456%)",
    Metropolitan: "rgb(58.660889%, 0.575256%, 33.026123%)",
    "Hammersmith & City": "rgb(95.56427%, 40.682983%, 63.269043%)",
    Jubilee: "rgb(58.119202%, 59.446716%, 60.510254%)",
    Piccadilly: "rgb(16.012573%, 25.125122%, 59.718323%)",
    "Waterloo & City": "rgb(53.001404%, 83.607483%, 70.713806%)",
  };

  // Three maps in a tabbed, zoomable viewer.
  const MAPS = [
    { key: "standard", file: "img/tube-map.svg", label: "Tube map", kind: "svg", highlight: true },
    { key: "running", label: "Running times", kind: "data" },
    { key: "walking", file: "img/walking-map.png", label: "Walking times", kind: "img" },
    { key: "toilets", file: "img/toilet-map.png", label: "Toilets 🚻", kind: "img" },
    { key: "geo", label: "Geographic", kind: "geo" },
    { key: "overground", file: "img/overground-map.png", label: "Overground", kind: "img" },
    { key: "connections", file: "img/connections-map.png", label: "Rail connections", kind: "img" },
  ];
  const svgCache = {};
  let curMap = "standard";
  let curZoom = 1.6;
  let netData = null;         // data/tube-network.json, lazy-loaded
  let geoTimeMode = "run";    // run | walk | off — badge mode on the highlighted line
  function defaultZoom(kind) { return kind === "geo" ? 1.7 : kind === "data" ? 1 : 1.6; }
  async function loadNetwork() {
    if (netData) return netData;
    const res = await fetch("data/tube-network.json");
    if (!res.ok) throw new Error("network data");
    netData = await res.json();
    return netData;
  }

  function renderTubeMap() {
    const root = document.getElementById("tubeMap");
    if (!root) return;
    root.innerHTML = `
      <div class="tm-tabs">${MAPS.map((m) =>
        `<button type="button" class="tm-tab${m.key === curMap ? " on" : ""}" data-map="${m.key}">${escapeHtml(m.label)}</button>`).join("")}</div>
      <div class="tm-bar">
        <p class="tm-caption" id="tmCaption"></p>
        <div class="tm-zoom">
          <button type="button" class="tm-zbtn" data-z="out" aria-label="Zoom out">&minus;</button>
          <button type="button" class="tm-zbtn" data-z="reset">Reset</button>
          <button type="button" class="tm-zbtn" data-z="in" aria-label="Zoom in">+</button>
        </div>
      </div>
      <div class="tm-scroll" id="tmHolder"><p class="tm-loading">Loading the map…</p></div>
      <p class="tm-scrollhint">Scroll or drag inside the map to pan · use +/&minus; to zoom.</p>`;
    root.querySelectorAll(".tm-tab").forEach((b) => b.addEventListener("click", () => {
      curMap = b.dataset.map;
      curZoom = defaultZoom(curMapKind());
      root.querySelectorAll(".tm-tab").forEach((x) => x.classList.toggle("on", x === b));
      loadMap();
    }));
    root.querySelectorAll(".tm-zbtn").forEach((b) => b.addEventListener("click", () => {
      const z = b.dataset.z;
      curZoom = z === "in" ? Math.min(5, curZoom + 0.3) : z === "out" ? Math.max(0.8, curZoom - 0.3) : defaultZoom(curMapKind());
      applyZoom();
    }));
    // Drag-to-pan inside the map viewport.
    const holder = root.querySelector("#tmHolder");
    let drag = false, sx, sy, sl, st;
    holder.addEventListener("pointerdown", (e) => {
      if (curMapKind() === "data") return; // let the table select/scroll normally
      e.preventDefault(); // stop native image/text drag hijacking the pan
      drag = true; sx = e.clientX; sy = e.clientY; sl = holder.scrollLeft; st = holder.scrollTop;
      holder.setPointerCapture(e.pointerId); holder.style.cursor = "grabbing";
    });
    holder.addEventListener("pointermove", (e) => {
      if (!drag) return;
      holder.scrollLeft = sl - (e.clientX - sx);
      holder.scrollTop = st - (e.clientY - sy);
    });
    const endDrag = () => { drag = false; holder.style.cursor = "grab"; };
    holder.addEventListener("pointerup", endDrag);
    holder.addEventListener("pointercancel", endDrag);
    loadMap();
  }

  async function loadMap() {
    const holder = document.getElementById("tmHolder");
    const cap = document.getElementById("tmCaption");
    const zoom = document.querySelector(".tm-zoom");
    const cfg = MAPS.find((m) => m.key === curMap);
    const active = cfg.highlight && nextRun && LINE_FILL[nextRun.key] ? nextRun.key : null;
    const CAPTIONS = {
      geo: `Our own live map, built from open TfL data — zoom, drag and tap a station.`,
      standard: active ? `<strong style="color:${LINE_COLOURS[active]}">${escapeHtml(active)} line</strong> highlighted for the next run — zoom in to trace it.` : `The official London Underground map.`,
      running: `Estimated running time to each stop on the next run's line.`,
      walking: `Walking minutes between stations — handy for short hops.`,
      toilets: `Stations with toilets — plan your pit stops.`,
      overground: `The London Overground network — great for orbital, out-of-centre routes.`,
      connections: `The geographic rail-connections map — every line where it really runs.`,
    };
    if (cap) cap.innerHTML = CAPTIONS[cfg.key] || "";
    if (zoom) zoom.style.visibility = cfg.kind === "data" ? "hidden" : "visible";
    holder.style.cursor = cfg.kind === "data" ? "auto" : "grab";
    holder.innerHTML = `<p class="tm-loading">Loading…</p>`;

    // Our own data-driven geographic map.
    if (cfg.kind === "geo") { renderGeoMap(holder, cap).catch(() => { holder.innerHTML = `<p class="diagram-empty">Couldn't build the map right now.</p>`; }); return; }

    // Data view: a computed per-station running-time table (no image).
    if (cfg.kind === "data") { renderRunningTimes(holder); return; }

    // Non-highlight maps render as a plain <img> — the browser's native SVG/PNG
    // renderer handles the whole document reliably (inline injection mis-renders
    // huge SVGs). draggable=false so our drag-to-pan isn't hijacked.
    if (cfg.kind === "img") {
      const img = document.createElement("img");
      img.className = "tm-svg";
      img.draggable = false;
      img.alt = cfg.label + " map";
      img.addEventListener("load", () => { applyZoom(); requestAnimationFrame(() => centreContent(holder)); });
      img.addEventListener("error", () => { holder.innerHTML = `<p class="diagram-empty">Couldn't load the map right now.</p>`; });
      holder.innerHTML = "";
      holder.appendChild(img);
      img.src = cfg.file;
      return;
    }

    try {
      let txt = svgCache[cfg.key];
      if (!txt) { const res = await fetch(cfg.file); if (!res.ok) throw new Error("fetch"); txt = await res.text(); svgCache[cfg.key] = txt; }
      // Parse as SVG (not innerHTML) so xlink:href references resolve & render.
      const svg = new DOMParser().parseFromString(txt, "image/svg+xml").documentElement;
      if (svg.nodeName.toLowerCase() !== "svg") throw new Error("no svg");
      svg.removeAttribute("width"); svg.removeAttribute("height"); svg.setAttribute("class", "tm-svg");
      holder.innerHTML = "";
      holder.appendChild(document.importNode(svg, true));
      applyZoom();
      const live = holder.querySelector("svg");
      if (active) highlightLine(live, LINE_FILL[active]);
      requestAnimationFrame(() => {
        if (active) centreOnLine(live, LINE_FILL[active], holder);
        else centreContent(holder);
      });
    } catch (e) {
      holder.innerHTML = `<p class="diagram-empty">Couldn't load the map right now.</p>`;
    }
  }

  function centreContent(holder) {
    holder.scrollLeft = (holder.scrollWidth - holder.clientWidth) / 2;
    holder.scrollTop = (holder.scrollHeight - holder.clientHeight) / 2;
  }

  function applyZoom() {
    const node = document.querySelector("#tmHolder svg, #tmHolder img");
    if (node) node.style.width = (curZoom * 100) + "%";
  }

  function curMapKind() { return (MAPS.find((m) => m.key === curMap) || {}).kind; }

  // --- Our own geographic tube map (data/tube-network.json) ---------------
  // Resolve the next run's line to a network id (tube runs only).
  function geoHighlightId(net) {
    if (!nextRun) return null;
    const key = (nextRun.key || "").toLowerCase();
    for (const id in net) if (net[id].name.toLowerCase() === key) return id;
    return null;
  }

  // Equirectangular projection of lat/lon → a 1000-wide viewBox.
  function geoProject(net) {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const id in net) { const st = net[id].stations; for (const sid in st) { const s = st[sid];
      if (s.lat < minLat) minLat = s.lat; if (s.lat > maxLat) maxLat = s.lat;
      if (s.lon < minLon) minLon = s.lon; if (s.lon > maxLon) maxLon = s.lon; } }
    const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const W = 1000, pad = 26;
    const scale = (W - 2 * pad) / ((maxLon - minLon) * kx);
    const H = Math.round((maxLat - minLat) * scale + 2 * pad);
    return { W, H, X: (lon) => pad + (lon - minLon) * kx * scale, Y: (lat) => pad + (maxLat - lat) * scale };
  }

  function buildGeoSvg(net, hi) {
    const p = geoProject(net);
    // station id → line ids serving it (for interchange dots + tooltips)
    const slines = {};
    for (const id in net) { const st = net[id].stations; for (const sid in st) (slines[sid] || (slines[sid] = [])).push(id); }
    const order = Object.keys(net).sort((a, b) => (a === hi ? 1 : 0) - (b === hi ? 1 : 0)); // highlighted on top

    let paths = "";
    for (const id of order) { const line = net[id], dim = hi && id !== hi;
      const w = id === hi ? 4.4 : 2.4, op = dim ? 0.18 : 1;
      for (const br of line.branches) {
        const pts = br.map((sid) => { const s = line.stations[sid]; return `${p.X(s.lon).toFixed(1)},${p.Y(s.lat).toFixed(1)}`; }).join(" ");
        paths += `<polyline points="${pts}" fill="none" stroke="${line.colour}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" opacity="${op}"/>`;
      }
    }

    let dots = ""; const drawn = new Set();
    for (const id of order) { const line = net[id], dim = hi && id !== hi;
      for (const sid in line.stations) { if (drawn.has(sid)) continue; drawn.add(sid);
        const s = line.stations[sid], x = p.X(s.lon).toFixed(1), y = p.Y(s.lat).toFixed(1);
        const onHi = hi && slines[sid].indexOf(hi) >= 0, op = dim && !onHi ? 0.22 : 1, inter = slines[sid].length > 1;
        const title = `<title>${escapeHtml(s.n)} — ${escapeHtml(slines[sid].map((l) => net[l].name).join(", "))}</title>`;
        dots += inter
          ? `<circle cx="${x}" cy="${y}" r="${onHi ? 3.4 : 2.8}" fill="#fff" stroke="#111" stroke-width="1" opacity="${op}">${title}</circle>`
          : `<circle cx="${x}" cy="${y}" r="1.7" fill="${line.colour}" opacity="${op}">${title}</circle>`;
      }
    }

    // Labels + cumulative time badges on the highlighted line.
    let labels = "";
    if (hi) {
      const line = net[hi];
      const br = line.branches.reduce((a, b) => (b.length > a.length ? b : a), line.branches[0] || []);
      const perKm = geoTimeMode === "walk" ? WALK_MIN_PER_KM : (parseFloat(paceSel && paceSel.value) || 6.5);
      let cum = 0; const tmap = {};
      for (let i = 0; i < br.length; i++) { if (i > 0) { const a = line.stations[br[i - 1]], b = line.stations[br[i]];
        cum += haversineKm([0, a.lat, a.lon], [0, b.lat, b.lon]) * ROAD_FACTOR; } tmap[br[i]] = cum; }
      for (const sid in line.stations) { const s = line.stations[sid], x = +p.X(s.lon).toFixed(1), y = +p.Y(s.lat).toFixed(1);
        labels += `<text class="geo-lbl" x="${x + 4}" y="${y + 2.5}">${escapeHtml(s.n)}</text>`;
        if (geoTimeMode !== "off" && tmap[sid] !== undefined)
          labels += `<text class="geo-time" x="${x + 4}" y="${y + 9}" fill="${line.colour}">${fmtTime(tmap[sid] * perKm)}</text>`;
      }
    }

    return `<svg class="tm-svg geo-svg" viewBox="0 0 ${p.W} ${p.H}" xmlns="http://www.w3.org/2000/svg" style="width:${curZoom * 100}%">`
      + `<rect x="0" y="0" width="${p.W}" height="${p.H}" fill="#f7f9fc"/>${paths}${dots}${labels}</svg>`;
  }

  function centreGeoOn(holder, hi, net) {
    const svg = holder.querySelector("svg"); if (!svg) return;
    const p = geoProject(net), line = net[hi];
    let sx = 0, sy = 0, n = 0;
    for (const sid in line.stations) { const s = line.stations[sid]; sx += p.X(s.lon); sy += p.Y(s.lat); n++; }
    if (!n) return;
    const r = svg.getBoundingClientRect();
    holder.scrollLeft = (sx / n / p.W) * r.width - holder.clientWidth / 2;
    holder.scrollTop = (sy / n / p.H) * r.height - holder.clientHeight / 2;
  }

  function geoCaption(cap, net, hi, holder) {
    if (!cap) return;
    const modes = hi ? `<span class="geo-modes">Times: ${["run", "walk", "off"].map((m) =>
      `<button type="button" class="geo-mode${geoTimeMode === m ? " on" : ""}" data-mode="${m}">${m === "off" ? "Off" : m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</span>` : "";
    cap.innerHTML = (hi
      ? `<strong style="color:${net[hi].colour}">${escapeHtml(net[hi].name)} line</strong> lit up for the next run — every other line dimmed. `
      : `Our own live map, built from open TfL data — zoom, drag and tap a station. `) + modes;
    cap.querySelectorAll(".geo-mode").forEach((b) => b.addEventListener("click", () => {
      geoTimeMode = b.dataset.mode;
      cap.querySelectorAll(".geo-mode").forEach((x) => x.classList.toggle("on", x === b));
      holder.innerHTML = buildGeoSvg(net, hi); applyZoom();
    }));
  }

  async function renderGeoMap(holder, cap) {
    const net = await loadNetwork();
    const hi = geoHighlightId(net);
    geoCaption(cap, net, hi, holder);
    holder.innerHTML = buildGeoSvg(net, hi);
    applyZoom();
    requestAnimationFrame(() => { if (hi) centreGeoOn(holder, hi, net); else centreContent(holder); });
  }

  // Per-station running times for the next run's line (uses its WAYPOINTS).
  function renderRunningTimes(holder) {
    const line = nextRun && WAYPOINTS[nextRun.key] ? nextRun.key : null;
    if (!line) {
      holder.innerHTML = `<p class="diagram-empty">Per-station running times appear here once the next run's line has mapped stations (add them to <code>WAYPOINTS</code>).</p>`;
      return;
    }
    const stns = WAYPOINTS[line];
    const c = LINE_COLOURS[line] || "#0019A8";
    const paceKm = parseFloat(paceSel && paceSel.value) || 6.5;
    const unit = unitsSel && unitsSel.value === "mi" ? "mi" : "km";
    let cumKm = 0, cumMin = 0;
    const rows = stns.map((s, i) => {
      let legMin = 0;
      if (i > 0) { const legKm = haversineKm(stns[i - 1], stns[i]) * ROAD_FACTOR; cumKm += legKm; legMin = legKm * paceKm; cumMin += legMin; }
      const dist = unit === "mi" ? `${(cumKm * MI_PER_KM).toFixed(1)} mi` : `${cumKm.toFixed(1)} km`;
      return `<tr>
        <td class="rt-stn"><span class="rt-dot" style="background:${c}"></span>${escapeHtml(s[0])}</td>
        <td>${i === 0 ? "—" : "+" + fmtTime(legMin)}</td>
        <td class="rt-cum">${i === 0 ? "start" : fmtTime(cumMin)}</td>
        <td>${dist}</td>
      </tr>`;
    }).join("");
    holder.innerHTML = `
      <div class="rt-head" style="border-color:${c}">
        <strong style="color:${c}">${escapeHtml(line)} line</strong>
        <span>${escapeHtml(stns[0][0])} → ${escapeHtml(stns[stns.length - 1][0])} · at ${fmtPace(paceKm)}/km</span>
      </div>
      <table class="rt-table">
        <thead><tr><th>Station</th><th>Leg</th><th>Elapsed</th><th>From start</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="rt-foot">Cumulative running time from the start at your chosen pace (change it in <a href="#plan">Plan</a>). Add time for regroups, photos and breaks.</p>`;
  }

  // Dim every filled path except those matching the highlighted line's colour.
  function highlightLine(svg, targetFill) {
    const paths = svg.querySelectorAll("path");
    let matched = 0;
    paths.forEach((p) => { if (p.getAttribute("fill") === targetFill) matched++; });
    if (!matched) return; // colour not found — show the full map rather than blank it
    paths.forEach((p) => {
      const f = p.getAttribute("fill");
      if (!f || f === "none" || f === targetFill) return;
      p.style.opacity = "0.22";
    });
  }

  // Scroll the holder so the highlighted line sits in view.
  function centreOnLine(svg, targetFill, holder) {
    const vb = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    if (!vb || !rect.width) return;
    const scale = rect.width / vb.width;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, found = false;
    svg.querySelectorAll("path").forEach((p) => {
      if (p.getAttribute("fill") !== targetFill) return;
      let b; try { b = p.getBBox(); } catch (e) { return; }
      if (!b.width && !b.height) return;
      found = true;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    });
    if (!found) return;
    holder.scrollLeft = ((x0 + x1) / 2 - vb.x) * scale - holder.clientWidth / 2;
    holder.scrollTop = ((y0 + y1) / 2 - vb.y) * scale - holder.clientHeight / 2;
  }

  renderLive();
  renderTubeMap();
  renderLineStats();
  renderNext();
  renderList();
  renderRoutes();
  setupPlanner();
  renderLineCollector();
  renderGallery();
  wireSocials();
  wireForm();
  loadWeather();
})();
