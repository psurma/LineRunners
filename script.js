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
    eventbrite: "https://www.eventbrite.co.uk/o/london-tube-run-15271012006",
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
    {
      type: "tube", line: "Metropolitan", date: "2026-07-04",
      leg: "Chesham → Aldgate", start: "Chesham Underground Station",
      distance: "2 days · ~40 km",
      routeLink: "https://www.strava.com/clubs/311876/group_events/3499820905351240354",
      notes: "Our big one — the whole Metropolitan line over a weekend, from Chesham out in the Chilterns all the way to Aldgate, split overnight at Wembley Park. All paces: run as much or as little of each day as you like.",
      days: [
        { title: "Day 1 · Sat 4 July — Chesham → Wembley Park", start: "Chesham Underground Station, 9:18am", distance: "~6:00/km, 2 pitstops", finish: "Wembley Park Underground Station" },
        { title: "Day 2 · Sun 5 July — Wembley Park → Aldgate", start: "Wembley Park Underground Station, 9:35am", finish: "Aldgate" },
      ],
    },
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
    Central: [
      ["Liverpool Street", 51.5174, -0.0832], ["Bank", 51.5134, -0.0889], ["St Paul's", 51.5149, -0.0976],
      ["Chancery Lane", 51.5182, -0.1116], ["Holborn", 51.5176, -0.1205], ["Tottenham Court Road", 51.5164, -0.1304],
      ["Oxford Circus", 51.5152, -0.1419], ["Bond Street", 51.5143, -0.1497], ["Marble Arch", 51.5134, -0.1590],
      ["Lancaster Gate", 51.5117, -0.1755], ["Queensway", 51.5103, -0.1872], ["Notting Hill Gate", 51.5091, -0.1961],
      ["Holland Park", 51.5071, -0.2057], ["Shepherd's Bush", 51.5044, -0.2188], ["White City", 51.5120, -0.2243],
      ["East Acton", 51.5166, -0.2472], ["North Acton", 51.5235, -0.2598], ["West Acton", 51.5180, -0.2810],
      ["Ealing Broadway", 51.5150, -0.3015],
    ],
    Metropolitan: [
      ["Chesham", 51.7052, -0.6112], ["Chalfont & Latimer", 51.6680, -0.5607], ["Chorleywood", 51.6544, -0.5185],
      ["Rickmansworth", 51.6402, -0.4737], ["Moor Park", 51.6298, -0.4325], ["Northwood", 51.6111, -0.4238],
      ["Northwood Hills", 51.6006, -0.4095], ["Pinner", 51.5929, -0.3812], ["North Harrow", 51.5849, -0.3624],
      ["Harrow-on-the-Hill", 51.5792, -0.3372], ["Northwick Park", 51.5785, -0.3181], ["Preston Road", 51.5720, -0.2951],
      ["Wembley Park", 51.5632, -0.2793], ["Finchley Road", 51.5468, -0.1798], ["Baker Street", 51.5229, -0.1571],
      ["Great Portland Street", 51.5238, -0.1443], ["Euston Square", 51.5256, -0.1358], ["King's Cross St Pancras", 51.5307, -0.1232],
      ["Farringdon", 51.5203, -0.1049], ["Barbican", 51.5203, -0.0980], ["Moorgate", 51.5182, -0.0883],
      ["Liverpool Street", 51.5174, -0.0832], ["Aldgate", 51.5142, -0.0757],
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
  const pinned = RUN_PLAN.filter((r) => r.date).map((r) => parseISO(r.date));
  // Don't auto-schedule a first-Sunday run on a weekend already taken by a dated special.
  const nearPinned = (sun) => pinned.some((p) => Math.abs(p - sun) <= 2 * 86400000);
  const sundays = upcomingSundays(autoCount + pinned.length).filter((s) => !nearPinned(s)).slice(0, autoCount);
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
  // Each route carries an indicative `path` of [lat,lon] waypoints tracing the described
  // course (an overview line, not a turn-by-turn GPX); `loop` closes the trace visually.
  const ROUTES = [
    { name: "Regent's Canal Towpath", type: "canal", leg: "Limehouse Basin → Little Venice", start: "Limehouse (DLR/c2c)", distance: "9.3 mi (15 km)", highlights: "Largely traffic-free towpath past Mile End Park, Victoria Park, Camden Lock and the narrowboats of Little Venice; flat.", suitability: "Ideal sociable long run — flat, easy to follow, splittable into shorter chunks.", loop: false, path: [[51.5122, -0.0395], [51.5170, -0.0367], [51.5230, -0.0345], [51.5305, -0.0408], [51.5360, -0.0430], [51.5378, -0.0640], [51.5352, -0.0900], [51.5335, -0.1088], [51.5362, -0.1290], [51.5415, -0.1465], [51.5348, -0.1610], [51.5245, -0.1795], [51.5220, -0.1830]] },
    { name: "Hyde Park & Kensington Gardens Loop", type: "park", leg: "Perimeter of both royal parks", start: "Hyde Park Corner / Lancaster Gate", distance: "4.3 mi (7 km)", highlights: "Sealed paths around the Serpentine, Italian Gardens and Diana Memorial; mild undulations.", suitability: "Very group-friendly — flat loop with 1mi/2mi markers built in for mixed paces.", loop: true, path: [[51.5028, -0.1527], [51.5090, -0.1560], [51.5131, -0.1589], [51.5118, -0.1700], [51.5079, -0.1812], [51.5030, -0.1858], [51.5008, -0.1770], [51.5020, -0.1660], [51.5033, -0.1600], [51.5028, -0.1527]] },
    { name: "The Grand Tour (Thames Landmarks)", type: "landmark", leg: "Trafalgar Sq → Tower Bridge & back, both banks", start: "Charing Cross", distance: "7.0 mi (11.25 km)", highlights: "Westminster, the London Eye, Tate Modern, the Globe, St Paul's, the Tower — the Thames Path both banks.", suitability: "Perfect landmark tour — allow 2–3× time for photos; can be congested.", loop: true, path: [[51.5074, -0.1278], [51.5044, -0.1240], [51.5010, -0.1215], [51.5030, -0.1170], [51.5055, -0.1050], [51.5076, -0.0994], [51.5079, -0.0900], [51.5052, -0.0790], [51.5045, -0.0754], [51.5055, -0.0754], [51.5081, -0.0759], [51.5104, -0.0870], [51.5138, -0.0984], [51.5110, -0.1090], [51.5074, -0.1210], [51.5074, -0.1278]] },
    { name: "Regent's Park & Primrose Hill", type: "park", leg: "Outer Circle loop + Primrose Hill", start: "Baker Street / Great Portland Street", distance: "4.0 mi (6.5 km)", highlights: "Gardens, boating lake, an old cinder track and the famous city view from Primrose Hill.", suitability: "Something for everyone — flat 2.7mi loop with an optional hill for keen legs.", loop: true, path: [[51.5226, -0.1571], [51.5255, -0.1605], [51.5295, -0.1615], [51.5322, -0.1555], [51.5330, -0.1475], [51.5305, -0.1445], [51.5350, -0.1505], [51.5388, -0.1582], [51.5350, -0.1505], [51.5300, -0.1445], [51.5262, -0.1500], [51.5226, -0.1571]] },
    { name: "Diana Memorial Run", type: "landmark", leg: "Figure-of-eight through four royal parks", start: "Hyde Park Corner", distance: "7.2 mi (11.6 km)", highlights: "Way-marked with 90 brass plates past Buckingham Palace, St James's, Green & Hyde Parks.", suitability: "Easy navigation, splittable into two loops; some road crossings by the Palace.", loop: true, path: [[51.5028, -0.1527], [51.5015, -0.1445], [51.5014, -0.1419], [51.5024, -0.1360], [51.5030, -0.1310], [51.5045, -0.1360], [51.5050, -0.1428], [51.5040, -0.1500], [51.5028, -0.1527]] },
    { name: "Victoria Park Loop", type: "park", leg: "Perimeter of the 'People's Park'", start: "Hackney Wick / Cambridge Heath", distance: "2.7 mi (4.4 km)", highlights: "Tree-lined avenues with parallel dirt bridle paths, ponds and gardens; flanked by two canals.", suitability: "Sociable and popular — flat, wide paths, lots of runners for company.", loop: true, path: [[51.5358, -0.0450], [51.5360, -0.0360], [51.5385, -0.0320], [51.5415, -0.0350], [51.5420, -0.0410], [51.5405, -0.0470], [51.5378, -0.0500], [51.5358, -0.0450]] },
    { name: "Battersea Park Circuit", type: "park", leg: "Loop via Carriage Drive", start: "Battersea Park Rail / Queenstown Road", distance: "2.2 mi (3.5 km)", highlights: "Riverside park from Albert to Chelsea Bridge with crushed-limestone paths and a track; flat.", suitability: "Great all-paces park — flat, no traffic (track only before 8am).", loop: true, path: [[51.4800, -0.1560], [51.4820, -0.1555], [51.4832, -0.1500], [51.4820, -0.1460], [51.4798, -0.1475], [51.4788, -0.1520], [51.4800, -0.1560]] },
    { name: "Greenwich Park & Blackheath", type: "park", leg: "Park circuit onto Blackheath", start: "Cutty Sark DLR / Greenwich Rail", distance: "2 mi (3.2 km) + Blackheath", highlights: "Royal Observatory, the Meridian, sweeping city views, then the open expanse of Blackheath.", suitability: "Scenery plus a hill challenge — flat north, then three climbs.", loop: false, path: [[51.4827, -0.0096], [51.4805, -0.0057], [51.4785, -0.0020], [51.4769, -0.0005], [51.4730, 0.0000], [51.4690, 0.0060], [51.4670, 0.0090]] },
    { name: "Hampstead Heath", type: "trail", leg: "Loop over Parliament Hill & the ponds", start: "Hampstead / Gospel Oak (Overground)", distance: "8.0 mi (13 km)", highlights: "320 hectares of woodland, heath and ponds crowned by the Parliament Hill view.", suitability: "For a confident group — hilly, easy to get lost, keep together; muddy when wet.", loop: true, path: [[51.5555, -0.1530], [51.5580, -0.1550], [51.5600, -0.1580], [51.5640, -0.1610], [51.5690, -0.1625], [51.5710, -0.1670], [51.5670, -0.1740], [51.5610, -0.1770], [51.5570, -0.1760], [51.5555, -0.1530]] },
    { name: "St James's & Green Park", type: "park", leg: "Loop around both parks and the lake", start: "Green Park / St James's Park", distance: "2.4 mi (3.9 km)", highlights: "Green oasis on Buckingham Palace's doorstep with a photo-ready lake and The Mall.", suitability: "Easy short social loop, very photogenic; heavy foot traffic.", loop: true, path: [[51.5067, -0.1428], [51.5058, -0.1360], [51.5045, -0.1320], [51.5024, -0.1340], [51.5014, -0.1419], [51.5035, -0.1442], [51.5050, -0.1440], [51.5067, -0.1428]] },
    { name: "Southwark Park & the Docks", type: "river", leg: "Park out to Greenland Dock & Thames Path", start: "Surrey Quays / Canada Water", distance: "1.4 mi (2.25 km), extendable", highlights: "Victorian park linking to Greenland Dock, Russia Dock Woodland and a rare south-bank river corridor.", suitability: "Flexible — flat, quiet, easily lengthened along the docks and river.", loop: false, path: [[51.4980, -0.0498], [51.4958, -0.0520], [51.4945, -0.0480], [51.4915, -0.0450], [51.4950, -0.0430], [51.5000, -0.0470]] },
    { name: "Wormwood Scrubs", type: "park", leg: "Perimeter loop of 'The Scrubs'", start: "East Acton (Central)", distance: "2.4 mi (3.85 km)", highlights: "Vast open grass with a 960m sealed loop and Grand Union Canal access next door; flat.", suitability: "Roomy and flat for all paces, with the canal as an add-on.", loop: true, path: [[51.5165, -0.2480], [51.5195, -0.2430], [51.5225, -0.2380], [51.5228, -0.2300], [51.5200, -0.2280], [51.5175, -0.2330], [51.5170, -0.2430], [51.5165, -0.2480]] },
  ];

  const routeMap = { map: null, layer: null };

  function drawRoute(i) {
    const r = ROUTES[i], c = ROUTE_COLOURS[r.type] || "#0019A8", m = routeMap.map;
    if (!m || !r.path || !r.path.length) return;
    if (routeMap.layer) m.removeLayer(routeMap.layer);
    const grp = L.layerGroup();
    const pts = r.loop && r.path.length > 2 ? r.path.concat([r.path[0]]) : r.path;
    L.polyline(pts, { color: c, weight: 5, opacity: 0.3, lineJoin: "round", lineCap: "round" }).addTo(grp);
    L.polyline(pts, { renderer: L.svg(), color: c, weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round", className: "route-flow", dashArray: "2 13" }).addTo(grp);
    const first = r.path[0], last = r.path[r.path.length - 1];
    L.circleMarker(first, { radius: 6, color: "#fff", weight: 2, fillColor: c, fillOpacity: 1 })
      .bindTooltip("Start · " + escapeHtml(r.start), { direction: "top" }).addTo(grp);
    if (!r.loop) L.circleMarker(last, { radius: 6, color: c, weight: 2, fillColor: "#fff", fillOpacity: 1 })
      .bindTooltip("Finish", { direction: "top" }).addTo(grp);
    grp.addTo(m);
    routeMap.layer = grp;
    m.fitBounds(L.latLngBounds(r.path), { padding: [34, 34] });
  }

  function selectRoute(i) {
    const cards = document.querySelectorAll("#routeList .route-card");
    cards.forEach((el, j) => { el.classList.toggle("on", j === i); el.setAttribute("aria-pressed", j === i ? "true" : "false"); });
    drawRoute(i);
    if (window.matchMedia("(max-width: 860px)").matches && routeMap.map)
      document.getElementById("routeMap").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderRoutes() {
    const el = document.getElementById("routeList");
    if (!el) return;
    el.innerHTML = ROUTES.map((r, i) => {
      const c = ROUTE_COLOURS[r.type] || "#0019A8";
      return `<div class="route-card" data-i="${i}" role="button" tabindex="0" aria-pressed="false" style="border-top-color:${c}">
        <div class="rc-top"><span class="rc-type" style="background:${c}">${escapeHtml(r.type)}</span><span class="rc-dist">${escapeHtml(r.distance)}</span></div>
        <h3>${escapeHtml(r.name)}</h3>
        <p class="rc-leg">${escapeHtml(r.leg)}</p>
        <p class="rc-meta"><strong>Start</strong> ${escapeHtml(r.start)}</p>
        <p class="rc-hi">${escapeHtml(r.highlights)}</p>
        ${r.suitability ? `<p class="rc-suit">${escapeHtml(r.suitability)}</p>` : ""}
        <p class="rc-show">Show on map →</p>
      </div>`;
    }).join("");
    el.querySelectorAll(".route-card").forEach((card) => {
      const i = parseInt(card.dataset.i, 10);
      card.addEventListener("click", () => selectRoute(i));
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectRoute(i); } });
    });

    const mapEl = document.getElementById("routeMap");
    if (mapEl && typeof L !== "undefined") {
      routeMap.map = L.map(mapEl, { center: [51.509, -0.115], zoom: 11, preferCanvas: true, zoomSnap: 0 });
      cartoBasemap().addTo(routeMap.map);
      modifierWheelZoom(routeMap.map);
      requestAnimationFrame(() => { routeMap.map.invalidateSize(false); selectRoute(0); });
    }
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
    { key: "geo", label: "Map", kind: "geo" },
    { key: "running", label: "Running times", kind: "data" },
    { key: "walking", file: "img/walking-map.png", label: "Walking times", kind: "img" },
    { key: "toilets", file: "img/toilet-map.png", label: "Toilets 🚻", kind: "img" },
    { key: "standard", file: "img/tube-map.svg", label: "Tube map", kind: "svg", highlight: true },
    { key: "overground", file: "img/overground-map.png", label: "Overground", kind: "img" },
    { key: "connections", file: "img/connections-map.png", label: "Rail connections", kind: "img" },
  ];
  const svgCache = {};
  let curMap = "geo";
  let curZoom = 1.4;
  let netData = null;         // data/tube-network.json, lazy-loaded
  let toiletSet = null;       // Set of station ids with confirmed toilets
  let geoTimeMode = "run";    // run | walk | off — badge mode on the highlighted line
  let geoShowToilets = true;  // toilet pins on the geographic map
  function defaultZoom(kind) { return kind === "geo" ? 1.4 : kind === "schematic" ? 1.3 : kind === "data" ? 1 : 1.6; }
  async function loadNetwork() {
    if (netData) return netData;
    const [nRes, tRes] = await Promise.all([fetch("data/tube-network.json"), fetch("data/station-toilets.json")]);
    if (!nRes.ok) throw new Error("network data");
    netData = await nRes.json();
    toiletSet = new Set(tRes.ok ? await tRes.json() : []);
    return netData;
  }
  let schemData = null;       // data/schematic.json — Beck-style schematic coords (d3-tube-map, MIT)
  async function loadSchematic() {
    if (schemData) return schemData;
    const res = await fetch("data/schematic.json");
    if (!res.ok) throw new Error("schematic data");
    schemData = await res.json();
    return schemData;
  }
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const LABEL_POS = {
    N: { dx: 0, dy: -1, anchor: "middle" }, S: { dx: 0, dy: 1, anchor: "middle" },
    E: { dx: 1, dy: 0, anchor: "start" }, W: { dx: -1, dy: 0, anchor: "end" },
    NE: { dx: 1, dy: -1, anchor: "start" }, NW: { dx: -1, dy: -1, anchor: "end" },
    SE: { dx: 1, dy: 1, anchor: "start" }, SW: { dx: -1, dy: 1, anchor: "end" },
  };

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
      <p class="tm-scrollhint">Drag to pan · ⌘/Ctrl + scroll to zoom to the cursor · or use +/&minus;.</p>`;
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
      if (curMapKind() === "data" || curMapKind() === "geo") return; // table scrolls; Leaflet owns the map
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
    // Cmd/Ctrl + wheel to zoom toward the cursor (trackpad pinch sends ctrl+wheel).
    holder.addEventListener("wheel", (e) => {
      if (!(e.metaKey || e.ctrlKey) || curMapKind() === "data" || curMapKind() === "geo") return;
      const node = holder.querySelector("svg, img");
      if (!node) return;
      e.preventDefault();
      const rect = holder.getBoundingClientRect();
      const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
      const px = holder.scrollLeft + ox, py = holder.scrollTop + oy;
      const before = curZoom;
      curZoom = Math.min(6, Math.max(0.5, curZoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      applyZoom();
      const scale = curZoom / before;
      holder.scrollLeft = px * scale - ox;
      holder.scrollTop = py * scale - oy;
    }, { passive: false });
    loadMap();
  }

  async function loadMap() {
    const holder = document.getElementById("tmHolder");
    const cap = document.getElementById("tmCaption");
    const zoom = document.querySelector(".tm-zoom");
    const cfg = MAPS.find((m) => m.key === curMap);
    if (cfg.kind !== "geo") { document.body.classList.remove("tm-map-active"); if (tmMap.map) { tmMap.map.remove(); tmMap.map = null; } }
    const active = cfg.highlight && nextRun && LINE_FILL[nextRun.key] ? nextRun.key : null;
    const CAPTIONS = {
      geo: `Our own live map, built from open TfL data — zoom, drag and tap a station.`,
      schematic: `Our own semantic Beck-style schematic (beta).`,
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

    // Our own semantic schematic (Beck-style).
    if (cfg.kind === "schematic") { renderSchematic(holder, cap).catch(() => { holder.innerHTML = `<p class="diagram-empty">Couldn't build the schematic right now.</p>`; }); return; }

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
  // Equirectangular projection with a radial "fisheye" that expands dense
  // central London and compresses the sparse edges, so labels stop colliding.
  let linesGeo = null;
  async function loadLines() {
    if (linesGeo) return linesGeo;
    const res = await fetch("data/tube-lines.geojson");
    if (!res.ok) throw new Error("lines geojson");
    linesGeo = await res.json();
    return linesGeo;
  }
  const tmMap = { map: null };

  // Shared openly-licensed basemap (CARTO Voyager, no key) for our Leaflet maps.
  function cartoBasemap() {
    return L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd", maxZoom: 20,
    });
  }

  // Zoom to the cursor only while ⌘/Ctrl is held, so plain scroll still moves the page.
  function modifierWheelZoom(map) {
    map.scrollWheelZoom.disable();
    map.getContainer().addEventListener("wheel", (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      const ll = map.containerPointToLatLng(map.mouseEventToContainerPoint(e));
      map.setZoomAround(ll, map.getZoom() - e.deltaY * 0.008);
    }, { passive: false });
  }

  // Cumulative running distance (km) to each stop along the highlighted line's longest branch.
  function tmComputeKm(net, hi) {
    const out = {};
    if (!hi || !net[hi]) return out;
    const line = net[hi], br = line.branches.reduce((a, b) => (b.length > a.length ? b : a), line.branches[0] || []);
    let cum = 0;
    for (let i = 0; i < br.length; i++) {
      if (i > 0) { const a = line.stations[br[i - 1]], b = line.stations[br[i]]; cum += haversineKm([0, a.lat, a.lon], [0, b.lat, b.lon]) * ROAD_FACTOR; }
      out[br[i]] = cum;
    }
    return out;
  }

  function geoCaption(cap, net, hi, redraw) {
    if (!cap) return;
    const modes = hi ? `<span class="geo-modes">Times: ${["run", "walk", "off"].map((m) =>
      `<button type="button" class="geo-mode" data-mode="${m}"${geoTimeMode === m ? ' data-on="1"' : ""}>${m === "off" ? "Off" : m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</span>` : "";
    const wcBtn = `<button type="button" class="geo-mode geo-wc-btn" data-wc="1"${geoShowToilets ? ' data-on="1"' : ""}>🚻 Toilets</button>`;
    cap.innerHTML = (hi
      ? `<strong style="color:${net[hi].colour}">${escapeHtml(net[hi].name)} line</strong> lit up for the next run, with running times to each stop. `
      : `Our own live map — real streets, parks and the Thames, with every tube line on top. `) + modes + " " + wcBtn;
    cap.querySelectorAll(".geo-mode[data-on]").forEach((b) => b.classList.add("on"));
    cap.querySelectorAll(".geo-mode[data-mode]").forEach((b) => b.addEventListener("click", () => {
      geoTimeMode = b.dataset.mode;
      cap.querySelectorAll(".geo-mode[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
      redraw();
    }));
    const wb = cap.querySelector(".geo-wc-btn");
    if (wb) wb.addEventListener("click", () => { geoShowToilets = !geoShowToilets; wb.classList.toggle("on", geoShowToilets); redraw(); });
  }

  // Real geographic map: Leaflet + CARTO Voyager basemap + our tube overlays.
  async function renderGeoMap(holder, cap) {
    if (typeof L === "undefined") { holder.innerHTML = `<p class="diagram-empty">The map library couldn't load — check your connection.</p>`; return; }
    const [net, geo] = await Promise.all([loadNetwork(), loadLines()]);
    const hi = geoHighlightId(net);
    document.body.classList.add("tm-map-active");
    holder.innerHTML = `<div id="tmMap"></div>`;
    if (tmMap.map) { tmMap.map.remove(); tmMap.map = null; }
    const map = L.map("tmMap", { center: [51.509, -0.115], zoom: 11, preferCanvas: true, zoomSnap: 0 });
    tmMap.map = map;
    cartoBasemap().addTo(map);
    modifierWheelZoom(map);

    // Tube lines (real track geometry). Highlighted line bold & on top, others dimmed.
    const lineLayer = L.geoJSON(geo, { style: (f) => { const on = hi && f.properties.line === hi;
      return { color: f.properties.colour, weight: on ? 5 : 3, opacity: on ? 1 : (hi ? 0.3 : 0.9), lineJoin: "round", lineCap: "round" }; } }).addTo(map);
    lineLayer.eachLayer((l) => { if (hi && l.feature.properties.line === hi) l.bringToFront(); });

    // Animated run route from the next run's waypoints (start → finish) to show direction.
    const wp = hi && nextRun ? WAYPOINTS[nextRun.key] : null;
    if (wp && wp.length > 1) {
      const wl = wp.map((s) => [s[1], s[2]]);
      L.polyline(wl, { renderer: L.svg(), color: net[hi].colour, weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round", className: "route-flow", dashArray: "2 12" }).addTo(map);
      L.circleMarker(wl[0], { radius: 6, color: "#fff", weight: 2, fillColor: net[hi].colour, fillOpacity: 1 })
        .bindTooltip("Start · " + escapeHtml(wp[0][0]), { direction: "top" }).addTo(map);
      L.marker(wl[wl.length - 1], { icon: L.divIcon({ className: "route-finish", html: "◉", iconSize: [15, 15], iconAnchor: [7, 7] }) })
        .bindTooltip("Finish · " + escapeHtml(wp[wp.length - 1][0]), { direction: "top" }).addTo(map);
    }

    // Station lookup: dedup by id, count lines per station (interchange), colour.
    const count = {}, coordById = {}, colourById = {};
    for (const id in net) { const st = net[id].stations; for (const sid in st) { count[sid] = (count[sid] || 0) + 1;
      if (!coordById[sid]) { coordById[sid] = st[sid]; colourById[sid] = net[id].colour; } } }
    const km = tmComputeKm(net, hi);

    let stationGrp = null, toiletGrp = null;
    function draw() {
      if (stationGrp) map.removeLayer(stationGrp);
      if (toiletGrp) map.removeLayer(toiletGrp);
      const perKm = geoTimeMode === "walk" ? WALK_MIN_PER_KM : (parseFloat(paceSel && paceSel.value) || 6.5);
      stationGrp = L.layerGroup();
      for (const sid in coordById) { const s = coordById[sid], inter = count[sid] > 1, onHi = km[sid] !== undefined, dim = hi && !onHi;
        const m = L.circleMarker([s.lat, s.lon], {
          radius: inter ? (onHi ? 6 : 4.5) : 3, weight: inter ? 1.5 : 1,
          color: inter ? "#111" : (dim ? "#9aa3ad" : colourById[sid]),
          fillColor: inter ? "#fff" : (dim ? "#c4ccd4" : colourById[sid]),
          fillOpacity: 1, opacity: dim ? 0.55 : 1,
        });
        if (onHi) {
          const time = geoTimeMode !== "off" ? `<span style="color:${net[hi].colour}">${fmtTime(km[sid] * perKm)}</span>` : "";
          m.bindTooltip(`<b>${escapeHtml(s.n)}</b>${time}`, { permanent: true, direction: "right", className: "tm-run-label", offset: [7, 0] });
        } else { m.bindTooltip(escapeHtml(s.n), { direction: "top", className: "tm-hover-label" }); }
        stationGrp.addLayer(m);
      }
      stationGrp.addTo(map);
      toiletGrp = L.layerGroup();
      if (geoShowToilets) toiletSet.forEach((sid) => { const s = coordById[sid]; if (!s) return;
        L.marker([s.lat, s.lon], { icon: L.divIcon({ className: "tm-wc", html: "wc", iconSize: [15, 15], iconAnchor: [7, 7] }) })
          .bindTooltip(escapeHtml(s.n) + " — toilets").addTo(toiletGrp); });
      toiletGrp.addTo(map);
    }
    draw();
    geoCaption(cap, net, hi, draw);

    requestAnimationFrame(() => { map.invalidateSize(false);
      if (hi) { const b = L.latLngBounds([]); lineLayer.eachLayer((l) => { if (l.feature.properties.line === hi) b.extend(l.getBounds()); });
        if (b.isValid()) map.fitBounds(b, { padding: [28, 28] }); }
      else map.fitBounds(lineLayer.getBounds(), { padding: [16, 16] }); });
  }

  // --- Our own SEMANTIC Beck-style schematic (data/schematic.json) --------
  function schemLineForNext(schem) {
    if (!nextRun) return null;
    const k = (nextRun.key || "").toLowerCase();
    const l = schem.lines.find((L) => L.name.toLowerCase() === k || (L.label || "").toLowerCase() === k);
    return l ? l.name : null;
  }

  function schemLabelText(schem, name) { return (schem.stations[name] && schem.stations[name].label || name).replace(/\n/g, " "); }

  function schemLabel(schem, nd, x, y, timeInfo) {
    const lp = LABEL_POS[nd.labelPos || "E"], off = 6, lh = 6.4;
    const raw = (schem.stations[nd.name] && schem.stations[nd.name].label) || nd.name;
    const rows = raw.split("\n");
    const ax = x + lp.dx * off;
    let baseline, y0;
    if (lp.dy < 0) { baseline = "auto"; y0 = y + lp.dy * off - (rows.length - 1) * lh; }
    else if (lp.dy > 0) { baseline = "hanging"; y0 = y + lp.dy * off; }
    else { baseline = "middle"; y0 = y - (rows.length - 1) * lh / 2; }
    let t = `<text class="sch-lbl" text-anchor="${lp.anchor}" dominant-baseline="${baseline}">`;
    rows.forEach((ln, i) => { t += `<tspan x="${ax.toFixed(1)}" y="${(y0 + i * lh).toFixed(1)}">${escapeHtml(ln)}</tspan>`; });
    t += `</text>`;
    if (timeInfo && timeInfo.show) {
      const ty = (lp.dy < 0 ? y - off + 1 : y0 + rows.length * lh);
      t += `<text class="sch-time" x="${ax.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${lp.anchor}" dominant-baseline="hanging" fill="${timeInfo.color}">${fmtTime(timeInfo.mins)}</text>`;
    }
    return t;
  }

  function buildSchematicSvg(schem, net, hi) {
    const S = 15, pad = 60;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    schem.lines.forEach((L) => L.nodes.forEach((nd) => { const [x, y] = nd.coords;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }));
    const W = Math.round((maxX - minX) * S + 2 * pad), H = Math.round((maxY - minY) * S + 2 * pad);
    const X = (x) => pad + (x - minX) * S, Y = (y) => pad + (maxY - y) * S; // flip Y (north up)

    // cumulative km along the highlighted line, using real geographic coords by name
    const coordByName = {};
    for (const id in net) { const st = net[id].stations; for (const sid in st) { const s = st[sid]; const k = norm(s.n); if (!coordByName[k]) coordByName[k] = s; } }
    const tmap = {}; let hiColor = "#0019A8";
    if (hi) {
      const L = schem.lines.find((l) => l.name === hi); hiColor = L.color;
      let cum = 0, prev = null;
      L.nodes.filter((n) => n.name).forEach((n) => { const c = coordByName[norm(n.name)];
        if (c && prev) cum += haversineKm([0, prev.lat, prev.lon], [0, c.lat, c.lon]) * ROAD_FACTOR;
        if (c) prev = c; tmap[n.name] = cum; });
    }
    const perKm = geoTimeMode === "walk" ? WALK_MIN_PER_KM : (parseFloat(paceSel && paceSel.value) || 6.5);

    const order = schem.lines.slice().sort((a, b) => ((a.name === hi) ? 1 : 0) - ((b.name === hi) ? 1 : 0));
    let paths = "";
    order.forEach((L) => { const dim = hi && L.name !== hi, w = L.name === hi ? 6 : 3.4, op = dim ? 0.25 : 1;
      const pts = L.nodes.map((nd) => `${X(nd.coords[0]).toFixed(1)},${Y(nd.coords[1]).toFixed(1)}`).join(" ");
      paths += `<polyline points="${pts}" fill="none" stroke="${L.color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" opacity="${op}"/>`;
    });

    let dots = "", labels = ""; const drawn = new Set();
    order.forEach((L) => { L.nodes.forEach((nd) => { if (!nd.name || drawn.has(nd.name)) return; drawn.add(nd.name);
      const x = X(nd.coords[0]), y = Y(nd.coords[1]);
      const onHi = tmap[nd.name] !== undefined, op = hi && !onHi ? 0.3 : 1, inter = nd.marker === "interchange";
      dots += inter
        ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.4" fill="#fff" stroke="#111" stroke-width="1.6" opacity="${op}"><title>${escapeHtml(schemLabelText(schem, nd.name))}</title></circle>`
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${L.color}" opacity="${op}"><title>${escapeHtml(schemLabelText(schem, nd.name))}</title></circle>`;
      if (!hi || onHi) labels += schemLabel(schem, nd, x, y, onHi ? { mins: tmap[nd.name] * perKm, show: geoTimeMode !== "off", color: hiColor } : null);
    }); });

    return `<svg class="tm-svg sch-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:${curZoom * 100}%">`
      + `<rect width="${W}" height="${H}" fill="#fff"/>${paths}${dots}${labels}</svg>`;
  }

  function schematicCaption(cap, schem, net, hi, holder) {
    if (!cap) return;
    const col = hi ? schem.lines.find((l) => l.name === hi).color : "#0019A8";
    const modes = hi ? `<span class="geo-modes">Times: ${["run", "walk", "off"].map((m) =>
      `<button type="button" class="geo-mode" data-mode="${m}"${geoTimeMode === m ? ' data-on="1"' : ""}>${m === "off" ? "Off" : m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</span>` : "";
    cap.innerHTML = (hi
      ? `<strong style="color:${col}">${escapeHtml(hi)} line</strong> on our own semantic schematic <em>(beta — central zone, expanding)</em>. `
      : `Our own semantic Beck-style schematic <em>(beta — central zone, expanding)</em>. `) + modes;
    cap.querySelectorAll(".geo-mode[data-on]").forEach((b) => b.classList.add("on"));
    cap.querySelectorAll(".geo-mode[data-mode]").forEach((b) => b.addEventListener("click", () => {
      geoTimeMode = b.dataset.mode;
      cap.querySelectorAll(".geo-mode[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
      holder.innerHTML = buildSchematicSvg(schem, net, hi); applyZoom();
    }));
  }

  async function renderSchematic(holder, cap) {
    const [schem] = await Promise.all([loadSchematic(), loadNetwork()]);
    const hi = schemLineForNext(schem);
    schematicCaption(cap, schem, netData, hi, holder);
    holder.innerHTML = buildSchematicSvg(schem, netData, hi);
    applyZoom();
    requestAnimationFrame(() => centreContent(holder));
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
  loadWeather();
})();
