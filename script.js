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
  // it back, so every line has TWO collectible directions (36 in total).
  // LINE_DIRS gives each line's two direction labels [dir0, dir1].
  const TUBE_LINES = [
    "Bakerloo", "Central", "Circle", "District", "Hammersmith & City",
    "Jubilee", "Metropolitan", "Northern", "Piccadilly", "Victoria", "Waterloo & City",
    "Lioness", "Mildmay", "Windrush", "Weaver", "Suffragette", "Liberty", "Elizabeth",
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
    Lioness: ["→ Watford Junction", "→ Euston"],
    Mildmay: ["→ Stratford", "→ Richmond / Clapham Junction"],
    Windrush: ["→ Highbury & Islington", "→ New Cross / Croydon / Crystal Palace"],
    Weaver: ["→ Liverpool Street", "→ Chingford / Enfield Town / Cheshunt"],
    Suffragette: ["→ Gospel Oak", "→ Barking Riverside"],
    Liberty: ["→ Romford", "→ Upminster"],
    Elizabeth: ["→ Reading / Heathrow", "→ Shenfield / Abbey Wood"],
  };
  // Personal line-collector progress ("Line|0"/"Line|1", index into LINE_DIRS) is kept
  // per-visitor in the browser (localStorage) — see loadCollector/renderLineCollector.

  // --- GALLERY -----------------------------------------------------------
  // Drop in photos: { src: "photos/xyz.jpg", caption: "..." }. Leave empty to
  // show a friendly "share your photos" placeholder.
  const GALLERY = [];

  const MEET_TIME = "09:00";
  const ROAD_FACTOR = 1.3;   // streets are longer than crow-flies between points
  const WALK_MIN_PER_KM = 12; // ~5 km/h walking pace
  const CYCLE_MIN_PER_KM = 4; // ~15 km/h city cycling pace
  const LONDON = { lat: 51.5033, lon: -0.1145 };

  // Official-ish TfL line colours.
  const LINE_COLOURS = {
    Bakerloo: "#B36305", Central: "#E32017", Circle: "#FFD300", District: "#00782A",
    "Hammersmith & City": "#F3A9BB", Jubilee: "#A0A5A9", Metropolitan: "#9B0056",
    Northern: "#000000", Piccadilly: "#003688", Victoria: "#0098D4",
    "Waterloo & City": "#95CDBA", Elizabeth: "#6950A1", Overground: "#EE7C0E", DLR: "#00A4A7",
    // London Overground's 6 named lines (TfL Colour Standard, Issue 10).
    Lioness: "#FAA61A", Mildmay: "#0077AD", Windrush: "#ED1B00",
    Weaver: "#823A62", Suffragette: "#5BBD72", Liberty: "#5D6061",
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
      type: "tube", line: "Metropolitan", date: "2026-07-04", bound: "Southbound",
      leg: "Chesham → Aldgate", start: "Chesham Underground Station",
      distance: "2 days · ~59 km",
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
    if (d < 0) return "On now!"; // multi-day event already under way
    if (d === 0) return "Today — let's run!";
    if (d === 1) return "Tomorrow";
    if (d < 7) return `In ${d} days`;
    const w = Math.round(d / 7);
    return `In ${w} week${w > 1 ? "s" : ""}`;
  }
  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  // --- Live run phase (timezone-correct) ---------------------------------
  // Runs happen on UK time, but a viewer can be in any timezone — so anything
  // hour-aware must reason in Europe/London, never the viewer's local clock.
  const LON_DTF = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  function londonParts(ms) {
    const p = LON_DTF.formatToParts(new Date(ms));
    const g = (t) => +p.find((x) => x.type === t).value;
    return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour") % 24, mi: g("minute") };
  }
  // Absolute epoch-ms for a wall-clock time in London (handles BST/GMT itself).
  function londonInstant(y, m0, d, h, mi) {
    const guess = Date.UTC(y, m0, d, h, mi);
    const p = londonParts(guess);
    return guess - (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - guess);
  }
  function londonHM(ms) {
    const p = londonParts(ms);
    return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
  }
  function londonDayNo(ms) {
    const p = londonParts(ms);
    return Math.floor(Date.UTC(p.y, p.mo - 1, p.d) / 86400000);
  }
  function relDay(nowMs, ms) {
    const diff = londonDayNo(ms) - londonDayNo(nowMs);
    if (diff <= 0) return "today";
    if (diff === 1) return "tomorrow";
    return DOW[new Date(londonDayNo(ms) * 86400000).getUTCDay()];
  }
  const RUN_WINDOW_MS = 6 * 3600 * 1000; // fallback time on the move when a finish can't be estimated
  // Per-day { start, end } windows for a run, as absolute instants. `end` is the
  // estimated finish — the day's routed distance at ~6:30/km plus 30 min slack —
  // so "on now" (and the live button) stop once the group is realistically done
  // rather than after a flat 6 hours. Falls back to RUN_WINDOW_MS with no route.
  function runTimeline(run) {
    const days = run.days && run.days.length > 1 ? run.days : [null];
    const wp = WAYPOINTS[run.key];
    const segs = wp ? journeySegments(run, wp) : null;
    return days.map((d, i) => {
      const base = new Date(run.date.getFullYear(), run.date.getMonth(), run.date.getDate() + i);
      const [H, M] = (d ? parseClock(d.start) : MEET_TIME).split(":").map(Number);
      const start = londonInstant(base.getFullYear(), base.getMonth(), base.getDate(), H, M);
      const seg = segs && segs[i];
      const dur = seg ? legDistanceKm(wp, seg.from, seg.to) * 6.5 * 60000 + 30 * 60000 : RUN_WINDOW_MS;
      return { start, end: start + dur };
    });
  }
  // Live status of a run: upcoming / today / on-now / between days / finished.
  // A pure function of the current time — recomputed on every tick. Returns a
  // compact `short` (for the hero corner chip) and a fuller `label`.
  function runPhase(run) {
    if (!run) return { short: "", label: "", live: false, day: 0 };
    const now = Date.now();
    const tl = runTimeline(run);
    const multi = tl.length > 1;
    // The day the runner should care about now: the first not-yet-finished day,
    // or the last once the whole event is over.
    let day = tl.findIndex((w) => now < w.end);
    if (day === -1) day = tl.length - 1;
    if (now >= tl[tl.length - 1].end) return { short: "Done", label: "That's a wrap — see you next time", live: false, day };
    for (let i = 0; i < tl.length; i++) {
      const w = tl[i];
      if (now < w.start) {
        if (i > 0) {
          const rel = relDay(now, w.start);
          return { short: rel === "tomorrow" ? "Tomorrow" : "Today", label: `Day ${i} done · Day ${i + 1} ${rel} ${londonHM(w.start)}`, live: false, day };
        }
        if (londonDayNo(now) === londonDayNo(w.start)) {
          const mins = Math.round((w.start - now) / 60000);
          const inTxt = mins >= 60 ? `in ${Math.round(mins / 60)}h` : `in ${mins} min`;
          return { short: "Today", label: `Today · meet ${londonHM(w.start)} (${inTxt})`, live: false, day };
        }
        const c = countdownText(run.date);
        return { short: c, label: c, live: false, day };
      }
      if (now < w.end) return { short: "On now", label: multi ? `On now · Day ${i + 1}` : "On now", live: true, day };
    }
    return { short: "On now", label: "On now", live: true, day };
  }
  // The meeting point / meet time / leg the card should show *right now*. For a
  // multi-day run this follows the active day once day 1 is done, so the card
  // stops advertising a leg the group has already run.
  function stripTime(s) { return (s || "").replace(/,\s*\d{1,2}(:\d{2})?\s*[ap]m.*$/i, "").trim(); }
  function dayLeg(d) {
    if (d.title && /[—–]/.test(d.title)) return d.title.split(/[—–]/).slice(1).join("–").trim();
    const from = stripTime(d.start);
    return d.finish ? `${from} → ${d.finish}` : from;
  }
  function runMeet(run, ph) {
    const days = run.days && run.days.length > 1 ? run.days : null;
    if (!days) return { place: run.start, clock: MEET_TIME, leg: run.leg };
    const d = days[ph.day] || days[0];
    return { place: stripTime(d.start) || run.start, clock: parseClock(d.start), leg: ph.day > 0 ? dayLeg(d) : run.leg };
  }

  // --- Route normalisation ----------------------------------------------
  // Turn a RUN_PLAN entry into a uniform shape the UI can render.
  function normalise(entry) {
    const rich = {
      type: entry.type,
      location: entry.location || "London",
      map: entry.map || null,            // optional explicit Google Maps URL for the meeting point
      routeLink: entry.routeLink || null,
      days: entry.days || null,
      exits: entry.exits || null,
      stay: entry.stay || null,
      notes: entry.notes || null,
      leg: entry.leg, start: entry.start, distance: entry.distance,
      bound: entry.bound || null,        // explicit line direction (e.g. TfL "Southbound"); overrides the computed compass
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
  // Line colour as *text/border* on a light background: darken light colours
  // (Circle yellow, H&C pink, W&C green, Jubilee grey, Victoria blue…) until
  // they hit ~4.5:1 (WCAG AA) contrast against white. Raw line colours stay
  // untouched everywhere they're used as fills/strokes/backgrounds.
  const lineTextCache = {};
  function lineTextColour(hex) {
    if (lineTextCache[hex]) return lineTextCache[hex];
    const raw = hex.replace("#", "");
    let r = parseInt(raw.slice(0, 2), 16), g = parseInt(raw.slice(2, 4), 16), b = parseInt(raw.slice(4, 6), 16);
    const lum = () => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    while (1.05 / (lum() + 0.05) < 4.5 && (r || g || b)) {
      r = Math.floor(r * 0.92); g = Math.floor(g * 0.92); b = Math.floor(b * 0.92);
    }
    const h = (v) => v.toString(16).padStart(2, "0");
    return (lineTextCache[hex] = `#${h(r)}${h(g)}${h(b)}`);
  }
  // Google Maps link for a run's meeting point — explicit `map` URL if given,
  // otherwise a search built from the start point + its location.
  function meetMapUrl(r, place) {
    if (r.map && /^https?:\/\//i.test(r.map)) return r.map;
    const where = r.location && r.location !== "London" ? r.location : "London";
    const q = `${place || r.start}, ${where}`;
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
  // Runs from the start of next month on are tentative "suggestions" — the plan is
  // only firmed up a month out. Pinned specials (explicit dates) stay confirmed.
  const suggestFrom = new Date(); suggestFrom.setHours(0, 0, 0, 0); suggestFrom.setDate(1); suggestFrom.setMonth(suggestFrom.getMonth() + 1);
  const runs = RUN_PLAN
    .map((r) => ({ ...normalise(r), date: r.date ? parseISO(r.date) : sundays[si++], pinned: !!r.date }))
    .sort((a, b) => a.date - b.date);
  runs.forEach((r) => { r.suggested = !r.pinned && r.date >= suggestFrom; });
  const runEnd = (r) => new Date(r.date.getTime() + ((r.days ? r.days.length : 1) - 1) * 86400000);
  // "Next" = first run whose final day hasn't passed (a pinned date can be in
  // the past). Recomputed live rather than frozen at page-load, so a tab left
  // open — or restored from bfcache — rolls over on its own.
  function pickNextRun() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return runs.find((r) => runEnd(r) >= t) || runs[runs.length - 1];
  }
  let nextRun = pickNextRun();

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
    const total = Math.round(mins), h = Math.floor(total / 60), m = total % 60;
    return h ? `${h}h ${m}m` : `${m} min`;
  }
  // The run/cycle/walk time-estimate row, shared by the distance planner, bus
  // tracer and A→B journey planner. paceKm defaults to the site-wide run pace.
  function timesRowHtml(km, paceKm = rtPace) {
    return `<div class="cr-times"><span class="cr-run">🏃 run ~${fmtTime(km * paceKm)}</span> <span class="cr-cycle">🚴 cycle ~${fmtTime(km * CYCLE_MIN_PER_KM)}</span> <span class="cr-walk">🚶 walk ~${fmtTime(km * WALK_MIN_PER_KM)}</span></div>`;
  }

  // Overall run direction as one of the four cardinals (Northbound/Eastbound/…),
  // start → finish. Compares north/south vs east/west travel and picks the larger.
  function compassBound(wp) {
    if (!wp || wp.length < 2) return null;
    const a = wp[0], b = wp[wp.length - 1];
    const dNorthKm = (b[1] - a[1]) * 111;                                   // + = north
    const dEastKm = (b[2] - a[2]) * 111 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); // + = east
    if (Math.abs(dEastKm) > Math.abs(dNorthKm)) return dEastKm >= 0 ? "Eastbound" : "Westbound";
    return dNorthKm >= 0 ? "Northbound" : "Southbound";
  }

  // --- Render: Next run card + weather ----------------------------------
  function renderNext() {
    const el = document.getElementById("nextCard");
    if (!el || !nextRun) return;
    const c = nextRun.colour, tc = contrastText(c);
    const ph = runPhase(nextRun);
    const meet = runMeet(nextRun, ph);
    el.style.borderLeftColor = c;
    el.style.setProperty("--run-col", c);
    const md = nextRun.days && nextRun.days.length > 1 ? nextRun.days : null;
    const bound = nextRun.bound || compassBound(WAYPOINTS[nextRun.key]);
    const endDate = md ? new Date(nextRun.date.getTime() + (md.length - 1) * 86400000) : null;
    el.innerHTML = `
      <div class="date-badge">
        <div class="dow">${md ? DOW[nextRun.date.getDay()] + "–" + DOW[endDate.getDay()] : DOW[nextRun.date.getDay()]}</div>
        <div class="day">${md ? nextRun.date.getDate() + "–" + endDate.getDate() : nextRun.date.getDate()}</div>
        <div class="mon">${md && endDate.getMonth() !== nextRun.date.getMonth()
          ? (endDate.getFullYear() !== nextRun.date.getFullYear()
            ? `${MON[nextRun.date.getMonth()]} ${nextRun.date.getFullYear()}–${MON[endDate.getMonth()]} ${endDate.getFullYear()}`
            : `${MON[nextRun.date.getMonth()]}–${MON[endDate.getMonth()]} ${endDate.getFullYear()}`)
          : `${MON[nextRun.date.getMonth()]} ${nextRun.date.getFullYear()}`}</div>
        <div class="cd${ph.live ? " is-live" : ""}">${escapeHtml(ph.label)}</div>
      </div>
      <div class="next-body">
        <span class="line-tag" style="background:${c};color:${tc}">${escapeHtml(nextRun.badge)}</span>
        ${md ? `<span class="multiday-badge">${md.length}-day run</span>` : ""}
        ${nextRun.suggested ? `<span class="r-suggest" title="Tentative — the plan is only firmed up about a month ahead">Suggested</span>` : ""}
        ${bound ? `<span class="run-dir">🧭 ${bound}</span>` : ""}
        <h3>${escapeHtml(meet.leg)}</h3>
        <div class="next-meta">
          <div><strong>Meet</strong> ${escapeHtml(meet.clock)} · <a class="meet-link" href="${escapeAttr(meetMapUrl(nextRun, meet.place))}" target="_blank" rel="noopener">${escapeHtml(meet.place)} ↗</a></div>
          <div><strong>Distance</strong> ${escapeHtml(distText(nextRun.distance))}</div>
          ${nextRun.location !== "London" ? `<div><strong>Where</strong> ${escapeHtml(nextRun.location)}</div>` : ""}
        </div>
        ${md ? `<ol class="nd-days">${md.map((d) => `<li><strong>${escapeHtml(d.title)}</strong>${
          [d.start && "Start " + d.start, distText(d.distance), d.finish && "Finish " + d.finish].filter(Boolean).length
            ? `<span>${[d.start && "Start " + d.start, distText(d.distance), d.finish && "Finish " + d.finish].filter(Boolean).map(escapeHtml).join(" · ")}</span>` : ""
        }</li>`).join("")}</ol>` : ""}
        ${routeLinksHtml(nextRun)}
      </div>`;
  }

  // --- Render: Next-run card in the hero (compact, above the fold) -------
  // --- Live "Follow along" link ------------------------------------------
  // Editable at data/live.json (no code deploy needed — change it from the
  // GitHub app on run morning). Shape:
  //   { "date": "YYYY-MM-DD", "name": "Sam", "url": "https://livetrack.garmin.com/..." }
  // A "Follow <name> live" button then shows on that date, but only while the
  // group is actually out (until the estimated finish). Blank the fields to
  // remove it. LiveTrack links are per-activity and expire, hence the hand edit.
  let liveNow = null;
  async function loadLiveNow() {
    try {
      const res = await fetch("data/live.json?t=" + Math.floor(Date.now() / 60000));
      liveNow = res.ok ? await res.json() : null;
    } catch (_) { liveNow = null; }
    renderHeroCard();
  }
  function todayLondonISO() {
    const p = londonParts(Date.now());
    return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  function liveTrackBtn(run) {
    // runPhase().live now means "genuinely out on the road" (the run window ends
    // at the estimated finish), so it doubles as the button's underway gate.
    const lt = liveNow;
    if (!lt || !lt.url || lt.date !== todayLondonISO() || !runPhase(run).live) return "";
    const who = lt.name ? `${escapeHtml(lt.name)} live` : "live";
    return `<a class="live-follow" href="${escapeAttr(lt.url)}" target="_blank" rel="noopener">` +
      `<span class="live-follow-dot" aria-hidden="true"></span>Follow ${who} on Garmin ↗</a>`;
  }

  function renderHeroCard() {
    const el = document.getElementById("heroCard");
    if (!el || !nextRun) return;
    const c = nextRun.colour, tc = contrastText(c);
    const ph = runPhase(nextRun);
    const meet = runMeet(nextRun, ph);
    const md = nextRun.days && nextRun.days.length > 1 ? nextRun.days : null;
    const endDate = md ? new Date(nextRun.date.getTime() + (md.length - 1) * 86400000) : null;
    const when = md && endDate.getMonth() !== nextRun.date.getMonth()
      ? `${DOW[nextRun.date.getDay()]} ${nextRun.date.getDate()} ${MON[nextRun.date.getMonth()]} – ${DOW[endDate.getDay()]} ${endDate.getDate()} ${MON[endDate.getMonth()]}`
      : md
        ? `${DOW[nextRun.date.getDay()]} ${nextRun.date.getDate()}–${endDate.getDate()} ${MON[nextRun.date.getMonth()]}`
        : `${DOW[nextRun.date.getDay()]} ${nextRun.date.getDate()} ${MON[nextRun.date.getMonth()]}`;
    const bail = nextRun.type === "tube"
      ? "No-drop: regroup at every station — bail at any of them and take the train back."
      : nextRun.exits && nextRun.exits.length
        ? "Escape points along the way — join for as much as you like."
        : "All paces welcome — join for as much as you like.";
    el.style.setProperty("--run-col", c);
    el.innerHTML = `
      <div class="hc-top">
        <span class="line-tag" style="background:${c};color:${tc}">${escapeHtml(nextRun.badge)}</span>
        <span class="hc-cd${ph.live ? " is-live" : ""}">${escapeHtml(ph.short)}</span>
      </div>
      <div class="hc-when">${when} · meet ${escapeHtml(meet.clock)}</div>
      ${ph.label && ph.label !== ph.short ? `<div class="hc-status${ph.live ? " is-live" : ""}">${escapeHtml(ph.label)}</div>` : ""}
      <div class="hc-leg">${escapeHtml(meet.leg)}</div>
      ${liveTrackBtn(nextRun)}
      <div class="hc-meta">
        <span>📍 <a href="${escapeAttr(meetMapUrl(nextRun, meet.place))}" target="_blank" rel="noopener">${escapeHtml(meet.place)}</a></span>
        <span>📏 ${escapeHtml(distText(nextRun.distance))}</span>
      </div>
      <p class="hc-bail">${bail}</p>
      <a class="hc-more" href="#next">Full details &darr;</a>`;
    el.hidden = false;
  }

  // --- Render: Journey board (vertical National-Rail-style calling points) ---
  // Split the waypoints into per-day segments for a multi-day event, else one segment.
  function journeySegments(run, wp) {
    const last = wp.length - 1;
    const norm = (s) => (s || "").toLowerCase().replace(/underground station|station/g, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
    // Exact name match first; fall back to suffix/prefix so a title like
    // "Day 1 · Sat 4 July - Chesham" (no em-dash) still resolves its station.
    const findIdx = (name, tail) => {
      const n = norm(name);
      if (!n) return -1;
      let i = wp.findIndex((p) => norm(p[0]) === n);
      if (i < 0) {
        // Prefer the LONGEST partial match so "Northwood Hills" never binds to "Northwood".
        let bestLen = 0;
        wp.forEach((p, j) => {
          const w = norm(p[0]);
          if (w.length > bestLen && (tail ? n.endsWith(w) : n.startsWith(w))) { bestLen = w.length; i = j; }
        });
      }
      return i;
    };
    const days = run.days;
    if (Array.isArray(days) && days.length > 1) {
      const segs = [];
      for (const d of days) {
        const parts = (d.title || "").split("→");
        if (parts.length < 2) return null;
        const fromName = parts[0].split(/[—–]/).pop();
        const from = findIdx(fromName, true), to = findIdx(parts[1], false);
        if (from < 0 || to < 0 || to <= from) return null;
        segs.push({ label: (d.title || "").split(/[—–]/)[0].trim(), leg: `${wp[from][0]} → ${wp[to][0]}`, from, to, start: parseClock(d.start) });
      }
      return segs;
    }
    return [{ label: null, leg: run.leg, from: 0, to: last, start: MEET_TIME }];
  }

  function journeyBoardSection(run, wp, seg, c, paceKm, opts = {}) {
    const rows = [];
    for (let j = seg.from; j <= seg.to; j++) {
      const kmFromStart = legDistanceKm(wp, seg.from, j);
      const legKm = j === seg.from ? 0 : legDistanceKm(wp, j - 1, j);
      const mins = kmFromStart * paceKm;
      const isStart = j === seg.from, isEnd = j === seg.to, end = isStart || isEnd;
      const time = isStart ? `depart ${seg.start}` : (isEnd ? `arrive ~${arrivalWindow(mins, seg.start)}` : `~${arrivalWindow(mins, seg.start)}`);
      const now = opts.liveIdx === j;
      rows.push(`<li class="jb-stop${end ? " jb-end" : ""}${now ? " jb-now" : ""}" data-i="${j}">
        <span class="jb-dot" style="border-color:${c}${end ? `;background:${c}` : ""}"></span>
        <span class="jb-name">${escapeHtml(wp[j][0])}${interchangeTags(wp[j][0], run.key)}</span>
        <span class="jb-leg">${isStart ? "—" : "+" + fmtTime(legKm * paceKm)}</span>
        <span class="jb-elapsed">${isStart ? "start" : fmtTime(mins)}</span>
        <span class="jb-dist">${fmtKm(kmFromStart, 1)}</span>
        <span class="jb-time">${time}</span>
      </li>`);
    }
    const cols = `<div class="jb-cols" aria-hidden="true"><span></span><span>Station</span><span>Leg</span><span>Elapsed</span><span>From start</span><span>Group arrives</span></div>`;
    const list = `<ol class="jb-list${opts.current ? " jb-current" : ""}" style="--jb-col:${c};--jb-text:${lineTextColour(c)}">${rows.join("")}</ol>`;
    const sub = (t) => `<p class="jb-sub" style="color:${lineTextColour(c)}">${t}</p>`;
    if (opts.done) {
      // Finished day: collapse into an expandable summary; the stops stay one click away.
      return `<details class="jb-section jb-done">
        <summary class="jb-summary"><span class="jb-day">${escapeHtml(seg.label)}</span>${sub(escapeHtml(seg.leg))}<span class="jb-done-tag">done ✓</span></summary>
        ${cols}${list}</details>`;
    }
    const head = seg.label
      ? `<p class="jb-day">${escapeHtml(seg.label)}</p>${sub(escapeHtml(seg.leg))}`
      : sub(`${escapeHtml(run.badge)} · ${escapeHtml(seg.leg)}`);
    return `<div class="jb-section">${head}${cols}${list}</div>`;
  }

  // Where the group most likely is right now on the active day: the stop whose
  // expected arrival time is closest to now (London time). absIdx is null before
  // the day starts or once they've arrived. Drives the pulsing "you are here" dot.
  function journeyLivePos(run) {
    const wp = WAYPOINTS[run.key];
    if (!wp || wp.length < 2) return null;
    const segs = journeySegments(run, wp);
    if (!segs) return null;
    const tl = runTimeline(run);
    const di = Math.min(runPhase(run).day, segs.length - 1);
    const seg = segs[di];
    const startMs = tl[Math.min(di, tl.length - 1)].start;
    const elapsed = (Date.now() - startMs) / 60000;
    const paceKm = 6.5;
    const endMin = legDistanceKm(wp, seg.from, seg.to) * paceKm;
    if (elapsed < 0 || elapsed > endMin + 10) return { dayIdx: di, absIdx: null };
    let best = seg.from, bestD = Infinity;
    for (let j = seg.from; j <= seg.to; j++) {
      const d = Math.abs(legDistanceKm(wp, seg.from, j) * paceKm - elapsed);
      if (d < bestD) { bestD = d; best = j; }
    }
    return { dayIdx: di, absIdx: best };
  }

  let jbRenderedKey = null, jbRenderedDay = -1;
  function renderJourneyBoard() {
    const el = document.getElementById("journeyBoard");
    if (!el || !nextRun) return;
    const wp = WAYPOINTS[nextRun.key];
    if (!wp || wp.length < 2) { el.innerHTML = ""; jbRenderedKey = null; return; }
    const c = nextRun.colour, paceKm = 6.5;
    const segs = journeySegments(nextRun, wp) || [{ label: null, leg: nextRun.leg, from: 0, to: wp.length - 1, start: MEET_TIME }];
    const multi = segs.length > 1;
    const tl = runTimeline(nextRun);
    const now = Date.now();
    // A day collapses to "done" once its own window has ended; the current day is
    // the first not-yet-finished one (none once the whole run is over, so both days
    // collapse into their summaries).
    const curDay = tl.findIndex((w) => now < w.end);
    const live = journeyLivePos(nextRun);
    const sections = segs.map((s, di) => journeyBoardSection(nextRun, wp, s, c, paceKm, {
      done: multi && tl[di] && now >= tl[di].end,
      current: di === curDay,
      liveIdx: live && live.dayIdx === di ? live.absIdx : null,
    })).join("");
    el.innerHTML = `
      <h3 class="jb-title">Journey board ${gpxDownloadHtml(lineSlug(nextRun.key), nextRun.key, "jb-gpx")}</h3>
      ${sections}
      <p class="jb-foot">Expected arrival windows at a steady 6:30/km from each day's start — add time for regroups and photos.</p>`;
    jbRenderedKey = nextRun.key; jbRenderedDay = curDay;
  }

  // Move the live "group ~here now" dot each minute without re-rendering the whole
  // board (so an expanded finished day stays open). Full re-render only when the
  // run or the active day changes.
  function tickJourneyNow() {
    const el = document.getElementById("journeyBoard");
    if (!el || !nextRun || jbRenderedKey !== nextRun.key) return;
    const live = journeyLivePos(nextRun);
    if (live && live.dayIdx !== jbRenderedDay) { renderJourneyBoard(); return; }
    const prev = el.querySelector(".jb-stop.jb-now");
    const target = live && live.absIdx != null
      ? el.querySelector(`.jb-current .jb-stop[data-i="${live.absIdx}"]`) : null;
    if (prev && prev !== target) prev.classList.remove("jb-now");
    if (target) target.classList.add("jb-now");
  }

  // --- Render: Schedule --------------------------------------------------
  function hasDetails(r) { return r.days || r.exits || r.stay || r.notes || r.routeLink || WAYPOINTS[r.key]; }

  function detailsHtml(r) {
    const days = r.days ? `<div class="d-block"><h4>Itinerary</h4>${r.days.map((d) => `
      <div class="d-day">
        <strong>${escapeHtml(d.title)}</strong>
        <span>${[d.start && `Start: ${d.start}`, distText(d.distance), d.pitstops, d.finish && `Finish: ${d.finish}`]
          .filter(Boolean).map(escapeHtml).join(" · ")}</span>
      </div>`).join("")}</div>` : "";
    const exits = r.exits ? `<div class="d-block"><h4>Escape points</h4>
      <div class="d-tags">${r.exits.map((e) => `<span class="d-tag">${escapeHtml(e.name)} · ${distText(e.at)}</span>`).join("")}</div></div>` : "";
    const stay = r.stay ? `<div class="d-block"><h4>Where to stay</h4><ul class="d-list">${r.stay.map((s) =>
      `<li><a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.name)} ↗</a></li>`).join("")}</ul></div>` : "";
    const link = routeLinksHtml(r);
    const notes = r.notes ? `<p class="d-notes">${escapeHtml(r.notes)}</p>` : "";
    const stripLabel = r.type === "tube" ? `${r.key} line` : (r.badge || r.key);
    const strip = WAYPOINTS[r.key]
      ? `<div class="line-diagram strip run-strip" style="--line-col:${r.colour}">${stripMapHtml(r.key, r.colour, r.key, { bannerLabel: stripLabel })}</div>` : "";
    return `<div class="run-details">${notes}${strip}${days}${exits}${stay}${link}</div>`;
  }

  function renderList() {
    const el = document.getElementById("runList");
    if (!el) return;
    el.innerHTML = runs.map((r, i) => {
      const loc = r.location !== "London" ? `<span class="r-loc">${escapeHtml(r.location)}</span>` : "";
      const toggle = hasDetails(r) ? `<button class="r-toggle" data-i="${i}" aria-expanded="false">Details</button>` : "";
      return `
      <div class="run-row${r.suggested ? " is-suggested" : ""}">
        <div class="r-date">${r.date.getDate()} ${MON[r.date.getMonth()]}
          <small>${DOW[r.date.getDay()]} · ${r.date.getFullYear()}</small>
        </div>
        <div class="r-swatch" style="background:${r.colour}"></div>
        <div class="r-title">${escapeHtml(r.badge)} ${loc}${r.suggested ? ` <span class="r-suggest" title="Tentative — the plan is only firmed up about a month ahead">Suggested</span>` : ""}
          <small>${escapeHtml(r.leg)}</small>
        </div>
        <div class="r-dist">${escapeHtml(distText(r.distance))}${toggle}</div>
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
  // `let`, not `const`: the live clock repoints it when the run rolls over.
  let pts = WAYPOINTS[nextRun ? nextRun.key : ""];
  const fromSel = document.getElementById("fromStn");
  const toSel = document.getElementById("toStn");
  const paceSel = document.getElementById("pace");
  const startSel = document.getElementById("startTime");
  const MI_PER_KM = 0.621371;
  // Site-wide distance unit, driven by the header km/mi toggle.
  let distUnit = (() => { try { return localStorage.getItem("tuberun_units") === "mi" ? "mi" : "km"; } catch (_) { return "km"; } })();
  function fmtKm(km, dp) {
    const v = distUnit === "mi" ? km * MI_PER_KM : km;
    return `${v.toFixed(dp !== undefined ? dp : (v >= 20 ? 0 : 1))} ${distUnit}`;
  }
  // Convert distance mentions inside free text (e.g. "9.3 mi (15 km)", "~13 km",
  // "46 miles") to a single value in the active unit. Pace strings ("6:00/km")
  // don't match — the digits must be separated from the unit by whitespace only.
  function distText(s) {
    if (!s) return s;
    s = String(s)
      .replace(/([\d.]+)\s*mi(?:les)?\s*\(\s*[\d.]+\s*km\s*\)/gi, (_, mi) => fmtKm(mi * 1.609344))
      .replace(/([\d.]+)\s*km\s*\(\s*[\d.]+\s*mi(?:les)?\s*\)/gi, (_, km) => fmtKm(+km));
    return s.replace(/([\d.]+)\s*(km|miles|mi)\b/gi, (_, n, u) => fmtKm(/km/i.test(u) ? +n : n * 1.609344));
  }
  let firstPick = true;

  // Interchange data for the carriage-style strip map: which tube lines meet at each stop.
  let interchangeMap = null; // norm(station name) -> [{name, colour}]
  function buildInterchangeMap(net) {
    const m = {};
    for (const id in net) {
      const ln = net[id];
      for (const sid in ln.stations) {
        const k = norm(ln.stations[sid].n);
        if (!m[k]) m[k] = [];
        if (!m[k].some((x) => x.name === ln.name)) m[k].push({ name: ln.name, colour: ln.colour });
      }
    }
    return m;
  }
  // Non-tube interchanges (Elizabeth line / Overground / DLR / National Rail), from the
  // TfL hub data — the tube dataset only knows the 11 Underground lines. [bg, text] per brand.
  const NON_TUBE_COLOURS = {
    "Elizabeth line": ["#6950A1", "#fff"],
    "Overground": ["#EE7C0E", "#10131c"],
    "DLR": ["#00A4A7", "#fff"],
    "National Rail": ["#C00000", "#fff"],
    "Tram": ["#5FA524", "#10131c"],
  };
  const NON_TUBE_INTERCHANGES = {
    "Amersham": ["National Rail"],
    "Bank": ["DLR"],
    "Blackhorse Road": ["Overground"],
    "Bond Street": ["Elizabeth line"],
    "Brixton": ["National Rail"],
    "Chalfont & Latimer": ["National Rail"],
    "Chorleywood": ["National Rail"],
    "Ealing Broadway": ["Elizabeth line", "National Rail"],
    "Euston": ["Overground", "National Rail"],
    "Farringdon": ["Elizabeth line", "National Rail"],
    "Finsbury Park": ["National Rail"],
    "Greenford": ["National Rail"],
    "Harrow-on-the-Hill": ["National Rail"],
    "Highbury & Islington": ["Overground", "National Rail"],
    "King's Cross St. Pancras": ["National Rail"],
    "Liverpool Street": ["Elizabeth line", "Overground", "National Rail"],
    "Moorgate": ["National Rail"],
    "Rickmansworth": ["National Rail"],
    "Seven Sisters": ["Overground", "National Rail"],
    "Shepherd's Bush": ["Overground", "National Rail"],
    "South Ruislip": ["National Rail"],
    "Stratford": ["Elizabeth line", "Overground", "DLR", "National Rail"],
    "Tottenham Court Road": ["Elizabeth line"],
    "Tottenham Hale": ["National Rail"],
    "Vauxhall": ["National Rail"],
    "Victoria": ["National Rail"],
    "Walthamstow Central": ["Overground"],
    "West Ruislip": ["National Rail"],
  };
  let nonTubeByNorm = null;
  function interchangeTags(name, lineName) {
    const line = lineName || (nextRun && nextRun.key);
    if (!line) return "";
    if (!nonTubeByNorm) {
      nonTubeByNorm = {};
      for (const k in NON_TUBE_INTERCHANGES) nonTubeByNorm[norm(k)] = NON_TUBE_INTERCHANGES[k];
    }
    const key = norm(name);
    const tube = interchangeMap ? (interchangeMap[key] || []).filter((x) => norm(x.name) !== norm(line)) : [];
    const other = nonTubeByNorm[key] || [];
    if (!tube.length && !other.length) return "";
    const pills = tube.map((x) => `<span class="stn-tag" style="background:${x.colour};color:${contrastText(x.colour)}">${escapeHtml(x.name)}</span>`)
      .concat(other.map((n) => {
        const c = NON_TUBE_COLOURS[n] || ["#555", "#fff"];
        return `<span class="stn-tag" style="background:${c[0]};color:${c[1]}">${escapeHtml(n)}</span>`;
      }));
    return `<span class="stn-tags">${pills.join("")}</span>`;
  }

  function fmtPace(minPerUnit) {
    const totalSec = Math.round(minPerUnit * 60);
    return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
  }

  // Escape points + route links for an adventure/non-tube run. Distances run
  // through distText() so they honour the km/mi toggle like everywhere else.
  function adventurePlanHtml(run) {
    const exits = run.exits ? `<div class="d-block"><h4>Escape points to bail early</h4>
      <div class="d-tags">${run.exits.map((e) => `<span class="d-tag">${escapeHtml(e.name)} · ${distText(e.at)}</span>`).join("")}</div></div>` : "";
    return `<div class="adventure-plan">${exits}${routeLinksHtml(run)}</div>`;
  }
  // Re-render just the planner's distance-bearing output at the current unit
  // (called by the km/mi toggle). update() covers tube runs; the adventure block
  // covers the rest. Both no-op when they don't apply.
  function refreshPlanner() {
    if (!nextRun) return;
    if (pts) { update(); return; }
    const diagram = document.getElementById("lineDiagram");
    if (diagram && (nextRun.exits || nextRun.routeLink)) diagram.innerHTML = adventurePlanHtml(nextRun);
  }

  function setupPlanner() {
    const diagram = document.getElementById("lineDiagram");
    const result = document.getElementById("calcResult");
    const calc = document.getElementById("calc");
    if (!nextRun) {
      // Empty RUN_PLAN — hide the planner instead of aborting the whole init chain.
      if (calc) calc.style.display = "none";
      if (diagram) diagram.innerHTML = "";
      if (result) result.innerHTML = "";
      return;
    }
    if (!pts) {
      // No station-by-station data (e.g. an adventure or a route not yet mapped).
      if (calc) calc.style.display = "none";
      if (nextRun.exits || nextRun.routeLink) {
        // Show escape points + route link instead of the tube-style planner.
        if (diagram) diagram.innerHTML = adventurePlanHtml(nextRun);
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
    if (startSel && !startSel.value) startSel.value = MEET_TIME;
    [fromSel, toSel, paceSel, startSel].filter(Boolean).forEach((s) => s.addEventListener("input", update));
    renderDiagram();
    update();
    // Full-line pavement GPX for this month's line — a sibling of the diagram, so
    // it survives the diagram's re-renders. setupPlanner runs once, so no dupes.
    const planGpx = gpxDownloadHtml(lineSlug(nextRun.key), nextRun.key, "plan-gpx");
    if (diagram && planGpx) diagram.insertAdjacentHTML("afterend", `<p class="plan-gpx-row">Take it with you: ${planGpx}</p>`);
    // Enrich the strip with interchange tags once the network data loads.
    // Only the fetch failure is swallowed — errors in the render work below must surface.
    loadNetwork().catch(() => null).then((net) => {
      if (!net) return;
      interchangeMap = buildInterchangeMap(net);
      renderDiagram();
      renderJourneyBoard();
      // Re-render the schedule for interchange tags, restoring any details
      // panel the user already opened (the rebuild recreates them hidden).
      const open = [...document.querySelectorAll(".run-details-wrap:not([hidden])")].map((d) => d.id);
      renderList();
      open.forEach((id) => {
        const d = document.getElementById(id);
        if (!d) return;
        d.hidden = false;
        const btn = document.querySelector(`.r-toggle[data-i="${id.replace("det-", "")}"]`);
        if (btn) { btn.setAttribute("aria-expanded", "true"); btn.textContent = "Hide"; }
      });
    });
  }

  // Carriage-style strip map for a WAYPOINTS line. Interactive (planner) or read-only (schedule).
  function stripMapHtml(key, colour, lineName, opts = {}) {
    const wp = opts.wp || WAYPOINTS[key];
    if (!wp || !wp.length) return "";
    const iact = !!opts.interactive;
    const tappable = iact || !!opts.tap; // opts.tap: clickable stops without the two-point planner logic
    const a = iact ? opts.a : 0, b = iact ? opts.b : wp.length - 1;
    const from = iact ? opts.from : 0, to = iact ? opts.to : wp.length - 1;
    const tag = tappable ? "button" : "span";
    const label = escapeHtml(opts.bannerLabel || `${lineName} line`);
    const banner = `<div class="strip-line" style="background:${colour};color:${contrastText(colour)}">${label}</div>`;
    const track = wp.map((p, i) => {
      const active = i >= a && i <= b;
      const endpoint = i === from || i === to;
      return `<${tag} class="stn${active ? " active" : ""}${endpoint ? " endpoint" : ""}"${tappable ? ` data-i="${i}"` : ""} title="${escapeHtml(p[0])}" aria-label="${escapeHtml(p[0])}">
                <span class="stn-name">${escapeHtml(p[0])}</span>
                <span class="rail"><span class="dot"></span></span>
                ${interchangeTags(p[0], lineName)}
              </${tag}>`;
    }).join("");
    return banner + `<div class="line-track">${track}</div>`;
  }

  function renderDiagram() {
    const diagram = document.getElementById("lineDiagram");
    if (!diagram || !pts) return;
    let a = +fromSel.value, b = +toSel.value;
    if (a > b) [a, b] = [b, a];
    diagram.style.setProperty("--line-col", nextRun.colour);
    diagram.classList.add("strip");
    diagram.innerHTML = stripMapHtml(nextRun.key, nextRun.colour, nextRun.key,
      { interactive: true, a, b, from: +fromSel.value, to: +toSel.value });
    diagram.querySelectorAll(".stn").forEach((btn) => {
      btn.addEventListener("click", () => onStationClick(+btn.dataset.i));
    });
    updatePlanPrompt();
  }

  // Make it obvious whether the next tap sets the Start or the Finish point.
  function updatePlanPrompt() {
    const el = document.getElementById("planPrompt");
    const startField = document.getElementById("fieldStart");
    const finishField = document.getElementById("fieldFinish");
    if (startField) startField.classList.toggle("next-pick", firstPick);
    if (finishField) finishField.classList.toggle("next-pick", !firstPick);
    if (!el) return;
    el.classList.toggle("is-finish", !firstPick);
    el.innerHTML = firstPick
      ? `<span class="pp-badge pp-start">1 · Start</span> Tap a station below (or the map) to set where you <strong>join</strong> the run.`
      : `<span class="pp-badge pp-finish">2 · Finish</span> Now tap where you'll <strong>leave</strong> — that sets your finish. Tap Start again to redo.`;
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
    if (a === b) { if (b < pts.length - 1) b += 1; else a -= 1; } // force a real one-leg selection even at the last stop
    if (a > b) [a, b] = [b, a];
    const km = legDistanceKm(pts, a, b);
    const paceKm = rtPace;
    const stops = Math.max(0, b - a - 1);

    // Expected arrival clock time: running time from the route's actual start
    // (index 0) to each picked station, added to the run's start time.
    const startClock = (startSel && startSel.value) || MEET_TIME;
    const etaFrom = clockAdd(startClock, legDistanceKm(pts, 0, a) * paceKm);
    const etaTo = clockAdd(startClock, legDistanceKm(pts, 0, b) * paceKm);

    const dist = fmtKm(km, 1);
    const paceStr = distUnit === "mi"
      ? `${fmtPace(paceKm / MI_PER_KM)} /mi`
      : `${fmtPace(paceKm)} /km`;

    const result = document.getElementById("calcResult");
    result.innerHTML = `
      <div class="cr-main"><span class="cr-km">${dist}</span></div>
      ${timesRowHtml(km, paceKm)}
      <div class="cr-detail">
        ${escapeHtml(pts[a][0])} → ${escapeHtml(pts[b][0])}
        · ${b - a} leg${b - a > 1 ? "s" : ""}${stops ? ` · passes ${stops} stop${stops > 1 ? "s" : ""}` : ""}
        · at ${paceStr}
      </div>
      <div class="cr-eta">🕒 Starting ${startClock}, the group reaches <strong>${escapeHtml(pts[a][0])}</strong> at <strong>~${etaFrom}</strong>${b > a ? ` and <strong>${escapeHtml(pts[b][0])}</strong> at <strong>~${etaTo}</strong>` : ""}</div>
      <div class="cr-note">Estimate: crow-flies distance × ${ROAD_FACTOR} for streets, running only — add time for regroups, photos and coffee, so arrive a little early.</div>`;
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

  // One forecast target per run day (multi-day events get a chip each).
  function weatherDays() {
    if (Array.isArray(nextRun.days) && nextRun.days.length > 1) {
      return nextRun.days.map((d, i) => {
        const date = new Date(nextRun.date.getTime() + i * 86400000);
        const clock = parseClock(d.start).slice(0, 3) + "00"; // hourly buckets sit on the hour
        return { date, clock, label: `${DOW[date.getDay()]} ${date.getDate()} ${MON[date.getMonth()].slice(0, 3)}` };
      });
    }
    return [{ date: nextRun.date, clock: MEET_TIME, label: `${DOW[nextRun.date.getDay()]} ${MEET_TIME}` }];
  }

  function weatherChip(data, d) {
    const dateStr = isoDate(d.date);
    const hIdx = data.hourly.time.indexOf(`${dateStr}T${d.clock}`);
    let code, temp, feels, pop, wind;
    if (hIdx !== -1) {
      code = data.hourly.weather_code[hIdx];
      temp = data.hourly.temperature_2m[hIdx];
      feels = data.hourly.apparent_temperature[hIdx];
      pop = data.hourly.precipitation_probability[hIdx];
      wind = data.hourly.wind_speed_10m[hIdx];
    } else {
      const dIdx = data.daily.time.indexOf(dateStr);
      if (dIdx === -1) return "";
      code = data.daily.weather_code[dIdx];
      temp = data.daily.temperature_2m_max[dIdx];
      pop = data.daily.precipitation_probability_max[dIdx];
    }
    const [desc, icon] = describe(code);
    return `<div class="wx-row">
      <span class="wx-icon">${icon}</span>
      <span class="wx-main">${Math.round(temp)}°C · ${desc}</span>
      <span class="wx-sub">${feels != null ? `feels ${Math.round(feels)}° · ` : ""}${pop != null ? `${Math.round(pop)}% rain` : ""}${wind != null ? ` · ${Math.round(wind)} km/h wind` : ""}</span>
      <span class="wx-tag">${escapeHtml(d.label)}</span>
    </div>`;
  }

  async function loadWeather() {
    const el = document.getElementById("weather");
    if (!el || !nextRun) return;
    const days = weatherDays();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LONDON.lat}&longitude=${LONDON.lon}` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=Europe%2FLondon&forecast_days=16`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("weather fetch failed");
      const data = await res.json();
      const chips = days.map((d) => weatherChip(data, d)).filter(Boolean);
      if (!chips.length) {
        el.classList.remove("weather-multi");
        el.innerHTML = `<span class="wx-soft">Weather forecast will appear closer to the day.</span>`;
        return;
      }
      el.classList.toggle("weather-multi", chips.length > 1);
      el.innerHTML = chips.join("");
    } catch (_) {
      el.classList.remove("weather-multi");
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
  // Label a link by what it actually opens — a group event page isn't a route map.
  function routeLinkLabel(u) {
    const who = providerOf(u);
    if (/group_events|\/events?\//i.test(u)) return "See the event on " + who;
    if (/\/activities?\//i.test(u)) return "View activity on " + who;
    return "View route on " + who;
  }
  function routeLinksHtml(r, extraClass) {
    if (!r.routeLink) return "";
    const urls = Array.isArray(r.routeLink) ? r.routeLink : [r.routeLink];
    return urls.map((u) =>
      `<a class="route-link${extraClass ? " " + extraClass : ""}" href="${escapeAttr(u)}" target="_blank" rel="noopener">${escapeHtml(routeLinkLabel(u))} ↗</a>`
    ).join("");
  }

  // Downloadable pavement GPX per Tube line (generated into routes/<slug>.gpx and
  // also used to draw the maps). Accepts a line slug (network id) or a line name.
  const GPX_LINES = new Set(["bakerloo", "central", "circle", "district", "hammersmith-city", "jubilee", "metropolitan", "northern", "piccadilly", "victoria", "waterloo-city",
    "lioness", "mildmay", "windrush", "weaver", "suffragette", "liberty", "elizabeth"]);
  function lineSlug(name) { return String(name || "").toLowerCase().replace(/\s*&\s*/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function gpxDownloadHtml(slugOrName, lineName, extraClass) {
    const slug = GPX_LINES.has(slugOrName) ? slugOrName : lineSlug(slugOrName);
    if (!GPX_LINES.has(slug)) return "";
    const label = lineName || slug;
    return `<a class="gpx-dl${extraClass ? " " + extraClass : ""}" href="routes/${slug}.gpx" download="TubeRun-${slug}.gpx" title="Download the ${escapeHtml(label)} line's pavement route as a GPX file for your watch">↓ GPX</a>`;
  }
  // Flip a GPX file's direction: reverse each track segment's trackpoint order
  // (so a watch follows it the other way). Waypoint POIs are order-independent,
  // so they're left as-is; every trkpt attribute (incl. elevation) is preserved.
  function reverseGpxText(text) {
    return text.replace(/<trkseg>[\s\S]*?<\/trkseg>/g, (seg) => {
      const pts = seg.match(/<trkpt\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/trkpt>)/g) || [];
      return "<trkseg>\n" + pts.reverse().map((p) => "      " + p).join("\n") + "\n    </trkseg>";
    });
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
  const ROUTE_COLOURS = { river: "#0E7C90", canal: "#237A49", park: "#2C7D45", landmark: "#9B0056", trail: "#4E6E22" };
  // Each route carries an indicative `path` of [lat,lon] waypoints tracing the described
  // course (an overview line, not a turn-by-turn GPX); `loop` closes the trace visually.
  const ROUTES = [
    { id: "regents-canal", name: "Regent's Canal Towpath", type: "canal", leg: "Limehouse Basin → Little Venice", start: "Limehouse (DLR/c2c)", distance: "9.3 mi (15 km)", highlights: "Largely traffic-free towpath past Mile End Park, Victoria Park, Camden Lock and the narrowboats of Little Venice; flat.", suitability: "Ideal sociable long run — flat, easy to follow, splittable into shorter chunks.", loop: false, path: [[51.5122, -0.0395], [51.5170, -0.0367], [51.5230, -0.0345], [51.5305, -0.0408], [51.5360, -0.0430], [51.5378, -0.0640], [51.5352, -0.0900], [51.5335, -0.1088], [51.5362, -0.1290], [51.5415, -0.1465], [51.5348, -0.1610], [51.5245, -0.1795], [51.5220, -0.1830]] },
    { id: "hyde-kensington", name: "Hyde Park & Kensington Gardens Loop", type: "park", leg: "Perimeter of both royal parks", start: "Hyde Park Corner / Lancaster Gate", distance: "4.3 mi (7 km)", highlights: "Sealed paths around the Serpentine, Italian Gardens and Diana Memorial; mild undulations.", suitability: "Very group-friendly — flat loop with 1mi/2mi markers built in for mixed paces.", loop: true, path: [[51.5028, -0.1527], [51.5090, -0.1560], [51.5131, -0.1589], [51.5118, -0.1700], [51.5079, -0.1812], [51.5030, -0.1858], [51.5008, -0.1770], [51.5020, -0.1660], [51.5033, -0.1600], [51.5028, -0.1527]] },
    { id: "grand-tour", name: "The Grand Tour (Thames Landmarks)", type: "landmark", leg: "Trafalgar Sq → Tower Bridge & back, both banks", start: "Charing Cross", distance: "7.0 mi (11.25 km)", highlights: "Westminster, the London Eye, Tate Modern, the Globe, St Paul's, the Tower — the Thames Path both banks.", suitability: "Perfect landmark tour — allow 2–3× time for photos; can be congested.", loop: true, path: [[51.5074, -0.1278], [51.5044, -0.1240], [51.5010, -0.1215], [51.5030, -0.1170], [51.5055, -0.1050], [51.5076, -0.0994], [51.5079, -0.0900], [51.5052, -0.0790], [51.5045, -0.0754], [51.5055, -0.0754], [51.5081, -0.0759], [51.5104, -0.0870], [51.5138, -0.0984], [51.5110, -0.1090], [51.5074, -0.1210], [51.5074, -0.1278]] },
    { id: "regents-park", name: "Regent's Park & Primrose Hill", type: "park", leg: "Outer Circle loop + Primrose Hill", start: "Baker Street / Great Portland Street", distance: "4.0 mi (6.5 km)", highlights: "Gardens, boating lake, an old cinder track and the famous city view from Primrose Hill.", suitability: "Something for everyone — flat 2.7mi loop with an optional hill for keen legs.", loop: true, path: [[51.5226, -0.1571], [51.5255, -0.1605], [51.5295, -0.1615], [51.5322, -0.1555], [51.5330, -0.1475], [51.5305, -0.1445], [51.5350, -0.1505], [51.5388, -0.1582], [51.5350, -0.1505], [51.5300, -0.1445], [51.5262, -0.1500], [51.5226, -0.1571]] },
    { id: "diana-memorial", name: "Diana Memorial Run", type: "landmark", leg: "Figure-of-eight through four royal parks", start: "Hyde Park Corner", distance: "7.2 mi (11.6 km)", highlights: "Way-marked with 90 brass plates past Buckingham Palace, St James's, Green & Hyde Parks.", suitability: "Easy navigation, splittable into two loops; some road crossings by the Palace.", loop: true, path: [[51.5028, -0.1527], [51.5015, -0.1445], [51.5014, -0.1419], [51.5024, -0.1360], [51.5030, -0.1310], [51.5045, -0.1360], [51.5050, -0.1428], [51.5040, -0.1500], [51.5028, -0.1527]] },
    { id: "victoria-park", name: "Victoria Park Loop", type: "park", leg: "Perimeter of the 'People's Park'", start: "Hackney Wick / Cambridge Heath", distance: "2.7 mi (4.4 km)", highlights: "Tree-lined avenues with parallel dirt bridle paths, ponds and gardens; flanked by two canals.", suitability: "Sociable and popular — flat, wide paths, lots of runners for company.", loop: true, path: [[51.5358, -0.0450], [51.5360, -0.0360], [51.5385, -0.0320], [51.5415, -0.0350], [51.5420, -0.0410], [51.5405, -0.0470], [51.5378, -0.0500], [51.5358, -0.0450]] },
    { id: "battersea-park", name: "Battersea Park Circuit", type: "park", leg: "Loop via Carriage Drive", start: "Battersea Park Rail / Queenstown Road", distance: "2.2 mi (3.5 km)", highlights: "Riverside park from Albert to Chelsea Bridge with crushed-limestone paths and a track; flat.", suitability: "Great all-paces park — flat, no traffic (track only before 8am).", loop: true, path: [[51.4800, -0.1560], [51.4820, -0.1555], [51.4832, -0.1500], [51.4820, -0.1460], [51.4798, -0.1475], [51.4788, -0.1520], [51.4800, -0.1560]] },
    { id: "greenwich-park", name: "Greenwich Park & Blackheath", type: "park", leg: "Park circuit onto Blackheath", start: "Cutty Sark DLR / Greenwich Rail", distance: "2 mi (3.2 km) + Blackheath", highlights: "Royal Observatory, the Meridian, sweeping city views, then the open expanse of Blackheath.", suitability: "Scenery plus a hill challenge — flat north, then three climbs.", loop: false, path: [[51.4827, -0.0096], [51.4805, -0.0057], [51.4785, -0.0020], [51.4769, -0.0005], [51.4730, 0.0000], [51.4690, 0.0060], [51.4670, 0.0090]] },
    { id: "hampstead-heath", name: "Hampstead Heath", type: "trail", leg: "Loop over Parliament Hill & the ponds", start: "Hampstead / Gospel Oak (Overground)", distance: "8.0 mi (13 km)", highlights: "320 hectares of woodland, heath and ponds crowned by the Parliament Hill view.", suitability: "For a confident group — hilly, easy to get lost, keep together; muddy when wet.", loop: true, path: [[51.5555, -0.1530], [51.5580, -0.1550], [51.5600, -0.1580], [51.5640, -0.1610], [51.5690, -0.1625], [51.5710, -0.1670], [51.5670, -0.1740], [51.5610, -0.1770], [51.5570, -0.1760], [51.5555, -0.1530]] },
    { id: "stjames-green", name: "St James's & Green Park", type: "park", leg: "Loop around both parks and the lake", start: "Green Park / St James's Park", distance: "2.4 mi (3.9 km)", highlights: "Green oasis on Buckingham Palace's doorstep with a photo-ready lake and The Mall.", suitability: "Easy short social loop, very photogenic; heavy foot traffic.", loop: true, path: [[51.5067, -0.1428], [51.5058, -0.1360], [51.5045, -0.1320], [51.5024, -0.1340], [51.5014, -0.1419], [51.5035, -0.1442], [51.5050, -0.1440], [51.5067, -0.1428]] },
    { id: "southwark-docks", name: "Southwark Park & the Docks", type: "river", leg: "Park out to Greenland Dock & Thames Path", start: "Surrey Quays / Canada Water", distance: "1.4 mi (2.25 km), extendable", highlights: "Victorian park linking to Greenland Dock, Russia Dock Woodland and a rare south-bank river corridor.", suitability: "Flexible — flat, quiet, easily lengthened along the docks and river.", loop: false, path: [[51.4980, -0.0498], [51.4958, -0.0520], [51.4945, -0.0480], [51.4915, -0.0450], [51.4950, -0.0430], [51.5000, -0.0470]] },
    { id: "wormwood-scrubs", name: "Wormwood Scrubs", type: "park", leg: "Perimeter loop of 'The Scrubs'", start: "East Acton (Central)", distance: "2.4 mi (3.85 km)", highlights: "Vast open grass with a 960m sealed loop and Grand Union Canal access next door; flat.", suitability: "Roomy and flat for all paces, with the canal as an add-on.", loop: true, path: [[51.5165, -0.2480], [51.5195, -0.2430], [51.5225, -0.2380], [51.5228, -0.2300], [51.5200, -0.2280], [51.5175, -0.2330], [51.5170, -0.2430], [51.5165, -0.2480]] },
    { id: "richmond-park", name: "Richmond Park (Tamsin Trail)", type: "trail", leg: "Perimeter shared-use loop", start: "Richmond (District/Overground)", distance: "7.2 mi (11.7 km)", highlights: "London's largest royal park — wild deer, ancient oaks, Isabella Plantation and big skies on a way-marked gravel loop.", suitability: "A proper long run for a confident group — gently hilly, traffic-free, easy to follow.", loop: true, path: [[51.4530, -0.2880], [51.4560, -0.2560], [51.4380, -0.2400], [51.4270, -0.2680], [51.4380, -0.2950], [51.4530, -0.2880]] },
    { id: "bushy-park", name: "Bushy Park", type: "park", leg: "Chestnut Avenue & Diana Fountain loop", start: "Teddington / Hampton Wick (rail)", distance: "4.0 mi (6.5 km)", highlights: "Deer, the mile-long Chestnut Avenue, the Diana Fountain and the Water Gardens, next to Hampton Court.", suitability: "Flat, open and roomy — great all-paces park with plenty of space.", loop: true, path: [[51.4180, -0.3450], [51.4180, -0.3300], [51.4080, -0.3300], [51.4080, -0.3450], [51.4180, -0.3450]] },
    { id: "wimbledon-common", name: "Wimbledon Common & Putney Heath", type: "trail", leg: "Windmill & woodland loop", start: "Putney / Wimbledon (rail)", distance: "5.0 mi (8 km)", highlights: "Heath, woods and horse rides around the windmill; a mix of gravel tracks and trails.", suitability: "Undulating and easy to get lost — keep the group together; muddy after rain.", loop: true, path: [[51.4400, -0.2400], [51.4400, -0.2200], [51.4270, -0.2200], [51.4270, -0.2400], [51.4400, -0.2400]] },
    { id: "clapham-common", name: "Clapham Common", type: "park", leg: "Triangle loop past the bandstand", start: "Clapham Common (Northern)", distance: "2.4 mi (3.9 km)", highlights: "Flat open triangle with wide paths, the bandstand and three ponds; a south London running staple.", suitability: "Flat and central — perfect easy social loop for all paces.", loop: true, path: [[51.4640, -0.1520], [51.4640, -0.1420], [51.4580, -0.1420], [51.4580, -0.1520], [51.4640, -0.1520]] },
    { id: "wandsworth-common", name: "Wandsworth Common", type: "park", leg: "Perimeter loop", start: "Wandsworth Common (rail)", distance: "2.5 mi (4 km)", highlights: "Leafy common with a lake, the Scope and quiet paths away from the traffic.", suitability: "Flat, relaxed and rarely crowded — a friendly all-paces loop.", loop: true, path: [[51.4490, -0.1700], [51.4490, -0.1620], [51.4410, -0.1620], [51.4410, -0.1700], [51.4490, -0.1700]] },
    { id: "brockwell-park", name: "Brockwell Park", type: "park", leg: "Hilltop loop above Herne Hill", start: "Herne Hill (rail)", distance: "2.2 mi (3.5 km)", highlights: "A short climb to a walled garden and one of the best skyline views in south London, plus the lido.", suitability: "Small but punchy — one hill, big reward; loops nicely for mixed paces.", loop: true, path: [[51.4560, -0.1090], [51.4560, -0.1020], [51.4500, -0.1020], [51.4500, -0.1090], [51.4560, -0.1090]] },
    { id: "dulwich-park", name: "Dulwich Park", type: "park", leg: "Flat carriage-drive loop", start: "North Dulwich (rail)", distance: "1.6 mi (2.6 km)", highlights: "A smooth ex-carriage-drive loop round lawns, a boating lake and rhododendrons.", suitability: "Flat, sealed and easy — ideal for beginners and recovery runs.", loop: true, path: [[51.4440, -0.0880], [51.4440, -0.0800], [51.4400, -0.0800], [51.4400, -0.0880], [51.4440, -0.0880]] },
    { id: "crystal-palace-park", name: "Crystal Palace Park", type: "park", leg: "Dinosaurs & terraces loop", start: "Crystal Palace (rail)", distance: "1.6 mi (2.6 km)", highlights: "Victorian dinosaurs, the old palace terraces, a maze and the National Sports Centre.", suitability: "Quirky and fun — gentle undulations, lots to look at.", loop: true, path: [[51.4240, -0.0730], [51.4240, -0.0670], [51.4180, -0.0670], [51.4180, -0.0730], [51.4240, -0.0730]] },
    { id: "alexandra-park", name: "Alexandra Park", type: "landmark", leg: "Ally Pally panorama loop", start: "Alexandra Palace (rail)", distance: "2.5 mi (4 km)", highlights: "'The People's Palace' with a sweeping panorama across the whole city; a proper hill up to the terrace.", suitability: "One big climb, then a view to earn it — a spirited group loop.", loop: true, path: [[51.5960, -0.1350], [51.5960, -0.1230], [51.5910, -0.1230], [51.5910, -0.1350], [51.5960, -0.1350]] },
    { id: "finsbury-park", name: "Finsbury Park", type: "park", leg: "Perimeter loop", start: "Finsbury Park (Victoria/Piccadilly)", distance: "1.6 mi (2.6 km)", highlights: "Busy north London park with a boating lake, an athletics track and the New River on its edge.", suitability: "Flat, central and sociable — links straight onto the Parkland Walk.", loop: true, path: [[51.5740, -0.1020], [51.5740, -0.0940], [51.5690, -0.0940], [51.5690, -0.1020], [51.5740, -0.1020]] },
    { id: "parkland-walk", name: "Parkland Walk", type: "trail", leg: "Finsbury Park → Highgate (disused railway)", start: "Finsbury Park (Victoria/Piccadilly)", distance: "3.0 mi (5 km)", highlights: "London's longest nature reserve along an old railway line — leafy, car-free and gently graded.", suitability: "Traffic-free and easy to follow — a lovely point-to-point; return for double.", loop: false, path: [[51.5710, -0.0980], [51.5730, -0.1150], [51.5760, -0.1300], [51.5780, -0.1430]] },
    { id: "grand-union-paddington", name: "Grand Union Canal (Paddington Arm)", type: "canal", leg: "Little Venice → Alperton", start: "Warwick Avenue (Bakerloo)", distance: "5.0 mi (8 km)", highlights: "Flat, quiet towpath out of Little Venice past Kensal Green and Wembley's edge — narrowboats all the way.", suitability: "Flat and easy underfoot — a calm long run away from the traffic.", loop: false, path: [[51.5225, -0.1830], [51.5270, -0.2200], [51.5330, -0.2550], [51.5400, -0.2990]] },
    { id: "lea-navigation", name: "Lea Navigation", type: "canal", leg: "Limehouse → Hackney Marshes", start: "Limehouse (DLR)", distance: "5.0 mi (8 km)", highlights: "Towpath from the Thames up past the Olympic Park and out to the wide-open Hackney Marshes.", suitability: "Flat, traffic-free and splittable — a favourite east London long run.", loop: false, path: [[51.5122, -0.0395], [51.5250, -0.0380], [51.5400, -0.0360], [51.5560, -0.0300]] },
    { id: "olympic-park", name: "Queen Elizabeth Olympic Park", type: "landmark", leg: "Stadium, Orbit & waterways loop", start: "Stratford / Hackney Wick", distance: "3.0 mi (5 km)", highlights: "The 2012 Stadium, the ArcelorMittal Orbit, the Aquatics Centre and waterside paths through the park.", suitability: "Wide, flat, way-marked paths — modern and sociable for all paces.", loop: true, path: [[51.5480, -0.0200], [51.5480, -0.0110], [51.5380, -0.0110], [51.5380, -0.0200], [51.5480, -0.0200]] },
    { id: "thames-putney-richmond", name: "Thames Path: Putney → Richmond", type: "river", leg: "Boat Race course to Richmond", start: "Putney Bridge (District)", distance: "6.0 mi (9.7 km)", highlights: "The Championship Course along the river past Barnes and Kew Gardens to riverside Richmond.", suitability: "Flat riverside miles — scenic and easy to follow; can be muddy in patches.", loop: false, path: [[51.4670, -0.2160], [51.4750, -0.2450], [51.4700, -0.2800], [51.4610, -0.3080]] },
    { id: "thames-barrier", name: "Thames Barrier Path", type: "river", leg: "Greenwich → the Thames Barrier", start: "Cutty Sark (DLR)", distance: "4.0 mi (6.5 km)", highlights: "Downriver from Greenwich past the O2 to the silver hoods of the Thames Barrier.", suitability: "Flat, open and breezy — a straightforward point-to-point along the river.", loop: false, path: [[51.4830, -0.0090], [51.4880, 0.0080], [51.4930, 0.0230], [51.4975, 0.0360]] },
  ];

  const routeMap = { map: null, layer: null, current: -1, reversed: false };

  // Per-visitor progress Sets in localStorage (collector, buses, route ideas).
  function loadSet(key) {
    try { const s = JSON.parse(localStorage.getItem(key)); return new Set(Array.isArray(s) ? s : []); }
    catch (_) { return new Set(); }
  }
  function saveSet(key, set) { try { localStorage.setItem(key, JSON.stringify([...set])); } catch (_) { /* private mode etc. */ } }

  // Shared achievement-badge markup (routes, buses and the line collector).
  function badgeCardsHtml(badges, ctx) {
    return badges.map((b) => {
      const got = b.test(ctx);
      return `<div class="badge${got ? " got" : ""}"><span class="badge-ic">${got ? b.icon : "🔒"}</span><span class="badge-nm">${escapeHtml(b.name)}</span><span class="badge-ds">${escapeHtml(b.desc)}</span></div>`;
    }).join("");
  }
  function badgesHeadHtml(title, counter) {
    return `<div class="lc-badges-head"><h3>${escapeHtml(title)}</h3><span class="lc-badges-count">${counter}</span></div>`;
  }

  // Route ideas you've run — kept per-visitor (localStorage), keyed by route name.
  const ROUTE_KEY = "tuberun_routes";
  function loadRoutesRun() { return loadSet(ROUTE_KEY); }
  function saveRoutesRun(set) { saveSet(ROUTE_KEY, set); }
  let routeRun = loadRoutesRun();
  const LANDMARK_TOTAL = ROUTES.filter((r) => r.type === "landmark").length;
  const ROUTE_BADGES = [
    { icon: "📸", name: "Sightseer", desc: "Run any landmark route", test: (c) => (c.type.landmark || 0) >= 1 },
    { icon: "🏛", name: "Grand Tourist", desc: "Run the Grand Tour of Thames landmarks", test: (c) => c.has("The Grand Tour (Thames Landmarks)") },
    { icon: "🌳", name: "Park Life", desc: "Run 5 park routes", test: (c) => (c.type.park || 0) >= 5 },
    { icon: "🌊", name: "River Runner", desc: "Run 3 riverside routes", test: (c) => (c.type.river || 0) >= 3 },
    { icon: "🛶", name: "Towpath Tramp", desc: "Run 3 canal routes", test: (c) => (c.type.canal || 0) >= 3 },
    { icon: "🥾", name: "Trailblazer", desc: "Run 3 trail routes", test: (c) => (c.type.trail || 0) >= 3 },
    { icon: "🗺", name: "Landmark Hunter", desc: "Run every landmark route", test: (c) => (c.type.landmark || 0) >= LANDMARK_TOTAL },
    { icon: "🧭", name: "Explorer", desc: "Run 10 different routes", test: (c) => c.count >= 10 },
    { icon: "👑", name: "London Complete", desc: `Run all ${ROUTES.length} routes`, test: (c) => c.count >= ROUTES.length },
  ];
  function renderRouteProgress() {
    const el = document.getElementById("routeProgress");
    if (!el) return;
    const runList = ROUTES.filter((r) => routeRun.has(r.name));
    const type = {};
    runList.forEach((r) => { type[r.type] = (type[r.type] || 0) + 1; });
    const ctx = { count: runList.length, type, has: (n) => routeRun.has(n) };
    const got = ROUTE_BADGES.filter((b) => b.test(ctx)).length;
    el.innerHTML = `
      ${badgesHeadHtml("Sightseeing badges", `${runList.length} route${runList.length === 1 ? "" : "s"} run · ${got} / ${ROUTE_BADGES.length} badges`)}
      <p class="lc-hint">Mark the routes you've run to collect sightseeing badges — parks, rivers, canals, trails and London's landmarks.</p>
      <div class="lc-badges">${badgeCardsHtml(ROUTE_BADGES, ctx)}</div>`;
  }
  // Real OSM route geometry (data/routes.geojson), keyed by each route's `id` slug.
  let routesGeo = null;
  async function loadRoutes() {
    if (routesGeo) return routesGeo;
    const loaded = {};
    try {
      const res = await fetch("data/routes.geojson");
      if (res.ok) {
        const gj = await res.json();
        for (const f of gj.features) loaded[f.properties.id] = f.geometry;
        routesGeo = loaded; // only cache success — a transient failure can retry next call
      }
    } catch (_) { /* fall back to the sketched paths */ }
    return routesGeo || loaded;
  }

  // Options for the animated dashed "flow" overlay drawn on top of a route line.
  function flowLineOptions(colour, overrides) {
    return { renderer: L.svg(), color: colour, weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round", className: "route-flow", dashArray: "2 13", ...overrides };
  }
  // A route drawn as two stacked polylines: a soft translucent base + the dashed
  // animated "flow" overlay. Shared by the segment, run-route and journey drawers.
  function addFlowLine(grp, latlngs, colour, opts = {}) {
    const baseWeight = opts.baseWeight || 6, baseOpacity = opts.baseOpacity || 0.3, flowWeight = opts.flowWeight || 4;
    L.polyline(latlngs, { color: colour, weight: baseWeight, opacity: baseOpacity, lineJoin: "round", lineCap: "round" }).addTo(grp);
    L.polyline(latlngs, flowLineOptions(colour, { weight: flowWeight })).addTo(grp);
  }

  // Draw route segments as a two-layer animated "flow" line (soft base + dashed
  // overlay) with start/finish markers, swap the group in as `holder.layer`, and
  // fit the map to it. `marks.finish` may be null for loop routes.
  function drawFlowSegments(map, holder, segs, colour, marks, padding) {
    if (holder.layer) map.removeLayer(holder.layer);
    const grp = L.layerGroup(), all = [];
    segs.forEach((seg) => {
      addFlowLine(grp, seg, colour, { baseWeight: 5, flowWeight: 5 });
      seg.forEach((p) => all.push(p));
    });
    // Click any marker to recentre the map on that stop (zooming in if far out)
    // and name it in a popup. `safeName` must already be HTML-escaped.
    const centerOn = (lat, lon, safeName) => {
      // autoPan off so the popup doesn't fight setView's centring (it would nudge
      // the stop to the edge instead, especially when zooming in from a wide view).
      map.setView([lat, lon], Math.max(map.getZoom(), 16), { animate: true });
      L.popup({ offset: [0, -2], autoPan: false }).setLatLng([lat, lon]).setContent(safeName).openOn(map);
    };
    // Optional dot at every stop along the route (e.g. each bus stop), tube-map style.
    if (marks.stops) marks.stops.forEach((s) => {
      L.circleMarker([s[1], s[2]], { radius: 3.2, color: "#fff", weight: 1.3, fillColor: colour, fillOpacity: 1 })
        .bindTooltip(escapeHtml(s[0]), { direction: "top" })
        .on("click", () => centerOn(s[1], s[2], escapeHtml(s[0]))).addTo(grp);
    });
    L.circleMarker(marks.start.at, { radius: 6, color: "#fff", weight: 2, fillColor: colour, fillOpacity: 1 })
      .bindTooltip(marks.start.label, { direction: "top" })
      .on("click", () => centerOn(marks.start.at[0], marks.start.at[1], marks.start.label)).addTo(grp);
    if (marks.finish) L.circleMarker(marks.finish.at, { radius: 6, color: colour, weight: 2, fillColor: "#fff", fillOpacity: 1 })
      .bindTooltip(marks.finish.label, { direction: "top" })
      .on("click", () => centerOn(marks.finish.at[0], marks.finish.at[1], marks.finish.label)).addTo(grp);
    grp.addTo(map);
    holder.layer = grp;
    if (all.length) map.fitBounds(L.latLngBounds(all), { padding });
  }

  function drawRoute(i) {
    const r = ROUTES[i], c = ROUTE_COLOURS[r.type] || "#0019A8", m = routeMap.map;
    if (!m) return;
    const geom = routesGeo && routesGeo[r.id];
    let segs; // array of segments, each an array of [lat,lon]
    if (geom) {
      const toLL = (ring) => ring.map((p) => [p[1], p[0]]);
      segs = geom.type === "MultiLineString" ? geom.coordinates.map(toLL) : [toLL(geom.coordinates)];
    } else if (r.path && r.path.length) {
      segs = [r.loop && r.path.length > 2 ? r.path.concat([r.path[0]]) : r.path];
    } else return;
    // Reverse: flip the order of segments and the points within each.
    if (routeMap.reversed) segs = segs.slice().reverse().map((s) => s.slice().reverse());
    const lastSeg = segs[segs.length - 1];
    drawFlowSegments(m, routeMap, segs, c, {
      start: { at: segs[0][0], label: routeMap.reversed ? "Start · from the far end (reversed)" : "Start · " + escapeHtml(r.start) },
      finish: r.loop ? null : { at: lastSeg[lastSeg.length - 1], label: routeMap.reversed ? "Finish · " + escapeHtml(r.start) : "Finish" },
    }, [34, 34]);
  }

  // --- Route filters (type + distance) ----------------------------------
  const routeKm = (r) => { const m = /([\d.]+)\s*km/.exec(r.distance); return m ? parseFloat(m[1]) : 0; };
  const DIST_BUCKETS = [
    { key: "short", label: "Short · under 5k", test: (k) => k > 0 && k < 5 },
    { key: "medium", label: "Medium · 5–10k", test: (k) => k >= 5 && k <= 10 },
    { key: "long", label: "Long · 10k+", test: (k) => k > 10 },
  ];
  const TYPE_LABELS = { all: "All", park: "Parks", trail: "Trails", canal: "Canals", river: "Rivers", landmark: "Landmarks" };
  const routeFilter = { type: "all", dist: "all" };
  const distBucket = (k) => { const b = DIST_BUCKETS.find((x) => x.test(k)); return b ? b.key : ""; };
  const routeMatches = (r) => (routeFilter.type === "all" || r.type === routeFilter.type)
    && (routeFilter.dist === "all" || distBucket(routeKm(r)) === routeFilter.dist);

  function routeCardHtml(r, i) {
    const c = ROUTE_COLOURS[r.type] || "#0019A8";
    return `<div class="route-card" data-i="${i}" role="button" tabindex="0" aria-pressed="false" style="border-top-color:${c}">
        <div class="rc-top"><span class="rc-type" style="background:${c}">${escapeHtml(r.type)}</span><span class="rc-dist">${escapeHtml(distText(r.distance))}</span></div>
        <h3>${escapeHtml(r.name)}</h3>
        <p class="rc-leg">${escapeHtml(r.leg)}</p>
        <p class="rc-meta"><strong>Start</strong> ${escapeHtml(r.start)}</p>
        <p class="rc-hi">${escapeHtml(r.highlights)}</p>
        ${r.suitability ? `<p class="rc-suit">${escapeHtml(r.suitability)}</p>` : ""}
        <div class="rc-actions">
          <button type="button" class="rc-mark" data-name="${escapeHtml(r.name)}">＋ Mark as run</button>
          <button type="button" class="rc-reverse" data-i="${i}">⇄ Reverse direction</button>
        </div>
      </div>`;
  }

  function syncRouteMark(btn) {
    const ran = routeRun.has(btn.dataset.name);
    btn.classList.toggle("on", ran);
    btn.textContent = ran ? "✓ Ran this route" : "＋ Mark as run";
  }

  // Rebuild the (filtered) card list; returns the original index of the first visible route.
  function renderRouteCards() {
    const el = document.getElementById("routeList");
    if (!el) return -1;
    const visible = ROUTES.map((r, i) => ({ r, i })).filter((x) => routeMatches(x.r));
    if (!visible.length) {
      el.innerHTML = `<p class="routes-empty">No routes match that filter — try a wider distance or another type.</p>`;
      return -1;
    }
    el.innerHTML = visible.map((x) => routeCardHtml(x.r, x.i)).join("");
    el.querySelectorAll(".route-card").forEach((card) => {
      const i = parseInt(card.dataset.i, 10);
      card.addEventListener("click", () => selectRoute(i));
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectRoute(i); } });
      const rev = card.querySelector(".rc-reverse");
      if (rev) rev.addEventListener("click", (e) => { e.stopPropagation(); reverseRoute(i, rev); });
      const mark = card.querySelector(".rc-mark");
      if (mark) {
        syncRouteMark(mark);
        mark.addEventListener("click", (e) => {
          e.stopPropagation();
          const n = mark.dataset.name;
          if (routeRun.has(n)) routeRun.delete(n); else routeRun.add(n);
          saveRoutesRun(routeRun); syncRouteMark(mark); renderRouteProgress();
        });
      }
    });
    // Re-apply the selected state — a rebuild (e.g. the unit toggle) must not
    // desync the cards from the route still drawn on the map.
    if (routeMap.current >= 0) {
      const cur = el.querySelector(`.route-card[data-i="${routeMap.current}"]`);
      if (cur) {
        cur.classList.add("on");
        cur.setAttribute("aria-pressed", "true");
        const rev = cur.querySelector(".rc-reverse");
        if (rev) rev.classList.toggle("on", routeMap.reversed);
      }
    }
    return visible[0].i;
  }

  function renderFilters() {
    const el = document.getElementById("routeFilters");
    if (!el) return;
    const types = ["all", ...Array.from(new Set(ROUTES.map((r) => r.type)))];
    const chip = (group, val, label) =>
      `<button type="button" class="rf-chip${routeFilter[group] === val ? " on" : ""}" data-group="${group}" data-val="${val}">${escapeHtml(label)}</button>`;
    const typeChips = types.map((t) => chip("type", t, TYPE_LABELS[t] || t)).join("");
    const distChips = [{ key: "all", label: "Any distance" }, ...DIST_BUCKETS].map((d) => chip("dist", d.key, d.label)).join("");
    el.innerHTML = `<div class="rf-row" role="group" aria-label="Filter routes by type">${typeChips}</div>
      <div class="rf-row" role="group" aria-label="Filter routes by distance">${distChips}</div>`;
    el.querySelectorAll(".rf-chip").forEach((b) => b.addEventListener("click", () => {
      routeFilter[b.dataset.group] = b.dataset.val;
      renderFilters();
      const first = renderRouteCards();
      if (first >= 0) selectRoute(first);
    }));
  }

  function selectRoute(i) {
    routeMap.current = i;
    routeMap.reversed = false; // a freshly-picked route starts in its forward direction
    document.querySelectorAll("#routeList .route-card").forEach((el) => {
      const on = +el.dataset.i === i;
      el.classList.toggle("on", on); el.setAttribute("aria-pressed", on ? "true" : "false");
      const rev = el.querySelector(".rc-reverse");
      if (rev) rev.classList.remove("on");
    });
    drawRoute(i);
    if (window.matchMedia("(max-width: 860px)").matches && routeMap.map)
      document.getElementById("routeMap").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function reverseRoute(i, btn) {
    if (routeMap.current !== i) { selectRoute(i); return; }
    routeMap.reversed = !routeMap.reversed;
    if (btn) btn.classList.toggle("on", routeMap.reversed);
    drawRoute(i);
  }

  function renderRoutes() {
    const el = document.getElementById("routeList");
    if (!el) return;
    renderFilters();
    const first = renderRouteCards();
    renderRouteProgress();

    const mapEl = document.getElementById("routeMap");
    if (mapEl) {
      if (typeof L === "undefined") { mapUnavailable(mapEl); return; }
      routeMap.map = createSiteMap(mapEl);
      requestAnimationFrame(async () => { routeMap.map.invalidateSize(false); await loadRoutes(); selectRoute(first >= 0 ? first : 0); });
    }
  }

  // --- Run a bus route (live from the TfL API) --------------------------
  const BUS_COL = "#DC241F"; // London bus red
  const busMapObj = { map: null, layer: null, currentId: null };

  // Bus routes you've run — kept per-visitor in the browser, like the line collector.
  const BUS_KEY = "tuberun_buses";
  function loadBuses() { return loadSet(BUS_KEY); }
  function saveBuses(set) { saveSet(BUS_KEY, set); }
  let busRun = loadBuses();
  const BUS_FAVE_IDS = ["24", "11", "15", "9", "159", "88"];
  const BUS_BADGES = [
    { icon: "🚌", name: "First Bus", desc: "Run your first bus route", test: (c) => c.count >= 1 },
    { icon: "🎫", name: "Red Rover", desc: "Run 5 bus routes", test: (c) => c.count >= 5 },
    { icon: "🚌", name: "Double Decker", desc: "Run 10 bus routes", test: (c) => c.count >= 10 },
    { icon: "🎡", name: "Iconic Six", desc: "Run the 24, 11, 15, 9, 159 & 88", test: (c) => c.iconic >= 6 },
    { icon: "🦉", name: "Night Owl", desc: "Run a night bus (an N-route)", test: (c) => c.night },
    { icon: "🏙", name: "Around Town", desc: "Run 25 bus routes", test: (c) => c.count >= 25 },
    { icon: "🚏", name: "Route Master", desc: "Run 50 bus routes", test: (c) => c.count >= 50 },
    { icon: "💯", name: "Bus Century", desc: "Run 100 bus routes", test: (c) => c.count >= 100 },
  ];

  function syncBusMark() {
    const mark = document.getElementById("busMark");
    if (!mark) return;
    const ran = busRun.has(mark.dataset.id);
    mark.classList.toggle("on", ran);
    mark.textContent = ran ? "✓ Ran this route" : "＋ Mark as run";
  }
  function renderBusProgress() {
    const el = document.getElementById("busProgress");
    if (!el) return;
    const ids = [...busRun];
    const ctx = { count: ids.length, iconic: BUS_FAVE_IDS.filter((x) => busRun.has(x)).length, night: ids.some((x) => /^N/i.test(x)) };
    const got = BUS_BADGES.filter((b) => b.test(ctx)).length;
    const sorted = ids.slice().sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b));
    const chips = sorted.length
      ? sorted.map((id) => `<button type="button" class="bus-chip" data-id="${escapeHtml(id)}" title="Tap to remove">${escapeHtml(id)} ✕</button>`).join("")
      : `<span class="bus-none">None yet — trace a route above and tap “Mark as run”.</span>`;
    el.innerHTML = `
      ${badgesHeadHtml("Bus running champs", `${ids.length} route${ids.length === 1 ? "" : "s"} run · ${got} / ${BUS_BADGES.length} badges`)}
      <div class="bus-chips">${chips}</div>
      <div class="lc-badges">${badgeCardsHtml(BUS_BADGES, ctx)}</div>`;
    el.querySelectorAll(".bus-chip").forEach((ch) => ch.addEventListener("click", () => {
      busRun.delete(ch.dataset.id);
      saveBuses(busRun); renderBusProgress(); syncBusMark();
    }));
  }

  function drawBus(seq, wp) {
    const m = busMapObj.map;
    if (!m) return;
    let segs = [];
    (seq.lineStrings || []).forEach((ls) => {
      try {
        const parsed = JSON.parse(ls);
        const lines = Array.isArray(parsed[0][0]) ? parsed : [parsed];
        lines.forEach((line) => segs.push(line.map((p) => [p[1], p[0]])));
      } catch (_) { /* skip malformed */ }
    });
    if (!segs.length) segs = [wp.map((s) => [s[1], s[2]])];
    const a = wp[0], b = wp[wp.length - 1];
    drawFlowSegments(m, busMapObj, segs, BUS_COL, {
      start: { at: [a[1], a[2]], label: "Start · " + escapeHtml(a[0]) },
      finish: { at: [b[1], b[2]], label: "Finish · " + escapeHtml(b[0]) },
      stops: wp,
    }, [30, 30]);
  }

  // Populate the route-number datalist from the cached list of TfL bus routes.
  function loadBusList() {
    fetch("data/bus-routes.json").then((r) => r.ok ? r.json() : []).then((ids) => {

      const dl = document.getElementById("busList");
      if (dl) dl.innerHTML = ids.map((id) => `<option value="${escapeHtml(id)}"></option>`).join("");
    }).catch(() => {});
  }

  function initBusMap(mapEl) {
    busMapObj.map = createSiteMap(mapEl);
    requestAnimationFrame(() => busMapObj.map.invalidateSize(false));
  }

  // Build the trace action for the bus runner — fetches the picked route's
  // stop sequence from TfL, draws it and renders the summary panel. A factory
  // so the staleness token stays private to the tracer.
  function makeBusTracer(pick, dir, result) {
    let traceSeq = 0; // two rapid picks can resolve out of order — only the latest may render
    return async function trace() {
      const id = (pick.value || "").trim();
      if (!id) return;
      const mySeq = ++traceSeq;
      result.innerHTML = `<p class="bus-loading">Loading route ${escapeHtml(id)}…</p>`;
      let seq;
      try {
        const res = await fetch(`https://api.tfl.gov.uk/Line/${encodeURIComponent(id)}/Route/Sequence/${dir.value}`);
        if (!res.ok) throw new Error("http " + res.status);
        seq = await res.json();
      } catch (_) {
        if (mySeq !== traceSeq) return;
        result.innerHTML = `<p class="bus-error">Couldn't load route <strong>${escapeHtml(id)}</strong> (${escapeHtml(dir.value)}). Check the number, or try the other direction.</p>`;
        return;
      }
      if (mySeq !== traceSeq) return;
      const sps = (seq.stopPointSequences || []).filter((s) => Array.isArray(s.stopPoint));
      // Stats describe the main branch: pick the sequence with the most stops
      // (mirrors the tube longest-branch logic) rather than an arbitrary first one.
      const main = sps.reduce((a, b) => (b.stopPoint.length > a.stopPoint.length ? b : a), sps[0]);
      const stops = main ? main.stopPoint : [];
      if (!stops || stops.length < 2) {
        result.innerHTML = `<p class="bus-error">No <strong>${escapeHtml(dir.value)}</strong> stops for route ${escapeHtml(id)} — try the other direction.</p>`;
        return;
      }
      const wp = stops.map((s) => [s.name, s.lat, s.lon]);
      const km = legDistanceKm(wp, 0, wp.length - 1);
      const from = wp[0][0], to = wp[wp.length - 1][0];
      const banner = `Route ${id} · ${from} → ${to}`;
      busMapObj.currentId = id;
      drawBus(seq, wp);
      result.innerHTML = `
        <div class="bus-summary">
          <div class="cr-main"><span class="cr-km">${fmtKm(km, 1)}</span></div>
          ${timesRowHtml(km)}
          <div class="cr-detail">${escapeHtml(from)} → ${escapeHtml(to)} · ${wp.length} stops</div>
          <div class="bus-elev jr-elev"></div>
          <button type="button" id="busMark" class="bus-mark" data-id="${escapeHtml(id)}">＋ Mark as run</button>
          <div class="cr-note">Distance along the stops × ${ROAD_FACTOR} for the road. Buses run on-road — mind the traffic and lights.</div>
        </div>
        <div class="line-diagram strip bus-strip" style="--line-col:${BUS_COL}">${stripMapHtml(null, BUS_COL, banner, { wp, bannerLabel: banner, tap: true })}</div>`;
      result.querySelectorAll(".bus-strip .stn").forEach((btn) => btn.addEventListener("click", () => {
        const s = wp[+btn.dataset.i];
        if (!s || !busMapObj.map) return;
        busMapObj.map.setView([s[1], s[2]], 16, { animate: true });
        L.popup({ offset: [0, -2], autoPan: false }).setLatLng([s[1], s[2]]).setContent(escapeHtml(s[0])).openOn(busMapObj.map);
        if (window.matchMedia("(max-width: 860px)").matches)
          document.getElementById("busMap").scrollIntoView({ behavior: "smooth", block: "center" });
      }));
      syncBusMark();
      const mark = document.getElementById("busMark");
      if (mark) mark.addEventListener("click", () => {
        const rid = mark.dataset.id;
        if (busRun.has(rid)) busRun.delete(rid); else busRun.add(rid);
        saveBuses(busRun); syncBusMark(); renderBusProgress();
      });
      // Elevation profile — buses carry no GPX, so sample open-meteo along the stops.
      const elBox = result.querySelector(".bus-elev");
      if (elBox) {
        elBox.innerHTML = `<p class="ls-elev-load">Reading elevation…</p>`;
        const elev = await routeElevation(wp.map((s) => [s[1], s[2]]));
        if (mySeq === traceSeq && elBox.isConnected) elBox.innerHTML = elev ? elevationHtml(elev) : "";
      }
    };
  }

  // Quick-pick chips for a few scenic/iconic routes (all current TfL routes).
  function setupBusQuickPicks(runRoute) {
    const faves = [["24", "Pimlico – Hampstead Heath"], ["11", "Westminster & St Paul's sightseeing"], ["15", "Tower of London (Routemaster heritage)"], ["9", "Kensington & the West End"], ["159", "Marble Arch – Streatham"], ["88", "Camden – Clapham via the West End"]];
    const quick = document.getElementById("busQuick");
    if (!quick) return;
    quick.innerHTML = `<span class="bq-lbl">Try one:</span>` + faves.map(([id, hint]) =>
      `<button type="button" class="bq-chip" data-route="${escapeHtml(id)}" title="${escapeHtml(hint)}">${escapeHtml(id)}</button>`).join("");
    quick.querySelectorAll(".bq-chip").forEach((b) => b.addEventListener("click", () => runRoute(b.dataset.route)));
  }

  // Find routes by place: TfL StopPoint search → bus lines serving the nearest stops.
  function setupBusPlaceSearch(runRoute, mapEl) {
    const placeIn = document.getElementById("busPlace");
    const placeGo = document.getElementById("busPlaceGo");
    const placeOut = document.getElementById("busPlaceResults");
    let placeSeq = 0;
    async function findByPlace() {
      const q = (placeIn.value || "").trim();
      if (!q || !placeOut) return;
      const mySeq = ++placeSeq;
      placeOut.innerHTML = `<p class="bus-loading">Searching stops near “${escapeHtml(q)}”…</p>`;
      try {
        const sRes = await fetch(`https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(q)}?modes=bus&maxResults=8`);
        if (!sRes.ok) throw new Error("search");
        const found = ((await sRes.json()).matches || []).slice(0, 6);
        if (mySeq !== placeSeq) return;
        if (!found.length) { placeOut.innerHTML = `<p class="bus-error">No bus stops found for <strong>${escapeHtml(q)}</strong> — try a station, road or area name.</p>`; return; }
        const dRes = await fetch(`https://api.tfl.gov.uk/StopPoint/${found.map((m) => encodeURIComponent(m.id)).join(",")}`);
        if (!dRes.ok) throw new Error("detail");
        let detail = await dRes.json();
        if (mySeq !== placeSeq) return;
        if (!Array.isArray(detail)) detail = [detail];
        const rows = detail.map((sp) => {
          const buses = (sp.lineModeGroups || []).find((g) => g.modeName === "bus");
          const ids = buses ? buses.lineIdentifier || [] : [];
          if (!ids.length) return "";
          return `<div class="bp-stop"><span class="bp-name">${escapeHtml(sp.commonName || "")}</span>
            <span class="bp-chips">${ids.map((id) => `<button type="button" class="bq-chip" data-route="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join("")}</span></div>`;
        }).filter(Boolean);
        placeOut.innerHTML = rows.length
          ? `<p class="bp-head">Bus routes near <strong>${escapeHtml(q)}</strong> — tap one to trace it:</p>` + rows.join("")
          : `<p class="bus-error">No bus routes found at those stops — try another name.</p>`;
        placeOut.querySelectorAll(".bq-chip").forEach((b) => b.addEventListener("click", () => {
          runRoute(b.dataset.route);
          mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }));
      } catch (_) {
        if (mySeq === placeSeq) placeOut.innerHTML = `<p class="bus-error">Couldn't search right now — check your connection and try again.</p>`;
      }
    }
    if (placeGo && placeIn) {
      placeGo.addEventListener("click", findByPlace);
      placeIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findByPlace(); } });
    }
  }

  function setupBusRunner() {
    const pick = document.getElementById("busPick");
    const dir = document.getElementById("busDir");
    const go = document.getElementById("busGo");
    const result = document.getElementById("busResult");
    const mapEl = document.getElementById("busMap");
    if (!pick || !go || !mapEl) return;
    if (typeof L === "undefined") { mapUnavailable(mapEl); return; }

    loadBusList();
    initBusMap(mapEl);
    const trace = makeBusTracer(pick, dir, result);
    go.addEventListener("click", trace);
    pick.addEventListener("change", trace);
    // Let the site-wide unit toggle re-render the last traced route in the new units.
    busMapObj.retrace = () => { if (busMapObj.currentId) { pick.value = busMapObj.currentId; trace(); } };
    dir.addEventListener("change", () => { if ((pick.value || "").trim()) trace(); });
    const runRoute = (id) => { pick.value = id; dir.value = "outbound"; trace(); };
    setupBusQuickPicks(runRoute);
    setupBusPlaceSearch(runRoute, mapEl);
    renderBusProgress();
  }

  // --- Render: Line stats ------------------------------------------------
  // Real end-to-end line data [name, length km, station count].
  const LINE_STATS = [
    ["Bakerloo", 23.2, 25], ["Central", 74, 49], ["Circle", 27, 36], ["District", 64, 60],
    ["Hammersmith & City", 25.5, 29], ["Jubilee", 36.2, 27], ["Metropolitan", 66.7, 34],
    ["Northern", 58, 52], ["Piccadilly", 71, 53], ["Victoria", 21, 16], ["Waterloo & City", 2.5, 2],
    // London Overground — km + stops of each line's main route (branches also shown on the map).
    ["Lioness", 34.2, 19], ["Mildmay", 24.4, 18], ["Windrush", 11.5, 12],
    ["Weaver", 14.1, 7], ["Suffragette", 29.5, 13], ["Liberty", 6.6, 3],
    // Elizabeth line — main spine Reading to Abbey Wood (branches also on the map).
    ["Elizabeth", 99.6, 25],
  ];

  // Sortable "Line by line" columns. Run/Cycle/Walk are all distance × a constant,
  // so they sort in the same order as Length — kept sortable for consistency.
  const LS_COLS = ["Line", "Length", "Stops", "Run", "Cycle", "Walk"];
  const lsSortVal = [(s) => s[0].toLowerCase(), (s) => s[1], (s) => s[2], (s) => s[1], (s) => s[1], (s) => s[1]];
  let lsSortCol = 1, lsSortDir = -1; // default: longest first

  function renderLineStats() {
    const el = document.getElementById("lineStats");
    if (!el) return;
    const kms = LINE_STATS.map((s) => s[1]);
    const stns = LINE_STATS.map((s) => s[2]);
    const maxKm = Math.max(...kms), minKm = Math.min(...kms);
    const maxSt = Math.max(...stns), minSt = Math.min(...stns);
    const active = nextRun ? nextRun.key : null;
    const sortVal = lsSortVal[lsSortCol];
    const rows = [...LINE_STATS].sort((a, b) => {
      const va = sortVal(a), vb = sortVal(b);
      return va < vb ? -lsSortDir : va > vb ? lsSortDir : 0;
    }).map(([name, km, stations]) => {
      const c = LINE_COLOURS[name] || "#0019A8";
      const badges = [];
      if (km === maxKm) badges.push(["Longest", "tough"]);
      if (km === minKm) badges.push(["Shortest", "easy"]);
      if (stations === maxSt) badges.push(["Most stops", ""]);
      if (stations === minSt) badges.push(["Fewest stops", ""]);
      const badgeHtml = badges.map(([t, cls]) => `<span class="ls-badge ${cls}">${t}</span>`).join("");
      return `<tr class="${name === active ? "ls-active" : ""}" data-line="${escapeHtml(name)}">
        <td class="ls-name"><button type="button" class="ls-row-btn" aria-expanded="false"><span class="ls-caret" aria-hidden="true">▸</span><span class="ls-name-in"><span class="ls-dot" style="background:${c}"></span>${escapeHtml(name)}${name === active ? ' <span class="ls-next">next run</span>' : ""}${badgeHtml}</span></button></td>
        <td>${fmtKm(km, 1)}</td>
        <td>${stations}</td>
        <td>${fmtTime(km * 6.5)}</td>
        <td>${fmtTime(km * CYCLE_MIN_PER_KM)}</td>
        <td>${fmtTime(km * WALK_MIN_PER_KM)}</td>
      </tr>`;
    }).join("");
    if (lsMap) { lsMap.remove(); lsMap = null; } // drop any open mini-map before re-render
    const heads = LS_COLS.map((h, i) => {
      const on = i === lsSortCol;
      return `<th aria-sort="${on ? (lsSortDir === 1 ? "ascending" : "descending") : "none"}"><button type="button" class="ls-sort${on ? " on" : ""}" data-col="${i}">${escapeHtml(h)}<span class="ls-arrow" aria-hidden="true">${on ? (lsSortDir === 1 ? "▲" : "▼") : ""}</span></button></th>`;
    }).join("");
    el.innerHTML = `
      <table class="ls-table">
        <thead><tr>${heads}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="ls-foot">Tap a column to sort, or a line to see its run route on a map. Run at a steady 6:30/km, cycle at ~15 km/h, walk at ~5 km/h, end to end.</p>`;
    const tbody = el.querySelector("tbody");
    if (tbody) tbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".ls-row-btn");
      if (btn) toggleLineDetail(btn);
    });
    const thead = el.querySelector("thead");
    if (thead) thead.addEventListener("click", (e) => {
      const btn = e.target.closest(".ls-sort");
      if (!btn) return;
      const col = +btn.dataset.col;
      if (col === lsSortCol) lsSortDir = -lsSortDir;
      else { lsSortCol = col; lsSortDir = col === 0 ? 1 : -1; }
      renderLineStats();
    });
  }

  // Curated end-to-end route variants for lines with multiple paths. Each variant
  // references the network's branch segments as [branchIndex, reversed] so the
  // station lists stay exact — assembleVariant() stitches them, dropping the
  // shared station at each join. (Northern branch 1 = via Charing Cross, branch 5
  // = via Bank; District branches all hinge on Earl's Court / Turnham Green.)
  const LINE_VARIANTS = {
    central: [
      { segs: [[0, 0], [1, 0], [2, 0], [3, 0]] },              // West Ruislip – Epping
      { segs: [[6, 0], [1, 0], [2, 0], [3, 0]] },              // Ealing Broadway – Epping
      { via: "Newbury Park", segs: [[0, 0], [1, 0], [4, 0]] }, // West Ruislip – Hainault
      { via: "Woodford", segs: [[0, 0], [1, 0], [2, 0], [5, 0]] }, // West Ruislip – Hainault (loop)
      { via: "Newbury Park", segs: [[6, 0], [1, 0], [4, 0]] }, // Ealing Broadway – Hainault
      { via: "Woodford", segs: [[6, 0], [1, 0], [2, 0], [5, 0]] }, // Ealing Broadway – Hainault (loop)
    ],
    district: [
      { segs: [[2, 1], [1, 1], [0, 1]] },   // Upminster – Ealing Broadway
      { segs: [[2, 1], [1, 1], [3, 1]] },   // Upminster – Richmond
      { segs: [[2, 1], [4, 1]] },           // Upminster – Wimbledon
      { segs: [[5, 1], [4, 1]] },           // Edgware Road – Wimbledon
      { segs: [[5, 1], [1, 1], [0, 1]] },   // Edgware Road – Ealing Broadway
      { segs: [[5, 1], [1, 1], [3, 1]] },   // Edgware Road – Richmond
    ],
    metropolitan: [
      { segs: [[7, 0], [1, 0], [2, 0], [3, 0], [6, 0], [4, 0]] }, // Chesham – Aldgate
      { segs: [[0, 0], [1, 0], [2, 0], [3, 0], [6, 0], [4, 0]] }, // Amersham – Aldgate
      { segs: [[8, 0], [3, 0], [6, 0], [4, 0]] },                 // Uxbridge – Aldgate
      { segs: [[9, 0], [2, 0], [3, 0], [6, 0], [4, 0]] },         // Watford – Aldgate
    ],
    northern: [
      { via: "Bank", segs: [[0, 0], [5, 0], [6, 0], [7, 0]] },          // Morden – Edgware
      { via: "Charing Cross", segs: [[0, 0], [1, 0], [2, 0], [7, 0]] }, // Morden – Edgware
      { via: "Bank", segs: [[0, 0], [5, 0], [6, 0], [3, 0], [4, 0]] },  // Morden – High Barnet
      { via: "Charing Cross", segs: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] }, // Morden – High Barnet
      { via: "Bank", segs: [[0, 0], [5, 0], [6, 0], [3, 0], [8, 0]] },  // Morden – Mill Hill East
      { via: "Charing Cross", segs: [[0, 0], [1, 0], [2, 0], [3, 0], [8, 0]] }, // Morden – Mill Hill East
      { via: "Charing Cross", segs: [[9, 0], [1, 0], [2, 0], [7, 0]] }, // Battersea Power – Edgware
      { via: "Charing Cross", segs: [[9, 0], [1, 0], [2, 0], [3, 0], [4, 0]] }, // Battersea Power – High Barnet
      { via: "Charing Cross", segs: [[9, 0], [1, 0], [2, 0], [3, 0], [8, 0]] }, // Battersea Power – Mill Hill East
    ],
    piccadilly: [
      { segs: [[1, 1], [0, 1]] },             // Cockfosters – Uxbridge
      { segs: [[1, 1], [3, 1]] },             // Cockfosters – Heathrow T2 & 3
      { segs: [[1, 1], [3, 1], [2, 1]] },     // Cockfosters – Heathrow T4
      { segs: [[1, 1], [3, 1], [4, 1]] },     // Cockfosters – Heathrow T5
    ],
    mildmay: [
      { segs: [[0, 0], [1, 0]] },   // Stratford – Richmond
      { segs: [[0, 0], [2, 0]] },   // Stratford – Clapham Junction
    ],
    windrush: [
      { segs: [[0, 0], [1, 0], [2, 0]] },   // Highbury & Islington – West Croydon
      { segs: [[0, 0], [1, 0], [4, 0]] },   // Highbury & Islington – Crystal Palace
      { segs: [[0, 0], [3, 0]] },           // Highbury & Islington – Clapham Junction
      { segs: [[0, 0], [5, 0]] },           // Highbury & Islington – New Cross
    ],
    weaver: [
      { segs: [[0, 0], [5, 0]] },                   // Liverpool Street – Chingford
      { segs: [[0, 0], [1, 0], [2, 0], [3, 0]] },   // Liverpool Street – Cheshunt
      { segs: [[0, 0], [1, 0], [2, 0], [4, 0]] },   // Liverpool Street – Enfield Town
    ],
    elizabeth: [
      { segs: [[8, 1], [4, 1], [3, 1], [2, 1], [9, 1]] },                 // Reading – Abbey Wood
      { segs: [[8, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1]] },         // Reading – Shenfield
      { segs: [[6, 1], [5, 1], [4, 1], [3, 1], [2, 1], [9, 1]] },         // Heathrow T4 – Abbey Wood
      { segs: [[6, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1]] }, // Heathrow T4 – Shenfield
      { segs: [[7, 1], [5, 1], [4, 1], [3, 1], [2, 1], [9, 1]] },         // Heathrow T5 – Abbey Wood
      { segs: [[7, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1]] }, // Heathrow T5 – Shenfield
      { segs: [[0, 0], [11, 0]] },                                        // Shenfield – Liverpool Street
    ],
  };
  function assembleVariant(net, id, variant) {
    const ln = net[id];
    if (!ln || !ln.branches) return null;
    const ids = [];
    for (const [bi, rev] of variant.segs) {
      const branch = ln.branches[bi];
      if (!branch) continue;
      const seg = rev ? [...branch].reverse() : branch;
      for (const sid of seg) {
        if (ids.length && ids[ids.length - 1] === sid) continue; // drop the shared join station
        ids.push(sid);
      }
    }
    return ids.map((sid) => { const s = ln.stations[sid]; return s ? [s.n, s.lat, s.lon] : null; }).filter(Boolean);
  }
  // Build the dropdown options for a line with multiple paths: every curated
  // variant, each in both directions. wp is the station waypoints (drawn as hops
  // and used for the route's distance/stop figures).
  function buildVariantOptions(net, id) {
    const variants = LINE_VARIANTS[id];
    if (!variants) return null;
    const options = [];
    for (const v of variants) {
      const wp = assembleVariant(net, id, v);
      if (!wp || wp.length < 2) continue;
      const a = wp[0][0], b = wp[wp.length - 1][0], via = v.via ? " · via " + v.via : "";
      const pair = `${a} ↔ ${b}`; // groups both directions (and any via-variants) of the same route
      options.push({ label: `${a} → ${b}${via}`, wp, pair });
      options.push({ label: `${b} → ${a}${via}`, wp: [...wp].reverse(), pair });
    }
    return options.length ? options : null;
  }
  // Build <option>/<optgroup> markup, grouping consecutive entries by groupOf(e).
  function groupedOptionsHtml(entries, groupOf, selectedIdx) {
    let html = "", cur = null, open = false;
    entries.forEach((e, i) => {
      const g = groupOf(e) || "";
      if (g !== cur) {
        if (open) { html += "</optgroup>"; open = false; }
        if (g) { html += `<optgroup label="${escapeHtml(g)}">`; open = true; }
        cur = g;
      }
      html += `<option value="${i}"${i === selectedIdx ? " selected" : ""}>${escapeHtml(e.label)}</option>`;
    });
    if (open) html += "</optgroup>";
    return html;
  }
  function waypointsKm(wp) {
    let km = 0;
    for (let i = 1; i < wp.length; i++) km += haversineKm(wp[i - 1], wp[i]);
    return km;
  }
  // Entries for the network map's route picker: this month's run (when it's a Tube
  // line, drawn from its pavement GPX) followed by every branching line's routes,
  // grouped by line. Each carries the line id + waypoints so any can be highlighted.
  function mapRouteEntries(net, hiId) {
    const entries = [];
    if (hiId && net[hiId]) {
      const base = rtStations(net, net[hiId].name);
      const ends = base && base.length > 1 ? ` · ${base[0][0]} → ${base[base.length - 1][0]}` : "";
      entries.push({ id: hiId, gpx: true, wp: base, group: "This month's run", label: net[hiId].name + ends });
    }
    for (const id of Object.keys(LINE_VARIANTS)) {
      if (!net[id]) continue;
      const opts = buildVariantOptions(net, id);
      if (!opts) continue;
      for (const o of opts) entries.push({ id, wp: o.wp, group: net[id].name, label: o.label });
    }
    return entries;
  }

  // "Line by line" row expansion: show a selected line's run route on a mini-map.
  let lsMap = null; // the single open mini-map (accordion — one line at a time)
  function toggleLineDetail(btn) {
    const tr = btn.closest("tr");
    const tbody = tr.parentNode;
    const wasOpen = tr.classList.contains("ls-open");
    if (lsMap) { lsMap.remove(); lsMap = null; }
    tbody.querySelectorAll(".ls-detail-row").forEach((r) => r.remove());
    tbody.querySelectorAll(".ls-open").forEach((r) => {
      r.classList.remove("ls-open");
      const b = r.querySelector(".ls-row-btn"); if (b) b.setAttribute("aria-expanded", "false");
      restoreRowStats(r); // put the line's overall figures back when it collapses
    });
    if (wasOpen) return; // a second click on the open row just closes it
    tr.classList.add("ls-open");
    btn.setAttribute("aria-expanded", "true");
    const detail = document.createElement("tr");
    detail.className = "ls-detail-row";
    const gpx = gpxDownloadHtml(lineSlug(tr.dataset.line), tr.dataset.line, "ls-gpx");
    const reverseBtn = gpx ? `<button type="button" class="ls-reverse" aria-pressed="false" title="Reverse the route direction — and download the GPX the other way round">⇄ Reverse</button>` : "";
    detail.innerHTML = `<td colspan="6"><div class="ls-detail-inner">${gpx ? `<div class="ls-gpx-row">${gpx}${reverseBtn}</div>` : ""}<div class="ls-map"></div><div class="ls-elev jr-elev"></div></div></td>`;
    tr.after(detail);
    lineRouteMap(detail.querySelector(".ls-map"), tr.dataset.line, tr);
  }
  // Update / restore a line row's Length·Stops·Run·Cycle·Walk cells so they reflect
  // the route variant currently shown on its mini-map (stashing the line's overall
  // figures the first time, to put back when it collapses).
  function setRowStats(tr, km, stops) {
    if (!tr) return;
    const cells = tr.querySelectorAll("td");
    if (cells.length < 6) return;
    if (!tr._origStats) tr._origStats = [1, 2, 3, 4, 5].map((i) => cells[i].textContent);
    cells[1].textContent = fmtKm(km, 1);
    cells[2].textContent = stops;
    cells[3].textContent = fmtTime(km * 6.5);
    cells[4].textContent = fmtTime(km * CYCLE_MIN_PER_KM);
    cells[5].textContent = fmtTime(km * WALK_MIN_PER_KM);
  }
  function restoreRowStats(tr) {
    if (!tr || !tr._origStats) return;
    const cells = tr.querySelectorAll("td");
    [1, 2, 3, 4, 5].forEach((i, k) => { if (cells[i]) cells[i].textContent = tr._origStats[k]; });
    tr._origStats = null;
  }
  async function lineRouteMap(mapDiv, name, tr) {
    if (!mapDiv) return;
    if (typeof L === "undefined") { mapDiv.innerHTML = '<p class="diagram-empty">The map couldn\'t load.</p>'; return; }
    const net = await loadNetwork();
    const id = Object.keys(net).find((k) => net[k].name === name);
    if (!id) { mapDiv.innerHTML = '<p class="diagram-empty">No route mapped for this line yet.</p>'; return; }
    if (!mapDiv.isConnected) return; // collapsed again before the network finished loading
    // Lines with multiple paths get a dropdown — the default route plus every
    // variant both ways; picking one redraws the map and updates the row's figures.
    const options = buildVariantOptions(net, id);
    const detailInner = mapDiv.parentNode;
    const reverseBtn = detailInner.querySelector(".ls-reverse");
    const gpxLink = detailInner.querySelector(".ls-gpx");
    let reversed = false, curIdx = 0, gpxText = null, revUrl = null, drawSeq = 0;
    if (options) {
      const sel = document.createElement("select");
      sel.className = "ls-variant";
      sel.setAttribute("aria-label", "Choose a route and direction for the " + name + " line");
      sel.innerHTML = groupedOptionsHtml(options, (o) => o.pair, 0);
      sel.addEventListener("change", () => { setReversed(false); drawVariant(+sel.value); syncGpxDir(); });
      mapDiv.parentNode.insertBefore(sel, mapDiv);
    }
    const map = createSiteMap(mapDiv);
    lsMap = map;
    let routeGrp = null;
    // Keep the GPX download in step with the shown direction: forward is the
    // static file; reversed is a client-built blob of the same file flipped.
    async function syncGpxDir() {
      if (!gpxLink) return;
      const slug = lineSlug(name);
      if (!reversed) {
        if (revUrl) { URL.revokeObjectURL(revUrl); revUrl = null; }
        gpxLink.href = `routes/${slug}.gpx`;
        gpxLink.setAttribute("download", `TubeRun-${slug}.gpx`);
        return;
      }
      if (gpxText === null) { try { gpxText = await (await fetch(`routes/${slug}.gpx`)).text(); } catch (_) { gpxText = ""; } }
      if (!gpxText) return;
      if (revUrl) URL.revokeObjectURL(revUrl);
      revUrl = URL.createObjectURL(new Blob([reverseGpxText(gpxText)], { type: "application/gpx+xml" }));
      gpxLink.href = revUrl;
      gpxLink.setAttribute("download", `TubeRun-${slug}-reverse.gpx`);
    }
    function setReversed(v) {
      reversed = v;
      if (reverseBtn) { reverseBtn.setAttribute("aria-pressed", String(reversed)); reverseBtn.classList.toggle("on", reversed); }
    }
    async function drawVariant(idx) {
      const my = ++drawSeq;
      curIdx = idx;
      if (routeGrp) { routeGrp.remove(); routeGrp = null; }
      const opt = options ? options[idx] : null;
      const dOpts = opt && !opt.gpx ? { waypoints: opt.wp } : {};
      if (reversed) dOpts.reverse = true;
      const r = await drawRunRoute(map, net, id, dOpts);
      if (my !== drawSeq || lsMap !== map) return; // a newer draw (variant change / reverse) superseded this one
      routeGrp = r && r.group;
      if (r && r.latlngs.length) map.fitBounds(L.latLngBounds(r.latlngs), { padding: [18, 18] });
      if (opt && opt.wp) setRowStats(tr, waypointsKm(opt.wp) * ROAD_FACTOR, opt.wp.length); // reflect the route in the row
      const elBox = detailInner.querySelector(".ls-elev");
      if (elBox && r && r.latlngs) {
        elBox.innerHTML = `<p class="ls-elev-load">Reading elevation…</p>`;
        const elev = await routeElevation(r.latlngs);
        if (my === drawSeq && lsMap === map && elBox.isConnected) elBox.innerHTML = elev ? elevationHtml(elev) : "";
      }
    }
    if (reverseBtn) reverseBtn.addEventListener("click", () => { setReversed(!reversed); drawVariant(curIdx); syncGpxDir(); });
    await drawVariant(0);
    setTimeout(() => { if (lsMap === map) map.invalidateSize(); }, 60);
  }

  // --- Render: Line collector (two directions per line, saved per-visitor) --
  const LC_KEY = "tuberun_collector";
  function loadCollector() { return loadSet(LC_KEY); }
  function saveCollector(set) { saveSet(LC_KEY, set); }
  let collectorDone = loadCollector();
  // Line length (km) for collector distance totals.
  const LINE_KM = {};
  LINE_STATS.forEach(([nm, km]) => { LINE_KM[nm] = km; });

  // Collectible achievement badges. Each test() runs against the collector context
  // { count, km, linesAny, linesBoth, both(name) } so they light up as you tick lines.
  const BADGES = [
    { icon: "🚇", name: "First Steps", desc: "Your first line direction", test: (c) => c.count >= 1 },
    { icon: "🎫", name: "Day Tripper", desc: "Run three different lines", test: (c) => c.linesAny >= 3 },
    { icon: "🖐", name: "High Five", desc: "Five directions collected", test: (c) => c.count >= 5 },
    { icon: "🔄", name: "There & Back", desc: "Any line, both ways", test: (c) => c.linesBoth >= 1 },
    { icon: "🌗", name: "Round-Trip Regular", desc: "Five lines both ways", test: (c) => c.linesBoth >= 5 },
    { icon: "🏃", name: "Halfway There", desc: "Eighteen directions — half the network", test: (c) => c.count >= 18 },
    { icon: "🏅", name: "Marathon Distance", desc: "Collect 42.2 km", test: (c) => c.km >= 42.195 },
    { icon: "💯", name: "Century Club", desc: "Collect 100 km", test: (c) => c.km >= 100 },
    { icon: "🗺", name: "Double Century", desc: "Collect 250 km", test: (c) => c.km >= 250 },
    { icon: "💚", name: "Waterloo & City Whiz", desc: "The shortest line, both ways", test: (c) => c.both("Waterloo & City") },
    { icon: "🔴", name: "Central Champion", desc: "The longest line, both ways", test: (c) => c.both("Central") },
    { icon: "🟡", name: "Full Circle", desc: "The Circle line, both ways", test: (c) => c.both("Circle") },
    { icon: "🟤", name: "Bakerloo Boss", desc: "The Bakerloo line, both ways", test: (c) => c.both("Bakerloo") },
    { icon: "🟢", name: "District Distance", desc: "The District line, both ways", test: (c) => c.both("District") },
    { icon: "🩷", name: "Hammersmith Hero", desc: "Hammersmith & City, both ways", test: (c) => c.both("Hammersmith & City") },
    { icon: "⚪", name: "Jubilee Jumper", desc: "The Jubilee line, both ways", test: (c) => c.both("Jubilee") },
    { icon: "🟣", name: "Metropolitan Master", desc: "The Metropolitan line, both ways", test: (c) => c.both("Metropolitan") },
    { icon: "⚫", name: "Northern Soul", desc: "The Northern line, both ways", test: (c) => c.both("Northern") },
    { icon: "🔵", name: "Piccadilly Pro", desc: "The Piccadilly line, both ways", test: (c) => c.both("Piccadilly") },
    { icon: "💙", name: "Victoria Victor", desc: "The Victoria line, both ways", test: (c) => c.both("Victoria") },
    { icon: "👑", name: "Tube Run Royalty", desc: "Every line, both ways", test: (c) => c.linesBoth >= 18 },
  ];

  function renderLineCollector() {
    const el = document.getElementById("lineCollector");
    if (!el) return;
    const total = TUBE_LINES.length * 2;
    let n = 0, collectedKm = 0, linesAny = 0, linesBoth = 0;

    const rows = TUBE_LINES.map((name) => {
      const c = LINE_COLOURS[name] || "#0019A8";
      const dirs = LINE_DIRS[name] || ["→ one way", "→ the other"];
      const lineKm = LINE_KM[name] || 0;
      let doneHere = 0;
      const chips = dirs.map((label, i) => {
        const keyId = `${name}|${i}`;
        const isDone = collectorDone.has(keyId);
        if (isDone) { n++; doneHere++; collectedKm += lineKm; }
        const style = isDone
          ? `background:${c};color:${contrastText(c)};border-color:${c}`
          : `color:#2b3140;border-color:${lineTextColour(c)}`;
        return `<button type="button" class="lc-dir${isDone ? " done" : ""}" data-key="${escapeHtml(keyId)}" aria-pressed="${isDone}" style="${style}">${isDone ? "✓ " : ""}${escapeHtml(label)}</button>`;
      }).join("");
      if (doneHere >= 1) linesAny++;
      if (doneHere >= 2) linesBoth++;
      return `<div class="lc-row">
        <span class="lc-name" style="border-color:${c}"><i style="background:${c}"></i>${escapeHtml(name)}<span class="lc-km">${fmtKm(lineKm, 1)} each way</span></span>
        <span class="lc-dirs">${chips}</span>
      </div>`;
    }).join("");

    const ctx = {
      count: n, km: collectedKm, linesAny, linesBoth,
      both: (nm) => collectorDone.has(`${nm}|0`) && collectorDone.has(`${nm}|1`),
    };
    const gotBadges = BADGES.filter((b) => b.test(ctx)).length;
    const pct = Math.round((n / total) * 100);
    const done = n === total;
    el.innerHTML = `
      <div class="lc-head">
        <span class="lc-count">${n} / ${total} directions run${done ? " · the whole network! 🎉" : ""}</span>
        <div class="lc-bar"><div class="lc-fill" style="width:${pct}%"></div></div>
        ${n ? `<button type="button" class="lc-reset" id="lcReset">Reset</button>` : ""}
      </div>
      <p class="lc-hint"><strong>Tap a direction to tick off a line you've run</strong> — each counts twice, one each way. Your tally is saved in this browser. ${TUBE_LINES.length} lines, ${total} runs to collect them all.</p>
      <div class="lc-dist"><span class="lc-dist-big">${fmtKm(collectedKm, 1)}</span> collected so far <small>across ${n} direction${n === 1 ? "" : "s"}</small></div>
      <div class="lc-rows">${rows}</div>
      ${badgesHeadHtml("Badges", `${gotBadges} / ${BADGES.length} earned`)}
      <p class="lc-hint">Collect lines to unlock badges — from your first direction to the whole network, both ways.</p>
      <div class="lc-badges">${badgeCardsHtml(BADGES, ctx)}</div>`;

    el.querySelectorAll(".lc-dir").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.key;
      if (collectorDone.has(k)) collectorDone.delete(k); else collectorDone.add(k);
      saveCollector(collectorDone);
      renderLineCollector();
    }));
    const reset = document.getElementById("lcReset");
    if (reset) reset.addEventListener("click", () => { collectorDone = new Set(); saveCollector(collectorDone); renderLineCollector(); });
  }

  // --- Render: Gallery ---------------------------------------------------
  // Photos are curated in data/gallery.json (array of {src, caption}); drop
  // images in img/gallery/ and list them there — no code changes needed.
  function galleryPlaceholder(el) {
    const tints = ["Victoria", "Central", "Piccadilly", "Northern", "Jubilee", "Bakerloo"];
    el.innerHTML = tints.map((n) =>
      `<div class="gal-item gal-empty" style="--t:${LINE_COLOURS[n]}"><span>Your photos here</span></div>`).join("") +
      (CONNECT.instagram ? `<a class="gal-cta" href="${escapeAttr(CONNECT.instagram)}" target="_blank" rel="noopener">Tag <strong>#TubeRun</strong> on Instagram →</a>` : "");
  }
  async function renderGallery() {
    const el = document.getElementById("galleryGrid");
    if (!el) return;
    let items = GALLERY;
    try {
      const res = await fetch("data/gallery.json", { cache: "no-cache" });
      if (res.ok) { const j = await res.json(); if (Array.isArray(j)) items = j; }
    } catch (_) { /* fall back to placeholder below */ }
    // Only same-site relative image paths — gallery.json shouldn't be able to point elsewhere.
    items = (items || []).filter((g) => g && typeof g.src === "string" && /^img\//.test(g.src));
    if (!items.length) { galleryPlaceholder(el); return; }
    el.innerHTML = items.map((g) => `<figure class="gal-item">
        <img src="${attrVal(g.src)}" alt="${escapeHtml(g.caption || "")}" loading="lazy" />
        ${g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ""}</figure>`).join("");
    // A broken/missing image removes just its tile; if none survive, show the placeholder.
    el.querySelectorAll(".gal-item img").forEach((img) => img.addEventListener("error", () => {
      const fig = img.closest(".gal-item");
      if (fig) fig.remove();
      if (!el.querySelector(".gal-item")) galleryPlaceholder(el);
    }));
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
  function geoDistStr(km) { return fmtKm(km, 1); } // follows the site-wide unit toggle
  // Compass bearing (deg, 0 = north) from waypoint a to b — for direction arrows.
  function bearingDeg(a, b) {
    const lat1 = a[1] * Math.PI / 180, lat2 = b[1] * Math.PI / 180, dLon = (b[2] - a[2]) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  // Clock time = base (HH:MM, default MEET_TIME) + mins; ±5-min window brackets the arrival.
  function clockAdd(base, mins) {
    const [h, m] = (base || MEET_TIME).split(":").map(Number);
    let t = (h * 60 + m + Math.round(mins)) % 1440; if (t < 0) t += 1440;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }
  function arrivalWindow(mins, base) { return `${clockAdd(base, mins - 5)}–${clockAdd(base, mins + 5)}`; }
  // Parse a start blurb like "Chesham Underground Station, 9:18am" into "09:18".
  function parseClock(s) {
    const m = (s || "").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!m) return MEET_TIME;
    let h = +m[1]; const mm = m[2] ? +m[2] : 0, ap = m[3].toLowerCase();
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  function defaultZoom(kind) { return kind === "geo" ? 1.4 : kind === "data" ? 1 : 1.6; }
  let netPromise = null; // memoise the in-flight fetch so parallel callers share one request
  function loadNetwork() {
    if (!netPromise) {
      netPromise = (async () => {
        const [nRes, tRes] = await Promise.all([fetch("data/tube-network.json"), fetch("data/station-toilets.json")]);
        if (!nRes.ok) throw new Error("network data");
        netData = await nRes.json();
        // Zero-trust: line colours end up in inline styles and SVG attributes,
        // and lineTextColour assumes 6-digit hex, so only that form passes.
        for (const id in netData) {
          if (!/^#[0-9a-fA-F]{6}$/.test(netData[id].colour)) netData[id].colour = "#0019a8";
        }
        toiletSet = new Set(tRes.ok ? await tRes.json() : []);
        return netData;
      })();
      netPromise.catch(() => { netPromise = null; }); // allow a retry after a transient failure
    }
    return netPromise;
  }
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  function renderTubeMap() {
    const root = document.getElementById("tubeMap");
    if (!root) return;
    root.innerHTML = `
      <div class="tm-tabs" role="tablist" aria-label="Map views">${MAPS.map((m) =>
        `<button type="button" role="tab" id="tmtab-${m.key}" aria-controls="tmHolder" aria-selected="${m.key === curMap ? "true" : "false"}" class="tm-tab${m.key === curMap ? " on" : ""}" data-map="${m.key}">${escapeHtml(m.label)}</button>`).join("")}</div>
      <div class="tm-bar">
        <p class="tm-caption" id="tmCaption"></p>
        <div class="tm-zoom">
          <button type="button" class="tm-zbtn" data-z="out" aria-label="Zoom out">&minus;</button>
          <button type="button" class="tm-zbtn" data-z="reset">Reset</button>
          <button type="button" class="tm-zbtn" data-z="in" aria-label="Zoom in">+</button>
        </div>
      </div>
      <div class="tm-scroll" id="tmHolder" role="tabpanel" aria-live="polite" tabindex="0"><p class="tm-loading">Loading the map…</p></div>
      <p class="tm-scrollhint">Drag to pan · ⌘/Ctrl + scroll to zoom to the cursor · or use +/&minus;.</p>`;
    root.querySelectorAll(".tm-tab").forEach((b) => b.addEventListener("click", () => {
      curMap = b.dataset.map;
      curZoom = curMap === "walking" ? wtSavedZoom() : defaultZoom(curMapKind());
      root.querySelectorAll(".tm-tab").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", on ? "true" : "false"); });
      loadMap();
    }));
    root.querySelectorAll(".tm-zbtn").forEach((b) => b.addEventListener("click", () => {
      const z = b.dataset.z;
      curZoom = z === "in" ? Math.min(5, curZoom + 0.3) : z === "out" ? Math.max(0.8, curZoom - 0.3) : defaultZoom(curMapKind());
      wtSaveZoom();
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
      wtSaveZoom();
      applyZoom();
      const scale = curZoom / before;
      holder.scrollLeft = px * scale - ox;
      holder.scrollTop = py * scale - oy;
    }, { passive: false });
    // Defer the first map build until the section nears the viewport — the geo
    // map pulls ~1 MB of geojson + GPX and sits below the fold. Tab clicks and
    // refreshes still call loadMap() directly.
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) { obs.disconnect(); loadMap(); }
      }, { rootMargin: "300px" });
      io.observe(root);
    } else {
      loadMap();
    }
  }

  let mapSeq = 0; // invalidates in-flight async renders when the user switches tabs mid-load
  async function loadMap() {
    const seq = ++mapSeq;
    const stale = () => seq !== mapSeq;
    const holder = document.getElementById("tmHolder");
    const cap = document.getElementById("tmCaption");
    const zoom = document.querySelector(".tm-zoom");
    const cfg = MAPS.find((m) => m.key === curMap);
    if (cfg.kind !== "geo") { document.body.classList.remove("tm-map-active"); if (tmMap.map) { tmMap.map.remove(); tmMap.map = null; } }
    const active = cfg.highlight && nextRun && LINE_FILL[nextRun.key] ? nextRun.key : null;
    const CAPTIONS = {
      geo: `Our own live map, built from open TfL data — zoom, drag and tap a station.`,
      standard: active ? `<strong style="color:${lineTextColour(LINE_COLOURS[active])}">${escapeHtml(active)} line</strong> highlighted for the next run — zoom in to trace it.` : `The official London Underground map.`,
      running: `Estimated running time to each stop on the next run's line.`,
      walking: `Minutes between stations on the official walking map — flip to Run and every number becomes a running time at your pace.`,
      toilets: `Stations with toilets — plan your pit stops.`,
      overground: `The London Overground network — great for orbital, out-of-centre routes.`,
      connections: `The geographic rail-connections map — every line where it really runs.`,
    };
    if (cap) cap.innerHTML = CAPTIONS[cfg.key] || "";
    if (zoom) zoom.style.visibility = cfg.kind === "data" ? "hidden" : "visible";
    holder.style.cursor = cfg.kind === "data" ? "auto" : "grab";
    holder.innerHTML = `<p class="tm-loading">Loading…</p>`;

    // Our own data-driven geographic map.
    if (cfg.kind === "geo") { renderGeoMap(holder, cap, stale).catch(() => { if (!stale()) holder.innerHTML = `<p class="diagram-empty">Couldn't build the map right now.</p>`; }); return; }

    // Data view: a computed per-station running-time table (no image).
    if (cfg.kind === "data") { renderRunningTimes(holder); return; }

    // Non-highlight maps render as a plain <img> — the browser's native SVG/PNG
    // renderer handles the whole document reliably (inline injection mis-renders
    // huge SVGs). draggable=false so our drag-to-pan isn't hijacked.
    if (cfg.kind === "img") {
      if (cfg.key === "walking" && cap) walkControls(cap);
      const img = document.createElement("img");
      img.className = "tm-svg";
      img.draggable = false;
      img.alt = cfg.label + " map";
      img.addEventListener("load", () => {
        if (stale()) return;
        applyZoom();
        if (cfg.key === "walking") buildWalkOverlay(holder, img, stale);
        requestAnimationFrame(() => centreContent(holder));
      });
      img.addEventListener("error", () => { if (!stale()) holder.innerHTML = `<p class="diagram-empty">Couldn't load the map right now.</p>`; });
      holder.innerHTML = "";
      holder.appendChild(img);
      img.src = cfg.file;
      return;
    }

    try {
      let txt = svgCache[cfg.key];
      if (!txt) { const res = await fetch(cfg.file); if (!res.ok) throw new Error("fetch"); txt = await res.text(); svgCache[cfg.key] = txt; }
      if (stale()) return;
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
      if (!stale()) holder.innerHTML = `<p class="diagram-empty">Couldn't load the map right now.</p>`;
    }
  }

  function centreContent(holder) {
    holder.scrollLeft = (holder.scrollWidth - holder.clientWidth) / 2;
    holder.scrollTop = (holder.scrollHeight - holder.clientHeight) / 2;
  }

  function applyZoom() {
    // The walking map's overlay wrapper takes the zoom width so the marker
    // layer scales with the image; other maps size the svg/img directly.
    const node = document.querySelector("#tmHolder .wt-wrap, #tmHolder svg, #tmHolder img");
    if (node) node.style.width = (curZoom * 100) + "%";
  }

  function curMapKind() { return (MAPS.find((m) => m.key === curMap) || {}).kind; }

  // --- Walking map: live walk/run minute overlay --------------------------
  // data/walk-times.json holds the printed walking-minute numbers OCR'd off
  // the TfL map with their positions (% of the image). In Run mode each one
  // is covered and re-rendered as a running time at the chosen pace.
  let wtMode = (() => { try { return localStorage.getItem("tuberun_walkmode") === "run" ? "run" : "walk"; } catch (_) { return "walk"; } })();
  let wtData = null;
  function wtSavedZoom() { try { const z = parseFloat(localStorage.getItem("tuberun_tmzoom")); return z >= 0.5 && z <= 6 ? z : defaultZoom("img"); } catch (_) { return defaultZoom("img"); } }
  function wtSaveZoom() { if (curMap !== "walking") return; try { localStorage.setItem("tuberun_tmzoom", String(curZoom)); } catch (_) { /* private mode */ } }
  async function loadWalkTimes() {
    if (wtData) return wtData;
    const res = await fetch("data/walk-times.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("walk times");
    const raw = await res.json();
    // Zero-trust: coerce every numeric field and drop malformed markers, so
    // nothing but real numbers ever reaches the overlay's HTML template.
    const pct = (v) => Number.isFinite(v) && v >= 0 && v <= 100;
    const num = (v, dflt) => (Number.isFinite(+v) && +v > 0 ? +v : dflt);
    const markers = (Array.isArray(raw && raw.markers) ? raw.markers : [])
      .map((m) => ({ walk: +m.walk, x: +m.x, y: +m.y, width: +m.width, height: +m.height }))
      .filter((m) => Number.isFinite(m.walk) && m.walk > 0 && pct(m.x) && pct(m.y) && pct(m.width) && pct(m.height));
    wtData = {
      markers,
      imageWidth: num(raw && raw.imageWidth, 2351),
      imageHeight: num(raw && raw.imageHeight, 2029),
      walkingPaceSecondsPerKm: num(raw && raw.walkingPaceSecondsPerKm, 720),
    };
    return wtData;
  }
  function wtRunMinutes(walkMin) {
    const walkingPaceSecondsPerKm = (wtData && wtData.walkingPaceSecondsPerKm) || 720; // 12:00/km
    const runPaceSecondsPerKm = rtPace * 60;
    const distanceKm = (walkMin * 60) / walkingPaceSecondsPerKm;
    return Math.max(1, Math.round((distanceKm * runPaceSecondsPerKm) / 60));
  }
  function wtApply() {
    // Walk mode shows the untouched printed map; Run mode covers each verified
    // number and renders the equivalent running time in its place.
    const layer = document.querySelector(".wt-layer");
    if (layer) layer.style.display = wtMode === "run" ? "" : "none";
    if (wtMode !== "run") return;
    document.querySelectorAll(".wt-mark").forEach((el) => {
      el.textContent = wtRunMinutes(+el.dataset.walk);
    });
  }
  async function buildWalkOverlay(holder, img, stale) {
    try { await loadWalkTimes(); } catch (_) { return; } // no data — plain map still shows
    if (!wtData || !Array.isArray(wtData.markers)) return; // malformed file — plain map still shows
    if (stale() || !img.isConnected) return;
    const wrap = document.createElement("div");
    wrap.className = "wt-wrap";
    img.replaceWith(wrap);
    wrap.appendChild(img);
    const layer = document.createElement("div");
    layer.className = "wt-layer";
    // Height % → cqw needs the map image's aspect ratio, carried in the data file.
    const aspect = wtData.imageWidth && wtData.imageHeight ? wtData.imageHeight / wtData.imageWidth : 2029 / 2351;
    // Pad each box slightly so the white cover fully hides the printed digit;
    // font sizes use container-query units so text scales with the zoom.
    layer.innerHTML = wtData.markers.map((m) =>
      `<span class="wt-mark" data-walk="${m.walk}" style="left:${(m.x - m.width * 0.3).toFixed(3)}%;top:${(m.y - m.height * 0.25).toFixed(3)}%;width:${(m.width * 1.6).toFixed(3)}%;height:${(m.height * 1.5).toFixed(3)}%;font-size:${(m.height * 1.05 * aspect).toFixed(3)}cqw">${m.walk}</span>`).join("");
    wrap.appendChild(layer);
    applyZoom();
    wtApply();
  }
  function walkControls(cap) {
    if (!cap) return;
    const box = document.createElement("span");
    box.className = "wt-controls geo-modes";
    box.innerHTML = ` Show: <button type="button" class="geo-mode" data-wtm="walk">🚶 Walk</button><button type="button" class="geo-mode" data-wtm="run">🏃 Run</button>
      <label class="wt-pace"><input type="range" min="4" max="9" step="0.25" value="${rtPace}" aria-label="Running pace, minutes per kilometre" /><b class="wt-pace-lbl">${rtPaceLabel()}</b></label>`;
    cap.appendChild(box);
    const syncBtns = () => box.querySelectorAll("[data-wtm]").forEach((b) => b.classList.toggle("on", b.dataset.wtm === wtMode));
    const paceLbl = box.querySelector(".wt-pace-lbl");
    const paceWrap = box.querySelector(".wt-pace");
    // Keep the pace control visible in Walk mode (just inert) so it's discoverable.
    const syncPaceVis = () => {
      paceWrap.classList.toggle("off", wtMode !== "run");
      paceWrap.querySelector("input").disabled = wtMode !== "run";
    };
    syncBtns(); syncPaceVis();
    box.querySelectorAll("[data-wtm]").forEach((b) => b.addEventListener("click", () => {
      wtMode = b.dataset.wtm;
      try { localStorage.setItem("tuberun_walkmode", wtMode); } catch (_) { /* private mode */ }
      syncBtns(); syncPaceVis(); wtApply();
    }));
    const slider = box.querySelector("input[type=range]");
    slider.addEventListener("input", () => {
      paceLbl.textContent = setRtPace(slider.value);
      wtApply();
    });
  }

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
  // Real pavement run route for a line, from the generated routes/<slug>.gpx
  // (built offline by tools/generate-routes.mjs — foot-routed on OpenStreetMap).
  // Same-origin fetch, cached per slug; returns an array of track segments
  // ([[[lat, lon], …], …], the main route first, then each branch) or null.
  const routeGpxCache = {};
  async function loadRouteGpx(slug) {
    if (!slug) return null;
    if (routeGpxCache[slug] !== undefined) return routeGpxCache[slug];
    try {
      const res = await fetch(`routes/${slug}.gpx`);
      if (!res.ok) throw new Error("gpx " + res.status);
      const doc = new DOMParser().parseFromString(await res.text(), "application/xml");
      const segs = [...doc.getElementsByTagName("trkseg")]
        .map((seg) => [...seg.getElementsByTagName("trkpt")].map((t) => {
          const ele = t.getElementsByTagName("ele")[0];
          return [+t.getAttribute("lat"), +t.getAttribute("lon"), ele ? +ele.textContent : undefined];
        }))
        .filter((s) => s.length > 1);
      routeGpxCache[slug] = segs.length ? segs : null;
    } catch (_) { routeGpxCache[slug] = null; }
    return routeGpxCache[slug];
  }

  // Draw a line's run route onto a Leaflet map: a soft base + animated flow line,
  // start/finish markers and direction-of-travel arrows. Prefers the real pavement
  // route (routes/<id>.gpx), falling back to straight station hops. Returns the
  // drawn latlngs (for fitBounds), or null if the line has no usable route.
  async function drawRunRoute(map, net, id, opts = {}) {
    const line = net[id];
    if (!line) return null;
    let wp = opts.waypoints || rtStations(net, line.name);
    if (!wp || wp.length < 2) return null;
    if (opts.reverse) wp = [...wp].reverse(); // draw the route the other way (swaps start/finish, flips arrows)
    const wl = wp.map((s) => [s[1], s[2]]);
    // Explicit variant waypoints draw as station-to-station hops; the default
    // whole-line route prefers the real pavement GPX (track 0, the main route).
    const gpxSegs = opts.waypoints ? null : await loadRouteGpx(id);
    if (opts.stale && opts.stale()) return null;
    const gpxLine = gpxSegs && gpxSegs[0];
    let routeLine = gpxLine && gpxLine.length > 1 ? gpxLine : wl;
    if (opts.reverse && routeLine === gpxLine) routeLine = [...gpxLine].reverse();
    const grp = L.layerGroup().addTo(map);
    addFlowLine(grp, routeLine, line.colour);
    L.circleMarker(wl[0], { radius: 6, color: "#fff", weight: 2, fillColor: line.colour, fillOpacity: 1 })
      .bindTooltip("Start · " + escapeHtml(wp[0][0]), { direction: "top" }).addTo(grp);
    L.marker(wl[wl.length - 1], { icon: L.divIcon({ className: "route-finish", html: "◉", iconSize: [15, 15], iconAnchor: [7, 7] }) })
      .bindTooltip("Finish · " + escapeHtml(wp[wp.length - 1][0]), { direction: "top" }).addTo(grp);
    // Direction-of-travel arrows spaced along the route (point start → finish).
    const step = Math.max(1, Math.floor(wp.length / 9));
    for (let i = step; i < wp.length - 1; i += step) {
      const deg = bearingDeg(wp[i], wp[i + 1]);
      L.marker(wl[i], { interactive: false, keyboard: false, icon: L.divIcon({
        className: "route-arrow",
        html: `<span style="transform:rotate(${Math.round(deg - 90)}deg);color:${line.colour}">➤</span>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
      }) }).addTo(grp);
    }
    return { group: grp, latlngs: routeLine };
  }
  const tmMap = { map: null };
  let geoRefresh = null; // set by renderGeoMap; re-draws station labels (e.g. after a unit switch)
  let journeyRefresh = null; // set by setupJourneyPlanner; re-renders the A→B result at the new unit

  // Shared openly-licensed basemap (CARTO Voyager, no key) for our Leaflet maps.
  function cartoBasemap() {
    return L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd", maxZoom: 20,
    });
  }

  // Ordnance Survey "Road" raster tiles — an A-Z-style British street atlas.
  // Free on the OS OpenData plan to zoom 16 (upscaled beyond via maxNativeZoom).
  // The key rides in the tile URL (unavoidable for a static site); it's the free
  // OpenData plan so it can't incur cost, and it's restricted to our domain at OS.
  const OS_KEY = "okbMrQnWH0qLZbLKEw29GCtB6ulDR9Tt";
  function osRoadBasemap() {
    return L.tileLayer("https://api.os.uk/maps/raster/v1/zxy/Road_3857/{z}/{x}/{y}.png?key=" + OS_KEY, {
      attribution: 'Contains OS data &copy; Crown copyright and database right 2026',
      maxZoom: 20, maxNativeZoom: 16,
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

  // Recompute size the first time a map scrolls into view (mobile can init it hidden/mis-sized).
  function observeMapSize(map) {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) map.invalidateSize(false);
    }, { threshold: 0.05 });
    io.observe(map.getContainer());
    map.on("unload", () => io.disconnect());
  }
  // Expand a map to full screen via the native Fullscreen API. Adds a top-right
  // button and keeps Leaflet correctly sized as fullscreen enters/exits.
  function addFullscreenControl(map) {
    const container = map.getContainer();
    const reqFs = container.requestFullscreen || container.webkitRequestFullscreen;
    const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
    if (!reqFs || !exitFs) return; // unsupported browser — skip silently
    const isFs = () => (document.fullscreenElement || document.webkitFullscreenElement) === container;
    const ctl = L.control({ position: "topright" });
    ctl.onAdd = () => {
      const a = L.DomUtil.create("a", "leaflet-bar map-expand");
      a.href = "#";
      a.title = "Expand map to full screen";
      a.setAttribute("role", "button");
      a.setAttribute("aria-label", "Expand map to full screen");
      a.innerHTML = "⤢";
      L.DomEvent.on(a, "click", L.DomEvent.stop);
      L.DomEvent.on(a, "click", () => { if (isFs()) exitFs.call(document); else reqFs.call(container); });
      map._fsBtn = a;
      return a;
    };
    ctl.addTo(map);
    const onChange = () => {
      // The geo map is destroyed and rebuilt on tab switches — drop this
      // listener once its container leaves the DOM instead of leaking one per rebuild.
      if (!document.body.contains(container)) {
        document.removeEventListener("fullscreenchange", onChange);
        document.removeEventListener("webkitfullscreenchange", onChange);
        return;
      }
      const fs = isFs();
      if (map._fsBtn) {
        map._fsBtn.innerHTML = fs ? "✕" : "⤢";
        map._fsBtn.title = fs ? "Exit full screen" : "Expand map to full screen";
      }
      setTimeout(() => map.invalidateSize(false), 80);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
  }

  // Small persistent hint on the geo map so mouse users know how to zoom.
  function addZoomHint(map) {
    const c = L.control({ position: "bottomleft" });
    c.onAdd = () => { const d = L.DomUtil.create("div", "tm-map-hint"); d.textContent = "⌘/Ctrl + scroll to zoom · drag to pan"; return d; };
    c.addTo(map);
  }

  // Shared Leaflet bootstrap for our interactive maps: London-centred map with
  // the CARTO basemap, modifier-wheel zoom, size observer and fullscreen
  // control (plus an optional zoom hint for the geo map).
  function createSiteMap(el, opts = {}) {
    const map = L.map(el, { center: [51.509, -0.115], zoom: 11, preferCanvas: true, zoomSnap: 0 });
    const bases = { "Voyager": cartoBasemap(), "Street atlas": osRoadBasemap() };
    bases["Street atlas"].addTo(map); // OS A-Z-style street atlas is the default; toggle to Voyager for the soft view
    L.control.layers(bases, null, { collapsed: true }).addTo(map);
    modifierWheelZoom(map);
    observeMapSize(map);
    if (opts.zoomHint) addZoomHint(map);
    addFullscreenControl(map);
    return map;
  }

  // A dropdown control (top-left) to choose which route is highlighted on the
  // geographic map. Entries come from mapRouteEntries() and are grouped by line
  // into <optgroup>s; selectedIdx is pre-selected.
  function addMapVariantControl(map, entries, selectedIdx, onChange) {
    const ctl = L.control({ position: "topleft" });
    ctl.onAdd = () => {
      const div = L.DomUtil.create("div", "leaflet-bar geo-variant");
      const row = L.DomUtil.create("div", "geo-variant-row", div);
      const sel = L.DomUtil.create("select", "", row);
      sel.setAttribute("aria-label", "Choose which route to show on the map");
      sel.innerHTML = groupedOptionsHtml(entries, (e) => e.group, selectedIdx);
      // GPX download for the selected line, kept in sync as the choice changes.
      const gpx = L.DomUtil.create("a", "gpx-dl geo-gpx", row);
      gpx.textContent = "↓ GPX";
      // Distance / stops / running time of the selected route, under the picker.
      const stats = L.DomUtil.create("div", "geo-stats", div);
      const syncGpx = (i) => {
        const id = entries[i] && entries[i].id;
        if (id && GPX_LINES.has(id)) { gpx.href = `routes/${id}.gpx`; gpx.download = `TubeRun-${id}.gpx`; gpx.title = "Download this line's pavement route as a GPX file for your watch"; gpx.style.display = ""; }
        else { gpx.removeAttribute("href"); gpx.style.display = "none"; }
      };
      const syncStats = (i) => {
        const wp = entries[i] && entries[i].wp;
        if (!wp || wp.length < 2) { stats.style.display = "none"; return; }
        const km = waypointsKm(wp) * ROAD_FACTOR;
        stats.style.display = "";
        stats.textContent = `${geoDistStr(km)} · ${wp.length} stops · 🏃 ${fmtTime(km * rtPace)}`;
      };
      const sync = (i) => { syncGpx(i); syncStats(i); };
      sync(selectedIdx);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      L.DomEvent.on(sel, "change", () => { sync(+sel.value); onChange(+sel.value); });
      return div;
    };
    ctl.addTo(map);
  }

  // Friendly message in a map container when Leaflet itself failed to load.
  function mapUnavailable(el) {
    el.innerHTML = `<p class="diagram-empty">The map library couldn't load — check your connection.</p>`;
  }

  // Cumulative running distance (km) to each stop along the highlighted line's longest branch.
  function tmComputeKm(net, hi) {
    const out = {};
    if (!hi || !net[hi]) return out;
    const line = net[hi];
    // Prefer the actual run's ordered waypoints so times accumulate from the real start
    // (e.g. Chesham → Aldgate), not from the arbitrary first stop of the line's longest branch.
    const wp = nextRun && norm(nextRun.key) === norm(line.name) ? WAYPOINTS[nextRun.key] : null;
    if (wp && wp.length) {
      const idByName = {};
      for (const sid in line.stations) idByName[norm(line.stations[sid].n)] = sid;
      let cum = 0;
      for (let i = 0; i < wp.length; i++) {
        if (i > 0) cum += haversineKm([0, wp[i - 1][1], wp[i - 1][2]], [0, wp[i][1], wp[i][2]]) * ROAD_FACTOR;
        const sid = idByName[norm(wp[i][0])];
        if (sid !== undefined) out[sid] = cum;
      }
      return out;
    }
    // Like rtStations: prefer the line's stitched end-to-end route when the
    // data provides one, otherwise fall back to its longest branch.
    const br = line.route && line.route.length
      ? line.route
      : line.branches.reduce((a, b) => (b.length > a.length ? b : a), line.branches[0] || []);
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
      ? `<strong style="color:${lineTextColour(net[hi].colour)}">${escapeHtml(net[hi].name)} line</strong> lit up for the next run — arrows show the direction of travel, with running time, distance and the group's expected arrival window (from a ${MEET_TIME} start) at each stop. `
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
  async function renderGeoMap(holder, cap, stale) {
    if (typeof L === "undefined") { mapUnavailable(holder); return; }
    const [net, geo] = await Promise.all([loadNetwork(), loadLines()]);
    if (stale && stale()) return; // user switched tabs while the data was in flight
    const hi = geoHighlightId(net);
    document.body.classList.add("tm-map-active");
    holder.innerHTML = `<div id="tmMap"></div>`;
    if (tmMap.map) { tmMap.map.remove(); tmMap.map = null; }
    const map = createSiteMap("tmMap", { zoomHint: true });
    tmMap.map = map;

    // Tube lines (real track geometry). Highlighted line bold & on top, others dimmed.
    const lineLayer = L.geoJSON(geo, { style: (f) => { const on = hi && f.properties.line === hi;
      return { color: f.properties.colour, weight: on ? 5 : 3, opacity: on ? 1 : (hi ? 0.3 : 0.9), lineJoin: "round", lineCap: "round" }; } }).addTo(map);
    lineLayer.eachLayer((l) => { if (hi && l.feature.properties.line === hi) l.bringToFront(); });

    // Route overlay + picker (top-left). The picker always lists this month's run
    // (when it's a Tube line) plus every branching line's routes grouped by line,
    // so any route can be explored on the map. drawMapRoute swaps the highlight:
    // a soft base + animated flow line with start/finish markers and arrows, and
    // brings the chosen line's track to the front.
    let hiRouteGrp = null;
    async function drawMapRoute(entry) {
      if (hiRouteGrp) { hiRouteGrp.remove(); hiRouteGrp = null; }
      const r = await drawRunRoute(map, net, entry.id, entry.gpx ? { stale } : { waypoints: entry.wp, stale });
      hiRouteGrp = r && r.group;
      lineLayer.eachLayer((l) => { if (l.feature.properties.line === entry.id) l.bringToFront(); });
    }
    const routeEntries = mapRouteEntries(net, hi);
    if (routeEntries.length) await drawMapRoute(routeEntries[0]);
    if (stale && stale()) return;
    if (routeEntries.length) addMapVariantControl(map, routeEntries, 0, (i) => drawMapRoute(routeEntries[i]));

    // Station lookup: dedup by id, count lines per station (interchange), colour.
    const count = {}, coordById = {}, colourById = {};
    for (const id in net) { const st = net[id].stations; for (const sid in st) { count[sid] = (count[sid] || 0) + 1;
      if (!coordById[sid]) { coordById[sid] = st[sid]; colourById[sid] = net[id].colour; } } }
    const km = tmComputeKm(net, hi);
    // Per-day ETA table so multi-day runs count each day's windows from that day's
    // own start clock (matching the journey board) instead of one 09:00 origin.
    const etaWp = hi && nextRun ? WAYPOINTS[nextRun.key] : null;
    const etaSegs = etaWp ? (journeySegments(nextRun, etaWp) || []).map((s) => ({
      fromKm: legDistanceKm(etaWp, 0, s.from), toKm: legDistanceKm(etaWp, 0, s.to), start: s.start,
    })) : [];
    function etaWindow(kmCum, perKm) {
      const seg = etaSegs.find((s) => kmCum <= s.toKm + 0.01) || etaSegs[etaSegs.length - 1];
      if (!seg) return arrivalWindow(kmCum * perKm);
      return arrivalWindow(Math.max(0, kmCum - seg.fromKm) * perKm, seg.start);
    }

    let stationGrp = null, toiletGrp = null;
    function draw() {
      if (stationGrp) map.removeLayer(stationGrp);
      if (toiletGrp) map.removeLayer(toiletGrp);
      const perKm = geoTimeMode === "walk" ? WALK_MIN_PER_KM : rtPace;
      const dense = map.getZoom() < 12; // thin the permanent labels when zoomed out to avoid overlap
      stationGrp = L.layerGroup();
      for (const sid in coordById) { const s = coordById[sid], inter = count[sid] > 1, onHi = km[sid] !== undefined, dim = hi && !onHi;
        const m = L.circleMarker([s.lat, s.lon], {
          radius: inter ? (onHi ? 6 : 4.5) : 3, weight: inter ? 1.5 : 1,
          color: inter ? "#111" : (dim ? "#9aa3ad" : colourById[sid]),
          fillColor: inter ? "#fff" : (dim ? "#c4ccd4" : colourById[sid]),
          fillOpacity: 1, opacity: dim ? 0.55 : 1,
        });
        const mins = km[sid] * perKm;
        if (onHi && (!dense || inter)) {
          const time = geoTimeMode !== "off" ? `<span>${fmtTime(mins)} · ${geoDistStr(km[sid])}<br><b class="tm-eta">🕒 ${etaWindow(km[sid], perKm)}</b></span>` : "";
          m.bindTooltip(`<b>${escapeHtml(s.n)}</b>${time}`, { permanent: true, direction: "right", className: "tm-run-label", offset: [7, 0] });
        } else {
          const t = onHi && geoTimeMode !== "off" ? `${escapeHtml(s.n)} · ${fmtTime(mins)} · ${geoDistStr(km[sid])} · group here ~${etaWindow(km[sid], perKm)}` : escapeHtml(s.n);
          m.bindTooltip(t, { direction: "top", className: "tm-hover-label" });
        }
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
    geoRefresh = () => { if (tmMap.map === map) draw(); };
    let wasDense = map.getZoom() < 12;
    map.on("zoomend", () => { const d = map.getZoom() < 12; if (d !== wasDense) { wasDense = d; draw(); } });

    requestAnimationFrame(() => { map.invalidateSize(false);
      if (hi) { const b = L.latLngBounds([]); lineLayer.eachLayer((l) => { if (l.feature.properties.line === hi) b.extend(l.getBounds()); });
        if (b.isValid()) map.fitBounds(b, { padding: [28, 28] }); }
      else map.fitBounds(lineLayer.getBounds(), { padding: [16, 16] }); });
  }

  // Per-station running times — any line, at an adjustable pace.
  let rtLine = null; // selected line for the running-times view (defaults to the next run's)
  let rtReversed = false; // direction of travel along the selected line
  let rtPaceSaved = false; // whether a visitor-saved pace exists (it then drives the planner select too)
  let rtPace = (() => { try { const v = parseFloat(localStorage.getItem("tuberun_rtpace")); if (v >= 4 && v <= 9) { rtPaceSaved = true; return v; } } catch (_) { /* private mode */ } return 6.5; })();

  // Ordered [name, lat, lon] stops for a line: the real run route when we have
  // one, then the line's stitched end-to-end main route from the open TfL
  // network data, otherwise its longest branch.
  function rtStations(net, name) {
    if (WAYPOINTS[name]) return WAYPOINTS[name];
    for (const id in net) {
      if (net[id].name !== name) continue;
      const br = net[id].route || net[id].branches.reduce((a, b) => (b.length > a.length ? b : a), net[id].branches[0] || []);
      return br.map((sid) => { const s = net[id].stations[sid]; return [s.n, s.lat, s.lon]; });
    }
    return null;
  }

  // --- A→B journey planner: shortest running route between any two stations ---
  // One undirected graph over the whole network. Nodes are keyed by a normalized
  // station name, so an interchange shared by several lines — including tube ↔
  // Overground, which use different ids — collapses to a single node: changing
  // lines there is free, exactly like a real journey. Edge weight is the
  // on-street running distance between adjacent stations (crow-flies ×
  // ROAD_FACTOR), matching every other estimate on the site.
  function buildStationGraph(net) {
    const norm = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
    const ekey = (a, b) => (a < b ? a + " " + b : b + " " + a);
    const nodes = {}, adj = {}, edgeLines = {}, lines = {};
    const node = (st) => {
      const k = norm(st.n);
      if (!nodes[k]) { nodes[k] = { name: st.n, lat: st.lat, lon: st.lon }; adj[k] = new Map(); }
      return k;
    };
    for (const id in net) {
      lines[id] = { name: net[id].name, colour: net[id].colour };
      for (const branch of net[id].branches || []) {
        let prev = null;
        for (const sid of branch) {
          const st = net[id].stations[sid];
          if (!st) { prev = null; continue; }
          const k = node(st);
          if (prev && prev.k !== k) {
            const w = haversineKm([0, prev.lat, prev.lon], [0, st.lat, st.lon]) * ROAD_FACTOR;
            if (!adj[k].has(prev.k) || adj[k].get(prev.k) > w) { adj[k].set(prev.k, w); adj[prev.k].set(k, w); }
            const ek = ekey(k, prev.k);
            (edgeLines[ek] || (edgeLines[ek] = new Set())).add(id); // which line(s) run this hop
          }
          prev = { k, lat: st.lat, lon: st.lon };
        }
      }
    }
    return { nodes, adj, edgeLines, lines, ekey, norm };
  }
  // Dijkstra over the station graph (a few hundred nodes — a sorted-array queue
  // is ample). Returns { path: [nodeKey…], km } or null if either end is unknown
  // or the two sit on disconnected parts of the network.
  function shortestPath(graph, fromName, toName) {
    const { adj, norm } = graph;
    const start = norm(fromName), end = norm(toName);
    if (!adj[start] || !adj[end]) return null;
    if (start === end) return { path: [start], km: 0 };
    const dist = { [start]: 0 }, prev = {}, done = new Set();
    const q = [[0, start]];
    while (q.length) {
      q.sort((x, y) => x[0] - y[0]);
      const [d, u] = q.shift();
      if (done.has(u)) continue;
      done.add(u);
      if (u === end) break;
      for (const [v, w] of adj[u]) {
        const nd = d + w;
        if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = u; q.push([nd, v]); }
      }
    }
    if (dist[end] === undefined) return null;
    const path = [];
    for (let cur = end; cur !== undefined; cur = prev[cur]) path.unshift(cur);
    return { path, km: dist[end] };
  }
  // Split a shortest path (node keys) into legs on a single line each, greedily
  // choosing lines to minimize changes when a hop is served by several.
  // (Named distinctly from the timeline's journeySegments(run, wp) — same-scope
  // function declarations with one name would shadow each other.)
  function pathToLegs(graph, path) {
    if (path.length < 2) return [];
    const { edgeLines, ekey } = graph;
    const chosen = [];
    let cur = null;
    for (let i = 0; i < path.length - 1; i++) {
      const cand = edgeLines[ekey(path[i], path[i + 1])] || new Set();
      let line = cur && cand.has(cur) ? cur : null; // stay on the current line if it runs this hop
      if (!line) {
        const next = i + 1 < path.length - 1 ? edgeLines[ekey(path[i + 1], path[i + 2])] : null;
        for (const l of cand) { if (next && next.has(l)) { line = l; break; } } // else prefer one that also runs the next hop
        if (!line) line = cand.values().next().value || cur;
      }
      chosen.push(line);
      cur = line;
    }
    const segs = [];
    for (let i = 0; i < chosen.length; i++) {
      if (segs.length && segs[segs.length - 1].line === chosen[i]) segs[segs.length - 1].nodes.push(path[i + 1]);
      else segs.push({ line: chosen[i], nodes: [path[i], path[i + 1]] });
    }
    return segs;
  }
  // Index of the trackpoint nearest a lat/lon (squared-degree distance is ample
  // for a nearest-point search at city scale).
  function nearestIdx(track, lat, lon) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < track.length; i++) {
      const dy = track[i][0] - lat, dx = track[i][1] - lon;
      const d = dy * dy + dx * dx;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // The real pavement polyline for one leg: slice the line's foot-routed GPX
  // between the leg's first and last station. Falls back to straight station
  // hops when the line has no GPX, or the stations don't sit on its main route
  // (e.g. a secondary branch the GPX doesn't cover).
  // Best pavement slice for one station→station hop, across all of the line's
  // branch tracks — so each hop follows whichever branch actually runs it, and a
  // leg that crosses a branch boundary still traces real pavement throughout.
  // Straight A→B when no track carries the hop.
  function hopPavement(segs, A, B) {
    let best = null, bestScore = Infinity;
    for (const track of segs) {
      const ia = nearestIdx(track, A[0], A[1]), ib = nearestIdx(track, B[0], B[1]);
      const score = Math.max(
        haversineKm([0, A[0], A[1]], [0, track[ia][0], track[ia][1]]),
        haversineKm([0, B[0], B[1]], [0, track[ib][0], track[ib][1]]));
      if (score < bestScore) { bestScore = score; best = { track, ia, ib }; }
    }
    if (!best || bestScore >= 0.4 || best.ia === best.ib) return [A, B];
    return best.ia < best.ib ? best.track.slice(best.ia, best.ib + 1) : best.track.slice(best.ib, best.ia + 1).reverse();
  }
  // Stitch a leg's real pavement hop by hop from the line's branch tracks.
  async function segmentPavement(segNodes, slug, nodes) {
    const coords = segNodes.map((k) => [nodes[k].lat, nodes[k].lon]);
    const segs = GPX_LINES.has(slug) ? await loadRouteGpx(slug) : null;
    if (!segs || !segs.length) return coords;
    const out = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const hop = hopPavement(segs, coords[i], coords[i + 1]);
      for (let j = out.length ? 1 : 0; j < hop.length; j++) out.push(hop[j]);
    }
    return out.length > 1 ? out : coords;
  }
  // Draw an A→B journey onto a map: each leg as its own line-coloured pavement
  // route (soft base + animated flow), a dot at every station, and start/finish
  // markers. Returns { group, latlngs } for fitBounds.
  async function drawJourney(map, segments, graph) {
    const grp = L.layerGroup().addTo(map);
    const all = [];
    const elevPts = []; let elevKm = 0, prevPt = null; // cumulative (distance, elevation) series across every leg
    for (const seg of segments) {
      const col = (graph.lines[seg.line] || {}).colour || "#0019a8";
      const dense = await segmentPavement(seg.nodes, seg.line, graph.nodes);
      addFlowLine(grp, dense, col, { baseOpacity: 0.28 });
      for (const p of dense) {
        if (prevPt) elevKm += haversineKm([0, prevPt[0], prevPt[1]], [0, p[0], p[1]]);
        if (p.length > 2 && isFinite(p[2])) elevPts.push([elevKm, p[2]]);
        prevPt = p;
        all.push(p);
      }
      seg.nodes.forEach((k) => {
        const n = graph.nodes[k];
        L.circleMarker([n.lat, n.lon], { radius: 3.2, color: "#fff", weight: 1.4, fillColor: col, fillOpacity: 1, interactive: false }).addTo(grp);
      });
    }
    const A = graph.nodes[segments[0].nodes[0]];
    const lastSeg = segments[segments.length - 1];
    const B = graph.nodes[lastSeg.nodes[lastSeg.nodes.length - 1]];
    L.circleMarker([A.lat, A.lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#111", fillOpacity: 1 })
      .bindTooltip("Start · " + escapeHtml(A.name), { direction: "top" }).addTo(grp);
    L.marker([B.lat, B.lon], { icon: L.divIcon({ className: "route-finish", html: "◉", iconSize: [15, 15], iconAnchor: [7, 7] }) })
      .bindTooltip("Finish · " + escapeHtml(B.name), { direction: "top" }).addTo(grp);
    return { group: grp, latlngs: all, elev: elevProfile(elevPts) };
  }
  // Reduce a path to at most `max` points (endpoints kept) for the elevation API.
  function sampleCoords(coords, max) {
    if (coords.length <= max) return coords;
    const out = [], step = (coords.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]);
    return out;
  }
  // Ground elevation (m) per [lat,lon] from open-meteo's elevation API (already in
  // our CSP connect-src). Up to 100 points per request; null on failure.
  async function fetchElevations(coords) {
    try {
      const lat = coords.map((c) => c[0].toFixed(5)).join(",");
      const lon = coords.map((c) => c[1].toFixed(5)).join(",");
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
      if (!res.ok) return null;
      const j = await res.json();
      return Array.isArray(j.elevation) && j.elevation.length === coords.length ? j.elevation : null;
    } catch (_) { return null; }
  }
  // Elevation profile for a drawn route (points as [lat,lon] or [lat,lon,ele]):
  // uses embedded GPX elevation when present (dense), else samples open-meteo (for
  // GPX-less routes like buses and variant lines). Null if unavailable. Async.
  async function routeElevation(coords) {
    if (!coords || coords.length < 3) return null;
    const hasEle = coords.some((c) => c.length > 2 && isFinite(c[2]));
    let pts = coords, eles = null;
    if (!hasEle) {
      pts = sampleCoords(coords, 100);
      eles = await fetchElevations(pts);
      if (!eles) return null;
    }
    const series = []; let km = 0, prev = null;
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i];
      if (prev) km += haversineKm([0, prev[0], prev[1]], [0, c[0], c[1]]);
      prev = c;
      const e = hasEle ? c[2] : eles[i];
      if (isFinite(e)) series.push([km, e]);
    }
    return elevProfile(series);
  }
  // Reduce a (distance-km, elevation-m) series to total climb/drop (hysteresis
  // threshold filters GPS/DEM jitter) plus min/max and the series itself for a
  // profile sparkline. Null when there aren't enough elevation points.
  function elevProfile(pts) {
    if (!pts || pts.length < 3) return null;
    let gain = 0, loss = 0, ref = pts[0][1], min = pts[0][1], max = pts[0][1];
    const TH = 3; // metres — ignore wiggles smaller than this
    for (const [, e] of pts) {
      if (e > max) max = e;
      if (e < min) min = e;
      const dz = e - ref;
      if (dz > TH) { gain += dz; ref = e; }
      else if (dz < -TH) { loss += -dz; ref = e; }
    }
    return { pts, maxD: pts[pts.length - 1][0], gain: Math.round(gain), loss: Math.round(loss), min: Math.round(min), max: Math.round(max) };
  }
  // A compact SVG area/line chart of the journey's elevation, with climb/drop figures.
  function elevationHtml(elev) {
    if (!elev) return "";
    const W = 320, H = 60, pad = 5, span = Math.max(1, elev.max - elev.min), maxD = elev.maxD || 1;
    const x = (d) => pad + (d / maxD) * (W - 2 * pad);
    const y = (e) => H - pad - ((e - elev.min) / span) * (H - 2 * pad);
    const step = Math.max(1, Math.floor(elev.pts.length / 160));
    let line = "";
    for (let i = 0; i < elev.pts.length; i += step) line += (line ? "L" : "M") + x(elev.pts[i][0]).toFixed(1) + " " + y(elev.pts[i][1]).toFixed(1);
    const last = elev.pts[elev.pts.length - 1];
    line += "L" + x(last[0]).toFixed(1) + " " + y(last[1]).toFixed(1);
    const bottom = (H - pad).toFixed(1);
    const area = "M" + pad + " " + bottom + " L" + line.slice(1) + " L" + x(maxD).toFixed(1) + " " + bottom + " Z";
    return `<div class="jr-elev-fig">Elevation <b>&uarr; ${elev.gain} m</b> climb &middot; <b>&darr; ${elev.loss} m</b> drop <span class="jr-elev-range">&middot; ${elev.min}&ndash;${elev.max} m above sea level</span></div>
      <svg class="jr-elev-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Elevation profile: ${elev.gain} metres of climb and ${elev.loss} metres of descent, ranging ${elev.min} to ${elev.max} metres above sea level">
        <path d="${area}" class="jr-elev-area"/><path d="${line}" class="jr-elev-line"/>
      </svg>`;
  }
  // A tube-map-style diagram of the journey: one coloured leg per line, its
  // stations listed on a coloured rail, with a "change here" marker between legs.
  function journeyStripHtml(segments, graph) {
    const nodes = graph.nodes;
    let html = `<div class="jrn">`;
    segments.forEach((seg, si) => {
      const info = graph.lines[seg.line] || { name: seg.line, colour: "#0019a8" };
      const col = info.colour, hops = seg.nodes.length - 1;
      const stops = si === 0 ? seg.nodes : seg.nodes.slice(1); // the interchange is shown in the change divider above
      html += `<div class="jrn-leg" style="--c:${col}">`;
      html += `<div class="jrn-badge" style="background:${col};color:${contrastText(col)}">${escapeHtml(info.name)} line <span class="jrn-badge-n">${hops} stop${hops === 1 ? "" : "s"}</span></div>`;
      html += `<ol class="jrn-stops">`;
      stops.forEach((k, i) => {
        const isStart = si === 0 && i === 0;
        const isEnd = si === segments.length - 1 && i === stops.length - 1;
        html += `<li class="jrn-stop${isStart ? " is-start" : ""}${isEnd ? " is-end" : ""}"><span class="jrn-dot"></span><span class="jrn-nm">${escapeHtml(nodes[k].name)}</span></li>`;
      });
      html += `</ol></div>`;
      if (si < segments.length - 1) {
        html += `<div class="jrn-change"><span class="jrn-change-i">⇄</span> Change at <strong>${escapeHtml(nodes[seg.nodes[seg.nodes.length - 1]].name)}</strong></div>`;
      }
    });
    return html + `</div>`;
  }
  // Distance/time summary + the tube-map strip for a routed journey.
  function journeyResultHtml(res, segments, graph) {
    const path = res.path, km = res.km, nodes = graph.nodes;
    const from = nodes[path[0]].name, to = nodes[path[path.length - 1]].name;
    const changes = Math.max(0, segments.length - 1);
    return `
      <div class="jr-head"><strong>${escapeHtml(from)}</strong><span class="jr-arrow">→</span><strong>${escapeHtml(to)}</strong></div>
      <div class="cr-main"><span class="cr-km">${fmtKm(km, 1)}</span> <span class="jr-stops">${path.length} stops · ${changes} change${changes === 1 ? "" : "s"}</span></div>
      ${timesRowHtml(km)}
      ${journeyStripHtml(segments, graph)}
      <div class="jr-elev" aria-live="polite"></div>
      <p class="jr-note">The map traces the real pavement route (GPX) leg by leg where available. Distance is on-street (crow-flies &times; 1.3); elevation is measured along the traced pavement.</p>`;
  }
  function setupJourneyPlanner() {
    const fromEl = document.getElementById("abFrom");
    const toEl = document.getElementById("abTo");
    const dl = document.getElementById("abStations");
    const goBtn = document.getElementById("abGo");
    const swapBtn = document.getElementById("abSwap");
    const mapEl = document.getElementById("abMap");
    const result = document.getElementById("abResult");
    if (!fromEl || !toEl || !mapEl || !result) return;
    let graph = null, jMap = null, jLayer = null, last = null;

    loadNetwork().catch(() => null).then((net) => {
      if (!net) { result.innerHTML = `<p class="journey-hint">Couldn't load the network map — try refreshing.</p>`; return; }
      graph = buildStationGraph(net);
      const names = Object.values(graph.nodes).map((n) => n.name).sort((a, b) => a.localeCompare(b));
      dl.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
    });

    function ensureMap() {
      if (jMap) return jMap;
      jMap = createSiteMap(mapEl);
      requestAnimationFrame(() => jMap.invalidateSize(false));
      return jMap;
    }
    function render(res) {
      last = res;
      const segments = pathToLegs(graph, res.path);
      const map = ensureMap();
      if (jLayer) { map.removeLayer(jLayer); jLayer = null; }
      drawJourney(map, segments, graph).then((drawn) => {
        if (!drawn || !drawn.latlngs.length) return;
        jLayer = drawn.group;
        map.fitBounds(L.latLngBounds(drawn.latlngs), { padding: [28, 28] });
        const box = result.querySelector(".jr-elev");
        if (box) box.innerHTML = elevationHtml(drawn.elev);
      });
      result.innerHTML = journeyResultHtml(res, segments, graph);
    }
    function plan() {
      if (!graph) return;
      const a = fromEl.value.trim(), b = toEl.value.trim();
      if (!a || !b) { result.innerHTML = `<p class="journey-hint">Pick a start and a finish station to trace a route.</p>`; return; }
      const res = shortestPath(graph, a, b);
      if (!res || res.path.length < 2) {
        const unknown = [a, b].filter((n) => !graph.adj[graph.norm(n)]);
        result.innerHTML = unknown.length
          ? `<p class="journey-hint">${unknown.map(escapeHtml).join(" and ")} ${unknown.length > 1 ? "aren't stations" : "isn't a station"} on the map — start typing and pick from the list.</p>`
          : `<p class="journey-hint">Those two aren't connected on the running network. Try another pair.</p>`;
        if (jLayer && jMap) { jMap.removeLayer(jLayer); jLayer = null; }
        last = null;
        return;
      }
      render(res);
    }
    if (goBtn) goBtn.addEventListener("click", plan);
    [fromEl, toEl].forEach((el) => el.addEventListener("change", () => { if (fromEl.value.trim() && toEl.value.trim()) plan(); }));
    if (swapBtn) swapBtn.addEventListener("click", () => {
      const t = fromEl.value; fromEl.value = toEl.value; toEl.value = t;
      if (fromEl.value.trim() && toEl.value.trim()) plan();
    });
    journeyRefresh = () => { if (last) render(last); };
    result.innerHTML = `<p class="journey-hint">Pick a start and a finish station &mdash; we&rsquo;ll trace the shortest running route across the network, changing lines where they meet.</p>`;
    ensureMap(); // show the London basemap straight away, ready to draw on
  }

  function rtPaceLabel() { return `${fmtPace(rtPace)} /km · ${fmtPace(rtPace / MI_PER_KM)} /mi`; }

  // rtPace is the single source of truth for pace, shared by the planner
  // select, the pace sliders and every time estimate. Set it here so the
  // change is clamped, persisted and mirrored into the coarse select.
  function setRtPace(v) {
    rtPace = Math.min(9, Math.max(4, parseFloat(v) || 6.5));
    try { localStorage.setItem("tuberun_rtpace", String(rtPace)); } catch (_) { /* private mode */ }
    syncPaceSelect();
    return rtPaceLabel();
  }
  // Snap the planner's coarse pace select to the option nearest rtPace.
  // Dispatching input keeps the planner's result in step with the sliders;
  // the value-changed guard stops the setRtPace → sync → setRtPace echo.
  function syncPaceSelect() {
    if (!paceSel || !paceSel.options.length) return;
    const best = [...paceSel.options].reduce((a, b) =>
      Math.abs(parseFloat(b.value) - rtPace) < Math.abs(parseFloat(a.value) - rtPace) ? b : a);
    if (paceSel.value !== best.value) {
      paceSel.value = best.value;
      paceSel.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function setupPaceState() {
    if (!paceSel) return;
    if (rtPaceSaved) syncPaceSelect(); // reflect the saved pace on load
    // Registered before setupPlanner's `update` listener, so the planner
    // always recalculates with the fresh rtPace.
    paceSel.addEventListener("input", () => setRtPace(paceSel.value));
  }

  async function renderRunningTimes(holder) {
    let net = null;
    try { net = await loadNetwork(); } catch (_) { /* WAYPOINTS-only fallback below */ }
    if (curMap !== "running") return; // user switched tabs while the data loaded
    const lines = net ? Object.values(net).map((l) => l.name).sort() : Object.keys(WAYPOINTS).filter((k) => LINE_COLOURS[k]);
    if (!rtLine || !lines.includes(rtLine)) rtLine = nextRun && lines.includes(nextRun.key) ? nextRun.key : lines[0];
    let stns = net ? rtStations(net, rtLine) : WAYPOINTS[rtLine];
    const hasRoute = !!(net && Object.values(net).some((l) => l.name === rtLine && l.route));
    if (!stns || stns.length < 2) { holder.innerHTML = `<p class="diagram-empty">No station data for this line yet.</p>`; return; }
    if (rtReversed) stns = stns.slice().reverse();
    const c = LINE_COLOURS[rtLine] || "#0019A8";
    let cumKm = 0;
    const rows = stns.map((s, i) => {
      const legKm = i === 0 ? 0 : haversineKm(stns[i - 1], stns[i]) * ROAD_FACTOR;
      cumKm += legKm;
      return `<tr data-leg="${legKm.toFixed(4)}" data-cum="${cumKm.toFixed(4)}">
        <td class="rt-stn"><span class="rt-dot" style="background:${c}"></span>${escapeHtml(s[0])}</td>
        <td class="rt-leg">${i === 0 ? "—" : "+" + fmtTime(legKm * rtPace)}</td>
        <td class="rt-cum">${i === 0 ? "start" : fmtTime(cumKm * rtPace)}</td>
        <td>${fmtKm(cumKm, 1)}</td>
      </tr>`;
    }).join("");
    holder.innerHTML = `
      <div class="rt-controls">
        <label class="rt-line-pick">Line
          <select id="rtLinePick">${lines.map((n) => `<option value="${escapeHtml(n)}"${n === rtLine ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")}</select>
        </label>
        <button type="button" id="rtReverse" class="rt-reverse${rtReversed ? " on" : ""}" aria-pressed="${rtReversed}" title="Swap the direction of travel">⇄ Reverse</button>
        <label class="rt-pace-pick">Pace
          <input type="range" id="rtPaceSlider" min="4" max="9" step="0.25" value="${rtPace}" aria-label="Running pace, minutes per kilometre" />
          <span class="rt-pace-lbl" id="rtPaceLbl">${rtPaceLabel()}</span>
        </label>
      </div>
      <div class="rt-head" style="border-color:${c}">
        <strong style="color:${lineTextColour(c)}">${escapeHtml(rtLine)} line</strong>
        <span>${escapeHtml(stns[0][0])} → ${escapeHtml(stns[stns.length - 1][0])}${WAYPOINTS[rtLine] ? "" : hasRoute ? " · main route" : " · longest branch"}</span>
      </div>
      <table class="rt-table">
        <thead><tr><th>Station</th><th>Leg</th><th>Elapsed</th><th>From start</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="rt-foot">Cumulative running time from the start at the pace above. Add time for regroups, photos and breaks.</p>`;
    holder.querySelector("#rtLinePick").addEventListener("input", (e) => { rtLine = e.target.value; rtReversed = false; renderRunningTimes(holder); });
    holder.querySelector("#rtReverse").addEventListener("click", () => { rtReversed = !rtReversed; renderRunningTimes(holder); });
    const slider = holder.querySelector("#rtPaceSlider");
    slider.addEventListener("input", () => {
      holder.querySelector("#rtPaceLbl").textContent = setRtPace(slider.value);
      // Update times in place so the drag isn't interrupted by a re-render.
      holder.querySelectorAll("tbody tr").forEach((tr, i) => {
        if (i === 0) return;
        tr.querySelector(".rt-leg").textContent = "+" + fmtTime(parseFloat(tr.dataset.leg) * rtPace);
        tr.querySelector(".rt-cum").textContent = fmtTime(parseFloat(tr.dataset.cum) * rtPace);
      });
    });
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

  // Underline each section heading in a rotating official Tube-line colour.
  function themeSections() {
    const cols = ["#E32017", "#003688", "#0098D4", "#00782A", "#B36305", "#9B0056", "#6950A1", "#000000", "#F3A9BB", "#A0A5A9"];
    document.querySelectorAll(".section-title").forEach((h, i) => h.style.setProperty("--accent", cols[i % cols.length]));
  }

  // Run each top-level init independently so a throw in one renderer degrades to
  // that one feature instead of aborting bootstrap and blanking the page.
  [
    ["themeSections", themeSections], ["renderLive", renderLive],
    ["renderTubeMap", renderTubeMap], ["renderLineStats", renderLineStats],
    ["renderNext", renderNext], ["renderHeroCard", renderHeroCard],
    ["renderJourneyBoard", renderJourneyBoard], ["renderList", renderList],
    ["renderRoutes", renderRoutes], ["setupPaceState", setupPaceState],
    ["setupPlanner", setupPlanner], ["setupBusRunner", setupBusRunner],
    ["setupJourneyPlanner", setupJourneyPlanner], ["renderLineCollector", renderLineCollector],
    ["renderGallery", renderGallery], ["wireSocials", wireSocials],
    ["loadWeather", loadWeather], ["setupScrollSpy", setupScrollSpy],
    ["setupUnitToggle", setupUnitToggle], ["setupLiveClock", setupLiveClock],
    ["loadLiveNow", loadLiveNow],
  ].forEach(([name, fn]) => {
    try { fn(); } catch (e) { console.error("init " + name + " failed:", e); }
  });

  // Keep the time-sensitive views live. The "next run" and its phase are
  // otherwise a snapshot frozen when the page's JS first ran, so a left-open
  // tab never advances its countdown or rolls over to the following run.
  // Recompute on a one-minute timer and whenever the tab wakes (visibility
  // change covers tab focus; pageshow covers bfcache back/forward restores).
  function setupLiveClock() {
    let timeSig = "";
    function refreshTime() {
      const prevKey = nextRun ? nextRun.key : null;
      nextRun = pickNextRun();
      pts = WAYPOINTS[nextRun ? nextRun.key : ""];
      const ph = runPhase(nextRun);
      tickJourneyNow(); // slide the live "group ~here now" dot even when the headline is unchanged
      const sig = (nextRun ? nextRun.key : "") + "|" + ph.short + "|" + ph.label + "|" + ph.live;
      if (sig === timeSig) return; // nothing visible changed — skip the re-render
      timeSig = sig;
      renderNext();
      renderHeroCard();
      if (nextRun && nextRun.key !== prevKey) {
        // Run rolled over to a different entry (rare, ~monthly): refresh the
        // views that key off it. renderRoutes/Leaflet are untouched.
        renderJourneyBoard();
        renderTubeMap();
        setupPlanner();
      }
    }
    refreshTime(); // seed timeSig so the first timer tick is a genuine no-op
    setInterval(refreshTime, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { refreshTime(); loadLiveNow(); } });
    window.addEventListener("pageshow", () => { refreshTime(); loadLiveNow(); });
  }

  // Site-wide km/mi toggle in the header — re-renders everything showing a distance.
  function setupUnitToggle() {
    const btns = [...document.querySelectorAll(".unit-toggle button[data-u]")];
    if (!btns.length) return;
    const sync = () => btns.forEach((b) => b.classList.toggle("on", b.dataset.u === distUnit));
    sync();
    btns.forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.u === distUnit) return;
      distUnit = b.dataset.u;
      try { localStorage.setItem("tuberun_units", distUnit); } catch (_) { /* private mode */ }
      sync();
      renderNext();
      renderHeroCard(); // its distance line shows units too
      renderJourneyBoard();
      renderList();
      renderRouteCards(); // cards only — renderRoutes() would re-init its Leaflet map
      if (typeof busMapObj.retrace === "function") busMapObj.retrace(); // bus result panel
      renderLineStats();
      renderLineCollector();
      refreshPlanner(); // tube calc or adventure escape-point distances, at the new unit
      if (typeof geoRefresh === "function") geoRefresh(); // live network-map labels
      if (typeof journeyRefresh === "function") journeyRefresh(); // A→B planner result
      if (curMap === "running") loadMap();                // running-times table
    }));
  }

  // Highlight the nav link for whichever section is currently in view.
  function setupScrollSpy() {
    const links = [...document.querySelectorAll('.nav a[href^="#"]')];
    const byId = {};
    const sections = [];
    links.forEach((a) => {
      const id = a.getAttribute("href").slice(1);
      const sec = document.getElementById(id);
      if (sec) { byId[id] = a; sections.push(sec); }
    });
    if (!("IntersectionObserver" in window) || !sections.length) return;
    const setActive = (id) => links.forEach((a) => {
      const on = a === byId[id];
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    // Track which sections cross a thin band near the middle of the viewport, and
    // activate the topmost one (document order) — deterministic as you scroll.
    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id); });
      const cur = sections.find((s) => visible.has(s.id));
      if (cur) setActive(cur.id);
    }, { rootMargin: "-14% 0px -80% 0px", threshold: 0 });
    sections.forEach((s) => io.observe(s));
  }
})();
