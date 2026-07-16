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

  // --- FEATURED SHOUT-OUT ------------------------------------------------
  // A one-off promo banner under the nav (e.g. a member's fundraiser). Shows
  // until `until` (inclusive, that day still shows) then hides itself; also
  // dismissible per-visitor. Set to null to remove. Preview with ?feature.
  const FEATURE = {
    id: "ray-elizabeth-2026",     // localStorage dismiss key — bump for a new promo
    until: "2026-07-17",          // last day shown (the run day)
    kicker: "This Friday",
    title: "Ray's Elizabeth line run",
    detail: "Reading → Shenfield, the whole Elizabeth line, for The Royal Marsden Cancer Charity",
    cta: "Cheer Ray on",
    url: "https://www.justgiving.com/fundraising/Ray4Cancer",
  };

  // --- LINE COLLECTOR ----------------------------------------------------
  // Direction matters: running a line one way is a different run from running
  // it back, so every line has TWO collectible directions.
  // LINE_DIRS gives each line's two direction labels [dir0, dir1].
  const TUBE_LINES = [
    "Bakerloo", "Central", "Circle", "District", "Hammersmith & City",
    "Jubilee", "Metropolitan", "Northern", "Piccadilly", "Victoria", "Waterloo & City",
    "Lioness", "Mildmay", "Windrush", "Weaver", "Suffragette", "Liberty", "Elizabeth",
  ];
  // The collectable list: the TfL lines above, plus the National Rail
  // operators once the network data loads (computeNrStats appends them).
  const COLLECT_LINES = TUBE_LINES.slice();
  // Not static either: computeNrStats adds each NR/DLR line's two directions at runtime.
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
  const GROUP_PACE = 6.5;    // min/km — the group's steady no-drop pace (the "6:30/km" in copy)
  const WALK_MIN_PER_KM = 12; // ~5 km/h walking pace
  const CYCLE_MIN_PER_KM = 4; // ~15 km/h city cycling pace
  const LONDON = { lat: 51.5033, lon: -0.1145 };

  // Official-ish TfL line colours. Not static: computeNrStats adds the NR and
  // DLR lines' colours at runtime once the network data loads.
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
    { type: "tube", line: "Victoria", leg: "Brixton → Walthamstow Central", start: "Brixton stn (outside M&S)", distance: "~26 km" },
    {
      type: "adventure", name: "Shipwrights Way", colour: "#5A7D2A",
      date: "2026-07-11", location: "East Hampshire → Portsmouth",
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
    { type: "tube", line: "Bakerloo", leg: "Elephant & Castle → Harrow & Wealdstone", start: "Elephant & Castle stn", distance: "~30 km" },
    { type: "canal", name: "Regent's Canal towpath", leg: "Little Venice → Limehouse Basin", start: "Warwick Ave stn", distance: "~14 km" },
    { type: "tube", line: "Central", leg: "Liverpool St → Ealing Broadway", start: "Liverpool Street stn (main entrance)", distance: "~22 km" },
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
    // River-path landmarks (Thames bridges, downstream) — coords from OSM.
    "Thames Path": [
      ["Putney Bridge", 51.4683, -0.2088], ["Wandsworth Bridge", 51.4649, -0.1877],
      ["Battersea Bridge", 51.4811, -0.1725], ["Albert Bridge", 51.4828, -0.1669],
      ["Vauxhall Bridge", 51.4875, -0.1268], ["Westminster Bridge", 51.5009, -0.1218],
      ["Waterloo Bridge", 51.5028, -0.1128], ["Blackfriars Bridge", 51.5098, -0.1044],
      ["London Bridge", 51.5080, -0.0877], ["Tower Bridge", 51.5055, -0.0754],
    ],
    // Key stops along TfL bus route 38 (Clapton Pond → Victoria) — coords from TfL.
    "Route 38": [
      ["Clapton Pond", 51.5568, -0.0557], ["Hackney Central", 51.5475, -0.0557],
      ["Dalston Junction", 51.5462, -0.0746], ["Essex Road", 51.5409, -0.0953],
      ["Angel", 51.5337, -0.1055], ["Mount Pleasant", 51.5254, -0.1104],
      ["Bloomsbury Square", 51.5186, -0.1217], ["Tottenham Court Road", 51.5167, -0.1281],
      ["Piccadilly Circus", 51.5092, -0.1363], ["Green Park", 51.5067, -0.1428],
      ["Hyde Park Corner", 51.5021, -0.1507], ["Victoria", 51.4961, -0.1436],
    ],
    // Shipwrights Way waymarked trail (Bentley → Portsmouth), heading south — coords from OSM.
    "Shipwrights Way": [
      ["Bentley Station", 51.1812, -0.8682], ["Alice Holt Forest", 51.1727, -0.8372],
      ["Bordon", 51.1091, -0.8593], ["Liphook", 51.0718, -0.8003],
      ["Liss", 51.0415, -0.8995], ["Petersfield", 51.0025, -0.9392],
      ["Buriton", 50.9708, -0.9504], ["Queen Elizabeth Country Park", 50.9655, -0.9693],
      ["Rowlands Castle", 50.9051, -0.9669], ["Havant", 50.8519, -0.9821],
      ["Portsmouth Historic Dockyard", 50.8005, -1.1095],
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
      const dur = seg ? legDistanceKm(wp, seg.from, seg.to) * GROUP_PACE * 60000 + 30 * 60000 : RUN_WINDOW_MS;
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
  // +3 headroom (matching tools/generate-schedule.mjs) so a pinned-heavy month
  // can't exhaust the candidate pool before the near-pinned filter runs.
  const nearPinned = (sun) => pinned.some((p) => Math.abs(p - sun) <= 2 * 86400000);
  const sundays = upcomingSundays(autoCount + pinned.length + 3).filter((s) => !nearPinned(s)).slice(0, autoCount);
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
      const res = await vfetch("data/live.json?t=" + Math.floor(Date.now() / 60000));
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
    const paceKm = GROUP_PACE;
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
    const c = nextRun.colour, paceKm = GROUP_PACE;
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
      <p class="jb-foot">Expected arrival windows at a steady ${fmtPace(GROUP_PACE)}/km from each day's start — add time for regroups and photos.</p>`;
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

  // --- Add-to-calendar (.ics) -----------------------------------------------
  // Client-side calendar export for a run — no backend. A timed 09:00 event on
  // the run date (all-day span for multi-day adventures) so people stop missing
  // the first-Sunday runs. Times are floating-local: the group meets in London.
  const CAL_URL = "https://psurma.github.io/TubeRun/";
  const CAL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>`;
  const pad2 = (n) => String(n).padStart(2, "0");
  function icsEsc(s) { return String(s).replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n"); }
  // Fold physical lines at 75 octets per RFC 5545 (continuation lines start with
  // a space). Measured in UTF-8 bytes, not chars — summaries carry "·" and
  // friends, and the limit is octets on the wire.
  const ICS_UTF8 = new TextEncoder();
  function icsFold(line) {
    let out = "", cur = "", bytes = 0, budget = 74; // continuation content gets 73 + the leading space
    for (const ch of line) { // by code point, so multibyte chars never split
      const b = ICS_UTF8.encode(ch).length;
      if (bytes + b > budget) { out += (out ? "\r\n " : "") + cur; cur = ch; bytes = b; budget = 73; }
      else { cur += ch; bytes += b; }
    }
    return out ? out + "\r\n " + cur : cur;
  }
  function icsDate(d, hh, mm) {
    const base = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    return hh == null ? base : `${base}T${pad2(hh)}${pad2(mm)}00`;
  }
  function icsStamp() {
    const d = new Date();
    return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T` +
      `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
  }
  function runIcs(r) {
    const [mh, mm] = MEET_TIME.split(":").map(Number);
    const multi = r.days && r.days.length > 1;
    const slug = lineSlug(r.key || r.badge);
    let dtStart, dtEnd;
    if (multi) {
      const end = new Date(r.date.getTime() + r.days.length * 86400000); // DTEND date is exclusive
      dtStart = `DTSTART;VALUE=DATE:${icsDate(r.date)}`;
      dtEnd = `DTEND;VALUE=DATE:${icsDate(end)}`;
    } else {
      const endMin = mh * 60 + mm + 150; // ~2h30 block
      dtStart = `DTSTART:${icsDate(r.date, mh, mm)}`;
      dtEnd = `DTEND:${icsDate(r.date, Math.floor(endMin / 60), endMin % 60)}`;
    }
    const loc = r.start ? r.start + (r.location === "London" ? ", London" : "") : r.location;
    const desc = [r.leg, distText(r.distance), multi ? null : `Meet ${MEET_TIME}`, CAL_URL].filter(Boolean).join("\n");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TubeRun//Runs//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${icsDate(r.date)}-${slug}@tuberun`,
      `DTSTAMP:${icsStamp()}`,
      dtStart, dtEnd,
      `SUMMARY:${icsEsc("Tube Run · " + r.badge)}`,
      loc ? `LOCATION:${icsEsc(loc)}` : "",
      `DESCRIPTION:${icsEsc(desc)}`,
      `URL:${CAL_URL}`,
      "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean);
    return lines.map(icsFold).join("\r\n");
  }
  function downloadRunIcs(r) {
    downloadBlob(`tube-run-${lineSlug(r.key || r.badge)}.ics`, new Blob([runIcs(r)], { type: "text/calendar;charset=utf-8" }));
  }

  function renderList() {
    const el = document.getElementById("runList");
    if (!el) return;
    el.innerHTML = runs.map((r, i) => {
      const loc = r.location !== "London" ? `<span class="r-loc">${escapeHtml(r.location)}</span>` : "";
      const toggle = hasDetails(r) ? `<button class="r-toggle" data-i="${i}" aria-expanded="false">Details</button>` : "";
      return `
      <div class="run-row${r.suggested ? " is-suggested" : ""}${hasDetails(r) ? " has-details" : ""}" data-i="${i}">
        <div class="r-date">${r.date.getDate()} ${MON[r.date.getMonth()]}
          <small>${DOW[r.date.getDay()]} · ${r.date.getFullYear()}</small>
        </div>
        <div class="r-swatch" style="background:${r.colour}"></div>
        <div class="r-title">${escapeHtml(r.badge)} ${loc}${r.suggested ? ` <span class="r-suggest" title="Tentative — the plan is only firmed up about a month ahead">Suggested</span>` : ""}
          <small>${escapeHtml(r.leg)}</small>
        </div>
        <div class="r-dist">${escapeHtml(distText(r.distance))}
          <div class="r-actions">
            <button class="r-cal" data-i="${i}" title="Add to your calendar" aria-label="Add the ${escapeHtml(r.badge)} run to your calendar">${CAL_ICON}Calendar</button>
            ${toggle}
          </div>
        </div>
      </div>
      ${hasDetails(r) ? `<div class="run-details-wrap" id="det-${i}" hidden>${detailsHtml(r)}</div>` : ""}`;
    }).join("");

    el.querySelectorAll(".r-cal").forEach((btn) => {
      btn.addEventListener("click", () => downloadRunIcs(runs[+btn.dataset.i]));
    });
    el.querySelectorAll(".run-row.has-details").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".r-cal")) return; // the calendar button keeps its own action
        const wrap = document.getElementById(`det-${row.dataset.i}`);
        if (!wrap) return;
        const open = !wrap.hidden;
        wrap.hidden = open;
        const btn = row.querySelector(".r-toggle");
        if (btn) { btn.setAttribute("aria-expanded", String(!open)); btn.textContent = open ? "Details" : "Hide"; }
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
  let interchangeMap = null; // interKey(station name) -> [{name, colour}]
  // National Rail termini carry a "London " prefix the tube names don't
  // ("London Waterloo" vs "Waterloo"), and the King's Cross cluster goes by
  // three names — canonicalise so the same place shares one interchange bucket.
  const INTERCHANGE_ALIAS = {
    kingscross: "kingscrossstpancras",
    stpancrasinternational: "kingscrossstpancras",
    stpancrasinternationalll: "kingscrossstpancras", // Thameslink's low-level platforms
    newcrossell: "newcross", // Windrush's New Cross as named on the East London line
  };
  const interKey = (n) => { const k = norm(n).replace(/^london/, ""); return INTERCHANGE_ALIAS[k] || k; };
  function buildInterchangeMap(net) {
    const m = {};
    for (const id in net) {
      const ln = net[id];
      for (const sid in ln.stations) {
        const k = interKey(ln.stations[sid].n);
        if (!m[k]) m[k] = [];
        if (!m[k].some((x) => x.name === ln.name)) m[k].push({ name: ln.name, colour: ln.colour, nr: !!ln.nr });
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
      for (const k in NON_TUBE_INTERCHANGES) nonTubeByNorm[interKey(k)] = NON_TUBE_INTERCHANGES[k];
    }
    const key = interKey(name);
    const tube = interchangeMap ? (interchangeMap[key] || []).filter((x) => norm(x.name) !== norm(line)) : [];
    // Drop a hardcoded "<name> line" (e.g. "Elizabeth line") when the network already
    // supplies that line as a Tube interchange, so it isn't listed twice — and drop
    // the generic "National Rail" tag once the network names the actual NR line(s).
    const tubeNames = new Set(tube.map((x) => norm(x.name)));
    const hasNamedNr = (interchangeMap ? (interchangeMap[key] || []) : []).some((x) => x.nr);
    const other = (nonTubeByNorm[key] || []).filter((n) => !tubeNames.has(norm(n.replace(/ line$/i, ""))) && !(n === "National Rail" && hasNamedNr));
    if (!tube.length && !other.length) return "";
    const pills = tube.map((x) => `<span class="stn-tag" style="background:${safeColour(x.colour)};color:${contrastText(x.colour)}">${escapeHtml(x.name)}</span>`)
      .concat(other.map((n) => {
        const c = NON_TUBE_COLOURS[n] || ["#555", "#fff"];
        return `<span class="stn-tag" style="background:${c[0]};color:${c[1]}">${escapeHtml(n)}</span>`;
      }));
    return `<span class="stn-tags">${pills.join("")}</span>`;
  }

  // --- Bus-stop -> Underground connections -----------------------------------
  // Bus stops don't share names with Tube stations, so their interchanges are
  // matched by proximity instead. tubeGeo is the unique station set (coords + the
  // Tube / Overground / Elizabeth lines serving each), built once the net loads.
  let tubeGeo = null;
  function buildTubeGeo(net) {
    const byName = {};
    for (const id in net) {
      const ln = net[id];
      for (const sid in ln.stations) {
        const st = ln.stations[sid];
        const k = norm(st.n);
        if (!byName[k]) byName[k] = { lat: st.lat, lon: st.lon, lines: [] };
        if (!byName[k].lines.some((x) => x.name === ln.name)) byName[k].lines.push({ name: ln.name, colour: ln.colour });
      }
    }
    return Object.values(byName);
  }
  // Lines serving the station nearest to (lat, lon), or [] if none within ~200 m.
  function nearestTubeLines(lat, lon) {
    if (!tubeGeo || !isFinite(lat) || !isFinite(lon)) return [];
    let best = null, bd = Infinity;
    for (const s of tubeGeo) {
      const d = haversineKm([0, lat, lon], [0, s.lat, s.lon]);
      if (d < bd) { bd = d; best = s; }
    }
    return best && bd <= 0.2 ? best.lines : [];
  }
  function tubePills(lines) {
    return lines.map((x) => `<span class="stn-tag" style="background:${safeColour(x.colour)};color:${contrastText(x.colour)}">${escapeHtml(x.name)}</span>`).join("");
  }
  // Interchange tags for a stop identified only by coordinates (bus strips/maps).
  function geoInterchangeTags(lat, lon) {
    const lines = nearestTubeLines(lat, lon);
    return lines.length ? `<span class="stn-tags">${tubePills(lines)}</span>` : "";
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
    // Re-runs on the monthly rollover (setupLiveClock) — drop last month's GPX
    // row so every path below starts clean.
    const oldGpxRow = document.querySelector(".plan-gpx-row");
    if (oldGpxRow) oldGpxRow.remove();
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
    // Wire the inputs once — rollover re-runs must not stack listeners.
    if (!fromSel.dataset.wired) {
      fromSel.dataset.wired = "1";
      [fromSel, toSel, paceSel, startSel].filter(Boolean).forEach((s) => s.addEventListener("input", update));
    }
    renderDiagram();
    update();
    // Full-line pavement GPX for this month's line — a sibling of the diagram, so
    // it survives the diagram's re-renders (any previous row was removed above).
    const planGpx = gpxDownloadHtml(lineSlug(nextRun.key), nextRun.key, "plan-gpx");
    if (diagram && planGpx) diagram.insertAdjacentHTML("afterend", `<p class="plan-gpx-row">Take it with you: ${planGpx}</p>`);
  }

  // Once the network data loads, build the interchange map and re-render the strips,
  // journey board and schedule so every station shows its Tube + rail interchanges.
  // Runs unconditionally at boot — the planner's early returns (an adventure or
  // unmapped next run) must NOT gate it, or those cases lose every Tube interchange.
  function enrichInterchanges() {
    // Only the fetch failure is swallowed — errors in the render work below must surface.
    loadNetwork().catch(() => null).then((net) => {
      if (!net) return;
      interchangeMap = buildInterchangeMap(net);
      tubeGeo = buildTubeGeo(net);
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
    // Sign-style leg distances: each segment labels the gap from the previous
    // stop (on-street estimate, or true along-path km when the caller has it).
    const legKm = (i) => (opts.legKms ? opts.legKms[i] : haversineKm(wp[i - 1], wp[i]) * ROAD_FACTOR);
    const legLbl = (km) => (distUnit === "km" && km < 0.95 ? `${Math.round(km * 200) * 5} m` : fmtKm(km, 1));
    const track = wp.map((p, i) => {
      const active = i >= a && i <= b;
      const endpoint = i === from || i === to;
      return `<${tag} class="stn${active ? " active" : ""}${endpoint ? " endpoint" : ""}"${tappable ? ` data-i="${i}"` : ""} title="${escapeHtml(p[0])}" aria-label="${escapeHtml(p[0])}">
                <span class="stn-name">${escapeHtml(p[0])}</span>
                <span class="rail"><span class="dot"></span>${i ? `<span class="stn-leg">${legLbl(legKm(i))}</span>` : ""}</span>
                ${opts.geoInterchange ? geoInterchangeTags(p[1], p[2]) : interchangeTags(p[0], lineName)}
              </${tag}>`;
    }).join("");
    const totalKm = opts.totalKm !== undefined ? opts.totalKm : waypointsKm(wp) * ROAD_FACTOR;
    const total = wp.length > 1 ? `<div class="strip-total">${fmtKm(totalKm, 1)} end to end</div>` : "";
    return banner + `<div class="line-track">${track}</div>` + total;
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
    if (!result) return;
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
  // Tool-fetched JSON lands in these style attributes; a poisoned upstream could
  // smuggle markup — clamp to a hex colour.
  const safeColour = (c) => (/^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? c : "#0019A8");
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
    "lioness", "mildmay", "windrush", "weaver", "suffragette", "liberty", "elizabeth", "dlr",
    // National Rail (tools/generate-nr-routes.mjs — main branch, pavement-routed)
    "chiltern-railways", "thameslink", "c2c", "great-northern", "greater-anglia",
    "great-western-railway", "heathrow-express", "southeastern", "southern", "south-western-railway"]);
  function lineSlug(name) { return String(name || "").toLowerCase().replace(/\s*&\s*/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function gpxDownloadHtml(slugOrName, lineName, extraClass) {
    const slug = GPX_LINES.has(slugOrName) ? slugOrName : lineSlug(slugOrName);
    if (!GPX_LINES.has(slug)) return "";
    const label = lineName || slug;
    return `<a class="gpx-dl${extraClass ? " " + extraClass : ""}" href="routes/${slug}.gpx" download="TubeRun-${slug}.gpx" title="Download the ${escapeHtml(label)} line's pavement route as a GPX file for your watch">↓ GPX</a><a class="gpx-dl tcx-dl${extraClass ? " " + extraClass : ""}" href="#" data-slug="${slug}" title="Download as a Garmin TCX course — Virtual Partner pacing at your site pace">⌚ TCX</a>`;
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

  // Convert a route's points ([lat, lon, ele?] — the same geometry the site
  // draws) to a Garmin TCX Course. Garmin's course format wants a Time on
  // every point, so times are synthesised at the visitor's rtPace — load it
  // onto the watch and the Virtual Partner runs at your pace.
  function tcxFromPoints(points, courseName, reverse) {
    let pts = points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) return null;
    if (reverse) pts = pts.slice().reverse();
    let cumKm = 0;
    const base = Date.now();
    const rows = pts.map((p, i) => {
      if (i) cumKm += haversineKm([0, pts[i - 1][0], pts[i - 1][1]], [0, p[0], p[1]]); // waypoint-shaped [name, lat, lon]
      const t = new Date(base + cumKm * rtPace * 60000).toISOString();
      const ele = Number.isFinite(p[2]) ? `<AltitudeMeters>${p[2].toFixed(1)}</AltitudeMeters>` : "";
      return `<Trackpoint><Time>${t}</Time><Position><LatitudeDegrees>${p[0]}</LatitudeDegrees><LongitudeDegrees>${p[1]}</LongitudeDegrees></Position>${ele}<DistanceMeters>${Math.round(cumKm * 1000)}</DistanceMeters></Trackpoint>`;
    });
    const a = pts[0], b = pts[pts.length - 1];
    return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
 <Courses><Course>
  <Name>${escapeHtml(courseName.slice(0, 15))}</Name>
  <Lap><TotalTimeSeconds>${Math.round(cumKm * rtPace * 60)}</TotalTimeSeconds><DistanceMeters>${Math.round(cumKm * 1000)}</DistanceMeters>
   <BeginPosition><LatitudeDegrees>${a[0]}</LatitudeDegrees><LongitudeDegrees>${a[1]}</LongitudeDegrees></BeginPosition>
   <EndPosition><LatitudeDegrees>${b[0]}</LatitudeDegrees><LongitudeDegrees>${b[1]}</LongitudeDegrees></EndPosition>
   <Intensity>Active</Intensity></Lap>
  <Track>${rows.join("")}</Track>
 </Course></Courses>
</TrainingCenterDatabase>`;
  }

  // Build a minimal GPX track from a route's points ([lat, lon, ele?]) — the same
  // geometry the site draws — so a runner can export the exact variant they pick on
  // the map, not just the line's whole-line file.
  function gpxFromPoints(points, name) {
    const pts = points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) return null;
    const trkpts = pts.map((p) => {
      const ele = Number.isFinite(p[2]) ? `<ele>${p[2].toFixed(1)}</ele>` : "";
      return `<trkpt lat="${p[0]}" lon="${p[1]}">${ele}</trkpt>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TubeRun" xmlns="http://www.topografix.com/GPX/1/1">
 <trk><name>${escapeHtml(name)}</name><trkseg>${trkpts}</trkseg></trk>
</gpx>`;
  }

  // Client-side "save this blob as a file": synthesise a download click, then
  // revoke the object URL once the browser has had time to start the save.
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // One delegated handler covers every "⌚ TCX" link the templates emit
  // (journey board, plan, line-by-line, geo map picker).
  document.addEventListener("click", async (e) => {
    const a = e.target && e.target.closest && e.target.closest(".tcx-dl");
    if (!a || !a.dataset.slug) return;
    e.preventDefault();
    const slug = a.dataset.slug, reverse = a.dataset.rev === "1";
    try {
      // Same geometry the site draws: the primary variant for branching lines,
      // else the GPX's main track segment.
      const vroutes = await loadVariantRoutes();
      let pts = vroutes[slug] && vroutes[slug][0] && vroutes[slug][0].length > 1 ? vroutes[slug][0] : null;
      if (!pts) { const segs = await loadRouteGpx(slug); pts = segs && segs[0]; }
      if (!pts || pts.length < 2) throw new Error("no track");
      const tcx = tcxFromPoints(pts, `TubeRun ${slug}`, reverse);
      if (!tcx) throw new Error("no track");
      downloadBlob(`TubeRun-${slug}${reverse ? "-reverse" : ""}.tcx`, new Blob([tcx], { type: "application/vnd.garmin.tcx+xml" }));
    } catch (_) {
      const was = a.textContent;
      a.textContent = "TCX unavailable";
      setTimeout(() => { a.textContent = was; }, 1800);
    }
  });

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

  // --- Render: Featured shout-out banner --------------------------------
  function renderFeature() {
    const el = document.getElementById("featureBanner");
    if (!el || !FEATURE) { if (el) el.hidden = true; return; }
    const preview = new URLSearchParams(location.search).has("feature");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let dismissed = false;
    try { dismissed = localStorage.getItem("tuberun_feat_" + FEATURE.id) === "1"; } catch (_) { /* private mode */ }
    // Hide once the day has passed, or if this visitor dismissed it (?feature overrides both).
    if (!preview && (dismissed || today > parseISO(FEATURE.until))) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `
      <span class="feat-text"><strong>${escapeHtml(FEATURE.kicker)}</strong> — ${escapeHtml(FEATURE.title)}: ${escapeHtml(FEATURE.detail)}</span>
      <span class="feat-actions">
        <a class="feat-cta" href="${escapeAttr(FEATURE.url)}" target="_blank" rel="noopener">${escapeHtml(FEATURE.cta)} ↗</a>
        <button type="button" class="feat-close" aria-label="Dismiss this notice">×</button>
      </span>`;
    const close = el.querySelector(".feat-close");
    if (close) {
      close.addEventListener("click", () => {
        el.hidden = true;
        try { localStorage.setItem("tuberun_feat_" + FEATURE.id, "1"); } catch (_) { /* private mode */ }
      });
    }
  }

  // --- Page version -----------------------------------------------------
  // Surface the deployed cache-buster (script.js?v=N, bumped every commit by the
  // pre-commit hook) in the footer, so it's clear which build is on screen.
  function showPageVersion() {
    const el = document.getElementById("pageVersion");
    if (!el) return;
    const tag = document.querySelector('script[src*="script.js"]');
    const m = tag && (tag.getAttribute("src") || "").match(/[?&]v=(\d+)/);
    el.textContent = m ? `Version ${m[1]}` : "";
  }

  // --- Route ideas library (adapted from a runners' guide to London) -----
  const ROUTE_COLOURS = { river: "#0E7C90", canal: "#237A49", park: "#2C7D45", landmark: "#9B0056", trail: "#4E6E22", disused: "#7A5230", race: "#E8600F" };
  // Each route carries an indicative `path` of [lat,lon] waypoints tracing the described
  // course (an overview line, not a turn-by-turn GPX); `loop` closes the trace visually.
  const ROUTES = [
    { id: "regents-canal", name: "Regent's Canal Towpath", type: "canal", leg: "Limehouse Basin → Little Venice", start: "Limehouse (DLR/c2c)", distance: "9.3 mi (15 km)", highlights: "Largely traffic-free towpath past Mile End Park, Victoria Park, Camden Lock and the narrowboats of Little Venice; flat.", suitability: "Ideal sociable long run — flat, easy to follow, splittable into shorter chunks.", loop: false, path: [[51.5122, -0.0395], [51.5170, -0.0367], [51.5230, -0.0345], [51.5305, -0.0408], [51.5360, -0.0430], [51.5378, -0.0640], [51.5352, -0.0900], [51.5335, -0.1088], [51.5362, -0.1290], [51.5415, -0.1465], [51.5348, -0.1610], [51.5245, -0.1795], [51.5220, -0.1830]] },
    { id: "hyde-kensington", name: "Hyde Park & Kensington Gardens Loop", type: "park", leg: "Perimeter of both royal parks", start: "Hyde Park Corner / Lancaster Gate", distance: "4.2 mi (6.8 km)", highlights: "Sealed paths around the Serpentine, Italian Gardens and Diana Memorial; mild undulations.", suitability: "Very group-friendly — flat loop with 1mi/2mi markers built in for mixed paces.", loop: true, path: [[51.5028, -0.1527], [51.5090, -0.1560], [51.5131, -0.1589], [51.5118, -0.1700], [51.5079, -0.1812], [51.5030, -0.1858], [51.5008, -0.1770], [51.5020, -0.1660], [51.5033, -0.1600], [51.5028, -0.1527]] },
    { id: "grand-tour", name: "The Grand Tour (Thames Landmarks)", type: "landmark", leg: "Trafalgar Sq → Tower Bridge & back, both banks", start: "Charing Cross", distance: "6.1 mi (9.8 km)", highlights: "Westminster, the London Eye, Tate Modern, the Globe, St Paul's, the Tower — the Thames Path both banks.", suitability: "Perfect landmark tour — allow 2–3× time for photos; can be congested.", loop: true, path: [[51.5074, -0.1278], [51.5044, -0.1240], [51.5010, -0.1215], [51.5030, -0.1170], [51.5055, -0.1050], [51.5076, -0.0994], [51.5079, -0.0900], [51.5052, -0.0790], [51.5045, -0.0754], [51.5055, -0.0754], [51.5081, -0.0759], [51.5104, -0.0870], [51.5138, -0.0984], [51.5110, -0.1090], [51.5074, -0.1210], [51.5074, -0.1278]] },
    { id: "regents-park", name: "Regent's Park & Primrose Hill", type: "park", leg: "Outer Circle loop + Primrose Hill", start: "Baker Street / Great Portland Street", distance: "4.0 mi (6.5 km)", highlights: "Gardens, boating lake, an old cinder track and the famous city view from Primrose Hill.", suitability: "Something for everyone — flat 2.7mi loop with an optional hill for keen legs.", loop: true, path: [[51.5226, -0.1571], [51.5255, -0.1605], [51.5295, -0.1615], [51.5322, -0.1555], [51.5330, -0.1475], [51.5305, -0.1445], [51.5350, -0.1505], [51.5388, -0.1582], [51.5350, -0.1505], [51.5300, -0.1445], [51.5262, -0.1500], [51.5226, -0.1571]] },
    { id: "diana-memorial", name: "Diana Memorial Run", type: "landmark", leg: "Figure-of-eight through four royal parks", start: "Hyde Park Corner", distance: "7.2 mi (11.6 km)", highlights: "Way-marked with 90 brass plates past Buckingham Palace, St James's, Green & Hyde Parks.", suitability: "Easy navigation, splittable into two loops; some road crossings by the Palace.", loop: true, path: [[51.5028, -0.1527], [51.5015, -0.1445], [51.5014, -0.1419], [51.5024, -0.1360], [51.5030, -0.1310], [51.5045, -0.1360], [51.5050, -0.1428], [51.5040, -0.1500], [51.5028, -0.1527]] },
    { id: "victoria-park", name: "Victoria Park Loop", type: "park", leg: "Perimeter of the 'People's Park'", start: "Hackney Wick / Cambridge Heath", distance: "2.7 mi (4.4 km)", highlights: "Tree-lined avenues with parallel dirt bridle paths, ponds and gardens; flanked by two canals.", suitability: "Sociable and popular — flat, wide paths, lots of runners for company.", loop: true, path: [[51.5358, -0.0450], [51.5360, -0.0360], [51.5385, -0.0320], [51.5415, -0.0350], [51.5420, -0.0410], [51.5405, -0.0470], [51.5378, -0.0500], [51.5358, -0.0450]] },
    { id: "battersea-park", name: "Battersea Park Circuit", type: "park", leg: "Loop via Carriage Drive", start: "Battersea Park Rail / Queenstown Road", distance: "2.2 mi (3.5 km)", highlights: "Riverside park from Albert to Chelsea Bridge with crushed-limestone paths and a track; flat.", suitability: "Great all-paces park — flat, no traffic (track only before 8am).", loop: true, path: [[51.4800, -0.1560], [51.4820, -0.1555], [51.4832, -0.1500], [51.4820, -0.1460], [51.4798, -0.1475], [51.4788, -0.1520], [51.4800, -0.1560]] },
    { id: "greenwich-park", name: "Greenwich Park & Blackheath", type: "park", leg: "Park circuit onto Blackheath", start: "Cutty Sark DLR / Greenwich Rail", distance: "2 mi (3.2 km) + Blackheath", highlights: "Royal Observatory, the Meridian, sweeping city views, then the open expanse of Blackheath.", suitability: "Scenery plus a hill challenge — flat north, then three climbs.", loop: false, path: [[51.4827, -0.0096], [51.4805, -0.0057], [51.4785, -0.0020], [51.4769, -0.0005], [51.4730, 0.0000], [51.4690, 0.0060], [51.4670, 0.0090]] },
    { id: "hampstead-heath", name: "Hampstead Heath", type: "trail", leg: "Loop over Parliament Hill & the ponds", start: "Hampstead / Gospel Oak (Overground)", distance: "6.0 mi (9.7 km)", highlights: "320 hectares of woodland, heath and ponds crowned by the Parliament Hill view.", suitability: "For a confident group — hilly, easy to get lost, keep together; muddy when wet.", loop: true, path: [[51.5555, -0.1530], [51.5580, -0.1550], [51.5600, -0.1580], [51.5640, -0.1610], [51.5690, -0.1625], [51.5710, -0.1670], [51.5670, -0.1740], [51.5610, -0.1770], [51.5570, -0.1760], [51.5555, -0.1530]] },
    { id: "stjames-green", name: "St James's & Green Park", type: "park", leg: "Loop around both parks and the lake", start: "Green Park / St James's Park", distance: "2.4 mi (3.9 km)", highlights: "Green oasis on Buckingham Palace's doorstep with a photo-ready lake and The Mall.", suitability: "Easy short social loop, very photogenic; heavy foot traffic.", loop: true, path: [[51.5067, -0.1428], [51.5058, -0.1360], [51.5045, -0.1320], [51.5024, -0.1340], [51.5014, -0.1419], [51.5035, -0.1442], [51.5050, -0.1440], [51.5067, -0.1428]] },
    { id: "southwark-docks", name: "Southwark Park & the Docks", type: "park", leg: "Park out to Greenland Dock & Thames Path", start: "Surrey Quays / Canada Water", distance: "1.4 mi (2.25 km), extendable", highlights: "Victorian park linking to Greenland Dock, Russia Dock Woodland and a rare south-bank river corridor.", suitability: "Flexible — flat, quiet, easily lengthened along the docks and river.", loop: false, path: [[51.4980, -0.0498], [51.4958, -0.0520], [51.4945, -0.0480], [51.4915, -0.0450], [51.4950, -0.0430], [51.5000, -0.0470]] },
    { id: "wormwood-scrubs", name: "Wormwood Scrubs", type: "park", leg: "Perimeter loop of 'The Scrubs'", start: "East Acton (Central)", distance: "2.4 mi (3.85 km)", highlights: "Vast open grass with a 960m sealed loop and Grand Union Canal access next door; flat.", suitability: "Roomy and flat for all paces, with the canal as an add-on.", loop: true, path: [[51.5165, -0.2480], [51.5195, -0.2430], [51.5225, -0.2380], [51.5228, -0.2300], [51.5200, -0.2280], [51.5175, -0.2330], [51.5170, -0.2430], [51.5165, -0.2480]] },
    { id: "richmond-park", name: "Richmond Park (Tamsin Trail)", type: "trail", leg: "Perimeter shared-use loop", start: "Richmond (District/Overground)", distance: "7.2 mi (11.7 km)", highlights: "London's largest royal park — wild deer, ancient oaks, Isabella Plantation and big skies on a way-marked gravel loop.", suitability: "A proper long run for a confident group — gently hilly, traffic-free, easy to follow.", loop: true, path: [[51.4530, -0.2880], [51.4560, -0.2560], [51.4380, -0.2400], [51.4270, -0.2680], [51.4380, -0.2950], [51.4530, -0.2880]] },
    { id: "bushy-park", name: "Bushy Park", type: "park", leg: "Chestnut Avenue & Diana Fountain loop", start: "Teddington / Hampton Wick (rail)", distance: "3.2 mi (5.2 km)", highlights: "Deer, the mile-long Chestnut Avenue, the Diana Fountain and the Water Gardens, next to Hampton Court.", suitability: "Flat, open and roomy — great all-paces park with plenty of space.", loop: true, path: [[51.4180, -0.3450], [51.4180, -0.3300], [51.4080, -0.3300], [51.4080, -0.3450], [51.4180, -0.3450]] },
    { id: "wimbledon-common", name: "Wimbledon Common & Putney Heath", type: "trail", leg: "Windmill & woodland loop", start: "Putney / Wimbledon (rail)", distance: "4.0 mi (6.5 km)", highlights: "Heath, woods and horse rides around the windmill; a mix of gravel tracks and trails.", suitability: "Undulating and easy to get lost — keep the group together; muddy after rain.", loop: true, path: [[51.4400, -0.2400], [51.4400, -0.2200], [51.4270, -0.2200], [51.4270, -0.2400], [51.4400, -0.2400]] },
    { id: "clapham-common", name: "Clapham Common", type: "park", leg: "Triangle loop past the bandstand", start: "Clapham Common (Northern)", distance: "2.0 mi (3.2 km)", highlights: "Flat open triangle with wide paths, the bandstand and three ponds; a south London running staple.", suitability: "Flat and central — perfect easy social loop for all paces.", loop: true, path: [[51.4640, -0.1520], [51.4640, -0.1420], [51.4580, -0.1420], [51.4580, -0.1520], [51.4640, -0.1520]] },
    { id: "wandsworth-common", name: "Wandsworth Common", type: "park", leg: "Perimeter loop", start: "Wandsworth Common (rail)", distance: "2.5 mi (4 km)", highlights: "Leafy common with a lake, the Scope and quiet paths away from the traffic.", suitability: "Flat, relaxed and rarely crowded — a friendly all-paces loop.", loop: true, path: [[51.4490, -0.1700], [51.4490, -0.1620], [51.4410, -0.1620], [51.4410, -0.1700], [51.4490, -0.1700]] },
    { id: "brockwell-park", name: "Brockwell Park", type: "park", leg: "Hilltop loop above Herne Hill", start: "Herne Hill (rail)", distance: "2.2 mi (3.5 km)", highlights: "A short climb to a walled garden and one of the best skyline views in south London, plus the lido.", suitability: "Small but punchy — one hill, big reward; loops nicely for mixed paces.", loop: true, path: [[51.4560, -0.1090], [51.4560, -0.1020], [51.4500, -0.1020], [51.4500, -0.1090], [51.4560, -0.1090]] },
    { id: "dulwich-park", name: "Dulwich Park", type: "park", leg: "Flat carriage-drive loop", start: "North Dulwich (rail)", distance: "1.6 mi (2.6 km)", highlights: "A smooth ex-carriage-drive loop round lawns, a boating lake and rhododendrons.", suitability: "Flat, sealed and easy — ideal for beginners and recovery runs.", loop: true, path: [[51.4440, -0.0880], [51.4440, -0.0800], [51.4400, -0.0800], [51.4400, -0.0880], [51.4440, -0.0880]] },
    { id: "crystal-palace-park", name: "Crystal Palace Park", type: "park", leg: "Dinosaurs & terraces loop", start: "Crystal Palace (rail)", distance: "1.9 mi (3.1 km)", highlights: "Victorian dinosaurs, the old palace terraces, a maze and the National Sports Centre.", suitability: "Quirky and fun — gentle undulations, lots to look at.", loop: true, path: [[51.4240, -0.0730], [51.4240, -0.0670], [51.4180, -0.0670], [51.4180, -0.0730], [51.4240, -0.0730]] },
    { id: "alexandra-park", name: "Alexandra Park", type: "park", leg: "Ally Pally panorama loop", start: "Alexandra Palace (rail)", distance: "2.5 mi (4 km)", highlights: "'The People's Palace' with a sweeping panorama across the whole city; a proper hill up to the terrace.", suitability: "One big climb, then a view to earn it — a spirited group loop.", loop: true, path: [[51.5960, -0.1350], [51.5960, -0.1230], [51.5910, -0.1230], [51.5910, -0.1350], [51.5960, -0.1350]] },
    { id: "finsbury-park", name: "Finsbury Park", type: "park", leg: "Perimeter loop", start: "Finsbury Park (Victoria/Piccadilly)", distance: "1.6 mi (2.6 km)", highlights: "Busy north London park with a boating lake, an athletics track and the New River on its edge.", suitability: "Flat, central and sociable — links straight onto the Parkland Walk.", loop: true, path: [[51.5740, -0.1020], [51.5740, -0.0940], [51.5690, -0.0940], [51.5690, -0.1020], [51.5740, -0.1020]] },
    { id: "parkland-walk", name: "Parkland Walk", type: "disused", leg: "Finsbury Park → Alexandra Palace (the old GNR branch)", start: "Finsbury Park (Victoria/Piccadilly)", distance: "4.5 mi (7.3 km)", highlights: "London's longest nature reserve along the Edgware, Highgate & Alexandra Palace railway (closed 1954) — old platforms at Crouch End, the Highgate tunnel portals, then over St James Lane viaduct to Ally Pally.", suitability: "Leafy, car-free and gently graded, with one road link over Highgate Hill; train home from Alexandra Palace.", loop: false, path: [[51.5645, -0.1065], [51.5717, -0.1218], [51.5777, -0.1458], [51.5872, -0.1440], [51.5983, -0.1202]],
      stops: [["Finsbury Park", 51.5645, -0.1065], ["Oxford Road", 51.5661, -0.1085], ["Stapleton Hall Road", 51.5691, -0.1152], ["Crouch Hill", 51.5709, -0.118], ["Crouch End Hill (old platforms)", 51.5717, -0.1218], ["Stanhope Road", 51.5737, -0.1307], ["Holmesdale Road", 51.5758, -0.1412], ["Highgate", 51.5777, -0.1458], ["Cranley Gardens", 51.5872, -0.144], ["Muswell Hill viaduct", 51.5901, -0.1398], ["Alexandra Palace", 51.5983, -0.1202]] },
    { id: "crystal-palace-high-level", name: "Crystal Palace High Level", type: "disused", leg: "Forest Hill → Crystal Palace over the lost High Level branch", start: "Forest Hill (Windrush)", distance: "3.4 mi (5.5 km)", highlights: "Cox's Walk into Sydenham Hill Wood, where the trackbed and tunnel portal of the Crystal Palace High Level railway (closed 1954) hide in the trees; finish beside the Palace terraces.", suitability: "Short but properly lumpy — woodland paths and real hills; muddy after rain.", loop: false, path: [[51.4394, -0.0531], [51.4408, -0.0800], [51.4325, -0.0803], [51.4181, -0.0729]],
      stops: [["Forest Hill", 51.4394, -0.0531], ["Cox's Walk", 51.4425, -0.0728], ["Sydenham Hill Wood", 51.439, -0.0795], ["Sydenham Hill", 51.4325, -0.0803], ["Crystal Palace Parade", 51.4235, -0.0784], ["Crystal Palace", 51.4181, -0.0729]] },
    { id: "northern-heights", name: "Northern Heights", type: "disused", leg: "Mill Hill East → Mill Hill Broadway (the tube that never was)", start: "Mill Hill East (Northern)", distance: "2.3 mi (3.7 km)", highlights: "The Mill Hill Old Railway nature reserve follows the Edgware branch the Northern line was electrifying when war killed the Northern Heights plan — passenger trains never came back.", suitability: "Short and gentle on a single-track path — run single file, or pair it with a Dollis Valley extension.", loop: false, path: [[51.6082, -0.2103], [51.6165, -0.2295], [51.6127, -0.2489]],
      stops: [["Mill Hill East", 51.6082, -0.2103], ["Bittacy Hill", 51.613, -0.22], ["Old Railway reserve", 51.6165, -0.2295], ["Copthall fields", 51.614, -0.238], ["Mill Hill Broadway", 51.6127, -0.2489]] },
    { id: "ebury-way", name: "Ebury Way", type: "disused", leg: "Rickmansworth → Watford High Street rail trail", start: "Rickmansworth (Metropolitan)", distance: "4.7 mi (7.5 km)", highlights: "The 1862 Watford & Rickmansworth Railway, now a flat gravel greenway across the Colne and Gade — aquadrome lakes, watercress country and canal crossings all the way to Watford.", suitability: "Pancake-flat, traffic-free and easy to follow — an ideal winter longer run; Lioness line home.", loop: false, path: [[51.6404, -0.4736], [51.6355, -0.4630], [51.6480, -0.4230], [51.6524, -0.3917]],
      stops: [["Rickmansworth", 51.6404, -0.4736], ["Aquadrome", 51.6355, -0.463], ["Colne crossing", 51.642, -0.44], ["Croxley Common Moor", 51.648, -0.423], ["Watford High Street", 51.6524, -0.3917]] },
    { id: "surrey-iron-railway", name: "Surrey Iron Railway", type: "disused", leg: "Wandsworth → West Croydon down the Wandle", start: "Wandsworth Town (rail)", distance: "8.5 mi (13.6 km)", highlights: "Trace the world's first public railway — 1803, horse-drawn — along the Wandle Trail: mills, wetlands and Morden Hall Park on the way to Croydon.", suitability: "A proper point-to-point long run — flat, mostly riverside path, splittable at Colliers Wood or Mitcham.", loop: false, path: [[51.4610, -0.1881], [51.4424, -0.1875], [51.4180, -0.1778], [51.3898, -0.1578], [51.3784, -0.0999]],
      stops: [["Wandsworth Town", 51.461, -0.1881], ["Earlsfield", 51.4424, -0.1875], ["Plough Lane", 51.431, -0.187], ["Colliers Wood", 51.418, -0.1778], ["Morden Hall Park", 51.4023, -0.1875], ["Mitcham Junction", 51.3898, -0.1578], ["West Croydon", 51.3784, -0.0999]] },
    { id: "longmoor-military", name: "Longmoor Military Railway", type: "disused", far: true, leg: "Liss → Liss Forest on the old army railway", start: "Liss (South Western)", distance: "1.2 mi (2.0 km)", highlights: "The Riverside Railway Walk follows the Army's own railway (1903–1969) out of Liss beside the Rother — the line that trained generations of military railwaymen at Longmoor.", suitability: "Short, flat and out-of-town — an out-and-back leg-stretcher on the Shipwrights Way; the camp beyond is still MOD land.", loop: false, path: [[51.0447, -0.8927], [51.0505, -0.8877], [51.0571, -0.8842]],
      stops: [["Liss", 51.0447, -0.8927], ["Rother bridge", 51.0505, -0.8877], ["Liss Forest", 51.0571, -0.8842]] },
    { id: "grand-union-paddington", name: "Grand Union Canal (Paddington Arm)", type: "canal", leg: "Little Venice → Alperton", start: "Warwick Avenue (Bakerloo)", distance: "6.1 mi (9.8 km)", highlights: "Flat, quiet towpath out of Little Venice past Kensal Green and Wembley's edge — narrowboats all the way.", suitability: "Flat and easy underfoot — a calm long run away from the traffic.", loop: false, path: [[51.5225, -0.1830], [51.5270, -0.2200], [51.5330, -0.2550], [51.5400, -0.2990]] },
    { id: "lea-navigation", name: "Lea Navigation", type: "canal", leg: "Limehouse → Hackney Marshes", start: "Limehouse (DLR)", distance: "5.0 mi (8 km)", highlights: "Towpath from the Thames up past the Olympic Park and out to the wide-open Hackney Marshes.", suitability: "Flat, traffic-free and splittable — a favourite east London long run.", loop: false, path: [[51.5122, -0.0395], [51.5250, -0.0380], [51.5400, -0.0360], [51.5560, -0.0300]] },
    { id: "olympic-park", name: "Queen Elizabeth Olympic Park", type: "landmark", leg: "Stadium, Orbit & waterways loop", start: "Stratford / Hackney Wick", distance: "2.6 mi (4.2 km)", highlights: "The 2012 Stadium, the ArcelorMittal Orbit, the Aquatics Centre and waterside paths through the park.", suitability: "Wide, flat, way-marked paths — modern and sociable for all paces.", loop: true, path: [[51.5480, -0.0200], [51.5480, -0.0110], [51.5380, -0.0110], [51.5380, -0.0200], [51.5480, -0.0200]] },
    { id: "thames-putney-richmond", name: "Thames Path: Putney → Richmond", type: "river", leg: "Boat Race course to Richmond", start: "Putney Bridge (District)", distance: "6.0 mi (9.7 km)", highlights: "The Championship Course along the river past Barnes and Kew Gardens to riverside Richmond.", suitability: "Flat riverside miles — scenic and easy to follow; can be muddy in patches.", loop: false, path: [[51.4670, -0.2160], [51.4750, -0.2450], [51.4700, -0.2800], [51.4610, -0.3080]] },
    { id: "thames-barrier", name: "Thames Barrier Path", type: "river", leg: "Greenwich → the Thames Barrier", start: "Cutty Sark (DLR)", distance: "4.4 mi (7.1 km)", highlights: "Downriver from Greenwich past the O2 to the silver hoods of the Thames Barrier.", suitability: "Flat, open and breezy — a straightforward point-to-point along the river.", loop: false, path: [[51.4830, -0.0090], [51.4880, 0.0080], [51.4930, 0.0230], [51.4975, 0.0360]] },
    { id: "london-marathon", name: "London Marathon", type: "race", leg: "Blackheath → Cutty Sark → Tower Bridge → Canary Wharf → The Mall", start: "Blackheath rail / Greenwich Park", distance: "26.2 mi (42.2 km)", highlights: "The whole iconic course: from the Blackheath starts out past Woolwich, down to the Cutty Sark, round Rotherhithe and over Tower Bridge, the long loop through the Isle of Dogs and Canary Wharf, then back past the Tower and along the Embankment through Westminster to finish on The Mall.", suitability: "A full marathon on flat, closed roads — our longest route by far, with rail and DLR bail-out points all along it. Indicative line traced from the course map.", loop: false, path: [[51.4690, 0.0120], [51.4735, 0.0330], [51.4800, 0.0510], [51.4865, 0.0645], [51.4888, 0.0655], [51.4900, 0.0450], [51.4880, 0.0230], [51.4840, 0.0030], [51.4808, -0.0075], [51.4820, -0.0096], [51.4815, -0.0230], [51.4855, -0.0335], [51.4915, -0.0455], [51.4975, -0.0510], [51.5012, -0.0520], [51.5015, -0.0445], [51.4988, -0.0575], [51.4990, -0.0670], [51.5015, -0.0740], [51.5033, -0.0754], [51.5079, -0.0760], [51.5083, -0.0616], [51.5095, -0.0470], [51.5108, -0.0355], [51.5075, -0.0255], [51.5000, -0.0245], [51.4930, -0.0250], [51.4880, -0.0180], [51.4872, -0.0110], [51.4905, -0.0078], [51.4970, -0.0075], [51.5025, -0.0095], [51.5050, -0.0170], [51.5045, -0.0220], [51.5072, -0.0245], [51.5098, -0.0300], [51.5100, -0.0430], [51.5085, -0.0616], [51.5079, -0.0760], [51.5095, -0.0800], [51.5090, -0.0870], [51.5100, -0.0960], [51.5110, -0.1035], [51.5098, -0.1120], [51.5072, -0.1205], [51.5045, -0.1235], [51.5012, -0.1243], [51.5003, -0.1295], [51.5008, -0.1352], [51.5010, -0.1412], [51.5024, -0.1400], [51.5040, -0.1345]] },
    { id: "big-half", name: "The Big Half", type: "race", leg: "Tower Bridge → Canary Wharf → Greenwich", start: "Tower Gateway (DLR)", distance: "13.1 mi (21.1 km)", highlights: "London's great half-marathon route: east along The Highway past Wapping to loop Canary Wharf, back over Tower Bridge, then the south bank through Bermondsey, Rotherhithe and Deptford to finish at the Cutty Sark.", suitability: "A full half-marathon on flat, iconic riverside roads; point-to-point with the DLR home from Greenwich. Indicative line traced from the 2022 course map.", loop: false, path: [[51.5095, -0.0740], [51.5085, -0.0620], [51.5085, -0.0455], [51.5090, -0.0270], [51.5072, -0.0205], [51.5085, -0.0090], [51.5040, -0.0205], [51.5085, -0.0400], [51.5045, -0.0555], [51.5055, -0.0730], [51.5030, -0.0754], [51.4990, -0.0670], [51.5008, -0.0520], [51.4990, -0.0455], [51.4935, -0.0480], [51.4880, -0.0475], [51.4835, -0.0330], [51.4818, -0.0210], [51.4827, -0.0098]] },
    { id: "vitality-10k", name: "Vitality London 10,000", type: "race", leg: "The Mall → City of London loop → The Mall", start: "St James's Park (District/Circle)", distance: "6.2 mi (10 km)", highlights: "The classic central-London 10K: down The Mall past Trafalgar Square, along the Strand and Fleet Street into the City past St Paul's and Bank, then back to finish by Buckingham Palace.", suitability: "Fast, flat and landmark-packed; starts and finishes by the Palace. Indicative line traced from the course map.", loop: true, path: [[51.5045, -0.1330], [51.5065, -0.1290], [51.5079, -0.1281], [51.5104, -0.1200], [51.5113, -0.1105], [51.5140, -0.1110], [51.5155, -0.0975], [51.5138, -0.0932], [51.5133, -0.0886], [51.5122, -0.0910], [51.5115, -0.0975], [51.5110, -0.1080], [51.5100, -0.1200], [51.5079, -0.1281], [51.5065, -0.1245], [51.5030, -0.1265], [51.5010, -0.1330]] },
    { id: "burgess-park", name: "Burgess Park", type: "park", leg: "Burgess Park loop", start: "Burgess Park", distance: "2.8 mi (4.5 km)", highlights: "A regenerated south London park with a fishing lake, man-made hills for sprints and the traffic-free old Surrey Canal alignment toward Peckham.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.4839, -0.07683], [51.48315, -0.07698], [51.48269, -0.08574], [51.48336, -0.08769], [51.48341, -0.08783], [51.48349, -0.0876], [51.48353, -0.0879], [51.48414, -0.08554], [51.4859, -0.08024], [51.48661, -0.08087], [51.48733, -0.07932], [51.48866, -0.07772], [51.48884, -0.07808], [51.48864, -0.07719], [51.48897, -0.07773], [51.48891, -0.07799], [51.48884, -0.07808], [51.48866, -0.07772], [51.48661, -0.08087], [51.4858, -0.08025], [51.48457, -0.08396], [51.48343, -0.0836], [51.48338, -0.08396], [51.48374, -0.08369], [51.48432, -0.07961], [51.48426, -0.07675]] },
    { id: "sutcliffe-park", name: "Sutcliffe Park", type: "park", leg: "Eltham loop", start: "Kidbrooke Station", distance: "0.85 mi (1.4 km)", highlights: "A compact wetland park with a running track and figure-of-eight trails ideal for pacing reps.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.45475, 0.02935], [51.45445, 0.02931], [51.45423, 0.02962], [51.45423, 0.03027], [51.45436, 0.03042], [51.45351, 0.03144], [51.4534, 0.03277], [51.4536, 0.03434], [51.45328, 0.03441], [51.45342, 0.03665], [51.4533, 0.03701], [51.45296, 0.03727], [51.45244, 0.04235], [51.45161, 0.04588], [51.45152, 0.04892], [51.45121, 0.05084], [51.45087, 0.05182], [51.45079, 0.05501], [51.45093, 0.06033], [51.45081, 0.06241], [51.45087, 0.06258], [51.4511, 0.06258]] },
    { id: "danson-park", name: "Danson Park", type: "park", leg: "Bexleyheath loop", start: "Welling Station", distance: "2.4 mi (3.9 km)", highlights: "One of London's top suburban parks, circling a large boating lake past a grand Georgian mansion.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.45824, 0.11522], [51.45786, 0.11639], [51.45763, 0.11577], [51.45715, 0.11534], [51.45647, 0.11536], [51.45626, 0.11468], [51.45605, 0.11439], [51.45572, 0.11438], [51.45518, 0.11344], [51.45298, 0.11603], [51.45219, 0.11852], [51.45298, 0.11603], [51.45518, 0.11344], [51.45572, 0.11438], [51.45605, 0.11439], [51.45642, 0.11514], [51.45644, 0.11716], [51.45628, 0.11813], [51.4564, 0.11815], [51.45628, 0.11813], [51.45642, 0.11708], [51.45654, 0.117], [51.45699, 0.11724], [51.45749, 0.11696], [51.45794, 0.11622]] },
    { id: "scadbury-park", name: "Scadbury Park", type: "trail", leg: "Chislehurst loop", start: "Chislehurst", distance: "2.5 mi (4 km)", highlights: "An easy-to-follow woodland-and-meadow nature reserve loop past the moated ruins of Scadbury manor.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.4135, 0.08762], [51.41486, 0.08721], [51.41495, 0.08896], [51.41598, 0.08972], [51.41532, 0.08945], [51.41481, 0.08844], [51.41453, 0.08718], [51.41332, 0.08714], [51.41279, 0.08645], [51.41217, 0.08635], [51.41062, 0.08614], [51.4098, 0.08645], [51.40859, 0.08641], [51.40754, 0.08558], [51.40664, 0.08609], [51.40781, 0.08317], [51.40993, 0.07866], [51.40865, 0.08118], [51.40677, 0.08457], [51.40734, 0.08557], [51.40827, 0.08637], [51.40911, 0.08688], [51.41062, 0.08614], [51.41186, 0.08604], [51.41272, 0.08629], [51.41332, 0.08714]] },
    { id: "petts-wood", name: "Petts Wood", type: "trail", leg: "Petts Wood loop", start: "Petts Wood", distance: "4.0 mi (6.4 km)", highlights: "A rolling four-mile loop mixing ancient woods, heath and farmland with lung-pumping views.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.39256, 0.06475], [51.39297, 0.06871], [51.39082, 0.07023], [51.39009, 0.07243], [51.39037, 0.0767], [51.39053, 0.07987], [51.39558, 0.079], [51.3988, 0.08086], [51.40257, 0.08316], [51.40443, 0.08288], [51.40417, 0.08224], [51.40334, 0.081], [51.40345, 0.07787], [51.40318, 0.07132], [51.4063, 0.07108], [51.41015, 0.07577], [51.41133, 0.07664], [51.40865, 0.08118], [51.40717, 0.08237], [51.40471, 0.08066], [51.40085, 0.07738], [51.39864, 0.07585], [51.39715, 0.07476], [51.3977, 0.07225], [51.39475, 0.06994], [51.39276, 0.06496]] },
    { id: "high-elms-country-park", name: "High Elms Country Park", type: "trail", leg: "Farnborough loop", start: "Farnborough", distance: "2.3 mi (3.6 km)", highlights: "An undulating woodland-and-formal-garden nature reserve loop that can extend to Charles Darwin's Down House.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.35222, 0.07439], [51.35194, 0.07504], [51.35105, 0.07498], [51.34974, 0.07267], [51.34895, 0.07206], [51.3469, 0.06997], [51.34318, 0.06537], [51.33965, 0.06268], [51.33931, 0.06075], [51.33717, 0.05823], [51.33931, 0.06075], [51.34084, 0.0639], [51.34339, 0.06563], [51.34211, 0.06799], [51.34193, 0.07094], [51.34618, 0.07396], [51.34618, 0.07396], [51.34312, 0.073], [51.34312, 0.073], [51.34662, 0.07344], [51.34769, 0.07068], [51.34848, 0.07115], [51.34942, 0.07219], [51.35085, 0.07457], [51.35154, 0.07464], [51.35231, 0.07469]] },
    { id: "the-woods-of-croydon", name: "The Woods of Croydon", type: "trail", leg: "West Wickham Common → Coombe Wood Croydon", start: "West Wickham", distance: "8.25 mi (13.25 km)", highlights: "Links Croydon's spider's web of woodland commons along the fourth section of the way-marked London LOOP.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.36897, 0.00987], [51.3704, 0.00446], [51.36821, -0.00579], [51.3677, -0.01499], [51.3634, -0.031], [51.36693, -0.03997], [51.36688, -0.05269], [51.36458, -0.05836], [51.36059, -0.05877], [51.35833, -0.05755], [51.35612, -0.0592], [51.35349, -0.05894], [51.35007, -0.06022], [51.34842, -0.05555], [51.34356, -0.04352], [51.33729, -0.04688], [51.33282, -0.05643], [51.32833, -0.05888], [51.33125, -0.06877], [51.33671, -0.07629], [51.34498, -0.07966], [51.34931, -0.08297], [51.34983, -0.08811], [51.34545, -0.0947], [51.34017, -0.10038], [51.33197, -0.10045]] },
    { id: "south-norwood-country-park", name: "South Norwood Country Park", type: "trail", leg: "South Norwood loop", start: "South Norwood", distance: "1.85 mi (3 km)", highlights: "A rejuvenated nature reserve of grassland and wetland beside the Croydon Arena athletics track.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.39661, -0.05669], [51.39557, -0.05646], [51.39362, -0.05799], [51.39246, -0.06036], [51.39164, -0.06144], [51.39004, -0.06519], [51.39006, -0.065], [51.39164, -0.06144], [51.39205, -0.06091], [51.39139, -0.05843], [51.39092, -0.05835], [51.38985, -0.05706], [51.38933, -0.05673], [51.39, -0.05682], [51.3898, -0.05601], [51.38957, -0.05607], [51.38862, -0.05562], [51.38602, -0.05416], [51.38844, -0.05532], [51.3893, -0.0553], [51.3898, -0.05601], [51.39085, -0.05825], [51.3923, -0.05709], [51.39289, -0.05717], [51.39524, -0.0569], [51.3961, -0.05637]] },
    { id: "peckham-rye-and-nunhead-cemetery", name: "Peckham Rye & Nunhead Cemetery", type: "park", leg: "Peckham loop", start: "Peckham", distance: "1.6 mi (2.6 km)", highlights: "Pairs a flat sports-field park-and-common circuit with the atmospheric Victorian Nunhead Cemetery.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.45836, -0.06196], [51.45976, -0.06164], [51.46193, -0.06501], [51.46291, -0.06483], [51.46291, -0.06483], [51.46268, -0.06466], [51.46094, -0.06194], [51.45845, -0.0605], [51.45817, -0.05973], [51.45825, -0.05536], [51.4576, -0.05593], [51.45853, -0.05504], [51.45839, -0.05152], [51.45875, -0.05156], [51.46096, -0.04955], [51.46176, -0.05057], [51.46291, -0.0517], [51.46424, -0.05307], [51.46493, -0.05298], [51.46455, -0.05391], [51.46307, -0.05612], [51.46275, -0.05575], [51.46249, -0.05677], [51.46316, -0.05901], [51.46094, -0.06194], [51.45908, -0.06254]] },
    { id: "waterlink-way", name: "Waterlink Way", type: "river", leg: "Creek Road, Deptford → Lower Sydenham", start: "Elverson Road DLR Station", distance: "5.2 mi (8.3 km)", highlights: "A flat, well-signed waterway trail following the Ravensbourne and Pool rivers from Sydenham north to the Thames near Greenwich.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.48088, -0.0239], [51.47923, -0.02286], [51.47617, -0.02274], [51.47458, -0.02281], [51.47388, -0.02262], [51.4722, -0.02253], [51.47151, -0.02165], [51.46916, -0.01926], [51.46731, -0.01835], [51.4648, -0.01682], [51.46154, -0.01841], [51.4567, -0.01968], [51.45522, -0.02072], [51.44954, -0.02583], [51.44686, -0.02659], [51.44558, -0.02533], [51.4447, -0.02227], [51.44373, -0.02617], [51.44253, -0.02669], [51.43975, -0.02643], [51.43668, -0.02668], [51.43377, -0.02845], [51.43272, -0.02915], [51.42978, -0.03195], [51.42803, -0.03287], [51.42552, -0.03198]] },
    { id: "three-commons", name: "Three Commons", type: "trail", leg: "Hayes loop", start: "Hayes", distance: "4.8 mi (7.7 km)", highlights: "An expertly way-marked loop weaving through three superb suburban commons and woods around Hayes and Keston.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.39829, 0.01493], [51.39527, 0.0138], [51.39022, 0.01627], [51.38384, 0.01303], [51.38048, 0.0137], [51.37529, 0.0126], [51.37277, 0.01341], [51.36954, 0.01617], [51.36552, 0.02221], [51.36276, 0.02972], [51.36139, 0.03391], [51.35898, 0.03571], [51.36139, 0.03391], [51.36276, 0.02972], [51.35929, 0.02238], [51.36147, 0.01991], [51.36738, 0.01553], [51.36852, 0.00766], [51.37026, 0.00391], [51.3708, 0.00522], [51.37427, 0.01201], [51.37843, 0.01303], [51.3826, 0.01287], [51.3891, 0.01636], [51.39291, 0.01487], [51.39817, 0.01511]] },
    { id: "cray-riverway", name: "Cray Riverway", type: "river", leg: "Erith → Bexley", start: "Erith Station", distance: "11.3 mi (18.2 km)", highlights: "A long way-marked riverway through marshland and woods tracing the banks of the Thames, Darent and Cray.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.48162, 0.17532], [51.48021, 0.17798], [51.48018, 0.18199], [51.47938, 0.18388], [51.47839, 0.18613], [51.47414, 0.20048], [51.47, 0.20442], [51.46759, 0.1935], [51.47167, 0.19081], [51.47191, 0.18636], [51.47018, 0.18106], [51.46579, 0.17743], [51.46491, 0.16751], [51.4633, 0.16581], [51.45924, 0.16512], [51.45383, 0.16502], [51.45301, 0.16481], [51.44998, 0.16168], [51.45103, 0.15624], [51.45092, 0.14784], [51.45073, 0.14513], [51.44874, 0.1471], [51.447, 0.14796], [51.44431, 0.14867], [51.44294, 0.14766], [51.44169, 0.14716]] },
    { id: "lesnes-abbey-and-thamesmead", name: "Lesnes Abbey & Thamesmead", type: "trail", leg: "Abbey Wood loop", start: "Abbey Wood Station", distance: "8.7 mi (14 km)", highlights: "An 8.7mi Green Chain loop linking the 12th-century Lesnes Abbey ruins, Southmere Lake and the industrial Thames Path.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.49153, 0.12154], [51.4899, 0.12624], [51.48874, 0.12837], [51.48841, 0.1324], [51.48609, 0.13464], [51.4892, 0.13986], [51.48844, 0.14936], [51.48808, 0.16065], [51.48678, 0.16945], [51.48075, 0.17771], [51.48275, 0.17782], [51.48691, 0.16829], [51.48868, 0.15568], [51.48882, 0.14298], [51.48991, 0.12634], [51.49212, 0.12123], [51.49812, 0.12111], [51.49746, 0.11114], [51.49859, 0.10486], [51.49919, 0.10005], [51.49858, 0.09018], [51.49795, 0.09169], [51.49885, 0.10235], [51.49528, 0.10425], [51.49369, 0.10927], [51.49123, 0.1217]] },
    { id: "oxleas-woods-and-shooters-hill", name: "Oxleas Woods & Shooters Hill", type: "trail", leg: "Woolwich loop", start: "Falconwood Station", distance: "10.0 mi (16.1 km)", highlights: "An incredible array of hilly Green Chain green spaces from the Thames Barrier up to Shooters Hill and Severndroog Castle.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.45927, 0.07955], [51.46379, 0.07313], [51.4661, 0.07362], [51.46505, 0.09195], [51.47323, 0.09771], [51.47546, 0.10561], [51.479, 0.11028], [51.48118, 0.10588], [51.4814, 0.08924], [51.48217, 0.0711], [51.48124, 0.04427], [51.47847, 0.04344], [51.47353, 0.04938], [51.46862, 0.0604], [51.471, 0.05526], [51.47647, 0.05647], [51.4824, 0.04592], [51.48676, 0.04247], [51.49111, 0.04092], [51.49226, 0.04001], [51.48613, 0.0386], [51.47888, 0.04423], [51.47353, 0.04938], [51.47032, 0.05963], [51.46447, 0.07237], [51.45893, 0.07954]] },
    { id: "eltham-and-avery-hill", name: "Eltham & Avery Hill", type: "trail", leg: "Eltham loop", start: "Falconwood Station", distance: "7.2 mi (11.5 km)", highlights: "A Green Chain figure-of-eight past open parkland, woods, a palace and the quaint lakeside Tarn.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.45924, 0.07841], [51.45943, 0.0728], [51.45453, 0.06916], [51.45145, 0.06675], [51.44893, 0.07048], [51.44946, 0.0742], [51.44954, 0.07531], [51.44897, 0.07312], [51.44812, 0.06824], [51.44857, 0.06417], [51.44953, 0.06169], [51.44806, 0.0522], [51.4473, 0.04837], [51.44667, 0.04741], [51.4449, 0.04557], [51.44667, 0.04741], [51.44766, 0.0489], [51.45069, 0.05303], [51.45303, 0.05253], [51.45459, 0.05281], [51.45648, 0.0547], [51.45956, 0.06692], [51.46385, 0.06834], [51.46654, 0.07053], [51.46339, 0.0742], [51.46195, 0.07496]] },
    { id: "beckenham-place-and-elmstead", name: "Beckenham Place & Elmstead", type: "trail", leg: "Grove Park loop", start: "Grove Park Station", distance: "10.1 mi (16.2 km)", highlights: "A hilly Green Chain figure-of-eight through ancient woods, rolling suburbs and the tranquil Durham Woodland Walk.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.42513, 0.03358], [51.42653, 0.04179], [51.42473, 0.04542], [51.4224, 0.03629], [51.42278, 0.03058], [51.4223, 0.02595], [51.41677, 0.02191], [51.41701, 0.01938], [51.41659, 0.00735], [51.41559, 0.00592], [51.41576, 0.0028], [51.41583, -0.00404], [51.41424, -0.00867], [51.41458, -0.01303], [51.41492, -0.01677], [51.41516, -0.02229], [51.42235, -0.0158], [51.42684, -0.01148], [51.42888, -0.00466], [51.42867, 0.00162], [51.43171, 0.01619], [51.43077, 0.01781], [51.43102, 0.02288], [51.43025, 0.02612], [51.42724, 0.02824], [51.42549, 0.03389]] },
    { id: "crystal-palace-to-nunhead", name: "Crystal Palace to Nunhead", type: "trail", leg: "New Beckenham → Nunhead", start: "New Beckenham Station", distance: "8.5 mi (13.7 km)", highlights: "A point-to-point over south London's hills linking a historic park, ancient woods and Victorian cemeteries.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.41628, -0.03389], [51.41752, -0.04407], [51.41696, -0.05064], [51.41573, -0.05342], [51.4175, -0.05665], [51.41989, -0.06147], [51.42315, -0.06046], [51.42478, -0.06148], [51.42513, -0.06494], [51.42804, -0.06597], [51.42975, -0.0681], [51.4314, -0.06705], [51.43329, -0.06823], [51.43412, -0.06838], [51.43662, -0.0677], [51.43821, -0.06655], [51.44084, -0.06426], [51.44441, -0.06178], [51.44802, -0.0582], [51.45045, -0.0561], [51.45317, -0.05111], [51.45535, -0.04805], [51.46032, -0.04885], [51.46261, -0.05068], [51.46456, -0.05263], [51.46641, -0.05109]] },
    { id: "tooting-bec-common", name: "Tooting Bec Common", type: "trail", leg: "Tooting Bec Common loop", start: "Tooting Bec Station", distance: "3.9 mi (6.3 km)", highlights: "Wandsworth's largest green space (92ha), a deceptively large perimeter trail mixing woodland, grass fields, a lake and a lido.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.43579, -0.15914], [51.43332, -0.15293], [51.43476, -0.14624], [51.43581, -0.14408], [51.43409, -0.14226], [51.43435, -0.13983], [51.43197, -0.13968], [51.43127, -0.14618], [51.43287, -0.15311], [51.43305, -0.15341], [51.43654, -0.15809], [51.4382, -0.15641], [51.43761, -0.1503], [51.43775, -0.14668], [51.43984, -0.14276], [51.44185, -0.14361], [51.44185, -0.14361], [51.44034, -0.14273], [51.43714, -0.14269], [51.43116, -0.14647], [51.42976, -0.14806], [51.43152, -0.14919], [51.43223, -0.15095], [51.43278, -0.15221], [51.43305, -0.15341], [51.43654, -0.15809]] },
    { id: "streatham-common-and-norwood-grove", name: "Streatham Common & Norwood Grove", type: "trail", leg: "Streatham Common loop", start: "Streatham Station", distance: "2.4 mi (3.8 km)", highlights: "A small hillside park with hidden surprises including The Rookery gardens and incredible views south from Norwood Grove.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.42489, -0.13088], [51.42315, -0.12942], [51.42009, -0.12805], [51.41768, -0.12669], [51.41969, -0.1245], [51.42042, -0.12195], [51.42178, -0.12067], [51.42259, -0.11916], [51.42359, -0.117], [51.42312, -0.11976], [51.42246, -0.11912], [51.42059, -0.11503], [51.41914, -0.11508], [51.41877, -0.11475], [51.41872, -0.11476], [51.41798, -0.11474], [51.41733, -0.11445], [51.4158, -0.11065], [51.41553, -0.11027], [51.41553, -0.11027], [51.4186, -0.11723], [51.4198, -0.11777], [51.42206, -0.12007], [51.42076, -0.12558], [51.42037, -0.12795], [51.4232, -0.12992]] },
    { id: "mitcham-common", name: "Mitcham Common", type: "trail", leg: "Mitcham Common loop", start: "Mitcham Junction Station", distance: "3.4 mi (5.5 km)", highlights: "A varied nature reserve emerging from its rubbish-tip and gravel-quarry past, with rolling man-made hills, woods, heath, ponds and a golf course.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.39789, -0.15378], [51.39804, -0.15474], [51.39715, -0.15557], [51.39395, -0.14533], [51.39426, -0.146], [51.39531, -0.14572], [51.39764, -0.14584], [51.39782, -0.14878], [51.39767, -0.14991], [51.39821, -0.15115], [51.39773, -0.15255], [51.39715, -0.15557], [51.39699, -0.15636], [51.39666, -0.15649], [51.39655, -0.15687], [51.39517, -0.158], [51.3943, -0.15796], [51.39379, -0.15846], [51.39363, -0.15892], [51.3943, -0.15796], [51.39517, -0.158], [51.39551, -0.15787], [51.39655, -0.15687], [51.39699, -0.15636], [51.39715, -0.15557], [51.39804, -0.15474]] },
    { id: "farthing-downs-and-happy-valley", name: "Farthing Downs & Happy Valley", type: "trail", leg: "Farthing Downs loop", start: "Coulsdon South Station", distance: "6.7 mi (10.8 km)", highlights: "The southernmost point of any London borough, an enticing mix of Roman-history chalk grassland, abundant wildflowers and hilly trails.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.31661, -0.13739], [51.31505, -0.13743], [51.31364, -0.13605], [51.30698, -0.13595], [51.30698, -0.13595], [51.31531, -0.13581], [51.31555, -0.13807], [51.31719, -0.13907], [51.32035, -0.14003], [51.3169, -0.13866], [51.31555, -0.13807], [51.31364, -0.13617], [51.30885, -0.1349], [51.30229, -0.1331], [51.29954, -0.13152], [51.29683, -0.12397], [51.2962, -0.11667], [51.29712, -0.10723], [51.29621, -0.10886], [51.29626, -0.12237], [51.2971, -0.12646], [51.30106, -0.13268], [51.30396, -0.1338], [51.3134, -0.13586], [51.31557, -0.13598], [51.31651, -0.13762]] },
    { id: "beddington-park", name: "Beddington Park", type: "park", leg: "Beddington Park loop", start: "Hackbridge Station", distance: "1.9 mi (3.0 km)", highlights: "A small park with two distinct flavours, grassy sports fields and landscaped formal parkland, split by the River Wandle.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.37801, -0.15368], [51.37815, -0.15378], [51.37605, -0.1528], [51.37612, -0.15381], [51.37471, -0.15189], [51.37396, -0.15135], [51.37384, -0.15075], [51.37281, -0.14413], [51.37291, -0.14179], [51.37143, -0.13981], [51.37094, -0.14058], [51.37088, -0.14645], [51.3708, -0.14981], [51.37057, -0.15141], [51.36984, -0.15286], [51.36984, -0.15286], [51.37049, -0.15164], [51.37169, -0.15068], [51.3725, -0.15015], [51.37352, -0.15001], [51.37377, -0.15134], [51.37407, -0.15097], [51.37477, -0.15454], [51.37633, -0.15322], [51.37795, -0.15384], [51.37813, -0.15359]] },
    { id: "wimbledon-park", name: "Wimbledon Park", type: "park", leg: "Wimbledon Park loop", start: "Wimbledon Park Station", distance: "1.3 mi (2.1 km)", highlights: "A small but inviting park just east of the famous tennis club, with a big grass sports field and a sheltered athletics track.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.43538, -0.20844], [51.43418, -0.20907], [51.43406, -0.20897], [51.43357, -0.20921], [51.43309, -0.20969], [51.43294, -0.21236], [51.43066, -0.21222], [51.42997, -0.21236], [51.42841, -0.21314], [51.42775, -0.21184], [51.42774, -0.21158], [51.42829, -0.21087], [51.42836, -0.21045], [51.42804, -0.20996], [51.42819, -0.20963], [51.42927, -0.20876], [51.42995, -0.2078], [51.43067, -0.20537]] },
    { id: "home-park-hampton-court", name: "Home Park (Hampton Court)", type: "park", leg: "Home Park loop", start: "Home Park", distance: "5.0 mi (8 km)", highlights: "Possibly London's most under-utilised running spot, with grassy plains, majestic tree avenues, roaming deer and a rare feeling of solitude beside Hampton Court Palace.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.40374, -0.33768], [51.40369, -0.33712], [51.40323, -0.33904], [51.40353, -0.33896], [51.40356, -0.3393], [51.40458, -0.34144], [51.40684, -0.33993], [51.40648, -0.33758], [51.40664, -0.33696], [51.41168, -0.31296], [51.4111, -0.31217], [51.41134, -0.31157], [51.4112, -0.31143], [51.40919, -0.31605], [51.40789, -0.3182], [51.40713, -0.31995], [51.40436, -0.33257], [51.40627, -0.33266], [51.40651, -0.33302], [51.40639, -0.33459], [51.40687, -0.33988], [51.40462, -0.3415], [51.40356, -0.3393], [51.40353, -0.33896], [51.40303, -0.33731], [51.40369, -0.33712]] },
    { id: "hounslow-heath", name: "Hounslow Heath", type: "trail", leg: "Hounslow Heath loop", start: "Hounslow Heath", distance: "2.5 mi (4 km)", highlights: "A back-to-nature scrappy heath of shrub, grass and wetland, a key London wildlife habitat with a horseshoe-marked bridle trail through the scrub.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.45756, -0.38464], [51.45874, -0.38683], [51.45935, -0.38405], [51.45996, -0.38376], [51.46039, -0.38396], [51.46074, -0.38387], [51.46126, -0.38363], [51.46246, -0.38054], [51.46302, -0.38061], [51.464, -0.38097], [51.4647, -0.3807], [51.4648, -0.37443], [51.46629, -0.36817], [51.46945, -0.35958], [51.46878, -0.35947], [51.46945, -0.35958], [51.46631, -0.36471], [51.46535, -0.36648], [51.46396, -0.36834], [51.46097, -0.37097], [51.45984, -0.37457], [51.45917, -0.37918], [51.45813, -0.38168], [51.45896, -0.38404], [51.45875, -0.38622], [51.45801, -0.38569]] },
    { id: "bedfont-lakes-country-park", name: "Bedfont Lakes Country Park", type: "trail", leg: "Bedfont Lakes Country Park loop", start: "Bedfont Lakes Country Park", distance: "2.0 mi (3.2 km)", highlights: "A 73-hectare nature reserve with six lakes, well-kept trails and rolling hills for a family-friendly run.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.44121, -0.45234], [51.4413, -0.45219], [51.44146, -0.45267], [51.44247, -0.4518], [51.44498, -0.4502], [51.44703, -0.44848], [51.44846, -0.44675], [51.44855, -0.44642], [51.4489, -0.4463], [51.4486, -0.44568], [51.4489, -0.4463], [51.44855, -0.44642], [51.44846, -0.44675], [51.44715, -0.44845], [51.44525, -0.45001], [51.44247, -0.4518], [51.44146, -0.45267], [51.4413, -0.45219]] },
    { id: "beverley-brook-walk", name: "Beverley Brook Walk", type: "river", leg: "New Malden → Putney", start: "New Malden Station", distance: "8.0 mi (13 km)", highlights: "A way-marked trail sampling Wimbledon Common, Richmond Park, Barnes Common and the Thames Path, with the train home or a 16-mile double-back.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.40356, -0.25564], [51.40584, -0.25238], [51.41082, -0.24919], [51.41154, -0.24813], [51.41621, -0.24548], [51.4242, -0.24552], [51.42757, -0.23667], [51.42934, -0.23866], [51.4309, -0.24371], [51.43549, -0.25297], [51.43684, -0.25767], [51.4402, -0.25934], [51.44551, -0.26181], [51.45298, -0.26457], [51.45836, -0.26787], [51.46022, -0.26172], [51.45887, -0.25715], [51.46514, -0.24828], [51.46602, -0.24546], [51.46951, -0.24331], [51.46922, -0.23761], [51.46738, -0.23098], [51.46715, -0.2272], [51.46711, -0.22418], [51.46478, -0.21494], [51.46055, -0.21634]] },
    { id: "the-wandle-trail", name: "The Wandle Trail", type: "river", leg: "East Croydon → Wandsworth Town", start: "East Croydon Station", distance: "13.7 mi (22.0 km)", highlights: "A 14-mile way-marked trail tracing the 'hardest working river in England' through rejuvenated woodlands and riverside parks.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.3757, -0.09273], [51.37444, -0.1063], [51.37346, -0.11294], [51.37031, -0.11662], [51.37014, -0.13014], [51.37328, -0.14001], [51.3725, -0.15015], [51.37025, -0.15194], [51.36707, -0.15783], [51.36754, -0.16234], [51.375, -0.15978], [51.38071, -0.16173], [51.38523, -0.16388], [51.39061, -0.16829], [51.39615, -0.17745], [51.39878, -0.18393], [51.40403, -0.18173], [51.40879, -0.1846], [51.4161, -0.18227], [51.42157, -0.1805], [51.42949, -0.18905], [51.43917, -0.18942], [51.44498, -0.19331], [51.45059, -0.19356], [51.45578, -0.19584], [51.4611, -0.18753]] },
    { id: "julia-bleasdales-loop", name: "Julia Bleasdale's Loop", type: "trail", leg: "Bushy Park loop", start: "Bushy Park", distance: "19.2 mi (31 km)", highlights: "Elite runner Julia Bleasdale's marathon-training loop linking the parks of Richmond and Bushy with long, traffic-free stretches beside the Thames.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.40673, -0.33092], [51.41114, -0.30721], [51.41705, -0.30698], [51.42654, -0.3097], [51.43193, -0.31097], [51.44009, -0.31119], [51.44853, -0.30581], [51.45718, -0.30584], [51.45749, -0.30599], [51.45508, -0.30181], [51.45073, -0.29661], [51.44622, -0.29468], [51.43879, -0.2922], [51.4328, -0.29103], [51.4354, -0.3052], [51.44233, -0.31135], [51.44508, -0.31466], [51.4395, -0.32222], [51.43522, -0.3232], [51.43139, -0.32374], [51.42651, -0.31768], [51.42069, -0.31949], [51.41811, -0.32039], [51.41414, -0.32728], [51.41102, -0.33389], [51.4064, -0.33413]] },
    { id: "two-palaces-and-a-canal", name: "Two Palaces and a Canal", type: "park", leg: "Syon Park loop", start: "Syon Park", distance: "8.5 mi (13.7 km)", highlights: "A scenic west London loop taking in the grand grounds of two palaces, Syon House and Osterley Park, finishing along a tree-lined canal towpath.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.47668, -0.31524], [51.47877, -0.31635], [51.48117, -0.32226], [51.48212, -0.32795], [51.48252, -0.34205], [51.48389, -0.34854], [51.48936, -0.35052], [51.48945, -0.35123], [51.48848, -0.34829], [51.48281, -0.34479], [51.48419, -0.32393], [51.48645, -0.3164], [51.48543, -0.31422], [51.48318, -0.31121], [51.4818, -0.30738], [51.48182, -0.30633], [51.48246, -0.31088], [51.48356, -0.31169], [51.48608, -0.3146], [51.48491, -0.32203], [51.48388, -0.32925], [51.4849, -0.33298], [51.48316, -0.32654], [51.48173, -0.32388], [51.48111, -0.31826], [51.47745, -0.31461]] },
    { id: "harmondsworth-moor", name: "Harmondsworth Moor", type: "trail", leg: "Harmondsworth loop", start: "Harmondsworth", distance: "4.2 mi (6.7 km)", highlights: "260 acres of reclaimed land turned into wildlife habitat by British Airways, with rolling hills and great limestone trails minutes from Heathrow.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.4914, -0.48554], [51.49274, -0.48419], [51.49481, -0.48331], [51.49532, -0.48178], [51.4973, -0.47863], [51.49897, -0.47764], [51.5007, -0.48133], [51.50085, -0.48337], [51.50143, -0.48326], [51.50204, -0.48241], [51.50143, -0.48326], [51.50085, -0.48337], [51.5007, -0.48133], [51.49879, -0.47758], [51.49736, -0.47817], [51.49577, -0.48077], [51.49499, -0.48308], [51.49401, -0.48321], [51.49281, -0.48267], [51.49218, -0.4821], [51.49146, -0.47861], [51.49112, -0.48235], [51.48913, -0.4824], [51.48844, -0.48284], [51.48813, -0.48227], [51.49087, -0.48682]] },
    { id: "cranford-country-park", name: "Cranford Country Park", type: "park", leg: "Cranford loop", start: "Cranford", distance: "2.8 mi (4.5 km)", highlights: "A historic estate park with the stables, walls and church of a lost manor house set among open grassland, woodland and the River Crane.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.48986, -0.41638], [51.49047, -0.4163], [51.4907, -0.41682], [51.49139, -0.41457], [51.49121, -0.41111], [51.4881, -0.41163], [51.48753, -0.41166], [51.48635, -0.41113], [51.48566, -0.41046], [51.4839, -0.40744], [51.48515, -0.40591], [51.48498, -0.40319], [51.48498, -0.40261], [51.48515, -0.40591], [51.48398, -0.40733], [51.48393, -0.40754], [51.48169, -0.40447], [51.48393, -0.40754], [51.48392, -0.40791], [51.48635, -0.41113], [51.48753, -0.41166], [51.4901, -0.41116], [51.49121, -0.41111], [51.49065, -0.4151], [51.4907, -0.41682], [51.48991, -0.41625]] },
    { id: "stockley-and-lake-farm-country-parks", name: "Stockley & Lake Farm Country Parks", type: "trail", leg: "Hayes loop", start: "Hayes", distance: "5.4 mi (8.7 km)", highlights: "Two west London green spaces with brilliant gravel and limestone trails looping a golf course, with easy access to the Grand Union Canal.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.5098, -0.44122], [51.50984, -0.43995], [51.51058, -0.43994], [51.51258, -0.44276], [51.51358, -0.44296], [51.51258, -0.44276], [51.51009, -0.43971], [51.50909, -0.43984], [51.50889, -0.4344], [51.5046, -0.41919], [51.5039, -0.41998], [51.50208, -0.4226], [51.50087, -0.42418], [51.49841, -0.42615], [51.4996, -0.4299], [51.49841, -0.42615], [51.50087, -0.42418], [51.50208, -0.4226], [51.5039, -0.41998], [51.50474, -0.41944], [51.50851, -0.42995], [51.50957, -0.43089], [51.51114, -0.43073], [51.51032, -0.43302], [51.51056, -0.43522], [51.50984, -0.43937]] },
    { id: "horsenden-hill", name: "Horsenden Hill", type: "trail", leg: "Perivale loop", start: "Perivale", distance: "3.5 mi (5.6 km)", highlights: "The largest conservation site in the Borough of Ealing and a top off-road spot, with great views from its wooded summit.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.54633, -0.32728], [51.5467, -0.32752], [51.54684, -0.32883], [51.54672, -0.32909], [51.54523, -0.32892], [51.54351, -0.32779], [51.54351, -0.32935], [51.54388, -0.33042], [51.54492, -0.3318], [51.54479, -0.33314], [51.54478, -0.33674], [51.54496, -0.3367], [51.54512, -0.33925], [51.54448, -0.33948], [51.54479, -0.33945], [51.54512, -0.33925], [51.54496, -0.3367], [51.54478, -0.33674], [51.54519, -0.33554], [51.54573, -0.33399], [51.54593, -0.33249], [51.54615, -0.3312], [51.54684, -0.33018], [51.5472, -0.32967], [51.54672, -0.32873], [51.5467, -0.32752]] },
    { id: "ruislip-woods", name: "Ruislip Woods", type: "trail", leg: "Ruislip loop", start: "Ruislip", distance: "9.0 mi (14.4 km)", highlights: "The ideal weekend long run through 300-plus hectares of stunning woodland around a sparkling lake, with a lazy lakeside lunch to follow.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.59251, -0.43085], [51.59131, -0.43303], [51.58831, -0.43044], [51.5893, -0.42456], [51.59276, -0.42251], [51.59572, -0.42461], [51.5972, -0.42692], [51.59849, -0.43014], [51.59997, -0.43664], [51.60197, -0.43935], [51.60534, -0.44256], [51.60161, -0.4436], [51.60036, -0.44314], [51.59713, -0.4415], [51.59543, -0.44133], [51.59199, -0.44072], [51.58979, -0.4368], [51.5903, -0.43907], [51.59235, -0.44146], [51.59311, -0.45158], [51.58767, -0.45826], [51.59099, -0.4518], [51.59366, -0.43981], [51.59226, -0.43522], [51.59126, -0.43269], [51.5926, -0.43112]] },
    { id: "fryent-country-park", name: "Fryent Country Park", type: "trail", leg: "Kingsbury loop", start: "Kingsbury", distance: "2.3 mi (3.7 km)", highlights: "A dose of English countryside on a hill in the middle of suburban London, with a stellar view of Wembley Stadium.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.57552, -0.28157], [51.57484, -0.28215], [51.5732, -0.27997], [51.57267, -0.27982], [51.5715, -0.27982], [51.5715, -0.28003], [51.57287, -0.27948], [51.57568, -0.27946], [51.57631, -0.27996], [51.57713, -0.28082], [51.57836, -0.27996], [51.57883, -0.27995], [51.57934, -0.27971], [51.57986, -0.27829], [51.58079, -0.27872], [51.58426, -0.28092], [51.58125, -0.27603], [51.5815, -0.27356], [51.57945, -0.27204], [51.57849, -0.27183], [51.57648, -0.27402], [51.5757, -0.27479], [51.57594, -0.27537], [51.57549, -0.27576], [51.575, -0.27959], [51.57496, -0.28162]] },
    { id: "canons-park", name: "Canons Park", type: "park", leg: "Stanmore loop", start: "Stanmore", distance: "1.9 mi (3.1 km)", highlights: "Former estate grounds restored in 2006, offering formal gardens, a historic walled garden and temple, and woodland walks in a compact space.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.61021, -0.2935], [51.60999, -0.29215], [51.60814, -0.29083], [51.60711, -0.29029], [51.60668, -0.28952], [51.60653, -0.2881], [51.60712, -0.28531], [51.6054, -0.28597], [51.60518, -0.28536], [51.60434, -0.28474], [51.60518, -0.28536], [51.6054, -0.28597], [51.60712, -0.28531], [51.60652, -0.28843], [51.60686, -0.28994], [51.60733, -0.29046], [51.60766, -0.29054], [51.60749, -0.29418], [51.61044, -0.29466]] },
    { id: "southall-park", name: "Southall Park", type: "park", leg: "Southall loop", start: "Southall", distance: "0.8 mi (1.3 km)", highlights: "Formal parkland with rolling undulations and handy distance markers on its perimeter, ideal for speed sessions.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.50947, -0.3694], [51.50988, -0.36911], [51.51065, -0.37017], [51.5108, -0.36991], [51.51095, -0.37015], [51.51135, -0.36824], [51.51145, -0.36689], [51.51285, -0.36699], [51.51294, -0.36444], [51.5142, -0.36377], [51.51409, -0.36195], [51.51562, -0.35889], [51.51577, -0.35938], [51.51712, -0.35919], [51.51705, -0.35831], [51.51792, -0.35809], [51.51789, -0.35786], [51.5186, -0.35767], [51.51863, -0.35754]] },
    { id: "walpole-and-lammas-parks", name: "Walpole & Lammas Parks", type: "park", leg: "Ealing loop", start: "Ealing", distance: "2.0 mi (3.2 km)", highlights: "Two beautifully presented parks - Walpole with Pitzhanger Manor and a pond, Lammas with a big grass field - linked into a figure-of-eight.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.5109, -0.30692], [51.51068, -0.307], [51.5106, -0.30787], [51.51048, -0.30814], [51.51019, -0.30829], [51.51008, -0.30865], [51.5099, -0.31056], [51.50741, -0.31002], [51.50721, -0.31017], [51.5067, -0.31013], [51.50713, -0.30861], [51.50627, -0.30795], [51.50713, -0.30861], [51.5067, -0.31013], [51.50721, -0.31017], [51.51008, -0.30865], [51.51019, -0.30829], [51.51048, -0.30814], [51.5106, -0.30787], [51.51068, -0.307]] },
    { id: "chiswick-house-gardens", name: "Chiswick House Gardens", type: "park", leg: "Chiswick loop", start: "Chiswick", distance: "1.25 mi (2 km)", highlights: "A small but stunning park with grand vistas, a mirror-like lake and formal gardens that inspired parks worldwide, just 400m from the Thames.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.48386, -0.25836], [51.48425, -0.25784], [51.48507, -0.25702], [51.48532, -0.25693], [51.48553, -0.25705], [51.48727, -0.25845], [51.48742, -0.25801], [51.48745, -0.2585], [51.48804, -0.25904], [51.49014, -0.26021], [51.48804, -0.25904], [51.48745, -0.2585], [51.48747, -0.25945], [51.48713, -0.2596], [51.48632, -0.26081], [51.48515, -0.26289], [51.4848, -0.26261], [51.48464, -0.26277], [51.48394, -0.26433], [51.48334, -0.26475], [51.48296, -0.26531], [51.48157, -0.26315], [51.48251, -0.259], [51.48248, -0.25771], [51.48341, -0.25813], [51.48353, -0.25796]] },
    { id: "gunnersbury-park", name: "Gunnersbury Park", type: "park", leg: "Gunnersbury loop", start: "Gunnersbury", distance: "2.4 mi (3.9 km)", highlights: "Two old mansions and huge grass sports fields ringed by sealed and dirt trails, with ponds, a Gothic tower and a secret garden to discover.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.49622, -0.2908], [51.49716, -0.29138], [51.49789, -0.29123], [51.49841, -0.29094], [51.49891, -0.28983], [51.49934, -0.28928], [51.49944, -0.28736], [51.49961, -0.28591], [51.49976, -0.28605], [51.49978, -0.28663], [51.50004, -0.28731], [51.50038, -0.28754], [51.50082, -0.28752], [51.50092, -0.28863], [51.50048, -0.28946], [51.50092, -0.29169], [51.50108, -0.29369], [51.50029, -0.29613], [51.50079, -0.29656], [51.50079, -0.29656], [51.50029, -0.29613], [51.50108, -0.29351], [51.49947, -0.29229], [51.49848, -0.2921], [51.49811, -0.29229], [51.498, -0.29193]] },
    { id: "muswell-hill-playing-fields", name: "Muswell Hill Playing Fields", type: "trail", leg: "Muswell Hill loop", start: "Muswell Hill", distance: "4.0 mi (6.5 km)", highlights: "A connectable mix of woods, playing fields and a large cemetery giving nice, largely off-road running.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.5966, -0.15896], [51.59838, -0.15758], [51.60085, -0.15783], [51.59879, -0.15753], [51.59867, -0.16059], [51.59919, -0.16088], [51.60053, -0.1609], [51.60051, -0.16363], [51.60085, -0.16221], [51.60496, -0.1582], [51.60562, -0.15923], [51.60591, -0.15835], [51.60663, -0.15814], [51.60712, -0.15893], [51.60777, -0.15868], [51.60872, -0.15838], [51.60758, -0.15863], [51.60698, -0.15865], [51.60592, -0.1572], [51.60688, -0.15226], [51.6055, -0.14991], [51.60251, -0.14807], [51.59863, -0.14654], [51.59863, -0.14654], [51.59803, -0.15193], [51.59662, -0.15749]] },
    { id: "waterlow-park", name: "Waterlow Park", type: "park", leg: "Highgate loop", start: "Highgate", distance: "0.9 mi (1.5 km)", highlights: "A little but stunning hillside park with formal gardens, great views and a chain of ponds, a short stroll from Hampstead Heath.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.56828, -0.14476], [51.56793, -0.14401], [51.56771, -0.14417], [51.56746, -0.14508], [51.56708, -0.14561], [51.56707, -0.14652], [51.5669, -0.14658], [51.56702, -0.14753], [51.56747, -0.1487], [51.56774, -0.14883], [51.56747, -0.1487], [51.56702, -0.14753], [51.5669, -0.14658], [51.56447, -0.14642], [51.5638, -0.14654], [51.56234, -0.14737], [51.56184, -0.15008], [51.56203, -0.14863], [51.56244, -0.14726], [51.56337, -0.14668], [51.56431, -0.14644], [51.56707, -0.14652], [51.56708, -0.14561], [51.56746, -0.14508], [51.56771, -0.14417], [51.56793, -0.14401]] },
    { id: "the-parks-of-pymmes-brook", name: "The Parks of Pymmes Brook", type: "river", leg: "Arnos Park → Oak Hill Park East Barnet", start: "Southgate", distance: "2.5 mi (4 km)", highlights: "Three riverside parks strung along the Pymmes Brook, with striking brick railway arches and lots of extra trails on a there-and-back run.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.61905, -0.1318], [51.61967, -0.13271], [51.6181, -0.13542], [51.61647, -0.13487], [51.61667, -0.13922], [51.61649, -0.14011], [51.61728, -0.14112], [51.61753, -0.14288], [51.61912, -0.14374], [51.6198, -0.14386], [51.62046, -0.14385], [51.62176, -0.14331], [51.62284, -0.14591], [51.62337, -0.14646], [51.62506, -0.14705], [51.62559, -0.14788], [51.62722, -0.14844], [51.62835, -0.1491], [51.62912, -0.1477], [51.63036, -0.146], [51.63134, -0.14621], [51.63149, -0.14613], [51.63233, -0.14609], [51.63558, -0.14949], [51.63587, -0.15053], [51.63833, -0.15611]] },
    { id: "monken-hadley-common", name: "Monken Hadley Common", type: "trail", leg: "Monken Hadley loop", start: "Monken Hadley", distance: "4.6 mi (7.4 km)", highlights: "A long stretch of woodland marking the border between suburban London and open countryside, with hills and a pretty fishing lake.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.66116, -0.19101], [51.66028, -0.19002], [51.65846, -0.18514], [51.65872, -0.18239], [51.65843, -0.17761], [51.65761, -0.17279], [51.65729, -0.16478], [51.65759, -0.16396], [51.65701, -0.16405], [51.65513, -0.15743], [51.65455, -0.15358], [51.6531, -0.1533], [51.65141, -0.15001], [51.6486, -0.14771], [51.64854, -0.1479], [51.65136, -0.14968], [51.65153, -0.15193], [51.65429, -0.1537], [51.65494, -0.15444], [51.65623, -0.1611], [51.65761, -0.17279], [51.65843, -0.17761], [51.65871, -0.18144], [51.65837, -0.18403], [51.65929, -0.18776], [51.66115, -0.19029]] },
    { id: "trent-country-park", name: "Trent Country Park", type: "trail", leg: "Cockfosters loop", start: "Cockfosters", distance: "4.8 mi (7.8 km)", highlights: "A former royal hunting ground and grand estate of undulating hills, woodlands, lakes and an Obelisk, in a safe enclosed setting.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.65455, -0.15196], [51.64994, -0.14789], [51.64747, -0.13408], [51.64963, -0.12825], [51.65343, -0.11555], [51.65661, -0.10891], [51.65777, -0.10793], [51.6595, -0.10778], [51.66142, -0.10752], [51.66213, -0.10291], [51.66321, -0.10404], [51.66344, -0.10297], [51.66425, -0.10473], [51.66473, -0.1049], [51.66468, -0.10865], [51.66526, -0.11175], [51.66635, -0.12782], [51.66648, -0.13234], [51.66478, -0.13512], [51.66462, -0.1365], [51.66304, -0.13707], [51.6621, -0.1387], [51.65994, -0.14412], [51.65893, -0.14658], [51.65545, -0.1502], [51.65421, -0.15172]] },
    { id: "celandine-route", name: "Celandine Route", type: "river", leg: "Pinner → West Drayton", start: "Pinner Station", distance: "11.0 mi (17.8 km)", highlights: "An 11-mile point-to-point tracing the way-marked Celandine Route along the River Pinn through sleepy outer northwest suburbs to the Grand Union Canal.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.59285, -0.38091], [51.59109, -0.38517], [51.58633, -0.39251], [51.58033, -0.40147], [51.57453, -0.40947], [51.57539, -0.42269], [51.57513, -0.43591], [51.57576, -0.44159], [51.57419, -0.45003], [51.57246, -0.45567], [51.56574, -0.45283], [51.55996, -0.45763], [51.55578, -0.44951], [51.55231, -0.44854], [51.55067, -0.44761], [51.54309, -0.44854], [51.53905, -0.45023], [51.53601, -0.44912], [51.53413, -0.44829], [51.53035, -0.44842], [51.52944, -0.45505], [51.52411, -0.45615], [51.52062, -0.45858], [51.51742, -0.46381], [51.51352, -0.47105], [51.51009, -0.47219]] },
    { id: "brent-river-park-footpath", name: "Brent River Park Footpath", type: "river", leg: "Hanwell → Hanger Lane", start: "Hanwell Station", distance: "5.9 mi (9.5 km)", highlights: "A largely traffic-free point-to-point along the River Brent through many of Ealing's best parks, passing under the 1837 Wharncliffe Viaduct.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.51196, -0.3383], [51.51144, -0.34126], [51.51093, -0.34355], [51.51093, -0.3448], [51.50852, -0.34299], [51.5072, -0.3437], [51.50509, -0.34553], [51.50339, -0.34432], [51.49992, -0.34073], [51.50111, -0.3366], [51.50293, -0.33455], [51.5038, -0.33294], [51.50599, -0.32937], [51.5095, -0.32844], [51.51211, -0.32696], [51.51362, -0.32616], [51.51646, -0.32551], [51.52109, -0.32604], [51.52144, -0.32289], [51.52556, -0.32178], [51.52803, -0.3208], [51.52747, -0.3187], [51.52817, -0.30599], [51.53062, -0.30048], [51.52962, -0.29288], [51.53004, -0.293]] },
    { id: "dollis-valley-greenwalk", name: "Dollis Valley Greenwalk", type: "river", leg: "Edgware → East Finchley", start: "Edgware Station", distance: "13.2 mi (21.2 km)", highlights: "A 13-mile way-marked point-to-point through Barnet's green spaces, following the Dollis Brook past a huge Victorian viaduct.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.61338, -0.27541], [51.61565, -0.27416], [51.62141, -0.27389], [51.62284, -0.26492], [51.62559, -0.26164], [51.62645, -0.25453], [51.63359, -0.25071], [51.63461, -0.24381], [51.63737, -0.23721], [51.63491, -0.22975], [51.63869, -0.22026], [51.64145, -0.21543], [51.64205, -0.20444], [51.63701, -0.19807], [51.63087, -0.19778], [51.62622, -0.19463], [51.62261, -0.1849], [51.62014, -0.18706], [51.61418, -0.18857], [51.60361, -0.19627], [51.60049, -0.19455], [51.59586, -0.18506], [51.59277, -0.18132], [51.5871, -0.1739], [51.58555, -0.17041], [51.58715, -0.16451]] },
    { id: "broomfield-park", name: "Broomfield Park", type: "park", leg: "Palmers Green loop", start: "Palmers Green", distance: "1.2 mi (1.9 km)", highlights: "An open community park with three distinct sections, including a walled formal garden with a bandstand and ponds plus a workout-friendly sports-field loop.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.61866, -0.11734], [51.61862, -0.1168], [51.61891, -0.11621], [51.61942, -0.11592], [51.61952, -0.11526], [51.61936, -0.11494], [51.61937, -0.11438], [51.61782, -0.10945], [51.61764, -0.10929], [51.61716, -0.10929], [51.61562, -0.10982], [51.61575, -0.11103], [51.61514, -0.11126], [51.61453, -0.1129], [51.61293, -0.11496], [51.61273, -0.11494], [51.61252, -0.11833], [51.61309, -0.12131], [51.61298, -0.12143], [51.61648, -0.11916], [51.61683, -0.11915], [51.61713, -0.11953], [51.61855, -0.11777], [51.61851, -0.11749]] },
    { id: "grovelands-park", name: "Grovelands Park", type: "park", leg: "Southgate loop", start: "Southgate", distance: "1.7 mi (2.7 km)", highlights: "A varied suburban park with a tree-lined boating lake, sloping playing fields and a lovely stretch of raised woodland boardwalk.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.63294, -0.11476], [51.63289, -0.11578], [51.63163, -0.1165], [51.62933, -0.11924], [51.62956, -0.11998], [51.62903, -0.12135], [51.62911, -0.12234], [51.62931, -0.12245], [51.63043, -0.12206], [51.63148, -0.12367], [51.63413, -0.11801], [51.63545, -0.11748], [51.63723, -0.11067], [51.63754, -0.11003], [51.63766, -0.1102], [51.6371, -0.10926], [51.63665, -0.1098], [51.63564, -0.11052], [51.63428, -0.11118], [51.63355, -0.11205], [51.63328, -0.11265]] },
    { id: "hackney-marshes", name: "Hackney Marshes", type: "trail", leg: "Homerton loop", start: "Homerton", distance: "4.3 mi (7.0 km)", highlights: "A vast traffic-free network of grass sports fields, Victorian filter-bed nature reserves and regenerating woodland threaded between the River Lea and Lee Navigation.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.55277, -0.02516], [51.55449, -0.02741], [51.55695, -0.03767], [51.56075, -0.04244], [51.56129, -0.04318], [51.56129, -0.04318], [51.56067, -0.03958], [51.55999, -0.03918], [51.56121, -0.0369], [51.56302, -0.03275], [51.56455, -0.03604], [51.56422, -0.03479], [51.56162, -0.03757], [51.56023, -0.03778], [51.55864, -0.03848], [51.55696, -0.03756], [51.55565, -0.03539], [51.55165, -0.03029], [51.5449, -0.01969], [51.54443, -0.01802], [51.54494, -0.01724], [51.5464, -0.01745], [51.55057, -0.01939], [51.5516, -0.02077], [51.55182, -0.02093], [51.55192, -0.02503]] },
    { id: "epping-forest", name: "Epping Forest", type: "trail", leg: "Epping → Manor Park", start: "Epping Station", distance: "15.0 mi (24 km)", highlights: "London's largest forest, a 15-mile point-to-point traverse from Epping to Manor Park through ancient oak, beech and hornbeam woodland on the historic Green Ride.", suitability: "Undulating to hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.70226, 0.01927], [51.69553, 0.02347], [51.68988, 0.03045], [51.68455, 0.03673], [51.68238, 0.0417], [51.67456, 0.04225], [51.66747, 0.04142], [51.66387, 0.03652], [51.6615, 0.03032], [51.65485, 0.03054], [51.64695, 0.02749], [51.63476, 0.01146], [51.6314, 0.00271], [51.62734, 0.006], [51.62076, 0.00839], [51.61447, 0.0064], [51.60381, 0.00287], [51.59703, 0.00853], [51.59335, 0.0117], [51.58669, 0.0126], [51.5848, 0.02053], [51.58253, 0.02178], [51.57582, 0.02787], [51.57011, 0.03842], [51.55884, 0.04229], [51.55245, 0.04664]] },
    { id: "wanstead-flats-and-wanstead-park", name: "Wanstead Flats & Wanstead Park", type: "trail", leg: "Wanstead loop", start: "Manor Park Station", distance: "6.9 mi (11 km)", highlights: "A wonderfully diverse clockwise loop over open grassland, boggy woods and ornamental ponds, passing the historic Temple and the vast City of London Cemetery.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.55245, 0.04664], [51.55507, 0.046], [51.55767, 0.0385], [51.55887, 0.03335], [51.55931, 0.02617], [51.55949, 0.02422], [51.56101, 0.02028], [51.56156, 0.01999], [51.56548, 0.02063], [51.56801, 0.0217], [51.56975, 0.0253], [51.57419, 0.03322], [51.57607, 0.03665], [51.57596, 0.04028], [51.57471, 0.0449], [51.57391, 0.04529], [51.5719, 0.0475], [51.56965, 0.04761], [51.56897, 0.04998], [51.56712, 0.05065], [51.56572, 0.05084], [51.5634, 0.04468], [51.56179, 0.04125], [51.55755, 0.04449], [51.55757, 0.04433], [51.55274, 0.04648]] },
    { id: "valentines-park", name: "Valentines Park", type: "park", leg: "Ilford loop", start: "Ilford", distance: "2.0 mi (3.2 km)", highlights: "A formal, award-winning park circling two ponds and the 1696 Valentines Mansion, with a gentle hill up to the house.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.56566, 0.07142], [51.56811, 0.07101], [51.56991, 0.06997], [51.57199, 0.0671], [51.57219, 0.06641], [51.57232, 0.06685], [51.57195, 0.06719], [51.56926, 0.06822], [51.56733, 0.06603], [51.5667, 0.06636], [51.56603, 0.06646], [51.56511, 0.06556], [51.56511, 0.06556], [51.56513, 0.06607], [51.56656, 0.06623], [51.56697, 0.06604], [51.56827, 0.06534], [51.5696, 0.06808], [51.57049, 0.06713], [51.57095, 0.06664], [51.57052, 0.06709], [51.56974, 0.06771], [51.56921, 0.06824], [51.56768, 0.06988], [51.56728, 0.07109], [51.56659, 0.07335]] },
    { id: "claybury-woods-and-park", name: "Claybury Woods & Park", type: "trail", leg: "Woodford Bridge loop", start: "Woodford Bridge", distance: "2.7 mi (4.3 km)", highlights: "A lush hillside park dropping over 40m through ancient flowering woods and meadow, with stunning views on a perimeter nature trail.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.60061, 0.06619], [51.60058, 0.0671], [51.60043, 0.06693], [51.60027, 0.06769], [51.59925, 0.06922], [51.59862, 0.07064], [51.59783, 0.07232], [51.59496, 0.07731], [51.59409, 0.08251], [51.59519, 0.0837], [51.59519, 0.0837], [51.59463, 0.08273], [51.59484, 0.07884], [51.59783, 0.07232], [51.59835, 0.07053], [51.59886, 0.07035], [51.60005, 0.06895], [51.60044, 0.06672], [51.60127, 0.06493], [51.60209, 0.0642], [51.60374, 0.06406], [51.60322, 0.06212], [51.60322, 0.06212], [51.60374, 0.06406], [51.60209, 0.0642], [51.60127, 0.06493]] },
    { id: "fairlop-waters-country-park", name: "Fairlop Waters Country Park", type: "trail", leg: "Fairlop loop", start: "Fairlop Station", distance: "2.9 mi (4.6 km)", highlights: "Home to possibly London's nicest crushed-limestone lake loop, ideal for mile reps, plus a nature reserve and golf-course perimeter.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.59284, 0.10045], [51.59273, 0.10016], [51.59245, 0.09999], [51.59234, 0.09935], [51.59175, 0.09845], [51.59183, 0.09774], [51.59479, 0.09564], [51.5964, 0.09617], [51.59658, 0.09555], [51.5958, 0.09328], [51.59581, 0.0929], [51.59593, 0.09286], [51.59565, 0.09186], [51.59666, 0.09548], [51.5964, 0.09617], [51.59479, 0.09564], [51.59183, 0.09774], [51.59175, 0.09845], [51.59234, 0.09935], [51.59245, 0.09999], [51.59273, 0.10016]] },
    { id: "hainault-forest-country-park", name: "Hainault Forest Country Park", type: "trail", leg: "Hainault loop", start: "Hainault", distance: "6.0 mi (9.7 km)", highlights: "A classic country park set in a basin, its perimeter loop climbing from a lakeside meadow up into hilltop woodland, with a cafe and children's farm at its heart.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.62314, 0.13126], [51.62099, 0.12303], [51.61823, 0.11828], [51.61722, 0.11654], [51.61564, 0.11484], [51.61233, 0.10785], [51.61099, 0.10419], [51.6085, 0.10261], [51.60686, 0.0968], [51.60286, 0.09847], [51.59806, 0.1004], [51.60286, 0.09847], [51.60686, 0.0968], [51.60994, 0.10326], [51.6108, 0.10527], [51.61299, 0.10754], [51.61589, 0.11613], [51.61472, 0.11954], [51.61585, 0.11632], [51.61646, 0.11387], [51.61631, 0.11169], [51.61782, 0.10951], [51.61823, 0.10921], [51.62059, 0.11652], [51.61984, 0.11905], [51.62213, 0.12469]] },
    { id: "eastbrookend-country-park", name: "Eastbrookend Country Park", type: "trail", leg: "Dagenham loop", start: "Dagenham", distance: "3.2 mi (5.2 km)", highlights: "A sprawling off-road wildlife reserve of ponds, woodchip lake trails and the River Rom corridor, forming a muddy circuit across three sections.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.55525, 0.17426], [51.55553, 0.17465], [51.55609, 0.17493], [51.55633, 0.17612], [51.55616, 0.17697], [51.556, 0.17778], [51.55577, 0.17933], [51.55493, 0.18006], [51.55431, 0.17992], [51.55403, 0.1804], [51.55498, 0.18185], [51.55522, 0.18311], [51.55435, 0.18162], [51.55353, 0.17676], [51.55387, 0.17482], [51.55351, 0.17497], [51.55328, 0.17384], [51.55353, 0.17292], [51.55348, 0.17031], [51.553, 0.16705], [51.55301, 0.16412], [51.55266, 0.16462], [51.55312, 0.16995], [51.55353, 0.17292], [51.55383, 0.17364], [51.55466, 0.17434]] },
    { id: "hornchurch-country-park", name: "Hornchurch Country Park", type: "trail", leg: "Hornchurch loop", start: "Hornchurch", distance: "2.5 mi (4.0 km)", highlights: "A former WWII RAF airfield turned nature park, its trails dotted with pillboxes tracing the Ingrebourne River and marshes.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.53877, 0.21059], [51.53985, 0.20961], [51.54013, 0.20951], [51.54181, 0.21203], [51.54262, 0.21311], [51.54303, 0.21188], [51.54471, 0.21278], [51.54492, 0.21379], [51.54624, 0.21468], [51.54736, 0.21539], [51.54724, 0.21583], [51.54927, 0.21707], [51.55036, 0.21828], [51.55231, 0.21855], [51.54916, 0.21782], [51.54856, 0.2168], [51.54724, 0.21583], [51.54664, 0.21454], [51.54535, 0.21386], [51.54492, 0.21379], [51.54445, 0.2126], [51.54303, 0.21188], [51.54239, 0.21307], [51.54144, 0.21179], [51.54013, 0.20951], [51.53918, 0.21097]] },
    { id: "mayesbrook-park", name: "Mayesbrook Park", type: "park", leg: "Dagenham loop", start: "Dagenham", distance: "2.0 mi (3.2 km)", highlights: "A facility-packed park with an athletics track, lakes and a pioneering climate-change wetland, linked north to south by a sealed path.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.54487, 0.11083], [51.54464, 0.11256], [51.54256, 0.11241], [51.54233, 0.11194], [51.54096, 0.11242], [51.54068, 0.11241], [51.53771, 0.11248], [51.53739, 0.11428], [51.53703, 0.11467], [51.53559, 0.11418], [51.53452, 0.11272], [51.5344, 0.1107], [51.5344, 0.1107], [51.53501, 0.11273], [51.53648, 0.11328], [51.53703, 0.11467], [51.53784, 0.1142], [51.53831, 0.11065], [51.5382, 0.10928], [51.53819, 0.11203], [51.54066, 0.11272], [51.54068, 0.11241], [51.54115, 0.11196], [51.54257, 0.11203], [51.54256, 0.11241], [51.54458, 0.11084]] },
    { id: "goodmayes-park", name: "Goodmayes Park", type: "park", leg: "Goodmayes loop", start: "Goodmayes", distance: "2.5 mi (4.0 km)", highlights: "A figure-of-eight fence-line run linking formal northern parkland, with lakes and a parkour gym, to flat southern grass sports fields.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.56, 0.11442], [51.55963, 0.11386], [51.55688, 0.11311], [51.55455, 0.10999], [51.55283, 0.1079], [51.55234, 0.1077], [51.55207, 0.1073], [51.55185, 0.10606], [51.55447, 0.10373], [51.55858, 0.09852], [51.55795, 0.09485], [51.56303, 0.09169], [51.56375, 0.09182], [51.56574, 0.09211], [51.56648, 0.09194], [51.56949, 0.09344], [51.56972, 0.09533], [51.56949, 0.09344], [51.56648, 0.09194], [51.56556, 0.09341], [51.5642, 0.09733], [51.56374, 0.09737], [51.56354, 0.09837], [51.56321, 0.10168], [51.56076, 0.1094], [51.56042, 0.10951]] },
    { id: "parsloes-park", name: "Parsloes Park", type: "park", leg: "Dagenham loop", start: "Dagenham", distance: "2.5 mi (4.0 km)", highlights: "A huge open expanse of sports-field grass ideal for barefoot running, with a sheltered lakeside loop in the formal southwest corner.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.54597, 0.1293], [51.54749, 0.12897], [51.54737, 0.12693], [51.54767, 0.12656], [51.54786, 0.12671], [51.54792, 0.12657], [51.54874, 0.12744], [51.54691, 0.12551], [51.54579, 0.12608], [51.54431, 0.12652], [51.54425, 0.12631], [51.54392, 0.12641], [51.54381, 0.12754], [51.54411, 0.13122], [51.546, 0.13447], [51.5472, 0.13584], [51.54691, 0.1369], [51.5472, 0.13584], [51.546, 0.13447], [51.54542, 0.13342], [51.54506, 0.13091], [51.54556, 0.12944]] },
    { id: "barking-park", name: "Barking Park", type: "park", leg: "Barking loop", start: "Barking", distance: "1.25 mi (2.0 km)", highlights: "A mini-Hyde-Park loop tracing a 920m boating lake and tree-lined avenues, ideal for time trials.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.54565, 0.08672], [51.54572, 0.08687], [51.5439, 0.08901], [51.54604, 0.09362], [51.54725, 0.09702], [51.54861, 0.09989], [51.55005, 0.10454], [51.5504, 0.10521], [51.55199, 0.10722], [51.55283, 0.1079], [51.55261, 0.11114], [51.55272, 0.11184], [51.55236, 0.1125], [51.55191, 0.11227], [51.55202, 0.11089]] },
    { id: "greenway-path", name: "Greenway Path", type: "trail", leg: "Pudding Mill Lane → Beckton District Park", start: "Pudding Mill Lane DLR Station", distance: "4.8 mi (7.7 km)", highlights: "A raised 5-mile pedestrian corridor along a sewer bank slicing across east London from the Olympic Park's View Tube to Beckton, with metre markers at every crossing.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.53786, -0.00016], [51.53519, 0.00205], [51.53447, 0.00405], [51.53377, 0.0055], [51.53338, 0.00536], [51.53154, 0.00498], [51.53081, 0.0053], [51.53034, 0.00553], [51.52931, 0.00502], [51.52783, 0.00929], [51.52766, 0.00946], [51.52573, 0.00925], [51.52509, 0.00967], [51.52508, 0.01392], [51.52302, 0.01485], [51.52229, 0.01866], [51.52183, 0.02059], [51.51806, 0.02607], [51.5175, 0.03182], [51.51705, 0.03259], [51.51705, 0.03468], [51.51655, 0.04182], [51.51669, 0.04244], [51.5169, 0.04379], [51.51779, 0.04429], [51.51832, 0.04454]] },
    { id: "west-ham-park", name: "West Ham Park", type: "park", leg: "West Ham loop", start: "West Ham", distance: "1.25 mi (2 km)", highlights: "Newham's historic premier park with a measured fence-line circuit and a summer grass athletics track, well sheltered by mature trees.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.53914, 0.01878], [51.53935, 0.01847], [51.53921, 0.01688], [51.53842, 0.01798], [51.53741, 0.01826], [51.53701, 0.01809], [51.53687, 0.0209], [51.53701, 0.01809], [51.53741, 0.01826], [51.53845, 0.01795], [51.54098, 0.01445], [51.54117, 0.01353], [51.54111, 0.01335], [51.54021, 0.01354], [51.53951, 0.01336], [51.53933, 0.01306], [51.5388, 0.01314], [51.53716, 0.01248], [51.53717, 0.01207], [51.5371, 0.01404], [51.53756, 0.0153], [51.53815, 0.01591], [51.53882, 0.01621], [51.53909, 0.01657], [51.53935, 0.01802], [51.53935, 0.01847]] },
    { id: "limehouse-cut", name: "Limehouse Cut", type: "canal", leg: "Limehouse Basin → Bow Locks", start: "Limehouse", distance: "1.4 mi (2.3 km)", highlights: "A straight, traffic-free canal towpath linking Limehouse Basin on the Thames to Bow Locks on the River Lea, with an award-winning floating section under the A12.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.51015, -0.03679], [51.51012, -0.03641], [51.51054, -0.03586], [51.51051, -0.03362], [51.51215, -0.03189], [51.51249, -0.03139], [51.51502, -0.02447], [51.51529, -0.02448], [51.51637, -0.02184], [51.51595, -0.02104], [51.51512, -0.02037], [51.51475, -0.0204], [51.51485, -0.01959], [51.5153, -0.01774], [51.51543, -0.01655], [51.51479, -0.01633], [51.5152, -0.01386], [51.51665, -0.01437], [51.51711, -0.01453], [51.51732, -0.01459], [51.51861, -0.01419], [51.51904, -0.01405], [51.51983, -0.0133], [51.52128, -0.01075], [51.52209, -0.00947], [51.52319, -0.00821]] },
    { id: "east-london-maritime", name: "East London Maritime", type: "landmark", leg: "Canary Wharf loop", start: "Canary Wharf", distance: "6.6 mi (10.6 km)", highlights: "A maritime-history circuit from Canary Wharf's docks through Mudchute and the Greenwich Foot Tunnel to the Cutty Sark and Royal Observatory, returning along the Thames Path.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.50313, -0.01894], [51.50255, -0.0176], [51.50072, -0.01737], [51.49465, -0.018], [51.4959, -0.01622], [51.49376, -0.01543], [51.49308, -0.01417], [51.49043, -0.0135], [51.48844, -0.01134], [51.48329, -0.01017], [51.48175, -0.01057], [51.4814, -0.01313], [51.47927, -0.01713], [51.48051, -0.01066], [51.48342, -0.00808], [51.48672, -0.00938], [51.48952, -0.01338], [51.49048, -0.0141], [51.49334, -0.01437], [51.49376, -0.01543], [51.49587, -0.01622], [51.50026, -0.01712], [51.50137, -0.01763], [51.50247, -0.0202], [51.50494, -0.01951], [51.50297, -0.01895]] },
    { id: "finsbury-park-to-alexandra-palace", name: "Finsbury Park to Alexandra Palace", type: "trail", leg: "Finsbury Park → Alexandra Palace", start: "Finsbury Park Station", distance: "5.2 mi (8.3 km)", highlights: "A green traverse from Finsbury Park up the disused-railway Parkland Walk through Queen's and Highgate ancient woods to the hilltop Alexandra Palace and its panoramic views.", suitability: "Undulating. Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.56481, -0.10639], [51.56504, -0.1057], [51.56558, -0.10563], [51.56922, -0.10516], [51.56974, -0.10615], [51.5732, -0.11195], [51.57423, -0.12155], [51.57894, -0.12368], [51.57974, -0.12375], [51.58102, -0.133], [51.58052, -0.13619], [51.58029, -0.13987], [51.58083, -0.14378], [51.58096, -0.14708], [51.58252, -0.14763], [51.58388, -0.14747], [51.58584, -0.14801], [51.58663, -0.1472], [51.58926, -0.1455], [51.59111, -0.14278], [51.59589, -0.13808], [51.59529, -0.13233], [51.59247, -0.1343], [51.59209, -0.1329], [51.59025, -0.13348], [51.59011, -0.13433]] },
    { id: "explore-the-river-lea", name: "Explore the River Lea", type: "river", leg: "Lea Bridge loop", start: "Lea Bridge", distance: "7.7 mi (12.4 km)", highlights: "A flat riverside loop up the wildlife-rich River Lea past Springfield Park, historic locks and the Tottenham and Walthamstow Marshes.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.57046, -0.05951], [51.57149, -0.05992], [51.57545, -0.06026], [51.57942, -0.0625], [51.58059, -0.06181], [51.58115, -0.06099], [51.58326, -0.0576], [51.58738, -0.05681], [51.59425, -0.05281], [51.59708, -0.05076], [51.60064, -0.04591], [51.60181, -0.04269], [51.60045, -0.04523], [51.59694, -0.05047], [51.59425, -0.05281], [51.58738, -0.05681], [51.58254, -0.05815], [51.57942, -0.0625], [51.57379, -0.05915], [51.57121, -0.05648], [51.56874, -0.05283], [51.56368, -0.04541], [51.5643, -0.04686], [51.56561, -0.04852], [51.56941, -0.05746], [51.57005, -0.0584]] },
    { id: "royal-docks-and-beckton-district-park", name: "Royal Docks & Beckton District Park", type: "landmark", leg: "Royal Docks loop", start: "Custom House Station", distance: "7.4 mi (12 km)", highlights: "A dockland circuit around the vast Royal Victoria and Albert Docks, crossing the sleek dock footbridge past the Emirates cable car, linked to the Greenway and leafy Beckton District Park.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.5101, 0.0254], [51.50803, 0.02484], [51.50739, 0.02573], [51.50716, 0.04035], [51.50624, 0.07116], [51.50614, 0.07409], [51.50695, 0.07357], [51.50752, 0.07069], [51.50861, 0.06478], [51.5099, 0.05206], [51.51036, 0.04791], [51.51383, 0.0444], [51.51656, 0.04303], [51.51346, 0.04433], [51.51036, 0.04791], [51.50951, 0.0541], [51.50815, 0.06974], [51.50729, 0.0706], [51.50246, 0.07008], [51.50113, 0.06953], [51.49962, 0.06553], [51.50249, 0.04459], [51.50608, 0.04003], [51.50814, 0.03925], [51.50951, 0.03495], [51.51011, 0.02559]] },
    { id: "richmond-and-teddington-loop", name: "Richmond & Teddington Loop", type: "river", leg: "Richmond loop", start: "Richmond", distance: "7.2 mi (11.6 km)", highlights: "A leafy Richmond-to-Teddington loop crossing the river at both ends, passing riverside palaces, gardens and Ham House on soft gravel trails.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.45737, -0.3071], [51.45373, -0.30415], [51.44894, -0.30828], [51.44759, -0.31246], [51.44689, -0.32115], [51.44835, -0.32454], [51.44996, -0.32676], [51.4493, -0.33212], [51.44531, -0.33563], [51.44158, -0.33229], [51.44061, -0.33246], [51.43732, -0.33303], [51.43326, -0.32962], [51.4312, -0.32725], [51.43009, -0.32527], [51.4299, -0.32213], [51.4313, -0.32343], [51.43252, -0.32172], [51.43674, -0.32264], [51.43983, -0.32252], [51.44316, -0.32163], [51.44429, -0.31412], [51.44602, -0.31313], [51.45138, -0.30268], [51.45345, -0.30283], [51.45796, -0.30606]] },
    { id: "chiswick-and-twickenham-loop", name: "Chiswick & Twickenham Loop", type: "river", leg: "Kew Bridge loop", start: "Kew Bridge", distance: "9.1 mi (14.6 km)", highlights: "A long, leafy south-bank river loop past Syon Park and Kew Gardens, dotted with riverside cottages and pubs.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.48669, -0.29546], [51.48384, -0.30421], [51.48401, -0.30653], [51.48349, -0.31034], [51.48307, -0.31182], [51.48134, -0.31489], [51.47913, -0.31347], [51.47653, -0.3153], [51.47399, -0.31676], [51.47157, -0.31931], [51.46907, -0.32225], [51.46647, -0.32211], [51.46483, -0.32149], [51.46004, -0.31505], [51.45866, -0.31663], [51.46189, -0.31779], [51.46505, -0.31976], [51.46864, -0.31908], [51.47463, -0.30715], [51.48347, -0.29733], [51.48623, -0.29035], [51.48611, -0.28762], [51.48946, -0.28717], [51.4899, -0.28566], [51.48873, -0.28732], [51.48743, -0.29272]] },
    { id: "putney-and-chiswick-loop", name: "Putney & Chiswick Loop", type: "river", leg: "Putney loop", start: "Putney", distance: "8.4 mi (13.5 km)", highlights: "A river loop steeped in Boat Race rowing and Fulham FC football, passing Fulham Palace and the Barnes, Hammersmith and Chiswick reaches.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.46588, -0.21423], [51.47035, -0.21725], [51.47203, -0.21807], [51.47282, -0.21508], [51.47176, -0.21426], [51.47176, -0.21426], [51.47282, -0.21508], [51.48163, -0.22287], [51.48352, -0.22447], [51.48885, -0.22852], [51.4893, -0.22916], [51.49045, -0.23436], [51.48976, -0.24326], [51.48584, -0.24992], [51.48198, -0.2515], [51.47693, -0.25186], [51.47516, -0.25281], [51.4724, -0.25302], [51.47201, -0.25276], [51.47036, -0.25058], [51.47099, -0.2458], [51.47144, -0.237], [51.47494, -0.23877], [51.47593, -0.23055], [51.47129, -0.22241], [51.46608, -0.21419]] },
    { id: "battersea-and-vauxhall-bridges-loop", name: "Battersea & Vauxhall Bridges Loop", type: "landmark", leg: "Vauxhall loop", start: "Battersea Power Station", distance: "5.4 mi (8.7 km)", highlights: "An easy loop over the Chelsea, Albert and Battersea bridges, circling Battersea Park and its landmark power station.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.48759, -0.12701], [51.48693, -0.13068], [51.48632, -0.13125], [51.48537, -0.1343], [51.48568, -0.13516], [51.4853, -0.13731], [51.4857, -0.15009], [51.483, -0.16871], [51.48205, -0.17335], [51.4834, -0.1672], [51.48106, -0.16601], [51.48334, -0.15013], [51.48262, -0.14475], [51.48138, -0.14322], [51.48032, -0.13975], [51.48024, -0.14003], [51.48111, -0.14332], [51.48092, -0.14486], [51.48082, -0.14455], [51.48111, -0.14332], [51.48027, -0.13996], [51.48275, -0.13501], [51.48339, -0.13177], [51.48459, -0.12834], [51.48576, -0.12457], [51.4864, -0.12421]] },
    { id: "two-footbridges-loop", name: "Two Footbridges Loop", type: "landmark", leg: "Temple loop", start: "Temple Station", distance: "2.7 mi (4.2 km)", highlights: "A compact, near-traffic-free loop crossing the Golden Jubilee and Millennium footbridges past St Paul's and Tate Modern.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.51109, -0.11378], [51.51068, -0.11545], [51.50852, -0.12043], [51.50676, -0.12314], [51.50538, -0.1166], [51.50419, -0.11439], [51.50357, -0.11382], [51.50271, -0.11258], [51.50297, -0.11223], [51.50322, -0.11125], [51.50383, -0.11021], [51.50526, -0.10561], [51.51091, -0.10458], [51.51092, -0.10443], [51.5086, -0.1036], [51.50824, -0.1027], [51.50787, -0.10169], [51.50728, -0.09974], [51.50678, -0.09816], [51.50778, -0.0978], [51.5084, -0.0986], [51.51341, -0.09848], [51.51298, -0.09918], [51.51216, -0.10335], [51.51118, -0.10568], [51.51113, -0.11356]] },
    { id: "10-bridges-loop", name: "10 Bridges Loop", type: "landmark", leg: "Westminster loop", start: "Westminster", distance: "9.4 mi (15.0 km)", highlights: "A zig-zagging river crossing that ticks off ten central London bridges between Vauxhall and Tower Bridge.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.48759, -0.12701], [51.49156, -0.12546], [51.49454, -0.12288], [51.49838, -0.1256], [51.50101, -0.12368], [51.50405, -0.11541], [51.50256, -0.11278], [51.50272, -0.11187], [51.50345, -0.11113], [51.50556, -0.10568], [51.50976, -0.10443], [51.50814, -0.09869], [51.50743, -0.09505], [51.50739, -0.09483], [51.50614, -0.09026], [51.50632, -0.08838], [51.50656, -0.08842], [51.50592, -0.08136], [51.50552, -0.07536], [51.4941, -0.08488], [51.4936, -0.08926], [51.49197, -0.09823], [51.4912, -0.10298], [51.48897, -0.11055], [51.48747, -0.11194], [51.48605, -0.12322]] },
    { id: "tower-bridge-and-greenwich-loop", name: "Tower Bridge & Greenwich Loop", type: "river", leg: "Wapping loop", start: "Wapping Station", distance: "11.4 mi (18.3 km)", highlights: "An anti-clockwise dockland loop through Bermondsey's old wharves and Canary Wharf, dipping under the Thames via the Greenwich foot tunnel.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.50552, -0.07536], [51.50202, -0.07076], [51.50006, -0.05569], [51.49998, -0.04994], [51.50013, -0.04248], [51.4998, -0.03631], [51.50011, -0.03338], [51.50565, -0.02587], [51.50718, -0.01677], [51.50692, -0.0066], [51.5097, 0.005], [51.50085, 0.00552], [51.49773, 0.00355], [51.49267, 0.00872], [51.48669, 0.00036], [51.48324, -0.00999], [51.49043, -0.0135], [51.49393, -0.01543], [51.50105, -0.01773], [51.50516, -0.02293], [51.50787, -0.03144], [51.51016, -0.04561], [51.50803, -0.05091], [51.50565, -0.05442], [51.50533, -0.06996], [51.50712, -0.07436]] },
    { id: "greenwich-to-erith", name: "Greenwich to Erith", type: "river", leg: "Cutty Sark → Erith", start: "Greenwich", distance: "13.3 mi (21.4 km)", highlights: "A wide-open, point-to-point run along the tidal Thames past the O2 and Thames Barrier, ideal for uninterrupted marathon-training miles.", suitability: "Indicative line traced from the Runner's Guide to London (2015).", loop: false, path: [[51.4829, -0.00987], [51.48441, -0.0044], [51.48892, 0.00238], [51.49293, 0.00198], [51.49564, 0.00316], [51.50076, 0.00052], [51.50096, 0.00464], [51.50214, 0.00777], [51.49767, 0.01906], [51.49869, 0.02528], [51.5023, 0.03718], [51.49864, 0.05924], [51.49442, 0.06281], [51.49362, 0.06562], [51.49045, 0.06947], [51.4912, 0.07791], [51.49035, 0.08739], [51.49666, 0.11231], [51.4914, 0.12126], [51.49083, 0.12598], [51.48919, 0.14193], [51.48844, 0.14936], [51.48853, 0.15828], [51.48665, 0.16882], [51.48386, 0.17543], [51.48082, 0.17923]] },
    { id: "jubilee-country-park", name: "Jubilee Country Park", type: "trail", leg: "Bromley loop", start: "Bromley", distance: "2.0 mi (3.2 km)", highlights: "A flat figure-of-eight through woods and wildflower meadows that bloom in spring and summer.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.39256, 0.06475], [51.39214, 0.06441], [51.39117, 0.06408], [51.38926, 0.06449], [51.38859, 0.06433], [51.38852, 0.06487], [51.38859, 0.06433], [51.38922, 0.06449], [51.38937, 0.06399], [51.3905, 0.06373], [51.39089, 0.0633], [51.39204, 0.06333], [51.3934, 0.06218], [51.39407, 0.06274], [51.3956, 0.06115], [51.39402, 0.06281], [51.39327, 0.06545]] },
    { id: "crane-park", name: "Crane Park", type: "park", leg: "Crane Park loop", start: "Whitton Station", distance: "4.0 mi (6.5 km)", highlights: "A long, narrow park following the River Crane under an ever-present cover of trees, with the 25m Shot Tower to spot.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.44309, -0.37478], [51.44308, -0.37745], [51.44308, -0.37745], [51.44345, -0.37719], [51.44398, -0.37374], [51.44464, -0.3728], [51.44783, -0.37019], [51.44842, -0.37038], [51.45089, -0.36698], [51.45249, -0.36763], [51.45375, -0.36995], [51.45696, -0.37261], [51.45696, -0.37261], [51.45292, -0.36812], [51.45001, -0.36673], [51.44844, -0.35437], [51.44872, -0.35293], [51.44718, -0.35161], [51.44714, -0.34976], [51.44714, -0.34976], [51.44408, -0.35542], [51.44216, -0.36141], [51.4416, -0.36462], [51.44242, -0.36833], [51.44379, -0.37301], [51.44316, -0.37431]] },
    { id: "hanworth-park", name: "Hanworth Park", type: "park", leg: "Hanworth Park loop", start: "Hanworth Park", distance: "1.75 mi (2.8 km)", highlights: "A former royal hunting ground and WWII airfield, now a pleasant open grassy plain with wonderfully soft trails.", suitability: "Flat. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.44099, -0.39931], [51.44124, -0.39891], [51.44116, -0.3974], [51.44067, -0.39588], [51.43929, -0.39582], [51.4351, -0.39542], [51.43493, -0.39432], [51.43473, -0.39436], [51.43417, -0.39379], [51.43473, -0.39436], [51.43493, -0.39432], [51.4351, -0.39542], [51.43542, -0.39515], [51.44112, -0.39591], [51.44226, -0.39545], [51.44295, -0.3958], [51.44359, -0.39728], [51.4441, -0.39652], [51.44416, -0.39667], [51.44401, -0.39655], [51.44359, -0.39728], [51.44226, -0.39545], [51.44183, -0.39563], [51.44156, -0.3977], [51.44119, -0.3985], [51.44124, -0.39891]] },
    { id: "hanger-hill-park-and-fox-wood", name: "Hanger Hill Park & Fox Wood", type: "trail", leg: "Hanger Hill loop", start: "Hanger Hill", distance: "1.4 mi (2.2 km)", highlights: "A hilly green pairing of Hanger Hill Park's sealed circuit with Fox Wood's wooded trails and stairs, extendable to nearby Pitshanger Park.", suitability: "Hilly. Indicative line traced from the Runner's Guide to London (2015).", loop: true, path: [[51.52477, -0.29544], [51.52428, -0.29597], [51.52393, -0.2974], [51.52422, -0.29751], [51.52393, -0.2974], [51.52415, -0.29215], [51.52439, -0.29165], [51.52403, -0.29146], [51.52342, -0.29133], [51.52325, -0.29124], [51.52312, -0.29095], [51.52302, -0.28919], [51.52041, -0.28814], [51.52067, -0.28689], [51.5202, -0.28651], [51.5202, -0.28651], [51.52067, -0.28689], [51.52041, -0.28814], [51.52347, -0.29042], [51.52312, -0.29095], [51.52325, -0.29124], [51.52376, -0.29107], [51.52403, -0.29146], [51.52439, -0.29165], [51.52505, -0.29253], [51.52508, -0.29449]] },
    { id: "cranleigh-line", name: "Cranleigh Line (Downs Link)", type: "disused", leg: "Guildford → Bramley & Wonersh → Cranleigh", start: "Guildford Station", distance: "7.0 mi (12 km)", highlights: "The disused Guildford-to-Horsham railway, closed in the 1965 Beeching cuts and now the Downs Link path: a flat, traffic-free run south through Shalford and the restored platforms of Bramley & Wonersh to Cranleigh.", suitability: "Flat, well-surfaced former trackbed and bridleway, entirely traffic-free. Point-to-point; no train back (the line is closed) so return by bus or run it out-and-back.", loop: false, path: [[51.2366, -0.5806], [51.232, -0.5792], [51.2255, -0.5762], [51.2176, -0.573], [51.209, -0.5708], [51.201, -0.5672], [51.194, -0.5632], [51.1878, -0.561], [51.18, -0.5528], [51.172, -0.544], [51.165, -0.5332], [51.158, -0.5198], [51.1512, -0.5052], [51.1447, -0.4926]] },
  ];

  const routeMap = { map: null, layer: null, current: -1, reversed: false, mode: null, gl: null };

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
  const RIVER_TOTAL = ROUTES.filter((r) => r.type === "river").length;
  const ROUTE_BADGES = [
    { icon: "📸", name: "Sightseer", desc: "Run any landmark route", test: (c) => (c.type.landmark || 0) >= 1 },
    { icon: "🏛", name: "Grand Tourist", desc: "Run the Grand Tour of Thames landmarks", test: (c) => c.has("The Grand Tour (Thames Landmarks)") },
    { icon: "🌳", name: "Park Life", desc: "Run 5 park routes", test: (c) => (c.type.park || 0) >= 5 },
    { icon: "🌊", name: "River Runner", desc: "Run every riverside route", test: (c) => (c.type.river || 0) >= RIVER_TOTAL },
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
  let routesGeo = null, routeStopsMerged = false;
  async function loadRoutes() {
    if (routesGeo) return routesGeo;
    const loaded = {};
    try {
      const res = await vfetch("data/routes.geojson");
      if (res.ok) {
        const gj = await res.json();
        for (const f of gj.features) loaded[f.properties.id] = f.geometry;
        routesGeo = loaded; // only cache success — a transient failure can retry next call
      }
    } catch (_) { /* fall back to the sketched paths */ }
    // Merge in curated access points for routes without inline stops (the
    // disused railways keep theirs), so canals, rivers and parks get strips too.
    if (!routeStopsMerged) {
      routeStopsMerged = true;
      try {
        const sRes = await vfetch("data/route-stops.json");
        if (sRes.ok) { const stops = await sRes.json(); for (const r of ROUTES) if (!r.stops && stops[r.id]) r.stops = stops[r.id]; }
      } catch (_) { /* strips just stay hidden for those routes */ }
    }
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
    L.polyline(latlngs, { color: "#fff", weight: baseWeight + 4, opacity: 0.85, lineJoin: "round", lineCap: "round" }).addTo(grp); // white casing: route stays legible on any basemap
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
      const conns = marks.tubeConns ? geoInterchangeTags(lat, lon) : "";
      L.popup({ offset: [0, -2], autoPan: false }).setLatLng([lat, lon]).setContent(safeName + conns).openOn(map);
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

  // Sign-style access-point strip under the routes map, for routes that carry a
  // curated `stops` list (e.g. the Parkland Walk's noticeboard diagram). Leg
  // distances are true along-path km, from projecting each stop onto the route.
  function renderRouteStrip(r) {
    const el = document.getElementById("routeStrip");
    if (!el) return;
    const geom = r && r.stops && routesGeo && routesGeo[r.id];
    if (!geom) { el.hidden = true; el.innerHTML = ""; return; }
    const path = (geom.type === "MultiLineString" ? geom.coordinates.flat() : geom.coordinates).map((p) => [p[1], p[0]]);
    const cum = pathCumKm(path);
    // A loop if the route says so, or its traced ends meet. Honour the flag too:
    // a circuit whose start/finish sit a few hundred metres apart (e.g. a race
    // starting on The Mall and finishing by the Palace) still needs loop ordering.
    const isLoop = !!r.loop || (path.length > 2 && haversineKm([0, path[0][0], path[0][1]], [0, path[path.length - 1][0], path[path.length - 1][1]]) < 0.08);
    let stops = r.stops;
    let along = stops.map((s) => projectOnPath(s[1], s[2], path, cum).alongKm);
    // On a loop the start/seam point can project to ≈0 or ≈full-length, so the
    // authored order isn't guaranteed monotonic — order the stops by their
    // position around the loop so every leg reads forward and positive.
    if (isLoop) {
      const order = along.map((_, i) => i).sort((a, b) => along[a] - along[b]);
      stops = order.map((i) => r.stops[i]);
      along = order.map((i) => along[i]);
    }
    const legKms = along.map((k, i) => (i ? Math.max(0, k - along[i - 1]) : 0));
    const c = ROUTE_COLOURS[r.type] || "#0019A8";
    el.hidden = false;
    el.classList.add("strip");
    el.style.setProperty("--line-col", c);
    // Access points are place names, not stations, so match interchanges by
    // proximity (like the bus strips) — e.g. Little Venice sits ~110 m from
    // Warwick Avenue, so the canal towpath surfaces the Bakerloo there.
    el.innerHTML = stripMapHtml(null, c, r.name, { wp: stops, bannerLabel: `${r.name} — ${isLoop ? "around the loop" : "access points"}`, legKms, totalKm: cum[path.length - 1], tap: true, geoInterchange: true });
    // Tap an access point to centre it on the route map above.
    el.querySelectorAll(".stn").forEach((sEl, si) => sEl.addEventListener("click", () => {
      const s = stops[si];
      if (routeMap.mode === "gl" && routeMap.gl && routeMap.gl.map) {
        const glMap = routeMap.gl.map;
        glMap.easeTo({ center: [s[2], s[1]], zoom: Math.max(glMap.getZoom(), 14.5), duration: 600 });
        new maplibregl.Popup({ offset: 10 }).setLngLat([s[2], s[1]]).setText(s[0]).addTo(glMap);
      } else if (routeMap.map) {
        routeMap.map.setView([s[1], s[2]], Math.max(routeMap.map.getZoom(), 15), { animate: true });
      }
    }));
  }

  function drawRoute(i) {
    const r = ROUTES[i], c = ROUTE_COLOURS[r.type] || "#0019A8";
    renderRouteStrip(r);
    if (routeMap.mode === "gl") { drawRouteGL(r, c); return; }
    const m = routeMap.map;
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

  // --- Routes map: real MapLibre GL 3D surface (with a Leaflet fallback) ---
  // Only the Routes route-detail map is a vector/3D MapLibre map; the app's other
  // maps stay on Leaflet. MapLibre (~230 KB gz) is lazy-loaded the first time this
  // surface opens, so it never weighs down visitors who don't view routes.
  const OFM_STYLE = "https://tiles.openfreemap.org/styles/liberty"; // keyless vector basemap
  const OFM_HILLSHADE = "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"; // Esri, keyless, CORS *
  // Marching-dash sequence for the animated flow line (MapLibre's animate-a-line pattern).
  const GL_FLOW_DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];

  // Finish-line pints: well-rated pubs near each route's ends (FSA open data,
  // built by tools/generate-pubs.mjs). Missing file just means no pub layer.
  let routePubsPromise = null;
  function loadRoutePubs() {
    if (!routePubsPromise) {
      routePubsPromise = vfetch("data/route-pubs.json").then((r) => (r.ok ? r.json() : {}))
        .catch(() => { routePubsPromise = null; return {}; }); // reset so a transient failure can retry
    }
    return routePubsPromise;
  }

  // Transport "secrets" — deep-level shelters, ghost stations, depots and
  // oddities worth a detour (data/secrets.json, hand-curated).
  let secretsPromise = null;
  function loadSecrets() {
    if (!secretsPromise) {
      secretsPromise = vfetch("data/secrets.json").then((r) => (r.ok ? r.json() : []))
        .catch(() => { secretsPromise = null; return []; }); // reset so a transient failure can retry
    }
    return secretsPromise;
  }

  let maplibrePromise = null;
  function loadMapLibre() {
    if (maplibrePromise) return maplibrePromise;
    maplibrePromise = new Promise((resolve, reject) => {
      if (typeof maplibregl !== "undefined") { resolve(maplibregl); return; }
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "vendor/maplibre/maplibre-gl.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "vendor/maplibre/maplibre-gl.js"; s.async = true;
      s.onload = () => (typeof maplibregl !== "undefined" ? resolve(maplibregl) : reject(new Error("maplibre unavailable")));
      s.onerror = () => reject(new Error("maplibre failed to load"));
      document.head.appendChild(s);
    });
    return maplibrePromise;
  }

  // Cheap WebGL capability probe — MapLibre needs a GL context; if there's none
  // (old device, GL disabled) we fall back to the Leaflet raster route map.
  function glSupported() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (_) { return false; }
  }

  // Build the MapLibre map in the Routes container: vector basemap + Esri hillshade
  // relief + the style's native 3D buildings, plus empty route layers (casing, soft
  // base, animated flow) that drawRouteGL fills per selection. Rejects (→ Leaflet
  // fallback) if MapLibre can't load or the style never comes up.
  async function routeGLInit(mapEl) {
    const gl = await loadMapLibre();
    const map = new gl.Map({
      container: mapEl,
      style: OFM_STYLE,
      center: [-0.115, 51.509],
      zoom: 11,
      pitch: 40,
      maxPitch: 75,
      cooperativeGestures: true, // ⌘/Ctrl + scroll to zoom — matches the app's other maps, keeps page scroll
      attributionControl: { compact: true },
    });
    routeMap.gl = { map, start: null, finish: null }; // store early so a failed init can be torn down
    map.addControl(new gl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new gl.FullscreenControl(), "top-right");
    map.addControl(new gl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("error", (e) => console.error("[routeMap gl]", e && e.error ? e.error.message : e));

    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("style load timeout")), 8000);
      map.on("load", () => { clearTimeout(to); resolve(); });
    });

    let before; // insert our layers below the basemap's labels so place names stay on top
    for (const l of map.getStyle().layers || []) if (l.type === "symbol") { before = l.id; break; }
    map.addSource("route-hillshade", { type: "raster", tiles: [OFM_HILLSHADE], tileSize: 256, maxzoom: 16, attribution: "Hillshade &copy; Esri" });
    map.addLayer({ id: "route-hillshade", type: "raster", source: "route-hillshade", paint: { "raster-opacity": 0.28 } }, before);
    map.setSky({ "sky-color": "#8fb2e6", "horizon-color": "#e4edf8", "fog-color": "#eef3fa", "sky-horizon-blend": 0.7, "horizon-fog-blend": 0.5 });

    const empty = { type: "FeatureCollection", features: [] };
    map.addSource("route", { type: "geojson", data: empty });
    map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#fff", "line-width": 8, "line-opacity": 0.9 } }, before);
    map.addLayer({ id: "route-base", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#0019a8", "line-width": 5, "line-opacity": 0.35 } }, before);
    map.addLayer({ id: "route-flow", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#0019a8", "line-width": 4, "line-dasharray": [0, 4, 3] } }, before);

    // Finish-line pints: amber dots near the route's ends; tap one for the name
    // and its FSA hygiene score. The 🍺 control toggles the layer.
    map.addSource("route-pubs", { type: "geojson", data: empty });
    map.addLayer({ id: "route-pubs", type: "circle", source: "route-pubs", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 15, 6.5],
      "circle-color": "#e39b25", "circle-stroke-color": "#fff", "circle-stroke-width": 1.6, "circle-opacity": 0.95,
    } }, before);
    map.on("click", "route-pubs", (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      new maplibregl.Popup({ offset: 10 }).setLngLat(f.geometry.coordinates)
        .setText(`${f.properties.n} — food hygiene ${f.properties.r}/5 · near the ${f.properties.end}`).addTo(map);
    });
    map.on("mouseenter", "route-pubs", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "route-pubs", () => { map.getCanvas().style.cursor = ""; });

    // Secrets along the route: shelters, ghost stations, depots and oddities
    // within ~400 m of the line — violet dots, tap for the story.
    map.addSource("route-secrets", { type: "geojson", data: empty });
    map.addLayer({ id: "route-secrets", type: "circle", source: "route-secrets", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 15, 7],
      "circle-color": "#5F259F", "circle-stroke-color": "#fff", "circle-stroke-width": 1.6, "circle-opacity": 0.95,
    } }, before);
    map.on("click", "route-secrets", (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      new maplibregl.Popup({ offset: 10, maxWidth: "280px" }).setLngLat(f.geometry.coordinates)
        .setText(`${f.properties.n} — ${f.properties.d}`).addTo(map);
    });
    map.on("mouseenter", "route-secrets", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "route-secrets", () => { map.getCanvas().style.cursor = ""; });
    map.addControl({
      onAdd() {
        const div = document.createElement("div");
        div.className = "maplibregl-ctrl maplibregl-ctrl-group";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "🍺";
        btn.title = "Finish-line pints — well-rated pubs near the start and finish";
        btn.setAttribute("aria-label", btn.title);
        btn.setAttribute("aria-pressed", "true");
        btn.addEventListener("click", () => {
          const off = map.getLayoutProperty("route-pubs", "visibility") === "none";
          map.setLayoutProperty("route-pubs", "visibility", off ? "visible" : "none");
          btn.setAttribute("aria-pressed", String(off));
          btn.style.opacity = off ? "" : "0.45";
        });
        div.appendChild(btn);
        const sBtn = document.createElement("button");
        sBtn.type = "button";
        sBtn.textContent = "👁";
        sBtn.title = "Secrets along the route — shelters, ghost stations, depots and oddities";
        sBtn.setAttribute("aria-label", sBtn.title);
        sBtn.setAttribute("aria-pressed", "true");
        sBtn.addEventListener("click", () => {
          const off = map.getLayoutProperty("route-secrets", "visibility") === "none";
          map.setLayoutProperty("route-secrets", "visibility", off ? "visible" : "none");
          sBtn.setAttribute("aria-pressed", String(off));
          sBtn.style.opacity = off ? "" : "0.45";
        });
        div.appendChild(sBtn);
        return div;
      },
      onRemove() { /* map teardown removes the DOM */ },
    }, "top-right");

    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      let step = 0;
      const animate = (t) => {
        if (!routeMap.gl) return; // map torn down
        const s = Math.floor((t / 55) % GL_FLOW_DASH.length);
        if (s !== step) { map.setPaintProperty("route-flow", "line-dasharray", GL_FLOW_DASH[s]); step = s; }
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
    return map;
  }

  // Draw the selected route on the MapLibre surface: feed its [lon,lat] geometry to
  // the route source, colour the flow line, place start/finish markers, and fit the
  // camera to the run with a gentle 3D tilt. Mirrors drawRoute's Leaflet behaviour.
  function drawRouteGL(r, colour) {
    const g = routeMap.gl;
    if (!g || !g.map) return;
    const map = g.map;
    const geom = routesGeo && routesGeo[r.id];
    let segs; // array of [lon,lat] rings
    if (geom) {
      segs = geom.type === "MultiLineString" ? geom.coordinates.map((s) => s.slice()) : [geom.coordinates.slice()];
    } else if (r.path && r.path.length) {
      const ll = r.path.map((p) => [p[1], p[0]]); // sketch fallback is [lat,lon] -> [lon,lat]
      segs = [r.loop && ll.length > 2 ? ll.concat([ll[0]]) : ll];
    } else return;
    if (routeMap.reversed) segs = segs.slice().reverse().map((s) => s.slice().reverse());

    map.getSource("route").setData({ type: "FeatureCollection", features: segs.map((coords) => ({ type: "Feature", geometry: { type: "LineString", coordinates: coords } })) });
    map.setPaintProperty("route-base", "line-color", colour);
    map.setPaintProperty("route-flow", "line-color", colour);
    loadRoutePubs().then((pubs) => {
      if (routeMap.current < 0 || ROUTES[routeMap.current].id !== r.id) return; // selection moved on while loading
      const src = map.getSource("route-pubs");
      if (src) src.setData({ type: "FeatureCollection", features: (pubs[r.id] || []).map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: { n: p.n, r: p.r, end: p.end } })) });
    });
    loadSecrets().then((all) => {
      if (routeMap.current < 0 || ROUTES[routeMap.current].id !== r.id) return;
      const src = map.getSource("route-secrets");
      if (!src) return;
      // near = within ~400 m of any route vertex (vertices are ~13 m apart)
      const near = all.filter((p) => segs.some((seg) => seg.some((c) =>
        Math.abs(c[1] - p.lat) < 0.005 && Math.abs(c[0] - p.lon) < 0.008 && haversineKm([0, c[1], c[0]], [0, p.lat, p.lon]) < 0.4)));
      src.setData({ type: "FeatureCollection", features: near.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: { n: p.n, d: p.d } })) });
    });

    const startAt = segs[0][0], lastSeg = segs[segs.length - 1], finishAt = lastSeg[lastSeg.length - 1];
    const startLabel = routeMap.reversed ? "Start · from the far end (reversed)" : "Start · " + r.start;
    // NB set lngLat BEFORE addTo — a Marker added without a position throws on _update().
    if (!g.start) g.start = new maplibregl.Marker({ color: "#00843d" }).setLngLat(startAt).addTo(map);
    else g.start.setLngLat(startAt);
    g.start.setPopup(new maplibregl.Popup({ offset: 22 }).setText(startLabel));
    if (r.loop) { if (g.finish) { g.finish.remove(); g.finish = null; } }
    else {
      if (!g.finish) g.finish = new maplibregl.Marker({ color: "#dc241f" }).setLngLat(finishAt).addTo(map);
      else g.finish.setLngLat(finishAt);
      g.finish.setPopup(new maplibregl.Popup({ offset: 22 }).setText(routeMap.reversed ? "Finish · " + r.start : "Finish"));
    }

    // fitBounds would reset pitch to 0; compute the fit camera, then ease with a tilt.
    const b = new maplibregl.LngLatBounds();
    let n = 0;
    segs.forEach((s) => s.forEach((c) => { b.extend(c); n++; }));
    if (n) {
      const cam = map.cameraForBounds(b, { padding: 48, maxZoom: 15.5 });
      if (cam) map.easeTo({ center: cam.center, zoom: cam.zoom, pitch: 40, bearing: 0, duration: 700 });
    }
  }

  // Bring up the Routes map: prefer the MapLibre 3D surface, fall back to the
  // Leaflet raster map if WebGL/MapLibre is unavailable, then draw the first route.
  async function initRoutesMap(mapEl, first) {
    await loadRoutes();
    const pick = () => selectRoute(routeMap.current >= 0 ? routeMap.current : (first >= 0 ? first : 0));
    if (glSupported()) {
      try {
        await routeGLInit(mapEl);
        routeMap.mode = "gl";
        pick();
        return;
      } catch (e) {
        console.error("[routeMap] MapLibre init failed, using Leaflet:", e);
        if (routeMap.gl && routeMap.gl.map) { try { routeMap.gl.map.remove(); } catch (_) { /* ignore */ } }
        routeMap.gl = null;
        mapEl.innerHTML = ""; // clear any half-built GL canvas before Leaflet claims the element
      }
    }
    if (typeof L === "undefined") { mapUnavailable(mapEl); return; }
    routeMap.mode = "leaflet";
    routeMap.map = createSiteMap(mapEl);
    requestAnimationFrame(() => { routeMap.map.invalidateSize(false); pick(); });
  }

  // --- Route filters (type + distance) ----------------------------------
  const routeKm = (r) => { const m = /([\d.]+)\s*km/.exec(r.distance); return m ? parseFloat(m[1]) : 0; };
  const DIST_BUCKETS = [
    { key: "short", label: "Short · under 5k", test: (k) => k > 0 && k < 5 },
    { key: "medium", label: "Medium · 5–10k", test: (k) => k >= 5 && k <= 10 },
    { key: "long", label: "Long · 10k+", test: (k) => k > 10 },
  ];
  const TYPE_LABELS = { all: "All", park: "Parks", trail: "Trails", canal: "Canals", river: "Rivers", landmark: "Landmarks", disused: "Disused railways", race: "Races" };
  const routeFilter = { type: "all", dist: "all" };
  const ROUTE_CARD_LIMIT = 6; // route cards shown before the "Show all" toggle (the library is long)
  let routesExpanded = false;
  const distBucket = (k) => { const b = DIST_BUCKETS.find((x) => x.test(k)); return b ? b.key : ""; };
  const routeMatches = (r) => (NET_MODE === "all" || !r.far) // out-of-London routes ride with the All lines mode
    && (routeFilter.type === "all" || r.type === routeFilter.type)
    && (routeFilter.dist === "all" || distBucket(routeKm(r)) === routeFilter.dist);

  function routeCardHtml(r, i) {
    const c = safeColour(ROUTE_COLOURS[r.type] || "#0019A8");
    return `<div class="route-card" data-i="${i}" role="button" tabindex="0" aria-pressed="false" style="border-top-color:${c}">
        <div class="rc-top"><span class="rc-type" style="background:${c}">${escapeHtml(r.type)}</span><span class="rc-dist">${escapeHtml(distText(r.distance))}</span></div>
        <h3>${escapeHtml(r.name)}</h3>
        <p class="rc-leg">${escapeHtml(r.leg)}</p>
        <p class="rc-meta"><strong>Start</strong> ${escapeHtml(r.start)}</p>
        <p class="rc-hi">${escapeHtml(r.highlights)}</p>
        ${r.suitability ? `<p class="rc-suit">${escapeHtml(r.suitability)}</p>` : ""}
        ${routeKm(r) ? timesRowHtml(routeKm(r)) : ""}
        <div class="rc-actions">
          <button type="button" class="rc-mark" data-name="${escapeHtml(r.name)}">＋ Mark as run</button>
          <button type="button" class="rc-reverse" data-i="${i}">⇄ Reverse direction</button>
          <button type="button" class="rc-share" data-i="${i}">🔗 Share</button>
        </div>
      </div>`;
  }

  function syncRouteMark(btn) {
    const ran = routeRun.has(btn.dataset.name);
    btn.classList.toggle("on", ran);
    btn.textContent = ran ? "✓ Ran this route" : "＋ Mark as run";
  }

  // The "Show all / Show fewer" control under the (long) route library.
  function setRoutesToggle(total) {
    const btn = document.getElementById("routesToggle");
    if (!btn) return;
    if (total <= ROUTE_CARD_LIMIT) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.textContent = routesExpanded ? "Show fewer routes" : `Show all ${total} routes`;
    btn.setAttribute("aria-expanded", routesExpanded ? "true" : "false");
  }

  // Rebuild the (filtered) card list; returns the original index of the first visible route.
  function renderRouteCards() {
    const el = document.getElementById("routeList");
    if (!el) return -1;
    const visible = ROUTES.map((r, i) => ({ r, i })).filter((x) => routeMatches(x.r));
    if (!visible.length) {
      el.innerHTML = `<p class="routes-empty">No routes match that filter — try a wider distance or another type.</p>`;
      setRoutesToggle(0);
      return -1;
    }
    // Collapse the long library to a few cards by default so the section is quick to
    // scroll past; the toggle reveals the rest. When collapsed, still append the
    // selected route's card (a deep link / share may point past the fold) so it stays
    // visible and highlighted without expanding the whole list.
    const collapsed = !routesExpanded && visible.length > ROUTE_CARD_LIMIT;
    let shown = collapsed ? visible.slice(0, ROUTE_CARD_LIMIT) : visible;
    if (collapsed) {
      const selPos = visible.findIndex((x) => x.i === routeMap.current);
      if (selPos >= ROUTE_CARD_LIMIT) shown = shown.concat([visible[selPos]]);
    }
    el.innerHTML = shown.map((x) => routeCardHtml(x.r, x.i)).join("");
    setRoutesToggle(visible.length);
    el.querySelectorAll(".route-card").forEach((card) => {
      const i = parseInt(card.dataset.i, 10);
      card.addEventListener("click", () => selectRoute(i, true));
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectRoute(i, true); } });
      const rev = card.querySelector(".rc-reverse");
      if (rev) rev.addEventListener("click", (e) => { e.stopPropagation(); reverseRoute(i, rev); });
      const share = card.querySelector(".rc-share");
      if (share) share.addEventListener("click", async (e) => {
        e.stopPropagation();
        const url = routeShareUrl(ROUTES[i]);
        // Native share sheet where it exists (mobile); otherwise copy the link.
        if (navigator.share) { try { await navigator.share({ title: ROUTES[i].name, url }); } catch (_) { /* user dismissed */ } return; }
        try {
          await navigator.clipboard.writeText(url);
          const was = share.textContent;
          share.textContent = "✓ Link copied";
          setTimeout(() => { share.textContent = was; }, 1600);
        } catch (_) { window.prompt("Copy this route link:", url); }
      });
      const mark = card.querySelector(".rc-mark");
      if (mark) {
        syncRouteMark(mark);
        mark.addEventListener("click", (e) => {
          e.stopPropagation();
          const n = mark.dataset.name;
          const adding = !routeRun.has(n);
          if (adding) routeRun.add(n); else routeRun.delete(n);
          stampRun(n, adding);
          saveRoutesRun(routeRun); syncRouteMark(mark); renderRouteProgress();
          renderLineCollector(); // its stats row + borough bagger count routes too
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
      `<button type="button" class="rf-chip${routeFilter[group] === val ? " on" : ""}" aria-pressed="${routeFilter[group] === val}" data-group="${group}" data-val="${val}">${escapeHtml(label)}</button>`;
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

  // A route's shareable URL, e.g. https://…/#routes/regents-canal.
  function routeShareUrl(r) { return location.href.split("#")[0] + "#routes/" + r.id; }
  // Index of the route named by a #routes/<id> deep link, or -1.
  function routeIndexFromHash() {
    const m = /^#routes\/(.+)$/.exec(location.hash);
    if (!m) return -1;
    const id = decodeURIComponent(m[1]);
    return ROUTES.findIndex((r) => r.id === id);
  }

  function selectRoute(i, updateHash) {
    routeMap.current = i;
    routeMap.reversed = false; // a freshly-picked route starts in its forward direction
    // Only user-initiated picks rewrite the URL — the boot-time auto-select
    // must not stamp a deep link onto every visit.
    if (updateHash) { try { history.replaceState(null, "", "#routes/" + ROUTES[i].id); } catch (_) { /* ignore */ } }
    document.querySelectorAll("#routeList .route-card").forEach((el) => {
      const on = +el.dataset.i === i;
      el.classList.toggle("on", on); el.setAttribute("aria-pressed", on ? "true" : "false");
      const rev = el.querySelector(".rc-reverse");
      if (rev) rev.classList.remove("on");
    });
    drawRoute(i);
    if (window.matchMedia("(max-width: 860px)").matches && (routeMap.map || routeMap.gl))
      document.getElementById("routeMap").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function reverseRoute(i, btn) {
    if (routeMap.current !== i) { selectRoute(i, true); return; }
    routeMap.reversed = !routeMap.reversed;
    if (btn) btn.classList.toggle("on", routeMap.reversed);
    drawRoute(i);
  }

  function renderRoutes() {
    const el = document.getElementById("routeList");
    if (!el) return;
    renderFilters();
    const toggle = document.getElementById("routesToggle");
    if (toggle && !toggle.dataset.wired) {
      toggle.dataset.wired = "1";
      toggle.addEventListener("click", () => {
        routesExpanded = !routesExpanded;
        renderRouteCards();
        if (!routesExpanded) document.getElementById("routes")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    // Honour a #routes/<id> deep link: pre-select that route (initRoutesMap's
    // first draw uses routeMap.current) before the cards render their state.
    const linked = routeIndexFromHash();
    if (linked >= 0) routeMap.current = linked;
    const first = renderRouteCards();
    renderRouteProgress();

    const mapEl = document.getElementById("routeMap");
    if (!mapEl) return;
    // Lazy: build the (MapLibre) map only when it first nears the viewport, so the
    // ~230 KB GL library isn't fetched for visitors who never scroll to the routes.
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) { obs.disconnect(); initRoutesMap(mapEl, first); }
      }, { rootMargin: "250px" });
      io.observe(mapEl);
    } else {
      initRoutesMap(mapEl, first);
    }
    // A shared link should land the visitor on the route, not the hero:
    // scrolling the map into view also triggers its lazy init above.
    if (linked >= 0) requestAnimationFrame(() => mapEl.scrollIntoView({ block: "center" }));
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

  function drawBus(seq, wp, reversed) {
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
    // Flip the geometry too so the flow arrows run the reversed direction (wp is
    // already reversed by the caller, which swaps the start/finish markers).
    if (reversed) segs = segs.slice().reverse().map((s) => s.slice().reverse());
    const a = wp[0], b = wp[wp.length - 1];
    drawFlowSegments(m, busMapObj, segs, BUS_COL, {
      start: { at: [a[1], a[2]], label: "Start · " + escapeHtml(a[0]) },
      finish: { at: [b[1], b[2]], label: "Finish · " + escapeHtml(b[0]) },
      stops: wp,
      tubeConns: true,
    }, [30, 30]);
  }

  // Populate the route-number datalist from the cached list of TfL bus routes.
  function loadBusList() {
    vfetch("data/bus-routes.json").then((r) => r.ok ? r.json() : []).then((ids) => {

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
  function makeBusTracer(pick, result) {
    let traceSeq = 0; // two rapid picks can resolve out of order — only the latest may render
    return async function trace() {
      const id = (pick.value || "").trim();
      if (!id) return;
      const mySeq = ++traceSeq;
      result.innerHTML = `<p class="bus-loading">Loading route ${escapeHtml(id)}…</p>`;
      let seq;
      try {
        // Always fetch the outbound sequence — the Reverse button flips it to run
        // the other way, so there's no separate inbound/outbound picker.
        const res = await fetch(`https://api.tfl.gov.uk/Line/${encodeURIComponent(id)}/Route/Sequence/outbound`);
        if (!res.ok) throw new Error("http " + res.status);
        seq = await res.json();
      } catch (_) {
        if (mySeq !== traceSeq) return;
        result.innerHTML = `<p class="bus-error">Couldn't load route <strong>${escapeHtml(id)}</strong>. Check the number and try again.</p>`;
        return;
      }
      if (mySeq !== traceSeq) return;
      const sps = (seq.stopPointSequences || []).filter((s) => Array.isArray(s.stopPoint));
      // Stats describe the main branch: pick the sequence with the most stops
      // (mirrors the tube longest-branch logic) rather than an arbitrary first one.
      const main = sps.reduce((a, b) => (b.stopPoint.length > a.stopPoint.length ? b : a), sps[0]);
      const stops = main ? main.stopPoint : [];
      if (!stops || stops.length < 2) {
        result.innerHTML = `<p class="bus-error">No stops found for route ${escapeHtml(id)} — check the number and try again.</p>`;
        return;
      }
      const fwd = stops
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
        .map((s) => [s.name, s.lat, s.lon]);
      if (fwd.length < 2) {
        result.innerHTML = `<p class="bus-error">No stops found for route ${escapeHtml(id)} — check the number and try again.</p>`;
        return;
      }
      busMapObj.currentId = id;
      // Render the traced route in the current direction. Reverse flips `reversed`
      // and re-renders — flipping the stops, the map's flow direction and the
      // elevation profile — so you can plan running the route either way round.
      let reversed = false, renderSeq = 0;
      const render = async () => {
        const myRender = ++renderSeq;
        const wp = reversed ? [...fwd].reverse() : fwd;
        const km = legDistanceKm(wp, 0, wp.length - 1);
        const from = wp[0][0], to = wp[wp.length - 1][0];
        const banner = `Route ${id} · ${from} → ${to}`;
        drawBus(seq, wp, reversed);
        result.innerHTML = `
          <div class="bus-summary">
            <div class="cr-main"><span class="cr-km">${fmtKm(km, 1)}</span></div>
            ${timesRowHtml(km)}
            <div class="cr-detail">${escapeHtml(from)} → ${escapeHtml(to)} · ${wp.length} stops</div>
            <div class="bus-elev jr-elev"></div>
            <div class="bus-actions">
              <button type="button" id="busMark" class="bus-mark" data-id="${escapeHtml(id)}">＋ Mark as run</button>
              <button type="button" class="bus-reverse${reversed ? " on" : ""}" title="Flip the route to run it the other way">⇄ Reverse</button>
            </div>
            <div class="cr-note">Distance along the stops × ${ROAD_FACTOR} for the road. Buses run on-road — mind the traffic and lights.</div>
          </div>
          <div class="line-diagram strip bus-strip" style="--line-col:${BUS_COL}">${stripMapHtml(null, BUS_COL, banner, { wp, bannerLabel: banner, tap: true, geoInterchange: true })}</div>`;
        result.querySelectorAll(".bus-strip .stn").forEach((btn) => btn.addEventListener("click", () => {
          const s = wp[+btn.dataset.i];
          if (!s || !busMapObj.map) return;
          busMapObj.map.setView([s[1], s[2]], 16, { animate: true });
          L.popup({ offset: [0, -2], autoPan: false }).setLatLng([s[1], s[2]]).setContent(escapeHtml(s[0]) + geoInterchangeTags(s[1], s[2])).openOn(busMapObj.map);
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
        const revBtn = result.querySelector(".bus-reverse");
        if (revBtn) revBtn.addEventListener("click", () => { reversed = !reversed; render(); });
        // Elevation profile — buses carry no GPX, so sample open-meteo along the stops.
        const elBox = result.querySelector(".bus-elev");
        if (elBox) {
          elBox.innerHTML = `<p class="ls-elev-load">Reading elevation…</p>`;
          const elev = await routeElevation(wp.map((s) => [s[1], s[2]]));
          if (myRender === renderSeq && mySeq === traceSeq && elBox.isConnected) elBox.innerHTML = elev ? elevationHtml(elev) : "";
        }
      };
      render();
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
    const go = document.getElementById("busGo");
    const result = document.getElementById("busResult");
    const mapEl = document.getElementById("busMap");
    if (!pick || !go || !mapEl) return;
    if (typeof L === "undefined") { mapUnavailable(mapEl); return; }

    loadBusList();
    initBusMap(mapEl);
    const trace = makeBusTracer(pick, result);
    go.addEventListener("click", trace);
    pick.addEventListener("change", trace);
    // Let the site-wide unit toggle re-render the last traced route in the new units.
    busMapObj.retrace = () => { if (busMapObj.currentId) { pick.value = busMapObj.currentId; trace(); } };
    const runRoute = (id) => { pick.value = id; trace(); };
    setupBusQuickPicks(runRoute);
    setupBusPlaceSearch(runRoute, mapEl);
    renderBusProgress();
  }

  // --- Live follow-along run mode ----------------------------------------
  // On the day, track the runner's GPS along the next run's route: which stop is
  // next and how far, how much of the line is done, distance to go and live pace.
  // Reference line = the WAYPOINTS station polyline (no GPX parse needed).
  let followActive = false;

  // Cumulative distance (km) at each vertex of a [[lat,lon],...] path.
  function pathCumKm(path) {
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum[i] = cum[i - 1] + haversineKm([0, path[i - 1][0], path[i - 1][1]], [0, path[i][0], path[i][1]]);
    return cum;
  }
  // Closest point on a [[lat,lon],...] path to (lat,lon). Planar per-segment
  // projection — fine at running scale. Returns how far along the path that point
  // lies (km) and how far off the path it is (km).
  function projectOnPath(lat, lon, path, cum) {
    let best = { off: Infinity, alongKm: 0 };
    const kLat = 111.32, kLon = 111.32 * Math.cos((lat * Math.PI) / 180); // km per degree
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const bx = (b[1] - a[1]) * kLon, by = (b[0] - a[0]) * kLat;
      const px = (lon - a[1]) * kLon, py = (lat - a[0]) * kLat;
      const len2 = bx * bx + by * by || 1e-9;
      let t = (px * bx + py * by) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const off = Math.hypot(px - t * bx, py - t * by);
      if (off < best.off) best = { off, alongKm: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
    return best;
  }

  // Track any route live. stops = ordered [[name,lat,lon],...] stations, used for
  // the "next stop" logic and the dots on the map. slug = the pavement route to
  // follow (routes/<slug>.gpx): the drawn line and every distance follow that real
  // road path. Without a GPX we fall back to straight station hops × the road
  // factor. Used for the next run and, from the Lines table, any line.
  async function startFollowAlong(stops, colour, label, slug) {
    if (followActive) return;
    if (!stops || stops.length < 2) return;
    if (!("geolocation" in navigator)) { window.alert("This device can't share its location."); return; }
    followActive = true;
    colour = colour || BUS_COL;

    // Prefer the real pavement route (dense, road-following); else station hops.
    const gpxSegs = slug ? await loadRouteGpx(slug) : null;
    const gpxLine = gpxSegs && gpxSegs[0] && gpxSegs[0].length > 1 ? gpxSegs[0] : null;
    const usingGpx = !!gpxLine;
    let path = usingGpx ? gpxLine.map((p) => [p[0], p[1]]) : stops.map((s) => [s[1], s[2]]);
    let cum = pathCumKm(path);
    // Align the GPX direction with the station order (the track may run the other way).
    if (usingGpx) {
      const a = projectOnPath(stops[0][1], stops[0][2], path, cum).alongKm;
      const b = projectOnPath(stops[stops.length - 1][1], stops[stops.length - 1][2], path, cum).alongKm;
      if (a > b) { path = path.slice().reverse(); cum = pathCumKm(path); }
    }
    const pathRaw = cum[path.length - 1];
    const factor = usingGpx ? 1 : ROAD_FACTOR; // GPX is the real road; hops need the fudge
    const totalKm = pathRaw * factor;
    // Distance along the path to each station (clamped monotone), for next-stop logic.
    const stopAt = []; let acc = 0;
    for (const s of stops) { acc = Math.max(acc, projectOnPath(s[1], s[2], path, cum).alongKm); stopAt.push(acc); }

    const ov = document.createElement("div");
    ov.className = "follow-overlay";
    ov.innerHTML = `
      <div class="follow-map" id="followMap"></div>
      <div class="follow-hud">
        <div class="fh-line" style="--fc:${colour};color:${contrastText(colour)}">${escapeHtml(label || "Run")}</div>
        <div class="fh-next">
          <span class="fh-lbl">Next stop</span>
          <span class="fh-stop" id="fhStop">Locating…</span>
          <span class="fh-dist" id="fhDist"></span>
        </div>
        <div class="fh-grid">
          <div><b id="fhPct">—</b><span>of the line</span></div>
          <div><b id="fhLeft">${fmtKm(totalKm, 1)}</b><span>to go</span></div>
          <div><b id="fhPace">—</b><span>pace</span></div>
        </div>
        <div class="fh-msg" id="fhMsg">Waiting for GPS — allow location access when asked.</div>
      </div>
      <button type="button" class="follow-stop" id="fhStopBtn" aria-label="Stop following the run">✕ Stop</button>`;
    document.body.appendChild(ov);
    document.body.classList.add("follow-lock");

    const map = createSiteMap(document.getElementById("followMap"));
    L.polyline(path, { color: colour, weight: 6, opacity: 0.9, lineJoin: "round" }).addTo(map);
    stops.forEach((s, i) => {
      const end = i === 0 || i === stops.length - 1;
      L.circleMarker([s[1], s[2]], { radius: end ? 6 : 4, color: "#fff", weight: 2, fillColor: colour, fillOpacity: 1 })
        .bindTooltip(escapeHtml(s[0]), { direction: "top" }).addTo(map);
    });
    map.fitBounds(L.latLngBounds(path), { padding: [50, 50] });

    const $ = (id) => document.getElementById(id);
    const paceStr = (minPerKm) => fmtPace(distUnit === "mi" ? minPerKm / MI_PER_KM : minPerKm) + " /" + distUnit;
    const youIcon = L.divIcon({ className: "follow-you", html: '<span class="fy-dot"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
    let youMarker = null, accCircle = null, watchId = null, wakeLock = null, paceEMA = null, last = null, centred = false;

    const onFix = (pos) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      const p = projectOnPath(lat, lon, path, cum);
      const alongKm = p.alongKm * factor;
      const pct = Math.max(0, Math.min(100, Math.round((p.alongKm / pathRaw) * 100)));
      let nextIdx = stopAt.findIndex((sa) => sa > p.alongKm + 0.03);
      if (nextIdx === -1) nextIdx = stops.length - 1;
      const next = stops[nextIdx];
      const toNext = Math.max(0, stopAt[nextIdx] - p.alongKm) * factor;
      $("fhStop").textContent = next[0];
      $("fhDist").textContent = fmtKm(toNext, toNext < 1 ? 2 : 1);
      $("fhPct").textContent = pct + "%";
      $("fhLeft").textContent = fmtKm(Math.max(0, totalKm - alongKm), 1);
      // live pace, smoothed; ignore GPS jitter under 5 m or gaps over 5 min
      if (last) {
        const dKm = haversineKm([0, last.lat, last.lon], [0, lat, lon]);
        const dMin = (pos.timestamp - last.t) / 60000;
        if (dKm > 0.005 && dMin > 0 && dMin < 5) {
          const inst = dMin / dKm;
          paceEMA = paceEMA == null ? inst : 0.6 * paceEMA + 0.4 * inst;
          $("fhPace").textContent = paceStr(paceEMA);
        }
      }
      last = { lat, lon, t: pos.timestamp };
      const far = p.off > 0.15;
      $("fhMsg").textContent = far ? `You're ${fmtKm(p.off, 2)} off the route.` : "";
      $("fhMsg").classList.toggle("off", far);
      const ll = [lat, lon];
      if (!youMarker) youMarker = L.marker(ll, { icon: youIcon, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      else youMarker.setLatLng(ll);
      if (accuracy) {
        if (!accCircle) accCircle = L.circle(ll, { radius: accuracy, color: colour, weight: 1, opacity: 0.35, fillOpacity: 0.08 }).addTo(map);
        else accCircle.setLatLng(ll).setRadius(accuracy);
      }
      if (!centred) { map.setView(ll, 16, { animate: true }); centred = true; }
      else map.panTo(ll, { animate: true, duration: 0.5 });
    };
    const onErr = (e) => {
      $("fhMsg").textContent = e && e.code === 1 ? "Location denied — enable it to follow the run." : "Can't get a GPS fix yet…";
      $("fhMsg").classList.add("off");
    };
    watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });

    // Keep the screen awake while running; wake locks drop when the tab hides.
    const lockScreen = () => { if ("wakeLock" in navigator) navigator.wakeLock.request("screen").then((wl) => { wakeLock = wl; }).catch(() => {}); };
    lockScreen();
    const onVis = () => { if (document.visibilityState === "visible") lockScreen(); };
    document.addEventListener("visibilitychange", onVis);

    const stop = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("keydown", onKey);
      map.remove();
      ov.remove();
      document.body.classList.remove("follow-lock");
      followActive = false;
    };
    const onKey = (e) => { if (e.key === "Escape") stop(); };
    document.addEventListener("keydown", onKey);
    $("fhStopBtn").addEventListener("click", stop);
  }

  function setupFollowAlong() {
    const btn = document.getElementById("followBtn");
    if (!btn) return;
    const run = typeof nextRun !== "undefined" ? nextRun : null;
    const route = run && WAYPOINTS[run.key];
    if (!route || route.length < 2) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.addEventListener("click", () => startFollowAlong(route, run.colour, run.badge, lineSlug(run.key)));
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

  // National Rail rows for the line-by-line table, computed from the network
  // data once it loads (length = the longest branch's station-to-station
  // distance, so a slight under-read of true track length; stops = unique
  // stations inside our commuter-belt clip).
  let NR_STATS = null, nrStatsKicked = false;
  function computeNrStats(net) {
    // Every network line not in the hardcoded tube LINE_STATS above — the
    // National Rail lines and the DLR — gets its stats, colour and collector
    // entry computed here from the data.
    const hardcoded = new Set(LINE_STATS.map((s) => s[0]));
    return Object.keys(net).filter((id) => !hardcoded.has(net[id].name)).map((id) => {
      const ln = net[id];
      let best = 0;
      for (const b of ln.branches || []) {
        let km = 0;
        for (let i = 1; i < b.length; i++) {
          const a = ln.stations[b[i - 1]], c = ln.stations[b[i]];
          if (a && c) km += haversineKm([0, a.lat, a.lon], [0, c.lat, c.lon]);
        }
        if (km > best) best = km;
      }
      LINE_COLOURS[ln.name] = ln.colour; // row dot + detail map colour lookups
      // Register for the line collector too: distance, direction labels from
      // the main branch's real ends, and a row in the collectable list.
      LINE_KM[ln.name] = Math.round(best * 10) / 10;
      const br = ln.route || (ln.branches || []).reduce((a, b) => (b.length > a.length ? b : a), (ln.branches || [])[0] || []);
      const endA = ln.stations[br[0]], endB = ln.stations[br[br.length - 1]];
      if (endA && endB && !LINE_DIRS[ln.name]) LINE_DIRS[ln.name] = ["→ " + endB.n, "→ " + endA.n];
      if (!COLLECT_LINES.includes(ln.name)) COLLECT_LINES.push(ln.name);
      return [ln.name, Math.round(best * 10) / 10, Object.keys(ln.stations).length];
    }).filter((r) => r[1] > 0).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderLineStats() {
    const el = document.getElementById("lineStats");
    if (!el) return;
    if (!nrStatsKicked) {
      nrStatsKicked = true;
      loadNetwork().then((net) => { NR_STATS = computeNrStats(net); renderLineStats(); renderLineCollector(); })
        .catch(() => { /* the table and collector simply stay TfL-only */ });
    }
    const allStats = NR_STATS ? LINE_STATS.concat(NR_STATS) : LINE_STATS;
    const kms = allStats.map((s) => s[1]);
    const stns = allStats.map((s) => s[2]);
    const maxKm = Math.max(...kms), minKm = Math.min(...kms);
    const maxSt = Math.max(...stns), minSt = Math.min(...stns);
    const active = nextRun ? nextRun.key : null;
    const sortVal = lsSortVal[lsSortCol];
    const rows = [...allStats].sort((a, b) => {
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
        <td>${fmtTime(km * GROUP_PACE)}</td>
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
      <p class="ls-foot">Tap a column to sort, or a line to see its run route on a map. Run at a steady ${fmtPace(GROUP_PACE)}/km, cycle at ~15 km/h, walk at ~5 km/h, end to end.</p>`;
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
  // Per-variant pavement geometry (from tools/generate-variants.mjs), loaded once
  // so branch variants draw as real routes instead of straight station hops.
  let variantRoutesCache = null, variantRoutesPromise = null;
  function loadVariantRoutes() {
    if (variantRoutesCache) return Promise.resolve(variantRoutesCache);
    if (!variantRoutesPromise) {
      variantRoutesPromise = vfetch("data/variant-routes.json")
        .then((r) => (r.ok ? r.json() : {}))
        .then((j) => { variantRoutesCache = j || {}; return variantRoutesCache; })
        .catch(() => { variantRoutesPromise = null; return {}; }); // allow a later retry
    }
    return variantRoutesPromise;
  }
  // Build the dropdown options for a line with multiple paths: every curated
  // variant, each in both directions. `wp` is the station waypoints (markers +
  // distance/stop figures); `route` is the pre-routed pavement geometry (geomArr
  // aligned to LINE_VARIANTS[id]), drawn when present so the variant follows real
  // streets rather than straight hops.
  function buildVariantOptions(net, id, geomArr) {
    const variants = LINE_VARIANTS[id];
    if (!variants) return null;
    const options = [];
    variants.forEach((v, vi) => {
      const wp = assembleVariant(net, id, v);
      if (!wp || wp.length < 2) return;
      const a = wp[0][0], b = wp[wp.length - 1][0], via = v.via ? " · via " + v.via : "";
      const pair = `${a} ↔ ${b}`; // groups both directions (and any via-variants) of the same route
      const route = geomArr && geomArr[vi] && geomArr[vi].length > 1 ? geomArr[vi] : null;
      options.push({ label: `${a} → ${b}${via}`, wp, pair, route });
      options.push({ label: `${b} → ${a}${via}`, wp: [...wp].reverse(), pair, route: route ? [...route].reverse() : null });
    });
    return options.length ? options : null;
  }
  // Lines whose branches are already complete end-to-end patterns (every
  // National Rail line, plus the DLR) don't need hand-curated variants: the
  // caller passes the per-non-main-branch pavement polylines (geo, aligned by
  // the same skip rule the generators use) and this turns each branch into a
  // picker option. The main route leads, drawn from its GPX; one direction each
  // — the ⇄ Reverse button flips.
  function buildBranchOptions(net, id, geo = []) {
    const ln = net[id];
    if (!ln || !ln.route || !(ln.branches || []).length) return null;
    const toWp = (b) => b.map((sid) => { const s = ln.stations[sid]; return s ? [s.n, s.lat, s.lon] : null; }).filter(Boolean);
    const options = [];
    const mainWp = toWp(ln.route);
    if (mainWp.length > 1) options.push({ label: `${mainWp[0][0]} → ${mainWp[mainWp.length - 1][0]} · main route`, wp: mainWp, pair: "", gpx: true });
    const mainKey = ln.route.join("|"), mainRev = [...ln.route].reverse().join("|");
    let gi = 0;
    for (const b of ln.branches) {
      if (b.join("|") === mainKey || b.join("|") === mainRev || b.length < 2) continue;
      const wp = toWp(b);
      if (wp.length < 2) continue;
      const route = geo[gi] && geo[gi].length > 1 ? geo[gi] : null;
      gi++;
      options.push({ label: `${wp[0][0]} → ${wp[wp.length - 1][0]}`, wp, pair: "", route });
    }
    return options.length > 1 ? options : null;
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
  async function mapRouteEntries(net, hiId) {
    const entries = [];
    const vroutes = await loadVariantRoutes(); // per-variant pavement polylines (aligned to LINE_VARIANTS)
    if (hiId && net[hiId]) {
      const base = rtStations(net, net[hiId].name);
      const ends = base && base.length > 1 ? ` · ${base[0][0]} → ${base[base.length - 1][0]}` : "";
      entries.push({ id: hiId, gpx: true, wp: base, group: "This month's run", label: net[hiId].name + ends });
    }
    for (const id of Object.keys(LINE_VARIANTS)) {
      if (!net[id]) continue;
      const opts = buildVariantOptions(net, id, vroutes[id]);
      if (!opts) continue;
      // Every variant carries its own pre-routed pavement polyline (variant-routes.json,
      // aligned to LINE_VARIANTS[id]) so it follows real streets; the main end-to-end
      // variant falls back to the whole-line GPX if that geometry is ever missing.
      const main = GPX_LINES.has(id) ? rtStations(net, net[id].name) : null;
      const mainA = main && main.length > 1 ? main[0][0] : null;
      const mainB = main && main.length > 1 ? main[main.length - 1][0] : null;
      for (const o of opts) {
        const a = o.wp[0][0], b = o.wp[o.wp.length - 1][0];
        const isMain = mainA && ((a === mainA && b === mainB) || (a === mainB && b === mainA));
        entries.push({ id, wp: o.wp, route: o.route, group: net[id].name, label: o.label, gpx: !!isMain });
      }
    }
    // Every remaining line gets its single end-to-end route too — linear Tube
    // and Overground lines (with their pavement GPX) and the National Rail
    // lines (drawn as station hops) — so the picker covers the whole network.
    const covered = new Set(Object.keys(LINE_VARIANTS));
    if (hiId) covered.add(hiId);
    // Grouping is by consecutive entries, so keep the TfL lines together first
    // and the National Rail block after them.
    const rest = Object.keys(net).filter((id) => !covered.has(id))
      .sort((a, b) => (net[a].nr ? 1 : 0) - (net[b].nr ? 1 : 0) || net[a].name.localeCompare(net[b].name));
    for (const id of rest) {
      const wp = rtStations(net, net[id].name);
      if (!wp || wp.length < 2) continue;
      entries.push({ id, gpx: GPX_LINES.has(id), wp, group: net[id].nr ? "National Rail" : "More lines", label: `${net[id].name} · ${wp[0][0]} → ${wp[wp.length - 1][0]}` });
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
    const name = tr.dataset.line;
    const gpx = gpxDownloadHtml(lineSlug(name), name, "ls-gpx");
    const reverseBtn = gpx ? `<button type="button" class="ls-reverse" aria-pressed="false" title="Reverse the route direction — and download the GPX the other way round">⇄ Reverse</button>` : "";
    // Any line whose stations we know is followable live with GPS, not just the next run.
    const followWp = netData ? rtStations(netData, name) : null;
    const followBtn = followWp && followWp.length >= 2 ? `<button type="button" class="ls-follow" title="Follow this line live with GPS — next stop, progress and pace">▶ Follow live</button>` : "";
    const ctrlRow = gpx || followBtn ? `<div class="ls-gpx-row">${gpx}${reverseBtn}${followBtn}</div>` : "";
    detail.innerHTML = `<td colspan="6"><div class="ls-detail-inner"><p class="ls-ends" aria-live="polite"></p>${ctrlRow}<div class="ls-map"></div><div class="ls-strip strip"></div><div class="ls-elev jr-elev"></div></div></td>`;
    tr.after(detail);
    lineRouteMap(detail.querySelector(".ls-map"), name, tr);
    const fb = detail.querySelector(".ls-follow");
    if (fb) fb.addEventListener("click", () => {
      let colour = null;
      for (const id in netData) { if (netData[id].name === name) { colour = netData[id].colour; break; } }
      startFollowAlong(followWp, colour, name + " line", lineSlug(name));
    });
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
    cells[3].textContent = fmtTime(km * GROUP_PACE);
    cells[4].textContent = fmtTime(km * CYCLE_MIN_PER_KM);
    cells[5].textContent = fmtTime(km * WALK_MIN_PER_KM);
  }
  function restoreRowStats(tr) {
    if (!tr || !tr._origStats) return;
    const cells = tr.querySelectorAll("td");
    [1, 2, 3, 4, 5].forEach((i, k) => { if (cells[i]) cells[i].textContent = tr._origStats[k]; });
    tr._origStats = null;
  }
  // Station to auto-focus when a line detail next opens (set by a pill click),
  // consumed once by lineRouteMap to pick the branch/variant containing it.
  let lineDetailFocus = null;
  async function lineRouteMap(mapDiv, name, tr) {
    if (!mapDiv) return;
    if (typeof L === "undefined") { mapDiv.innerHTML = '<p class="diagram-empty">The map couldn\'t load.</p>'; return; }
    let net;
    try { net = await loadNetwork(); }
    catch (_) { mapDiv.innerHTML = '<p class="diagram-empty">Couldn\'t load the map right now.</p>'; return; }
    const id = Object.keys(net).find((k) => net[k].name === name);
    if (!id) { mapDiv.innerHTML = '<p class="diagram-empty">No route mapped for this line yet.</p>'; return; }
    if (!mapDiv.isConnected) return; // collapsed again before the network finished loading
    // Lines with multiple paths get a dropdown — the default route plus every
    // variant both ways; picking one redraws the map and updates the row's figures.
    const vroutes = await loadVariantRoutes();
    // Curated variants (District, Northern, …) win; otherwise a line with more
    // than one branch gets a generated picker — but only when we actually hold
    // pavement geometry for its branches (NR lines, and the DLR). This keeps
    // straight-hop-only lines (e.g. the Circle) pickerless rather than ugly.
    let options = buildVariantOptions(net, id, vroutes[id]);
    if (!options && (net[id].branches || []).length > 1) {
      const geo = net[id].nr ? (await loadNrBranches())[id] : (await loadTubeBranches())[id];
      if (geo || net[id].nr) options = buildBranchOptions(net, id, geo || []);
    }
    // A pill click may have asked to focus a specific station — start on the
    // first option (branch/variant) whose stops include it, not the main route.
    let initIdx = 0;
    if (lineDetailFocus && options) {
      const fk = norm(lineDetailFocus);
      const fi = options.findIndex((o) => o.wp && o.wp.some((p) => norm(p[0]) === fk));
      if (fi >= 0) initIdx = fi;
    }
    lineDetailFocus = null;
    const detailInner = mapDiv.parentNode;
    const reverseBtn = detailInner.querySelector(".ls-reverse");
    const gpxLink = detailInner.querySelector(".ls-gpx");
    const endsEl = detailInner.querySelector(".ls-ends");
    let reversed = false, curIdx = 0, gpxText = null, revUrl = null, drawSeq = 0;
    if (options) {
      const sel = document.createElement("select");
      sel.className = "ls-variant";
      sel.setAttribute("aria-label", "Choose a route and direction for the " + name + " line");
      sel.innerHTML = groupedOptionsHtml(options, (o) => o.pair, initIdx);
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
      // The TCX link converts on click, so it only needs to know the direction.
      const tcxLink = gpxLink.parentElement && gpxLink.parentElement.querySelector(".tcx-dl");
      if (tcxLink) tcxLink.dataset.rev = reversed ? "1" : "";
      if (!reversed) {
        if (revUrl) { URL.revokeObjectURL(revUrl); revUrl = null; }
        gpxLink.href = `routes/${slug}.gpx`;
        gpxLink.setAttribute("download", `TubeRun-${slug}.gpx`);
        return;
      }
      if (gpxText === null) { try { gpxText = await (await vfetch(`routes/${slug}.gpx`)).text(); } catch (_) { gpxText = ""; } }
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
      // Name the route's endpoints (source → destination) — matches the drawn variant + direction.
      const seq = opt && opt.wp ? opt.wp : rtStations(net, name);
      if (endsEl && seq && seq.length > 1) {
        const from = seq[0][0], to = seq[seq.length - 1][0];
        endsEl.innerHTML = `<span class="ls-end">${escapeHtml(reversed ? to : from)}</span><span class="ls-arrow" aria-hidden="true">→</span><span class="sr-only">to</span><span class="ls-end">${escapeHtml(reversed ? from : to)}</span>`;
      }
      const dOpts = opt && !opt.gpx ? { waypoints: opt.wp } : {};
      if (opt && opt.route) dOpts.routeLine = opt.route; // pre-routed pavement line for this variant
      if (reversed) dOpts.reverse = true;
      const r = await drawRunRoute(map, net, id, dOpts);
      if (my !== drawSeq || lsMap !== map) return; // a newer draw (variant change / reverse) superseded this one
      routeGrp = r && r.group;
      if (r && r.latlngs.length) map.fitBounds(L.latLngBounds(r.latlngs), { padding: [18, 18] });
      // When the drawn line is real pavement (GPX or a routed branch polyline,
      // not station hops), project each station onto it so the strip's leg
      // distances and total are true along-path km rather than estimates.
      const stripWp = seq && seq.length > 1 ? (reversed ? seq.slice().reverse() : seq) : null;
      let legKms, totalKm;
      if (r && r.latlngs && stripWp && r.latlngs.length > stripWp.length + 2) {
        const path = r.latlngs, cum = pathCumKm(path);
        const along = [];
        let okProj = true;
        for (const p of stripWp) {
          const pr = projectOnPath(p[1], p[2], path, cum);
          if (pr.off > 0.4 || (along.length && pr.alongKm < along[along.length - 1] - 0.05)) { okProj = false; break; }
          along.push(pr.alongKm);
        }
        if (okProj) {
          legKms = along.map((v, i) => (i ? Math.max(0, v - along[i - 1]) : 0));
          totalKm = cum[cum.length - 1];
        }
      }
      if (opt && opt.wp) setRowStats(tr, totalKm !== undefined ? totalKm : waypointsKm(opt.wp) * ROAD_FACTOR, opt.wp.length); // reflect the route in the row
      // Sign-style station strip under the map, running in the drawn direction.
      // Tapping a station centres and names it on the mini-map above.
      const stripEl = detailInner.querySelector(".ls-strip");
      if (stripEl && stripWp) {
        stripEl.style.setProperty("--line-col", net[id].colour);
        stripEl.innerHTML = stripMapHtml(null, net[id].colour, name, { wp: stripWp, tap: true, legKms, totalKm });
        stripEl.querySelectorAll(".stn").forEach((sEl, si) => sEl.addEventListener("click", () => {
          const p = stripWp[si];
          if (lsMap !== map) return; // panel re-rendered since
          map.setView([p[1], p[2]], Math.max(map.getZoom(), 15), { animate: true });
          L.popup({ offset: [0, -2], autoPan: false }).setLatLng([p[1], p[2]])
            .setContent(`<b>${escapeHtml(p[0])}</b>` + interchangeTags(p[0], name)).openOn(map);
        }));
      }
      const elBox = detailInner.querySelector(".ls-elev");
      if (elBox && r && r.latlngs) {
        elBox.innerHTML = `<p class="ls-elev-load">Reading elevation…</p>`;
        const elev = await routeElevation(r.latlngs);
        if (my === drawSeq && lsMap === map && elBox.isConnected) elBox.innerHTML = elev ? elevationHtml(elev) : "";
      }
    }
    if (reverseBtn) reverseBtn.addEventListener("click", () => { setReversed(!reversed); drawVariant(curIdx); syncGpxDir(); });
    await drawVariant(initIdx);
    setTimeout(() => { if (lsMap === map) map.invalidateSize(); }, 60);
  }

  // --- Render: Line collector (two directions per line, saved per-visitor) --
  const LC_KEY = "tuberun_collector";
  function loadCollector() { return loadSet(LC_KEY); }
  function saveCollector(set) { saveSet(LC_KEY, set); }

  // When a line direction or route is ticked off, remember the date — it feeds
  // the "days active" stats. Older ticks pre-date this and simply have no date.
  const RUN_DATES_KEY = "tuberun_run_dates";
  let runDates = (() => { try { const m = JSON.parse(localStorage.getItem(RUN_DATES_KEY)); return m && typeof m === "object" && !Array.isArray(m) ? m : {}; } catch (_) { return {}; } })();
  function stampRun(key, on) {
    if (on) runDates[key] = new Date().toISOString().slice(0, 10);
    else delete runDates[key];
    try { localStorage.setItem(RUN_DATES_KEY, JSON.stringify(runDates)); } catch (_) { /* private mode */ }
  }
  let collectorDone = loadCollector();
  // Line length (km) for collector distance totals. Not static: computeNrStats
  // adds the NR/DLR lines at runtime once the network data loads.
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
    { icon: "🏃", name: "Halfway There", desc: "Half the network's directions", test: (c) => c.count >= c.total / 2 },
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
    { icon: "👑", name: "Tube Run Royalty", desc: "Every line, both ways", test: (c) => c.linesBoth >= c.total / 2 },
  ];

  function renderLineCollector() {
    const el = document.getElementById("lineCollector");
    if (!el) return;
    const total = COLLECT_LINES.length * 2;
    let n = 0, collectedKm = 0, linesAny = 0, linesBoth = 0;

    const nextUp = []; // suggester candidates: lines still missing a direction
    const rows = COLLECT_LINES.map((name) => {
      const c = LINE_COLOURS[name] || "#0019A8";
      const dirs = LINE_DIRS[name] || ["→ one way", "→ the other"];
      const lineKm = LINE_KM[name] || 0;
      let doneHere = 0, undoneLabel = "";
      const chips = dirs.map((label, i) => {
        const keyId = `${name}|${i}`;
        const isDone = collectorDone.has(keyId);
        if (isDone) { n++; doneHere++; collectedKm += lineKm; } else if (!undoneLabel) undoneLabel = label;
        const style = isDone
          ? `background:${c};color:${contrastText(c)};border-color:${c}`
          : `color:#2b3140;border-color:${lineTextColour(c)}`;
        return `<button type="button" class="lc-dir${isDone ? " done" : ""}" data-key="${escapeHtml(keyId)}" aria-pressed="${isDone}" style="${style}">${isDone ? "✓ " : ""}${escapeHtml(label)}</button>`;
      }).join("");
      if (doneHere >= 1) linesAny++;
      if (doneHere >= 2) linesBoth++;
      if (doneHere < 2) nextUp.push({ name, km: lineKm, doneHere, undoneLabel, colour: c });
      return `<div class="lc-row">
        <span class="lc-name" style="border-color:${c}"><i style="background:${c}"></i>${escapeHtml(name)}<span class="lc-km">${fmtKm(lineKm, 1)} each way</span></span>
        <span class="lc-dirs">${chips}</span>
      </div>`;
    }).join("");

    // "What next?" — nudge toward untouched lines first, longest new ground first.
    nextUp.sort((a, b) => a.doneHere - b.doneHere || b.km - a.km);
    const next = nextUp[0];
    const nextHtml = next && n > 0 ? `<p class="lc-next">🎯 Next tick: <b style="color:${lineTextColour(next.colour)}">${escapeHtml(next.name)}</b> ${escapeHtml(next.undoneLabel)} — ${next.doneHere ? "run it the other way to collect the pair" : `${fmtKm(next.km, 1)} of new ground`}</p>` : "";

    // Stats from the run-date log (dates only accrue as you tick things off).
    const routeKmDone = ROUTES.reduce((s, r) => s + (routeRun.has(r.name) ? routeKm(r) : 0), 0);
    const dates = Object.values(runDates);
    const daysActive = new Set(dates).size;
    const lastRun = dates.length ? dates.slice().sort().pop() : null;
    const statsHtml = `<div class="lc-stats">
      <span class="lc-stat"><b>${fmtKm(collectedKm + routeKmDone, 1)}</b> lines + routes collected</span>
      ${daysActive ? `<span class="lc-stat"><b>${daysActive}</b> day${daysActive === 1 ? "" : "s"} active</span>` : ""}
      ${lastRun ? `<span class="lc-stat"><b>${escapeHtml(lastRun)}</b> last tick</span>` : ""}
    </div>`;

    const ctx = {
      count: n, km: collectedKm, linesAny, linesBoth, total,
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
      <p class="lc-hint"><strong>Tap a direction to tick off a line you've run</strong> — each counts twice, one each way. Your tally is saved in this browser. ${COLLECT_LINES.length} lines, ${total} runs to collect them all.</p>
      <div class="lc-dist"><span class="lc-dist-big">${fmtKm(collectedKm, 1)}</span> collected so far <small>across ${n} direction${n === 1 ? "" : "s"}</small></div>
      ${statsHtml}
      ${nextHtml}
      <div class="lc-rows">${rows}</div>
      ${badgesHeadHtml("Badges", `${gotBadges} / ${BADGES.length} earned`)}
      <p class="lc-hint">Collect lines to unlock badges — from your first direction to the whole network, both ways.</p>
      <div class="lc-badges">${badgeCardsHtml(BADGES, ctx)}</div>`;

    el.querySelectorAll(".lc-dir").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.key;
      const adding = !collectorDone.has(k);
      if (adding) collectorDone.add(k); else collectorDone.delete(k);
      stampRun(k, adding);
      saveCollector(collectorDone);
      renderLineCollector();
    }));
    const reset = document.getElementById("lcReset");
    if (reset) reset.addEventListener("click", () => {
      collectorDone = new Set();
      saveCollector(collectorDone);
      for (const k in runDates) if (k.includes("|")) stampRun(k, false); // route dates survive a line reset
      renderLineCollector();
    });
    renderBoroughBagger();
  }

  // --- Borough bagger: which of the 33 boroughs your runs have touched -----
  // Derived entirely from the line collector + marked routes (no storage of
  // its own) against build-time tagging in data/boroughs.json.
  let boroughsPromise = null;
  function loadBoroughs() {
    if (!boroughsPromise) {
      boroughsPromise = vfetch("data/boroughs.json").then((r) => (r.ok ? r.json() : null))
        .catch(() => { boroughsPromise = null; return null; }); // reset so a transient failure can retry
    }
    return boroughsPromise;
  }
  async function renderBoroughBagger() {
    const el = document.getElementById("boroughBagger");
    if (!el) return;
    const data = await loadBoroughs();
    if (!data || !data.names) { el.hidden = true; return; }
    const covered = new Set();
    COLLECT_LINES.forEach((name) => {
      if (collectorDone.has(`${name}|0`) || collectorDone.has(`${name}|1`)) (data.lines[lineSlug(name)] || []).forEach((b) => covered.add(b));
    });
    ROUTES.forEach((r) => { if (routeRun.has(r.name)) (data.routes[r.id] || []).forEach((b) => covered.add(b)); });
    const chips = data.names.map((nm, i) => `<span class="bb-chip${covered.has(i) ? " got" : ""}">${covered.has(i) ? "✓ " : ""}${escapeHtml(nm)}</span>`).join("");
    el.hidden = false;
    el.innerHTML = `
      ${badgesHeadHtml("Borough bagger", `${covered.size} / ${data.names.length} boroughs`)}
      <p class="lc-hint">Every borough your ticked-off lines and marked routes pass through. Bag all ${data.names.length} — from Barking and Dagenham to Westminster.</p>
      <div class="bb-grid">${chips}</div>`;
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
      const res = await vfetch("data/gallery.json", { cache: "no-cache" });
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
  let waterPts = null;        // [[lat,lon],...] drinking-water points (OSM)
  let geoTimeMode = "run";    // run | walk | names | off — stop-label mode on the highlighted line
  let geoShowToilets = true;  // toilet pins on the geographic map
  let geoShowWater = false;   // drinking-water pins on the geographic map
  let tmYear = 9999;          // time-machine year on the geo map — 9999 = today

  // Year each line's corridor first carried passengers. For the Overground and
  // National Rail these are the Victorian railways the modern names run over
  // (the Mildmay is the 1850 North London Railway, Southeastern descends from
  // London's first railway of 1836) — approximate corridor heritage, not brands.
  const HERITAGE_YEAR = {
    metropolitan: 1863, "hammersmith-city": 1864, district: 1868, circle: 1884,
    northern: 1890, "waterloo-city": 1898, central: 1900, bakerloo: 1906,
    piccadilly: 1906, victoria: 1968, jubilee: 1979, elizabeth: 2022, dlr: 1987,
    lioness: 1912, mildmay: 1850, windrush: 1869, weaver: 1872, suffragette: 1894, liberty: 1893,
    southeastern: 1836, "south-western-railway": 1838, "great-western-railway": 1838,
    "greater-anglia": 1839, southern: 1841, "great-northern": 1850, c2c: 1854,
    thameslink: 1866, "chiltern-railways": 1899, "heathrow-express": 1998,
  };
  const lineYear = (id) => HERITAGE_YEAR[id] || 0; // unlisted lines always exist

  // Station-level opening years where they differ from the line's first year —
  // extensions came decades later (Battersea 2021, Morden 1926, Heathrow 1977)
  // and some corridors pre-date their tube service (the Epping branch was a
  // steam railway from 1856). Unlisted stations inherit the line year, so the
  // remaining error is Victorian-era infill detail, never a modern segment
  // shown early. Names must match the network data's station names.
  const HERITAGE_STATIONS = {
    northern: {
      1907: ["Leicester Square", "Goodge Street", "Warren Street", "Mornington Crescent", "Camden Town", "Chalk Farm", "Belsize Park", "Hampstead", "Golders Green", "Tufnell Park", "Archway"],
      1923: ["Brent Cross", "Hendon Central"],
      1924: ["Colindale", "Burnt Oak", "Edgware"],
      1926: ["Clapham South", "Tooting Bec", "Tooting Broadway", "Colliers Wood", "South Wimbledon", "Morden"],
      // High Barnet / Mill Hill branch: a GNR steam railway from 1867-72, tube from 1939-41
      1867: ["East Finchley", "Finchley Central", "Mill Hill East", "Highgate"],
      1872: ["Woodside Park", "Totteridge & Whetstone", "High Barnet"],
      1933: ["West Finchley"],
      2021: ["Nine Elms", "Battersea Power Station"],
    },
    piccadilly: {
      1932: ["Manor House", "Turnpike Lane", "Wood Green", "Bounds Green", "Arnos Grove"],
      1933: ["Southgate", "Oakwood", "Cockfosters"],
      1975: ["Hatton Cross"],
      1977: ["Heathrow Terminals 2 & 3"],
      1986: ["Heathrow Terminal 4"],
      2008: ["Heathrow Terminal 5"],
    },
    central: {
      1856: ["Leyton", "Leytonstone", "Snaresbrook", "South Woodford", "Woodford", "Buckhurst Hill", "Loughton"],
      1865: ["Debden", "Theydon Bois", "Epping"],
      1903: ["Newbury Park", "Barkingside", "Fairlop", "Hainault", "Grange Hill", "Chigwell"],
      1908: ["White City"],
      1920: ["East Acton"],
      1923: ["North Acton", "West Acton"],
      1936: ["Roding Valley"],
      1946: ["Bethnal Green"],
      1947: ["Hanger Lane", "Perivale", "Greenford", "Wanstead", "Redbridge", "Gants Hill"],
      1948: ["Northolt", "Ruislip Gardens", "South Ruislip", "West Ruislip"],
    },
    bakerloo: { 1915: ["Kilburn Park", "Maida Vale", "Warwick Avenue"] },
    jubilee: {
      1932: ["Stanmore", "Canons Park", "Kingsbury"],
      1934: ["Queensbury"],
      1939: ["St John's Wood", "Swiss Cottage"],
      1999: ["Southwark", "Bermondsey", "Canary Wharf", "North Greenwich", "Canning Town"],
    },
    victoria: { 1971: ["Brixton"], 1972: ["Pimlico"] },
    metropolitan: {
      1879: ["Finchley Road"], 1880: ["Harrow-on-the-Hill"], 1885: ["Pinner"],
      1887: ["Northwood", "Rickmansworth"], 1889: ["Chorleywood", "Chalfont & Latimer", "Chesham"],
      1892: ["Amersham"], 1894: ["Wembley Park"], 1904: ["Uxbridge", "Ruislip"], 1905: ["Ickenham"],
      1906: ["Rayners Lane", "Eastcote"], 1908: ["Preston Road"], 1910: ["Moor Park"], 1912: ["Ruislip Manor"],
      1915: ["North Harrow"], 1923: ["Northwick Park", "Hillingdon"], 1925: ["Croxley", "Watford"], 1933: ["Northwood Hills"],
    },
    district: { 1932: ["Upney", "Becontree", "Dagenham Heathway"], 1935: ["Elm Park"] },
    windrush: { 1999: ["Canada Water"], 2010: ["Shoreditch High Street", "Hoxton", "Haggerston", "Dalston Junction"] },
    "great-northern": { 1904: ["Drayton Park", "Essex Road", "Old Street", "Moorgate", "Highbury & Islington"] }, // the Northern City line
    weaver: { 1870: ["St James Street"], 1873: ["Wood Street", "Highams Park", "Chingford"], 1891: ["Southbury", "Turkey Street", "Theobalds Grove"] },
    mildmay: { 1853: ["Acton Central"], 1869: ["Kew Gardens", "Gunnersbury", "Richmond"], 1880: ["South Acton"] },
  };
  // A station's opening year on a given line (falls back to the line year).
  let stnYearNorm = null; // lineId -> { normName: year }, built lazily
  function stationYear(id, name) {
    if (!stnYearNorm) {
      stnYearNorm = {};
      for (const lid in HERITAGE_STATIONS) {
        stnYearNorm[lid] = {};
        for (const y in HERITAGE_STATIONS[lid]) for (const n of HERITAGE_STATIONS[lid][y]) stnYearNorm[lid][norm(n)] = +y;
      }
    }
    const m = stnYearNorm[id];
    return (m && m[norm(name)]) || lineYear(id);
  }
  // Latest opening year anywhere on a line — past it, the full modern geometry is honest.
  function lineMaxYear(id) {
    const segs = HERITAGE_STATIONS[id];
    const top = segs ? Math.max(...Object.keys(segs).map(Number)) : 0;
    return Math.max(lineYear(id), top);
  }
  // Era geometry for lines partially built at a given year: each branch drawn
  // only through the stations that had opened — later infills skip cleanly,
  // unbuilt extensions truncate. Shared by the geo map and the time machine.
  function eraLayerFor(net, year) {
    const grp = L.layerGroup();
    for (const id in net) {
      if (lineYear(id) > year || lineMaxYear(id) <= year) continue;
      const ln = net[id];
      for (const b of ln.branches || []) {
        const pts = b.map((sid) => ln.stations[sid]).filter((s) => s && stationYear(id, s.n) <= year).map((s) => [s.lat, s.lon]);
        if (pts.length > 1) L.polyline(pts, { color: ln.colour, weight: ln.nr ? 2 : 3, opacity: ln.nr ? 0.6 : 0.9, dashArray: ln.nr ? "6 5" : null, lineJoin: "round", lineCap: "round" }).addTo(grp);
      }
    }
    return grp;
  }
  // Leaflet style for a line feature at a time-machine year, shared by the geo
  // map's inline scrubber and the dedicated Time Machine section: ghost lines
  // that don't exist yet, hide lines mid-construction (the era layer draws
  // their built extent instead), full modern geometry otherwise. opts:
  // ghostOpacity (the two surfaces differ), on (bold the highlighted line),
  // dimmed (fade the rest while one is lit).
  function eraLineStyle(f, year, opts = {}) {
    const id = f.properties.line, nr = f.properties.nr;
    if (lineYear(id) > year) return { color: f.properties.colour, weight: 1, opacity: opts.ghostOpacity || 0.06, dashArray: "2 6", lineJoin: "round", lineCap: "round" };
    if (lineMaxYear(id) > year) return { color: f.properties.colour, weight: 0, opacity: 0 };
    return { color: f.properties.colour, weight: opts.on ? 5 : (nr ? 2 : 3), opacity: opts.on ? 1 : (opts.dimmed ? 0.3 : (nr ? 0.6 : 0.9)), dashArray: nr ? "6 5" : null, lineJoin: "round", lineCap: "round" };
  }
  // [year, story, target?] — the optional target makes the panel entry a
  // clickable zoom: {station}, {line}, {at:[lat,lon,zoom]} or {ext:index}.
  // Abstract milestones (the roundel, Johnston type, the Blitz) carry none.
  const TM_MILESTONES = [
    [1836, "London's first railway opens — London Bridge to Deptford.", { station: "London Bridge" }],
    [1838, "Brunel's Great Western steams out of Paddington.", { station: "Paddington" }],
    [1863, "The Metropolitan Railway opens — the world's first underground.", { station: "Baker Street" }],
    [1868, "The District line begins at Westminster.", { station: "Westminster" }],
    [1869, "Brunel's Thames Tunnel carries its first trains — today's Windrush line.", { station: "Wapping" }],
    [1884, "The Circle is finally completed.", { line: "circle" }],
    [1890, "City & South London Railway — the first deep-level electric Tube.", { station: "Stockwell" }],
    [1900, "The Central London Railway opens — the Twopenny Tube.", { station: "Bank" }],
    [1906, "Bakerloo and Piccadilly tubes open within months of each other.", { station: "Piccadilly Circus" }],
    [1908, "The bar-and-circle roundel first appears on platforms."],
    [1911, "London's first escalator spirals into Earls Court.", { station: "Earl's Court" }],
    [1916, "Edward Johnston's lettering starts spreading across the network."],
    [1926, "The Morden extension completes the Northern line's southern end.", { station: "Morden" }],
    [1933, "Harry Beck's diagram map debuts as London Transport is formed."],
    [1940, "Platforms shelter thousands each night through the Blitz."],
    [1952, "London's last tram runs — for now."],
    [1961, "Steam finally ends on the Metropolitan.", { station: "Amersham" }],
    [1968, "The Victoria line arrives, with automatic trains.", { line: "victoria" }],
    [1977, "Heathrow becomes the world's first airport on a metro.", { station: "Heathrow Terminals 2 & 3" }],
    [1979, "The Jubilee line opens, silver for the Silver Jubilee.", { line: "jubilee" }],
    [1988, "Thameslink reopens the Snow Hill tunnel through the City.", { station: "Farringdon" }],
    [1994, "Aldwych closes, and the Epping–Ongar shuttle makes its last run.", { station: "Epping" }],
    [1998, "Heathrow Express speeds airport runs from Paddington.", { station: "Heathrow Terminals 2 & 3" }],
    [2000, "Trams return, in Croydon.", { at: [51.3762, -0.0982, 13] }],
    [2003, "The Oyster card arrives."],
    [2007, "TfL takes over the North London lines — the Overground is born.", { line: "mildmay" }],
    [2016, "The Night Tube begins."],
    [2022, "The Elizabeth line opens at last.", { line: "elizabeth" }],
    [2024, "The Overground's six lines get their own names."],
    [2035, "Proposed: the Bakerloo line extension reaches Lewisham, via two new stations on the Old Kent Road.", { ext: 0 }],
  ];
  // Proposed / under-construction expansion, so the Time Machine can run past
  // today. Coordinates are indicative — TfL's own consultation stresses the
  // Old Kent Road alignments and station sites aren't fixed. The stations the
  // line would also call at already exist (New Cross Gate, Lewisham) and keep
  // their real coords; the two brand-new Old Kent Road stations sit at their
  // consultation locations. `from` is the existing station it grows out of.
  const FUTURE_EXTENSIONS = [
    {
      line: "bakerloo", name: "Bakerloo line extension", year: 2035, status: "proposed",
      note: "Elephant & Castle to Lewisham beneath the Old Kent Road, with two new stations. A later phase would take over the National Rail line on to Hayes.",
      from: "Elephant & Castle",
      stations: [
        ["Old Kent Road 1", 51.4874, -0.0731],
        ["Old Kent Road 2", 51.4806, -0.0627],
        ["New Cross Gate", 51.47513, -0.0404],
        ["Lewisham", 51.46467, -0.01287],
      ],
    },
  ];
  // Draw every proposed extension whose indicative year has arrived: dotted in
  // its line's colour, growing out of the `from` station, with hollow
  // "proposed" station rings. The forward-looking counterpart of eraLayerFor.
  function futureLayerFor(net, year) {
    const grp = L.layerGroup();
    for (const ext of FUTURE_EXTENSIONS) {
      if (year < ext.year) continue;
      const ln = net[ext.line];
      const colour = (ln && ln.colour) || "#0019A8";
      let anchor = null;
      if (ln) for (const sid in ln.stations) { if (norm(ln.stations[sid].n) === norm(ext.from)) { anchor = ln.stations[sid]; break; } }
      const pts = anchor ? [[anchor.lat, anchor.lon]] : [];
      for (const s of ext.stations) pts.push([s[1], s[2]]);
      if (pts.length > 1) L.polyline(pts, { color: colour, weight: 4, opacity: 0.85, dashArray: "2 7", lineCap: "round", lineJoin: "round" }).addTo(grp);
      for (const s of ext.stations) {
        L.circleMarker([s[1], s[2]], { radius: 3.6, weight: 2, color: colour, fillColor: "#fff", fillOpacity: 1, dashArray: "2 2" })
          .bindTooltip(`${escapeHtml(s[0])} · proposed ${ext.year}`, { direction: "top" }).addTo(grp);
      }
    }
    return grp;
  }
  // --- Time Machine: click a panel entry to fly the map to its subject --------
  // Coordinates of the first station matching a name, anywhere in the network.
  function stationCoordByName(net, name) {
    const k = norm(name);
    for (const id in net) for (const sid in net[id].stations) { const s = net[id].stations[sid]; if (norm(s.n) === k) return s; }
    return null;
  }
  // Bounds of a line's stations that had opened by `year` (all of them for a
  // future year), so clicking a line entry frames exactly what's drawn.
  function lineEraBounds(net, id, year) {
    const ln = net[id];
    if (!ln) return null;
    const b = L.latLngBounds([]);
    for (const sid in ln.stations) { const s = ln.stations[sid]; if (stationYear(id, s.n) <= year) b.extend([s.lat, s.lon]); }
    return b.isValid() ? b : null;
  }
  // Bounds of a proposed extension: its stations plus the station it grows from.
  function extBounds(net, ext) {
    if (!ext) return null;
    const b = L.latLngBounds([]);
    const ln = net[ext.line];
    if (ln) for (const sid in ln.stations) { if (norm(ln.stations[sid].n) === norm(ext.from)) { b.extend([ln.stations[sid].lat, ln.stations[sid].lon]); break; } }
    for (const s of ext.stations) b.extend([s[1], s[2]]);
    return b.isValid() ? b : null;
  }
  // Turn a milestone/line target into the attributes that make a panel entry a
  // clickable zoom control (empty string when there's nothing to point at).
  function tmzAttr(t) {
    if (!t) return "";
    const d = t.station ? `data-tmz-station="${escapeHtml(t.station)}"`
      : t.line ? `data-tmz-line="${escapeHtml(t.line)}"`
      : t.ext != null ? `data-tmz-ext="${t.ext}"`
      : t.at ? `data-tmz-at="${t.at.join(",")}"` : "";
    return d ? ` ${d} role="button" tabindex="0" title="Zoom the map to this"` : "";
  }
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
  // Data fetches carry the deploy version (from our own script tag's ?v=N),
  // so the service worker's stale-while-revalidate can never pair new code
  // with a previous deploy's data — the URL changes with every release.
  const ASSET_V = (() => {
    const s = document.querySelector('script[src*="script.js"]');
    const m = s && /[?&]v=(\d+)/.exec(s.src);
    return m ? m[1] : "0";
  })();
  const vfetch = (url, opts) => fetch(url + (url.includes("?") ? "&" : "?") + "v=" + ASSET_V, opts);

  // Network coverage mode: "tube" (default) keeps the site to the TfL network;
  // "all" adds the National Rail lines and out-of-London routes. The header
  // toggle persists the choice and reloads, so every surface follows the mode.
  const NET_MODE = (() => { try { return localStorage.getItem("tuberun_netmode") === "all" ? "all" : "tube"; } catch (_) { return "tube"; } })();
  function setupNetToggle() {
    const btns = document.querySelectorAll(".net-toggle [data-n]");
    btns.forEach((b) => {
      const on = b.dataset.n === NET_MODE;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
      b.addEventListener("click", () => {
        if (b.dataset.n === NET_MODE) return;
        try { localStorage.setItem("tuberun_netmode", b.dataset.n); } catch (_) { /* private mode */ }
        location.reload();
      });
    });
  }

  // Header search: stations, lines and curated routes in one box. Picking a
  // line expands its Lines row, a route selects its card, a station centres
  // the geographic map on it. The index respects the Tube / All lines mode.
  function setupSiteSearch() {
    // The fixed header no longer occupies flow space — pad the page to match
    // its real (possibly wrapped) height, and keep anchor scrolling clear of it.
    const hdr = document.querySelector(".site-header");
    const padForHeader = () => {
      if (!hdr) return;
      const h = hdr.offsetHeight;
      document.body.style.paddingTop = h + "px";
      document.documentElement.style.scrollPaddingTop = (h + 12) + "px";
      document.documentElement.style.setProperty("--hdr-h", h + "px");
    };
    padForHeader();
    window.addEventListener("resize", padForHeader);

    const input = document.getElementById("siteSearch"), dl = document.getElementById("siteSearchList");
    if (!input || !dl) return;
    // The index always covers the FULL network — searching for Liphook while
    // in Tube mode finds it, switches to All lines, and resumes the search.
    const buildIndex = async () => {
      const net = await loadNetwork().catch(() => null);
      if (!net || searchIndex) return;
      const extra = NET_MODE === "all" ? {} : await vfetch("data/nr-network.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      const opts = [], seen = new Set();
      const add = (src) => {
        for (const id in src) {
          opts.push(`${src[id].name} (line)`);
          for (const sid in src[id].stations) {
            const n = src[id].stations[sid].n, k = norm(n);
            if (!seen.has(k)) { seen.add(k); opts.push(`${n} (station)`); }
          }
        }
      };
      add(net); add(extra);
      ROUTES.forEach((r) => opts.push(`${r.name} (route)`));
      opts.sort((a, b) => a.localeCompare(b));
      searchIndex = [...new Set(opts)];
    };
    // Only ever render a dozen suggestions — a 400-option datalist makes
    // Chrome re-anchor the page on every keystroke (the creeping-scroll bug).
    let searchIndex = null;
    const suggest = () => {
      if (!searchIndex) return;
      const q = input.value.trim().toLowerCase();
      const hits = q.length < 2 ? [] : searchIndex.filter((o) => o.toLowerCase().includes(q)).slice(0, 12);
      dl.innerHTML = hits.map((o) => `<option value="${escapeHtml(o)}"></option>`).join("");
    };
    input.addEventListener("focus", () => buildIndex().then(suggest), { once: true });
    input.addEventListener("input", suggest);
    // Chrome scrolls the page toward a sticky input's document position on
    // focus and after every keystroke (asynchronously, so a post-input restore
    // loses the race). Capture the position before each key, and revert any
    // scroll that lands within a beat of it while the search has focus.
    let lockY = null, lastKey = 0;
    const arm = () => { lockY = scrollY; lastKey = performance.now(); };
    input.addEventListener("pointerdown", arm);
    input.addEventListener("keydown", arm);
    input.addEventListener("focus", () => { lastKey = performance.now(); if (lockY == null) lockY = scrollY; });
    window.addEventListener("scroll", () => {
      if (document.activeElement !== input || lockY == null) return;
      if (performance.now() - lastKey < 250 && Math.abs(scrollY - lockY) > 1 && Math.abs(scrollY - lockY) < 400) {
        window.scrollTo({ top: lockY, behavior: "instant" });
      }
    }, { passive: true });
    input.addEventListener("blur", () => { lockY = null; });
    const go = async (forced) => {
      const m = /^(.+) \((line|station|route)\)$/.exec((forced || input.value).trim());
      if (!m) return;
      const [, name, kind] = m;
      input.value = "";
      input.blur();
      // Not in the current (Tube-mode) network but real? Switch to All lines
      // and finish the search after the reload.
      if (NET_MODE !== "all") {
        const net = await loadNetwork().catch(() => null);
        const inNet = net && (kind === "route"
          ? ROUTES.some((r) => r.name === name && !r.far)
          : Object.keys(net).some((id) => (kind === "line" ? net[id].name === name : Object.values(net[id].stations).some((s) => norm(s.n) === norm(name)))));
        if (!inNet) {
          try {
            sessionStorage.setItem("tuberun_pending_search", `${name} (${kind})`);
            localStorage.setItem("tuberun_netmode", "all");
          } catch (_) { /* private mode */ }
          location.reload();
          return;
        }
      }
      if (kind === "route") {
        const card = [...document.querySelectorAll("#routeList .route-card")].find((c) => c.querySelector("h3").textContent === name);
        if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.click(); }
        return;
      }
      if (kind === "line") {
        document.getElementById("stats").scrollIntoView({ behavior: "smooth" });
        const btn = [...document.querySelectorAll(".ls-row-btn")].find((b) => (b.closest("tr") || {}).dataset && b.closest("tr").dataset.line === name);
        if (btn && btn.getAttribute("aria-expanded") !== "true") btn.click();
        return;
      }
      const net = await loadNetwork().catch(() => null);
      let st = null;
      let stId = null;
      if (net) outer: for (const id in net) for (const sid in net[id].stations) {
        if (norm(net[id].stations[sid].n) === norm(name)) { st = net[id].stations[sid]; stId = sid; break outer; }
      }
      document.getElementById("network").scrollIntoView({ behavior: "smooth" });
      if (!st) return;
      // The geo map is created lazily when the section scrolls into view —
      // which the line above just triggered. Wait for it before centring.
      for (let i = 0; i < 30 && !tmMap.map; i++) await new Promise((r) => setTimeout(r, 100));
      if (!tmMap.map) return;
      tmMap.map.setView([st.lat, st.lon], Math.max(tmMap.map.getZoom(), 14), { animate: true });
      L.popup({ autoPan: false }).setLatLng([st.lat, st.lon])
        .setContent(`<b>${escapeHtml(st.n)}</b>` + interchangeTags(st.n, "search") + `<div class="iso-row"><button type="button" class="iso-go" data-sid="${escapeHtml(stId)}">How far from here?</button></div>`).openOn(tmMap.map);
    };
    input.addEventListener("change", () => go());
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    // A search that switched modes resumes here, once the network is in.
    let pending = null;
    try { pending = sessionStorage.getItem("tuberun_pending_search"); sessionStorage.removeItem("tuberun_pending_search"); } catch (_) { /* private mode */ }
    if (pending) loadNetwork().catch(() => null).then(() => setTimeout(() => go(pending), 900));
  }

  // Every horizontal strip map can be grabbed with the mouse and dragged to
  // scroll. A 5px threshold keeps plain clicks working (station picks,
  // interchange pills); once a real drag happened the click it generates is
  // swallowed. Interchange pills double as links to that line's row in the
  // Line by line table. Touch scrolling is native and stays untouched.
  function setupStripInteractions() {
    const SCROLLERS = ".line-diagram, .ls-strip, .route-strip";
    let el = null, startX = 0, startLeft = 0, dragged = false, justDragged = false;
    document.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      el = e.target.closest(SCROLLERS);
      if (!el || el.scrollWidth <= el.clientWidth) { el = null; return; }
      startX = e.clientX; startLeft = el.scrollLeft; dragged = false;
    });
    document.addEventListener("pointermove", (e) => {
      if (!el) return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) < 5) return;
      if (!dragged) {
        // A text selection may have started in the pre-threshold pixels and
        // would grow across the page as the drag continues — clear it and
        // switch off selection everywhere until the pointer is released.
        const sel = getSelection();
        if (sel) sel.removeAllRanges();
        document.body.classList.add("strip-drag");
      }
      dragged = true;
      el.classList.add("strip-dragging");
      el.scrollLeft = startLeft - dx;
    });
    const end = () => {
      if (!el) return;
      el.classList.remove("strip-dragging");
      document.body.classList.remove("strip-drag");
      el = null;
      if (dragged) { justDragged = true; setTimeout(() => { justDragged = false; }, 80); }
    };
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("selectstart", (e) => { if (el && dragged) e.preventDefault(); });
    document.addEventListener("click", (e) => {
      if (justDragged) { e.stopPropagation(); e.preventDefault(); return; }
      const tag = e.target.closest(".stn-tag");
      if (!tag) return;
      const btn = [...document.querySelectorAll(".ls-row-btn")].find((b) => {
        const tr = b.closest("tr");
        return tr && tr.dataset.line === tag.textContent;
      });
      if (!btn) return; // pill names something without a Lines row (e.g. Tramlink)
      e.preventDefault();
      e.stopPropagation();
      // The pill sits on a station (a strip stop, or a map popup) that may be on
      // a branch rather than the line's main route — carry that station through
      // so the opened line detail selects the branch containing it (e.g. clicking
      // "South Western Railway" on Liphook opens the Portsmouth Direct branch).
      const stnEl = tag.closest(".stn"), popupEl = tag.closest(".leaflet-popup-content");
      lineDetailFocus = stnEl ? (stnEl.querySelector(".stn-name") || {}).textContent
        : popupEl ? (popupEl.querySelector("b") || {}).textContent : null;
      const wasOpen = btn.getAttribute("aria-expanded") === "true";
      if (wasOpen && lineDetailFocus) btn.click(); // collapse so the reopen rebuilds with the focused branch
      if (btn.getAttribute("aria-expanded") !== "true") btn.click();
      // Expanding is an accordion: the source row's tall detail collapses
      // (shifting the target when it sat above) and the new detail's map,
      // strip and elevation fill in asynchronously — one smooth scroll lands
      // wrong or gets cancelled by the layout shifts. Instead, re-pin the
      // line's row just below the header until the layout settles, backing
      // off the moment the user scrolls themselves.
      const tr = btn.closest("tr");
      let stop = false, tries = 0;
      const cancel = () => { stop = true; };
      ["wheel", "touchstart", "keydown", "pointerdown"].forEach((t) => addEventListener(t, cancel, { once: true, passive: true }));
      const pin = () => {
        if (stop) return;
        const hdr = document.querySelector(".site-header");
        const dy = tr.getBoundingClientRect().top - ((hdr ? hdr.offsetHeight : 64) + 12);
        if (Math.abs(dy) > 2) scrollBy({ top: dy, behavior: "instant" });
        if (++tries < 9) setTimeout(pin, 150);
      };
      pin();
    }, true);
  }

  let netPromise = null; // memoise the in-flight fetch so parallel callers share one request
  function loadNetwork() {
    if (!netPromise) {
      netPromise = (async () => {
        const [nRes, rRes, tRes, wRes] = await Promise.all([vfetch("data/tube-network.json"), NET_MODE === "all" ? vfetch("data/nr-network.json") : Promise.resolve({ ok: false }), vfetch("data/station-toilets.json"), vfetch("data/facilities-water.json")]);
        if (!nRes.ok) throw new Error("network data");
        netData = await nRes.json();
        // National Rail commuter lines join the same network model (marked
        // `nr` so map bounds/styling can treat them as the outer layer);
        // the site still works without the file.
        if (rRes.ok) {
          const nr = await rRes.json();
          for (const id in nr) { nr[id].nr = true; netData[id] = nr[id]; }
        }
        // Zero-trust: line colours end up in inline styles and SVG attributes,
        // and lineTextColour assumes 6-digit hex, so only that form passes.
        for (const id in netData) {
          if (!/^#[0-9a-fA-F]{6}$/.test(netData[id].colour)) netData[id].colour = "#0019a8";
        }
        toiletSet = new Set(tRes.ok ? await tRes.json() : []);
        waterPts = wRes.ok ? await wRes.json() : [];
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
    // The "drag to pan · scroll to zoom · +/−" hint only applies to the schematic
    // image/SVG maps that use holder pan-zoom. The table (data) has nothing to
    // pan, and the geo map is a Leaflet surface with its own in-map hint.
    const scrollHint = document.querySelector(".tm-scrollhint");
    if (scrollHint) scrollHint.style.display = (cfg.kind === "img" || cfg.kind === "svg") ? "" : "none";
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
    const res = await vfetch("data/walk-times.json", { cache: "no-cache" });
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
    const [res, nrRes] = await Promise.all([vfetch("data/tube-lines.geojson"), NET_MODE === "all" ? vfetch("data/nr-lines.geojson") : Promise.resolve({ ok: false })]);
    if (!res.ok) throw new Error("lines geojson");
    linesGeo = await res.json();
    // National Rail geometry rides along, marked `nr` so the map can style it
    // as the outer layer and keep its default view fitted to the TfL network.
    if (nrRes.ok) {
      const nr = await nrRes.json();
      (nr.features || []).forEach((f) => { f.properties.nr = true; linesGeo.features.push(f); });
    }
    return linesGeo;
  }
  // Real pavement run route for a line, from the generated routes/<slug>.gpx
  // (built offline by tools/generate-routes.mjs — foot-routed on OpenStreetMap).
  // Same-origin fetch, cached per slug; returns an array of track segments
  // ([[[lat, lon], …], …], the main route first, then each branch) or null.
  const routeGpxCache = {};
  async function loadRouteGpx(slug) {
    if (!slug) return null;
    if (!GPX_LINES.has(slug)) return null; // no file for this line — skip the 404 round-trip
    if (routeGpxCache[slug] !== undefined) return routeGpxCache[slug];
    try {
      const res = await vfetch(`routes/${slug}.gpx`);
      if (res.status === 404) { routeGpxCache[slug] = null; return null; } // genuinely no file — remember that
      if (!res.ok) throw new Error("gpx " + res.status);
      const doc = new DOMParser().parseFromString(await res.text(), "application/xml");
      const segs = [...doc.getElementsByTagName("trkseg")]
        .map((seg) => [...seg.getElementsByTagName("trkpt")].map((t) => {
          const ele = t.getElementsByTagName("ele")[0];
          return [+t.getAttribute("lat"), +t.getAttribute("lon"), ele ? +ele.textContent : undefined];
        }))
        .filter((s) => s.length > 1);
      routeGpxCache[slug] = segs.length ? segs : null;
    } catch (_) { delete routeGpxCache[slug]; return null; } // transient fetch failure — retry next call
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
    // GPX loads for the whole-line default, and for an explicit main-route variant
    // (opts.gpx) so it follows the streets; branch variants stay station hops.
    const gpxSegs = (opts.routeLine || (opts.waypoints && !opts.gpx)) ? null : await loadRouteGpx(id);
    if (opts.stale && opts.stale()) return null;
    const gpxLine = gpxSegs && gpxSegs[0];
    // A pre-routed variant line (routeLine) wins; else the line's pavement GPX; else straight station hops.
    let routeLine;
    if (opts.routeLine && opts.routeLine.length > 1) routeLine = opts.reverse ? [...opts.routeLine].reverse() : opts.routeLine;
    else if (gpxLine && gpxLine.length > 1) {
      routeLine = opts.reverse ? [...gpxLine].reverse() : gpxLine;
      // A variant drawn from the whole-line GPX may need flipping so the pavement
      // line runs the chosen start → finish (the GPX is stored one way only).
      if (opts.gpx && wl.length > 1) {
        const d0 = haversineKm([0, routeLine[0][0], routeLine[0][1]], [0, wl[0][0], wl[0][1]]);
        const dN = haversineKm([0, routeLine[0][0], routeLine[0][1]], [0, wl[wl.length - 1][0], wl[wl.length - 1][1]]);
        if (dN < d0) routeLine = [...routeLine].reverse();
      }
    } else routeLine = wl;
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

  // Expand a map to fill the browser window — a fixed overlay that keeps the
  // browser chrome (unlike the native full-screen control). Adds a top-right
  // button and exits on Escape or a second click.
  function addFullWindowControl(map) {
    const container = map.getContainer();
    const isOpen = () => container.classList.contains("map-fullwindow");
    const setOpen = (open) => {
      container.classList.toggle("map-fullwindow", open);
      document.body.classList.toggle("map-fullwindow-open", open);
      if (map._fwBtn) {
        map._fwBtn.innerHTML = open ? "✕" : "⛶";
        map._fwBtn.title = open ? "Exit full window" : "Fill the browser window";
        map._fwBtn.setAttribute("aria-label", map._fwBtn.title);
      }
      setTimeout(() => map.invalidateSize(false), 80);
    };
    const ctl = L.control({ position: "topright" });
    ctl.onAdd = () => {
      const a = L.DomUtil.create("a", "leaflet-bar map-expand");
      a.href = "#";
      a.title = "Fill the browser window";
      a.setAttribute("role", "button");
      a.setAttribute("aria-label", "Fill the browser window");
      a.innerHTML = "⛶";
      L.DomEvent.on(a, "click", L.DomEvent.stop);
      L.DomEvent.on(a, "click", () => setOpen(!isOpen()));
      map._fwBtn = a;
      return a;
    };
    ctl.addTo(map);
    // Escape exits full-window; drop the listener once the map leaves the DOM.
    const onKey = (e) => {
      if (!document.body.contains(container)) { document.removeEventListener("keydown", onKey); return; }
      if (e.key === "Escape" && isOpen()) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
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
    addFullWindowControl(map);
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
      // GPX + TCX downloads for the selected line, kept in sync as the choice changes.
      const gpx = L.DomUtil.create("a", "gpx-dl geo-gpx", row);
      gpx.textContent = "↓ GPX";
      // No tcx-dl class: the picker builds TCX from the picked variant's points via
      // its own handler below (the delegated .tcx-dl handler only knows the main variant).
      const tcx = L.DomUtil.create("a", "gpx-dl geo-gpx geo-tcx", row);
      tcx.textContent = "⌚ TCX";
      tcx.href = "#";
      tcx.title = "Download as a Garmin TCX course — Virtual Partner pacing at your site pace";
      // Distance / stops / running time of the selected route, under the picker.
      const stats = L.DomUtil.create("div", "geo-stats", div);
      let curIdx = selectedIdx, gpxBlob = null;
      // A picked variant exports its own pavement polyline (variant-routes.json — the
      // geometry the map draws); whole-line entries keep their static GPX file.
      const syncGpx = (i) => {
        const e = entries[i];
        if (gpxBlob) { URL.revokeObjectURL(gpxBlob); gpxBlob = null; }
        if (e && e.route && e.route.length > 1) {
          const text = gpxFromPoints(e.route, `TubeRun ${e.label}`);
          if (text) {
            gpxBlob = URL.createObjectURL(new Blob([text], { type: "application/gpx+xml" }));
            gpx.href = gpxBlob; gpx.download = `TubeRun-${e.id}-${lineSlug(e.label)}.gpx`;
            gpx.title = "Download this exact route as a GPX file for your watch";
            gpx.style.display = ""; tcx.style.display = ""; return;
          }
        }
        if (e && GPX_LINES.has(e.id)) {
          gpx.href = `routes/${e.id}.gpx`; gpx.download = `TubeRun-${e.id}.gpx`;
          gpx.title = "Download this line's pavement route as a GPX file for your watch";
          gpx.style.display = ""; tcx.style.display = "";
        } else { gpx.removeAttribute("href"); gpx.style.display = "none"; tcx.style.display = "none"; }
      };
      L.DomEvent.on(tcx, "click", async (ev) => {
        L.DomEvent.preventDefault(ev);
        const e = entries[curIdx];
        let pts = e && e.route && e.route.length > 1 ? e.route : null;
        if (!pts && e && GPX_LINES.has(e.id)) {
          const vr = await loadVariantRoutes();
          pts = (vr[e.id] && vr[e.id][0]) || ((await loadRouteGpx(e.id)) || [])[0] || null;
        }
        const doc = pts && pts.length > 1 ? tcxFromPoints(pts, `TubeRun ${e.label}`, false) : null;
        if (!doc) { const was = tcx.textContent; tcx.textContent = "TCX unavailable"; setTimeout(() => { tcx.textContent = was; }, 1800); return; }
        downloadBlob(`TubeRun-${e.id}-${lineSlug(e.label)}.tcx`, new Blob([doc], { type: "application/vnd.garmin.tcx+xml" }));
      });
      const syncStats = (i) => {
        const wp = entries[i] && entries[i].wp;
        if (!wp || wp.length < 2) { stats.style.display = "none"; return; }
        const km = waypointsKm(wp) * ROAD_FACTOR;
        stats.style.display = "";
        stats.textContent = `${geoDistStr(km)} · ${wp.length} stops · 🏃 ${fmtTime(km * rtPace)}`;
      };
      const sync = (i) => { curIdx = i; syncGpx(i); syncStats(i); };
      sync(selectedIdx);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      L.DomEvent.on(sel, "change", () => { sync(+sel.value); onChange(+sel.value); });
      return div;
    };
    ctl.addTo(map);
    return ctl; // so the time machine can swap the picker for another era's
  }

  // --- The time machine section: the network era by era, plus the nerd panel ---
  // A dedicated year scrubber and map (the Map tab keeps its own inline version),
  // with the running tally of what's open, each line's era extent, and the story.
  function tm2PanelHtml(net, year) {
    if (year < 1836) return `<h3 class="tm2-h">No railways yet</h3><p class="lc-hint">London in ${year} moves by horse, boat and boot. The first railway arrives in 1836 — London Bridge to Deptford.</p>`;
    const open = [], soon = [], openSids = new Set();
    for (const id in net) {
      const ln = net[id], y0 = lineYear(id);
      if (y0 > year) { soon.push({ n: ln.name, y: y0 }); continue; }
      let stns = 0, total = 0;
      for (const sid in ln.stations) { total++; if (stationYear(id, ln.stations[sid].n) <= year) { stns++; openSids.add(sid); } }
      const br = ln.route || (ln.branches || []).reduce((a, b) => (b.length > a.length ? b : a), (ln.branches || [])[0] || []);
      const ob = br.map((sid) => ln.stations[sid]).filter((s) => s && stationYear(id, s.n) <= year);
      open.push({ id, n: ln.name, c: ln.colour, y: y0, stns, total, from: ob[0] && ob[0].n, to: ob.length > 1 ? ob[ob.length - 1].n : null, building: lineMaxYear(id) > year });
    }
    open.sort((a, b) => a.y - b.y || a.n.localeCompare(b.n));
    soon.sort((a, b) => a.y - b.y);
    const events = TM_MILESTONES.filter(([y]) => y <= year).slice(-7).reverse();
    // Proposed expansion only makes sense once we're near the present — keep the
    // deep-history views purely historical.
    const futBuilt = year >= 2024 ? FUTURE_EXTENSIONS.filter((e) => e.year <= year) : [];
    const futSoon = year >= 2024 ? FUTURE_EXTENSIONS.filter((e) => e.year > year) : [];
    const futureHtml = futBuilt.length || futSoon.length ? `
      <h3 class="tm2-h">On the horizon</h3>
      ${futBuilt.map((e) => `<div class="tm2-line tm2-future tmz" data-tmz-ext="${FUTURE_EXTENSIONS.indexOf(e)}" role="button" tabindex="0" title="Zoom the map to this"><i style="background:${(net[e.line] || {}).colour || "#0019A8"}"></i><div>
        <b>${escapeHtml(e.name)}</b> <span class="tm2-yr">proposed · ${e.year}</span>
        <span class="tm2-ext">${escapeHtml(e.note)}</span></div></div>`).join("")}
      ${futSoon.length ? `<p class="tm2-soon"><b>Still on the drawing board:</b> ${futSoon.map((e) => `${escapeHtml(e.name)} (proposed ${e.year})`).join(" · ")}</p>` : ""}` : "";
    return `
      <h3 class="tm2-h">${year} · ${open.length} line${open.length === 1 ? "" : "s"} · ${openSids.size} stations open</h3>
      <div class="tm2-lines">${open.map((l) => `
        <div class="tm2-line tmz" data-tmz-line="${escapeHtml(l.id)}" role="button" tabindex="0" title="Zoom the map to this line"><i style="background:${l.c}"></i><div>
          <b>${escapeHtml(l.n)}</b> <span class="tm2-yr">opened ${l.y}${l.building ? " · still growing" : ""}</span>
          ${l.from && l.to ? `<span class="tm2-ext">${escapeHtml(l.from)} → ${escapeHtml(l.to)} · ${l.stns}/${l.total} of today's stations</span>` : ""}
        </div></div>`).join("")}</div>
      ${soon.length ? `<p class="tm2-soon"><b>Not yet built:</b> ${soon.map((s) => `${escapeHtml(s.n)} (${s.y})`).join(" · ")}</p>` : ""}
      ${futureHtml}
      <h3 class="tm2-h">The story so far</h3>
      <ul class="tm2-events">${events.map(([y, t, tgt]) => `<li${tgt ? " class=\"tmz\"" : ""}${tmzAttr(tgt)}><b>${y}</b> ${escapeHtml(t)}</li>`).join("")}</ul>`;
  }

  // Coarse same-place box for spotting an NR station's TfL twin / a nearby
  // interchange (~440 m N–S and ~415 m E–W at London's latitude).
  const TWIN_LAT_DEG = 0.004, TWIN_LON_DEG = 0.006;

  function renderTimeMachine() {
    const mapEl = document.getElementById("tm2Map");
    if (!mapEl) return;
    const init = async () => {
      if (typeof L === "undefined") { mapUnavailable(mapEl); return; }
      const [net, geo] = await Promise.all([loadNetwork(), loadLines()]);
      const slider = document.getElementById("tm2Year"), lbl = document.getElementById("tm2YearLbl"),
        note = document.getElementById("tm2Note"), panel = document.getElementById("tm2Panel");
      let year = +slider.value;
      const map = createSiteMap(mapEl);
      const style = (f) => eraLineStyle(f, year, { ghostOpacity: 0.06 });
      const lineLayer = L.geoJSON(geo, { style }).addTo(map);
      const b = L.latLngBounds([]);
      lineLayer.eachLayer((l) => { if (!l.feature.properties.nr) b.extend(l.getBounds()); });
      if (b.isValid()) map.fitBounds(b, { padding: [14, 14] });

      // The secrets layer: shelters, ghost stations, depots and oddities —
      // violet dots, hover for the name, tap for the story.
      loadSecrets().then((all) => {
        const grp = L.layerGroup();
        for (const p of all) {
          L.circleMarker([p.lat, p.lon], { radius: 3.4, weight: 1.2, color: "#fff", fillColor: "#5F259F", fillOpacity: 1 })
            .bindTooltip(escapeHtml(p.n), { direction: "top" })
            .bindPopup(`<b>${escapeHtml(p.n)}</b><br>${escapeHtml(p.d)}`, { maxWidth: 260 })
            .addTo(grp);
        }
        grp.addTo(map);
      });

      // Open-station dots (tooltip names the opening year); NR platforms on a
      // same-named TfL station are skipped like the geo map's markers.
      let eraGrp = null, stnGrp = null, futureGrp = null;
      const redraw = () => {
        lineLayer.setStyle(style);
        if (eraGrp) map.removeLayer(eraGrp);
        eraGrp = eraLayerFor(net, year).addTo(map);
        if (futureGrp) map.removeLayer(futureGrp);
        futureGrp = futureLayerFor(net, year).addTo(map);
        if (stnGrp) map.removeLayer(stnGrp);
        stnGrp = L.layerGroup();
        const tflByName = {}, chosen = {};
        for (const id in net) { if (net[id].nr) continue; const st = net[id].stations; for (const sid in st) {
          const y = stationYear(id, st[sid].n);
          if (y > year) continue;
          tflByName[norm(st[sid].n)] = st[sid];
          if (!chosen[sid] || y < chosen[sid].y) chosen[sid] = { s: st[sid], y, c: net[id].colour };
        } }
        for (const id in net) { if (!net[id].nr) continue; const st = net[id].stations; for (const sid in st) {
          const y = stationYear(id, st[sid].n);
          if (y > year) continue;
          const twin = tflByName[norm(st[sid].n)];
          if (twin && Math.abs(twin.lat - st[sid].lat) < TWIN_LAT_DEG && Math.abs(twin.lon - st[sid].lon) < TWIN_LON_DEG) continue;
          if (!chosen[sid] || y < chosen[sid].y) chosen[sid] = { s: st[sid], y, c: net[id].colour };
        } }
        for (const sid in chosen) {
          const { s, y, c } = chosen[sid];
          L.circleMarker([s.lat, s.lon], { radius: 2.8, weight: 1, color: "#fff", fillColor: c, fillOpacity: 1 })
            .bindTooltip(`${escapeHtml(s.n)} · opened ${y}`, { direction: "top" }).addTo(stnGrp);
        }
        stnGrp.addTo(map);
        let story = "London before the railways.";
        for (const [my, txt] of TM_MILESTONES) if (my <= year) story = `${my} — ${txt}`;
        note.textContent = story;
        panel.innerHTML = tm2PanelHtml(net, year);
      };
      let deb = null;
      slider.addEventListener("input", () => {
        year = +slider.value;
        lbl.textContent = String(year);
        clearTimeout(deb);
        deb = setTimeout(redraw, 120);
      });
      // Click (or keyboard-activate) a panel entry to fly the map to its subject.
      const tmzZoom = (el) => {
        if (el.dataset.tmzStation) { const s = stationCoordByName(net, el.dataset.tmzStation); if (s) map.setView([s.lat, s.lon], 14, { animate: true }); else return; }
        else if (el.dataset.tmzLine) { const b = lineEraBounds(net, el.dataset.tmzLine, year); if (b) map.fitBounds(b, { padding: [28, 28] }); else return; }
        else if (el.dataset.tmzExt != null) { const b = extBounds(net, FUTURE_EXTENSIONS[+el.dataset.tmzExt]); if (b) map.fitBounds(b, { padding: [40, 40] }); else return; }
        else if (el.dataset.tmzAt) { const [la, lo, z] = el.dataset.tmzAt.split(",").map(Number); map.setView([la, lo], z || 13, { animate: true }); }
        else return;
        mapEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      panel.addEventListener("click", (e) => { const el = e.target.closest(".tmz"); if (el) tmzZoom(el); });
      panel.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.closest(".tmz")) { e.preventDefault(); tmzZoom(e.target.closest(".tmz")); } });
      redraw();
    };
    // A failed data fetch must degrade like the other map surfaces, not leave
    // the section silently blank with an unhandled rejection.
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) { obs.disconnect(); init().catch(() => mapUnavailable(mapEl)); }
      }, { rootMargin: "250px" });
      io.observe(mapEl);
    } else init().catch(() => mapUnavailable(mapEl));
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

  // The map's intro sentence, describing whichever line is currently lit. The next
  // run gets the full "lit up for the next run … arrival window" copy; a route the
  // visitor picked to explore gets plainer running-time/distance wording.
  function geoIntroHtml(net, id, isNextRun) {
    if (!id || !net[id]) return "Our own live map — real streets, parks and the Thames, with every tube line on top. ";
    const name = `<strong style="color:${lineTextColour(net[id].colour)}">${escapeHtml(net[id].name)} line</strong>`;
    return isNextRun
      ? `${name} lit up for the next run — arrows show the direction of travel, with running time, distance and the group's expected arrival window (from a ${MEET_TIME} start) at each stop. Every stop is a bail-out — hop the train back — and the black-ringed interchanges get you onto other lines. `
      : `${name} traced on the map — running time and distance at each stop from its start. Every stop is a bail-out; black-ringed interchanges get you onto other lines. `;
  }

  function geoCaption(cap, net, hi, redraw, applyYear) {
    if (!cap) return;
    const modeLabels = { run: "Run", walk: "Walk", names: "Names", off: "Off" };
    const modes = hi ? `<span class="geo-modes">Labels: ${["run", "walk", "names", "off"].map((m) =>
      `<button type="button" class="geo-mode" data-mode="${m}"${geoTimeMode === m ? ' data-on="1"' : ""}>${modeLabels[m]}</button>`).join("")}</span>` : "";
    const wcBtn = `<button type="button" class="geo-mode geo-wc-btn" data-wc="1"${geoShowToilets ? ' data-on="1"' : ""}>🚻 Toilets</button>`;
    const waterBtn = `<button type="button" class="geo-mode geo-water-btn" data-water="1"${geoShowWater ? ' data-on="1"' : ""}>💧 Water</button>`;
    const tmOn = tmYear < 9999;
    const tmBtn = `<button type="button" class="geo-mode geo-tm-btn"${tmOn ? ' data-on="1"' : ""}>🕰 Time machine</button>`;
    const tmRowHtml = `<span class="tm-year-row"${tmOn ? "" : " hidden"}><input type="range" class="tm-year" min="1830" max="2026" step="1" value="${tmOn ? tmYear : 2026}" aria-label="Show the network as it was in this year" /><b class="tm-year-lbl"></b><span class="tm-year-note"></span></span>`;
    cap.innerHTML = `<span class="geo-intro">${geoIntroHtml(net, hi, true)}</span>` + modes + " " + wcBtn + " " + waterBtn + " " + tmBtn + tmRowHtml;
    cap.querySelectorAll(".geo-mode[data-on]").forEach((b) => b.classList.add("on"));
    cap.querySelectorAll(".geo-mode[data-mode]").forEach((b) => b.addEventListener("click", () => {
      geoTimeMode = b.dataset.mode;
      cap.querySelectorAll(".geo-mode[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
      redraw();
    }));
    const wb = cap.querySelector(".geo-wc-btn");
    if (wb) wb.addEventListener("click", () => { geoShowToilets = !geoShowToilets; wb.classList.toggle("on", geoShowToilets); redraw(); });
    const wtb = cap.querySelector(".geo-water-btn");
    if (wtb) wtb.addEventListener("click", () => { geoShowWater = !geoShowWater; wtb.classList.toggle("on", geoShowWater); redraw(); });
    // Time machine: scrub the year and the map ghosts every line that hadn't
    // opened yet, with a milestone caption for the era you've landed in.
    const tmb = cap.querySelector(".geo-tm-btn"), tmRow = cap.querySelector(".tm-year-row"),
      tmSlider = cap.querySelector(".tm-year"), tmLbl = cap.querySelector(".tm-year-lbl"), tmNote = cap.querySelector(".tm-year-note");
    const syncTm = () => {
      const y = +tmSlider.value;
      tmLbl.textContent = String(y);
      let note = "London before the railways.";
      for (const [my, txt] of TM_MILESTONES) if (my <= y) note = `${my} — ${txt}`;
      tmNote.textContent = note;
    };
    if (tmb && applyYear) {
      tmb.addEventListener("click", () => {
        const on = tmRow.hidden;
        tmRow.hidden = !on;
        tmb.classList.toggle("on", on);
        applyYear(on ? +tmSlider.value : 9999);
        syncTm();
      });
      tmSlider.addEventListener("input", () => { applyYear(+tmSlider.value); syncTm(); });
      syncTm();
    }
  }

  // Real geographic map: Leaflet + CARTO Voyager basemap + our tube overlays.
  async function renderGeoMap(holder, cap, stale) {
    if (typeof L === "undefined") { mapUnavailable(holder); return; }
    const [net, geo] = await Promise.all([loadNetwork(), loadLines()]);
    if (stale && stale()) return; // user switched tabs while the data was in flight
    const hi = geoHighlightId(net);
    // The line currently lit up on the map. Starts as the next run (hi) but then
    // follows the route picker, so choosing another route re-lights that line's
    // track and stop labels instead of stacking on top of the old highlight.
    let curHi = hi;
    document.body.classList.add("tm-map-active");
    holder.innerHTML = `<div id="tmMap"></div>`;
    if (tmMap.map) { tmMap.map.remove(); tmMap.map = null; }
    const map = createSiteMap("tmMap", { zoomHint: true });
    tmMap.map = map;

    // Tube lines (real track geometry). Highlighted line bold & on top, others
    // dimmed. National Rail rides underneath — thinner and dashed, the classic
    // NR cartography — so the TfL network stays the hero of the map. Lines the
    // time machine says don't exist yet linger as faint ghosts (eraLineStyle).
    const lineStyle = (f) => eraLineStyle(f, tmYear, { ghostOpacity: 0.07, on: curHi && f.properties.line === curHi, dimmed: !!curHi });
    const lineLayer = L.geoJSON(geo, { style: lineStyle }).addTo(map);

    // Era geometry for partially built lines: each branch drawn only through
    // the stations that had opened by the time-machine year (skipping later
    // infills without breaking, truncating unbuilt extensions naturally).
    let eraGrp = null;
    function drawEra() {
      if (eraGrp) { map.removeLayer(eraGrp); eraGrp = null; }
      if (tmYear >= 9999) return;
      eraGrp = eraLayerFor(net, tmYear).addTo(map);
    }
    if (tmYear < 9999) drawEra(); // a persisted time-machine year applies on re-render
    lineLayer.eachLayer((l) => { if (hi && l.feature.properties.line === hi) l.bringToFront(); });

    // Route overlay + picker (top-left). The picker always lists this month's run
    // (when it's a Tube line) plus every branching line's routes grouped by line,
    // so any route can be explored on the map. drawMapRoute swaps the highlight:
    // a soft base + animated flow line with start/finish markers and arrows, and
    // brings the chosen line's track to the front.
    let hiRouteGrp = null, curEntry = null, mapReady = false;
    async function drawMapRoute(entry) {
      if (hiRouteGrp) { hiRouteGrp.remove(); hiRouteGrp = null; }
      curEntry = entry;
      const r = await drawRunRoute(map, net, entry.id, { waypoints: entry.wp, routeLine: entry.route, gpx: entry.gpx, stale });
      hiRouteGrp = r && r.group;
      // After the first render, switching route re-lights the chosen line: its
      // track goes bold (others dim) and its per-stop labels are recomputed and
      // redrawn — so the previous route's line and time/distance labels clear
      // instead of lingering underneath the new one.
      if (mapReady) {
        curHi = entry.id; km = tmComputeKm(net, curHi); lineLayer.setStyle(lineStyle);
        const intro = cap && cap.querySelector(".geo-intro");
        if (intro) intro.innerHTML = geoIntroHtml(net, curHi, curHi === hi);
      }
      lineLayer.eachLayer((l) => { if (l.feature.properties.line === entry.id) l.bringToFront(); });
      if (mapReady) draw();
    }
    // The picker honours the time machine: only lines whose corridor existed
    // in the chosen year are offered (before 1836 there's nothing to run).
    const allRouteEntries = await mapRouteEntries(net, hi);
    const entriesForYear = () => (tmYear >= 9999 ? allRouteEntries : allRouteEntries.filter((e) => lineYear(e.id) <= tmYear));
    let variantCtl = null;
    function buildPicker(entries, selectedIdx) {
      if (variantCtl) { variantCtl.remove(); variantCtl = null; }
      if (entries.length) variantCtl = addMapVariantControl(map, entries, selectedIdx, (i) => drawMapRoute(entries[i]));
    }
    const routeEntries = entriesForYear();
    if (routeEntries.length) await drawMapRoute(routeEntries[0]);
    if (stale && stale()) return;
    buildPicker(routeEntries, 0);

    // Station lookup: dedup by id, count lines per station (interchange), colour.
    // National Rail platforms carry different Naptan ids (910G…) from the tube
    // station they share a building with (940G…), so also drop any NR station
    // sitting on a same-named TfL one — otherwise interchanges draw two markers.
    const count = {}, coordById = {}, colourById = {}, tflByName = {}, sidYear = {};
    const markYear = (sid, id, name) => { const y = stationYear(id, name); if (sidYear[sid] === undefined || y < sidYear[sid]) sidYear[sid] = y; };
    for (const id in net) { if (net[id].nr) continue; const st = net[id].stations; for (const sid in st) { count[sid] = (count[sid] || 0) + 1; markYear(sid, id, st[sid].n);
      if (!coordById[sid]) { coordById[sid] = st[sid]; colourById[sid] = net[id].colour; tflByName[norm(st[sid].n)] = st[sid]; } } }
    for (const id in net) { if (!net[id].nr) continue; const st = net[id].stations; for (const sid in st) {
      const twin = tflByName[norm(st[sid].n)];
      if (twin && Math.abs(twin.lat - st[sid].lat) < TWIN_LAT_DEG && Math.abs(twin.lon - st[sid].lon) < TWIN_LON_DEG) continue;
      count[sid] = (count[sid] || 0) + 1; markYear(sid, id, st[sid].n);
      if (!coordById[sid]) { coordById[sid] = st[sid]; colourById[sid] = net[id].colour; } } }
    let km = tmComputeKm(net, curHi);
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

    // --- Run + ride reach (Chronotrains-style) ---------------------------
    // From a tapped station: everywhere you can get in 30/60/90 minutes by
    // running at the site pace and/or riding the network. Rough rail model:
    // ~30 km/h tube, ~50 km/h National Rail (both incl. stops), 0.7 min
    // dwell per hop, 4 min to board at the origin, 6 min to change between
    // nearby stations. Each reachable station then contributes a running
    // circle of whatever time remains, drawn to one canvas per band.
    let isoGrp = null, isoCtl = null, isoAdj = null;
    function clearIso() {
      if (isoGrp) { isoGrp.remove(); isoGrp = null; }
      if (isoCtl) { isoCtl.remove(); isoCtl = null; }
    }
    // One canvas, each band drawn solid to an offscreen buffer then composited
    // once at the band's opacity — overlapping circles inside a band merge into
    // a flat region instead of stacking towards solid navy.
    const IsoLayer = L.Layer.extend({
      initialize(bands) { this._bands = bands; },
      onAdd(map) {
        this._map = map;
        this._canvas = L.DomUtil.create("canvas", "leaflet-layer");
        this._canvas.style.pointerEvents = "none";
        map.getPanes().overlayPane.appendChild(this._canvas);
        map.on("move zoomend viewreset resize", this._redraw, this);
        this._redraw();
      },
      onRemove(map) {
        map.off("move zoomend viewreset resize", this._redraw, this);
        this._canvas.remove();
      },
      _redraw() {
        const map = this._map, size = map.getSize();
        this._canvas.width = size.x; this._canvas.height = size.y;
        L.DomUtil.setPosition(this._canvas, map.containerPointToLayerPoint([0, 0]));
        const ctx = this._canvas.getContext("2d");
        const mpp = 40075016.686 * Math.abs(Math.cos(map.getCenter().lat * Math.PI / 180)) / (256 * Math.pow(2, map.getZoom()));
        const off = document.createElement("canvas");
        off.width = size.x; off.height = size.y;
        const octx = off.getContext("2d");
        octx.fillStyle = "#1c3f94";
        for (const band of this._bands) {
          octx.clearRect(0, 0, size.x, size.y);
          for (const c of band.list) {
            const p = map.latLngToContainerPoint([c.lat, c.lon]);
            const r = c.radM / mpp;
            if (p.x < -r || p.y < -r || p.x > size.x + r || p.y > size.y + r) continue;
            octx.beginPath();
            octx.arc(p.x, p.y, r, 0, 6.2832);
            octx.fill();
          }
          ctx.globalAlpha = band.op;
          ctx.drawImage(off, 0, 0);
        }
        ctx.globalAlpha = 1;
      },
    });
    function isoGraph() {
      if (isoAdj) return isoAdj;
      const adj = {};
      const add = (a, b, min) => { (adj[a] = adj[a] || []).push({ to: b, min }); (adj[b] = adj[b] || []).push({ to: a, min }); };
      for (const id in net) {
        const ln = net[id], speed = ln.nr ? 50 : 30;
        for (const br of ln.branches || []) for (let i = 1; i < br.length; i++) {
          const A = ln.stations[br[i - 1]], B = ln.stations[br[i]];
          if (A && B) add(br[i - 1], br[i], (haversineKm([0, A.lat, A.lon], [0, B.lat, B.lon]) * 1.2 / speed) * 60 + 0.7);
        }
      }
      // Out-of-station interchanges: distinct ids within 250 m of each other
      // (tube Victoria <-> NR London Victoria and friends).
      const sids = Object.keys(coordById);
      for (let i = 0; i < sids.length; i++) {
        const A = coordById[sids[i]];
        for (let j = i + 1; j < sids.length; j++) {
          const B = coordById[sids[j]];
          if (Math.abs(A.lat - B.lat) > TWIN_LAT_DEG || Math.abs(A.lon - B.lon) > TWIN_LON_DEG) continue;
          if (haversineKm([0, A.lat, A.lon], [0, B.lat, B.lon]) < 0.25) add(sids[i], sids[j], 6);
        }
      }
      isoAdj = adj;
      return adj;
    }
    function isoReach(sid0) {
      const adj = isoGraph();
      const dist = { [sid0]: 0 };
      const done = new Set();
      for (;;) {
        let u = null, best = Infinity;
        for (const k in dist) if (!done.has(k) && dist[k] < best) { best = dist[k]; u = k; }
        if (u === null) break;
        done.add(u);
        const wait = u === sid0 ? 4 : 0;
        for (const e of adj[u] || []) {
          const nd = dist[u] + e.min + wait;
          if (nd < (dist[e.to] ?? Infinity)) dist[e.to] = nd;
        }
      }
      return dist;
    }
    function showReach(sid) {
      clearIso();
      const s0 = coordById[sid];
      if (!s0) return;
      map.closePopup();
      const dist = isoReach(sid);
      const paceCrow = rtPace * ROAD_FACTOR; // min per crow-fly km on real streets
      const bands = [{ min: 90, op: 0.12, list: [] }, { min: 60, op: 0.14, list: [] }, { min: 30, op: 0.18, list: [] }];
      for (const band of bands) {
        for (const sid2 in coordById) {
          const t = sid2 === sid ? 0 : dist[sid2];
          if (t === undefined || (sidYear[sid2] || 0) > tmYear) continue;
          const rem = band.min - t;
          if (rem < 3) continue;
          band.list.push({ lat: coordById[sid2].lat, lon: coordById[sid2].lon, radM: (rem / paceCrow) * 1000 });
        }
      }
      isoGrp = new IsoLayer(bands);
      isoGrp.addTo(map);
      isoCtl = L.control({ position: "topleft" });
      isoCtl.onAdd = () => {
        const d = L.DomUtil.create("div", "iso-legend");
        d.innerHTML = `<b>Run + ride from ${escapeHtml(s0.n)}</b>
          <span class="iso-bands"><i style="opacity:.9"></i>30 min <i style="opacity:.55"></i>60 min <i style="opacity:.3"></i>90 min</span>
          <span class="iso-note">running ~${fmtTime(rtPace)}/km, rough train times</span>
          <button type="button" class="iso-x" aria-label="Clear the reach shading">&times;</button>`;
        L.DomEvent.disableClickPropagation(d);
        d.querySelector(".iso-x").addEventListener("click", clearIso);
        return d;
      };
      isoCtl.addTo(map);
    }
    map.getContainer().addEventListener("click", (e) => {
      const b = e.target.closest(".iso-go");
      if (b) showReach(b.dataset.sid);
    });

    let stationGrp = null, toiletGrp = null, waterGrp = null;
    function draw() {
      if (stationGrp) map.removeLayer(stationGrp);
      if (toiletGrp) map.removeLayer(toiletGrp);
      const perKm = geoTimeMode === "walk" ? WALK_MIN_PER_KM : rtPace;
      const dense = map.getZoom() < 12; // thin the permanent labels when zoomed out to avoid overlap
      const showEta = curHi === hi; // the group's arrival window only applies to the actual next run
      stationGrp = L.layerGroup();
      for (const sid in coordById) { const s = coordById[sid], inter = count[sid] > 1, onHi = km[sid] !== undefined, dim = curHi && !onHi;
        if ((sidYear[sid] || 0) > tmYear) continue; // station's every line post-dates the time machine year
        const m = L.circleMarker([s.lat, s.lon], {
          radius: inter ? (onHi ? 6 : 4.5) : 3, weight: inter ? 1.5 : 1,
          color: inter ? "#111" : (dim ? "#9aa3ad" : colourById[sid]),
          fillColor: inter ? "#fff" : (dim ? "#c4ccd4" : colourById[sid]),
          fillOpacity: 1, opacity: dim ? 0.55 : 1,
        });
        const mins = km[sid] * perKm;
        // run/walk badge a time; "names" shows the name only; "off" hides the
        // permanent labels entirely (names still appear on hover/tap) for a clean
        // map when zoomed out.
        const timed = geoTimeMode === "run" || geoTimeMode === "walk";
        if (onHi && geoTimeMode !== "off" && (!dense || inter)) {
          const eta = showEta ? `<br><b class="tm-eta">🕒 ${etaWindow(km[sid], perKm)}</b>` : "";
          const time = timed ? `<span>${fmtTime(mins)} · ${geoDistStr(km[sid])}${eta}</span>` : "";
          m.bindTooltip(`<b>${escapeHtml(s.n)}</b>${time}`, { permanent: true, direction: "right", className: "tm-run-label", offset: [7, 0] });
        } else {
          const eta = showEta ? ` · group here ~${etaWindow(km[sid], perKm)}` : "";
          const t = onHi && timed ? `${escapeHtml(s.n)} · ${fmtTime(mins)} · ${geoDistStr(km[sid])}${eta}` : escapeHtml(s.n);
          m.bindTooltip(t, { direction: "top", className: "tm-hover-label" });
        }
        m.on("click", () => {
          L.popup({ offset: [0, -2], autoPan: false }).setLatLng([s.lat, s.lon])
            .setContent(`<b>${escapeHtml(s.n)}</b>${interchangeTags(s.n, "search")}<div class="iso-row"><button type="button" class="iso-go" data-sid="${escapeHtml(sid)}">How far from here?</button></div>`)
            .openOn(map);
        });
        stationGrp.addLayer(m);
      }
      stationGrp.addTo(map);
      toiletGrp = L.layerGroup();
      if (geoShowToilets) toiletSet.forEach((sid) => { const s = coordById[sid]; if (!s) return;
        L.marker([s.lat, s.lon], { icon: L.divIcon({ className: "tm-wc", html: "wc", iconSize: [15, 15], iconAnchor: [7, 7] }) })
          .bindTooltip(escapeHtml(s.n) + " — toilets").addTo(toiletGrp); });
      toiletGrp.addTo(map);
      if (waterGrp) map.removeLayer(waterGrp);
      waterGrp = L.layerGroup();
      if (geoShowWater && waterPts) waterPts.forEach((p) => {
        L.marker([p[0], p[1]], { icon: L.divIcon({ className: "tm-water", html: "💧", iconSize: [16, 16], iconAnchor: [8, 8] }) })
          .bindTooltip("Drinking water").addTo(waterGrp); });
      waterGrp.addTo(map);
    }
    draw();
    mapReady = true; // from here, route-picker changes re-light the chosen line
    // Year change: restyle lines and stations live, then (debounced, so slider
    // drags stay smooth) refresh the route picker to the lines of that era —
    // swapping the drawn route out if its line hasn't been built yet.
    let tmRebuild = null;
    const applyYear = (y) => {
      tmYear = y;
      lineLayer.setStyle(lineStyle);
      drawEra();
      draw();
      clearTimeout(tmRebuild);
      tmRebuild = setTimeout(() => {
        const list = entriesForYear();
        const keep = curEntry ? list.indexOf(curEntry) : -1;
        if (keep >= 0) { buildPicker(list, keep); return; }
        if (list.length) { drawMapRoute(list[0]); buildPicker(list, 0); }
        else { // pre-railway London: nothing to run yet
          if (hiRouteGrp) { hiRouteGrp.remove(); hiRouteGrp = null; }
          curEntry = null;
          buildPicker(list, 0);
        }
      }, 250);
    };
    geoCaption(cap, net, hi, draw, applyYear);
    geoRefresh = () => { if (tmMap.map === map) draw(); };
    let wasDense = map.getZoom() < 12;
    map.on("zoomend", () => { const d = map.getZoom() < 12; if (d !== wasDense) { wasDense = d; draw(); } });

    requestAnimationFrame(() => { map.invalidateSize(false);
      if (hi) { const b = L.latLngBounds([]); lineLayer.eachLayer((l) => { if (l.feature.properties.line === hi) b.extend(l.getBounds()); });
        if (b.isValid()) map.fitBounds(b, { padding: [28, 28] }); }
      else { // default view: fit the TfL network only — NR geometry reaches Reading and would zoom London out
        const b = L.latLngBounds([]);
        lineLayer.eachLayer((l) => { if (!l.feature.properties.nr) b.extend(l.getBounds()); });
        map.fitBounds(b.isValid() ? b : lineLayer.getBounds(), { padding: [16, 16] });
      } });
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
    const ekey = (a, b) => (a < b ? a + "" + b : b + "" + a);
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
  function shortestPath(graph, fromName, toName, allowed) {
    const { adj, norm, edgeLines, ekey } = graph;
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
        if (allowed) { const ls = edgeLines[ekey(u, v)]; if (!ls || ![...ls].some((l) => allowed.has(l))) continue; } // stick to preferred lines only
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
  function pathToLegs(graph, path, allowed) {
    if (path.length < 2) return [];
    const { edgeLines, ekey } = graph;
    // Narrow a hop's serving-lines to the preferred set (unless that would empty it).
    const only = (set) => { if (!allowed) return set; const f = new Set([...set].filter((l) => allowed.has(l))); return f.size ? f : set; };
    const chosen = [];
    let cur = null;
    for (let i = 0; i < path.length - 1; i++) {
      const cand = only(edgeLines[ekey(path[i], path[i + 1])] || new Set());
      let line = cur && cand.has(cur) ? cur : null; // stay on the current line if it runs this hop
      if (!line) {
        const next = i + 1 < path.length - 1 ? only(edgeLines[ekey(path[i + 1], path[i + 2])] || new Set()) : null;
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
  // --- Circular "loop from a spot" route generation ---------------------
  // Full Dijkstra sweep from one node: shortest running km to every reachable
  // station (respecting the preferred-line filter). Powers turnaround selection.
  function allDistances(graph, startKey, allowed) {
    const { adj, edgeLines, ekey } = graph;
    const dist = { [startKey]: 0 }, done = new Set();
    const q = [[0, startKey]];
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [d, u] = q.shift();
      if (done.has(u)) continue;
      done.add(u);
      for (const [v, w] of adj[u]) {
        if (allowed) { const ls = edgeLines[ekey(u, v)]; if (!ls || ![...ls].some((l) => allowed.has(l))) continue; }
        const nd = d + w;
        if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; q.push([nd, v]); }
      }
    }
    return dist;
  }
  // Shortest path that DISCOURAGES a set of edges (each penalised ×4) so a loop's
  // return leg takes a different way round where one exists, yet still completes
  // (retracing) when that's the only option. Returns the real (un-penalised) km.
  function pathAvoiding(graph, fromKey, toKey, avoidEdges, allowed) {
    const { adj, edgeLines, ekey } = graph;
    const dist = { [fromKey]: 0 }, prev = {}, done = new Set();
    const q = [[0, fromKey]];
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [d, u] = q.shift();
      if (done.has(u)) continue;
      done.add(u);
      if (u === toKey) break;
      for (const [v, w] of adj[u]) {
        if (allowed) { const ls = edgeLines[ekey(u, v)]; if (!ls || ![...ls].some((l) => allowed.has(l))) continue; }
        const nd = d + (avoidEdges.has(ekey(u, v)) ? w * 4 : w);
        if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = u; q.push([nd, v]); }
      }
    }
    if (dist[toKey] === undefined) return null;
    const path = [];
    for (let c = toKey; c !== undefined; c = prev[c]) path.unshift(c);
    let km = 0;
    for (let i = 0; i < path.length - 1; i++) km += adj[path[i]].get(path[i + 1]);
    return { path, km };
  }
  // Generate a circular running route from a start station: out to a turnaround
  // ~half the target distance away (optionally within a crow-flies radius), then
  // a different way back. Scores candidates on closeness to target + how little
  // they retrace. Returns { path, km, loop:true, turnaround } or null.
  function buildLoop(graph, startName, targetKm, radiusKm, allowed) {
    const { adj, norm, nodes } = graph;
    const s = norm(startName);
    if (!adj[s]) return null;
    const distS = allDistances(graph, s, allowed);
    const sLat = nodes[s].lat, sLon = nodes[s].lon;
    const within = (k) => !radiusKm || haversineKm([0, sLat, sLon], [0, nodes[k].lat, nodes[k].lon]) <= radiusKm;
    // Turnarounds ~30–54% of the ceiling out (the return is usually a touch longer,
    // so aim the out-leg under half to keep the round trip within the max), and
    // inside the radius if one is set.
    const pick = (lo, hi) => Object.keys(distS).filter((k) => k !== s && distS[k] >= targetKm * lo && distS[k] <= targetKm * hi && within(k));
    let cands = pick(0.3, 0.54);
    if (cands.length < 6) cands = pick(0.22, 0.6); // relax when options are few (short target / tight radius)
    if (!cands.length) return null;
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    cands = cands.slice(0, 40);
    // One best option per turnaround (a true loop where the network allows one,
    // else a plain out-and-back). Score = distance miss + a gentle doubling-back
    // penalty; distance is only a rough guide, so we keep a whole band of options.
    const options = [];
    for (const t of cands) {
      const out = shortestPath(graph, nodes[s].name, nodes[t].name, allowed);
      if (!out || out.path.length < 2) continue;
      const avoid = new Set();
      for (let i = 0; i < out.path.length - 1; i++) avoid.add(graph.ekey(out.path[i], out.path[i + 1]));
      let bestForT = null;
      const consider = (path, km, retrace) => {
        // Distance is a ceiling: overshooting the max is penalised ~4× harder than
        // coming in under, so the best loop is the longest that still fits.
        const miss = km > targetKm ? (km - targetKm) / targetKm * 4 : (targetKm - km) / targetKm;
        const score = miss + retrace * 0.6;
        if (!bestForT || score < bestForT.score) bestForT = { path, km, retrace, score, turnaround: nodes[t].name };
      };
      const back = pathAvoiding(graph, t, s, avoid, allowed);
      if (back && back.path.length > 1) {
        let shared = 0;
        for (let i = 0; i < back.path.length - 1; i++) if (avoid.has(graph.ekey(back.path[i], back.path[i + 1]))) shared++;
        consider(out.path.concat(back.path.slice(1)), out.km + back.km, shared / (back.path.length - 1));
      }
      consider(out.path.concat(out.path.slice(0, -1).reverse()), out.km * 2, 1);
      if (bestForT) options.push(bestForT);
    }
    if (!options.length) return null;
    // Distance is a ceiling: keep the loops that fit under it (a hair of tolerance
    // for rounding), preferring the longer ones, then pick RANDOMLY among the best
    // handful so repeat "Generate loop" clicks give genuinely different routes.
    const under = options.filter((o) => o.km <= targetKm + 0.05).sort((a, b) => a.score - b.score);
    const p = under.length
      ? under[Math.floor(Math.random() * Math.min(10, under.length))]
      : options.sort((a, b) => a.km - b.km)[0]; // nothing fits under the max — give the shortest we found
    return { path: p.path, km: p.km, loop: true, retrace: p.retrace, turnaround: p.turnaround };
  }
  // Nearest graph station to a lat/lon (for "use my location").
  function nearestStation(graph, lat, lon) {
    let best = null, bd = Infinity;
    for (const k in graph.nodes) {
      const n = graph.nodes[k], d = haversineKm([0, lat, lon], [0, n.lat, n.lon]);
      if (d < bd) { bd = d; best = n; }
    }
    return best ? { name: best.name, km: bd } : null;
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
  // Pavement geometry for National Rail's secondary branches (the mains live
  // in routes/<id>.gpx) — so journey legs off the main line trace real streets.
  let nrBranchPromise = null;
  function loadNrBranches() {
    if (!nrBranchPromise) {
      nrBranchPromise = vfetch("data/nr-branch-routes.json").then((r) => (r.ok ? r.json() : {}))
        .catch(() => { nrBranchPromise = null; return {}; }); // reset so a transient failure can retry
    }
    return nrBranchPromise;
  }
  // Pavement geometry for tube-network lines whose secondary branches need it —
  // the DLR's Beckton/Woolwich arms and Bank/Tower Gateway spurs (its main branch
  // lives in routes/dlr.gpx), plus short spur arms that no curated variant covers
  // (District's Kensington Olympia, the Piccadilly and Elizabeth Heathrow T4 legs)
  // so journey legs over them trace real streets. Same shape as the NR branch file.
  let tubeBranchPromise = null;
  function loadTubeBranches() {
    if (!tubeBranchPromise) {
      tubeBranchPromise = vfetch("data/tube-branch-routes.json").then((r) => (r.ok ? r.json() : {}))
        .catch(() => { tubeBranchPromise = null; return {}; }); // reset so a transient failure can retry
    }
    return tubeBranchPromise;
  }
  // Stitch a leg's real pavement hop by hop from every track we hold for the
  // line: its main-route GPX, its routed branches (NR + tube), and its variants.
  async function segmentPavement(segNodes, slug, nodes) {
    const coords = segNodes.map((k) => [nodes[k].lat, nodes[k].lon]);
    const segs = GPX_LINES.has(slug) ? await loadRouteGpx(slug) : null;
    const [branches, tubeBranches, variants] = await Promise.all([loadNrBranches(), loadTubeBranches(), loadVariantRoutes()]);
    const tracks = [...(segs || []), ...(branches[slug] || []), ...(tubeBranches[slug] || []), ...((variants[slug] || []).filter((v) => v && v.length > 1))];
    if (!tracks.length) return coords;
    const out = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const hop = hopPavement(tracks, coords[i], coords[i + 1]);
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
      addFlowLine(grp, dense, col, { baseOpacity: 0.85 });
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
      const col = safeColour(info.colour), hops = seg.nodes.length - 1;
      const stops = seg.nodes; // show the interchange on both lines (it's the last stop of the leg above and where you board this one)
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
  // A→B cap (km, 0 = no limit) from the planner's Max distance slider —
  // over-cap routes get a bail-out suggestion rather than a refusal.
  let abMaxKm = (() => { try { const v = parseInt(localStorage.getItem("tuberun_abmax"), 10); return v >= 1 && v <= 100 ? v : 0; } catch (_) { return 0; } })();

  function journeyResultHtml(res, segments, graph) {
    const path = res.path, km = res.km, nodes = graph.nodes;
    const from = nodes[path[0]].name, to = nodes[path[path.length - 1]].name;
    // Over the max-distance cap: name the last station within it as the bail-out.
    let capNote = "";
    if (abMaxKm > 0 && !res.loop && km > abMaxKm + 0.05) {
      let cum = 0, bail = null, bailKm = 0;
      for (let i = 1; i < path.length; i++) {
        const a = nodes[path[i - 1]], b = nodes[path[i]];
        cum += haversineKm([0, a.lat, a.lon], [0, b.lat, b.lon]) * ROAD_FACTOR;
        if (cum <= abMaxKm) { bail = b.name; bailKm = cum; } else break;
      }
      capNote = bail && bail !== to
        ? `<p class="jr-cap">Over your ${fmtKm(abMaxKm, 0)} cap — bail out at <b>${escapeHtml(bail)}</b> (${fmtKm(bailKm, 1)} in) and hop the train the rest of the way.</p>`
        : `<p class="jr-cap">This one runs ${fmtKm(km, 1)} — over your ${fmtKm(abMaxKm, 0)} cap.</p>`;
    }
    const changes = Math.max(0, segments.length - 1);
    const isOB = res.loop && res.retrace > 0.85;
    const head = res.loop
      ? `<div class="jr-head"><span class="jr-loop" aria-hidden="true">↻</span><strong>${isOB ? "Out &amp; back from" : "Loop from"} ${escapeHtml(from)}</strong></div>`
      : `<div class="jr-head"><strong>${escapeHtml(from)}</strong><span class="jr-arrow">→</span><strong>${escapeHtml(to)}</strong></div>`;
    const meta = res.loop
      ? `${path.length - 1} stops · ${isOB ? "turn at" : "out to"} ${escapeHtml(res.turnaround)} · ${changes} change${changes === 1 ? "" : "s"}`
      : `${path.length} stops · ${changes} change${changes === 1 ? "" : "s"}`;
    const loopNote = res.loop
      ? (res.retrace < 0.15 ? "A circular route back to your start. "
        : isOB ? "An out-and-back to the turnaround and home again — no separate way round on the network from here. "
          : "A loop back to your start; part of it doubles back where the network had no separate way round. ")
      : "";
    return `
      ${head}
      <div class="cr-main"><span class="cr-km">${fmtKm(km, 1)}</span> <span class="jr-stops">${meta}</span></div>
      ${capNote}
      ${timesRowHtml(km)}
      ${journeyStripHtml(segments, graph)}
      <div class="jr-elev" aria-live="polite"></div>
      <p class="jr-note">${loopNote}The map traces the real pavement route (GPX) leg by leg where available. Distance is on-street (crow-flies &times; 1.3); elevation is measured along the traced pavement.</p>`;
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
    let graph = null, jMap = null, jLayer = null, last = null, allowed = null; // allowed: null = any line, else a Set of line ids
    const loadingHint = `<p class="journey-hint">Still loading the network map &mdash; give it a second, then try again.</p>`;

    loadNetwork().catch(() => null).then((net) => {
      if (!net) { result.innerHTML = `<p class="journey-hint">Couldn't load the network map — try refreshing.</p>`; return; }
      graph = buildStationGraph(net);
      const names = Object.values(graph.nodes).map((n) => n.name).sort((a, b) => a.localeCompare(b));
      dl.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
      renderLineChips();
    });

    function ensureMap() {
      if (jMap) return jMap;
      if (typeof L === "undefined") { mapUnavailable(mapEl); return null; }
      jMap = createSiteMap(mapEl);
      requestAnimationFrame(() => jMap.invalidateSize(false));
      return jMap;
    }
    function render(res) {
      last = res;
      const segments = pathToLegs(graph, res.path, allowed);
      const map = ensureMap();
      if (!map) { result.innerHTML = journeyResultHtml(res, segments, graph); return; } // Leaflet unavailable — show the route text, skip the map
      if (jLayer) { map.removeLayer(jLayer); jLayer = null; }
      // Accent the pane's left bar with the journey's main line (the leg with the most stops).
      const mainSeg = segments.reduce((a, b) => (b.nodes.length > a.nodes.length ? b : a), segments[0]);
      const mainInfo = mainSeg && graph.lines[mainSeg.line];
      result.style.borderLeftColor = mainInfo ? mainInfo.colour : "";
      result.innerHTML = journeyResultHtml(res, segments, graph); // set first so the map can stretch to the pane's height
      requestAnimationFrame(() => {
        map.invalidateSize(false); // the pane (and the map stretched to it) may have changed height
        drawJourney(map, segments, graph).then((drawn) => {
          if (!drawn || !drawn.latlngs.length) return;
          jLayer = drawn.group;
          map.fitBounds(L.latLngBounds(drawn.latlngs), { padding: [28, 28] });
          const box = result.querySelector(".jr-elev");
          if (box) box.innerHTML = elevationHtml(drawn.elev);
        });
      });
    }
    function plan() {
      if (!graph) { result.innerHTML = loadingHint; return; }
      result.style.borderLeftColor = ""; // reset to the default accent; render() re-colours it when a route is found
      const a = fromEl.value.trim(), b = toEl.value.trim();
      if (!a || !b) { result.innerHTML = `<p class="journey-hint">Pick a start and a finish station to trace a route.</p>`; return; }
      const res = shortestPath(graph, a, b, allowed);
      if (!res || res.path.length < 2) {
        const unknown = [a, b].filter((n) => !graph.adj[graph.norm(n)]);
        result.innerHTML = unknown.length
          ? `<p class="journey-hint">${unknown.map(escapeHtml).join(" and ")} ${unknown.length > 1 ? "aren't stations" : "isn't a station"} on the map — start typing and pick from the list.</p>`
          : allowed
            ? `<p class="journey-hint">No running route from ${escapeHtml(a)} to ${escapeHtml(b)} on just the line${allowed.size > 1 ? "s" : ""} you picked — add a line or clear the filter.</p>`
            : `<p class="journey-hint">Those two aren't connected on the running network. Try another pair.</p>`;
        if (jLayer && jMap) { jMap.removeLayer(jLayer); jLayer = null; }
        last = null;
        return;
      }
      render(res);
    }
    // Max-distance cap: label sync, persistence, and a live re-render so the
    // bail-out note appears or clears as the slider moves.
    const maxEl = document.getElementById("abMax"), maxVal = document.getElementById("abMaxVal");
    const syncMax = () => { if (maxVal) maxVal.textContent = abMaxKm ? fmtKm(abMaxKm, 0) : "any"; };
    if (maxEl) {
      maxEl.value = String(abMaxKm);
      syncMax();
      maxEl.addEventListener("input", () => {
        abMaxKm = +maxEl.value;
        try { localStorage.setItem("tuberun_abmax", String(abMaxKm)); } catch (_) { /* private mode */ }
        syncMax();
        if (last && !last.loop) render(last);
      });
    }

    // Surprise route: a random connected pair, preferring a proper 5–25 km run
    // (and always respecting the max-distance cap when one is set).
    function randomRoute() {
      if (!graph) { result.innerHTML = loadingHint; return; }
      const names = Object.values(graph.nodes).map((n) => n.name);
      if (names.length < 2) return;
      const pick = () => names[Math.floor(Math.random() * names.length)];
      const cap = abMaxKm || 25;
      let best = null;
      for (let i = 0; i < 60; i++) {
        const a = pick(), b = pick();
        if (a === b) continue;
        const res = shortestPath(graph, a, b, allowed);
        if (!res || res.path.length < 2) continue;
        if (abMaxKm && res.km > abMaxKm) continue;
        if (!best || res.km > best.res.km) best = { a, b, res }; // longest run inside the cap
        if (res.km >= Math.min(5, cap) && res.km <= cap) break;
      }
      if (!best) return;
      fromEl.value = best.a; toEl.value = best.b;
      render(best.res);
      if (window.matchMedia("(max-width: 860px)").matches) mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Build the "stick to lines" chip row from the network's lines.
    function renderLineChips() {
      const box = document.getElementById("abLines");
      const wrap = document.getElementById("abFilters");
      const clearBtn = document.getElementById("abLinesClear");
      if (!box || !graph) return;
      const lines = Object.entries(graph.lines)
        .map(([id, info]) => ({ id, name: info.name, colour: info.colour }))
        .sort((a, b) => a.name.localeCompare(b.name));
      box.innerHTML = lines.map((l) =>
        `<button type="button" class="ab-line" data-id="${escapeHtml(l.id)}" style="--lc:${l.colour};--lct:${contrastText(l.colour)}" aria-pressed="false"><span class="ab-line-dot"></span>${escapeHtml(l.name)}</button>`
      ).join("");
      if (wrap) wrap.hidden = false;
      const refresh = () => {
        const on = [...box.querySelectorAll(".ab-line.on")].map((b) => b.dataset.id);
        allowed = on.length ? new Set(on) : null;
        if (clearBtn) clearBtn.hidden = !on.length;
        if (fromEl.value.trim() && toEl.value.trim()) plan();
      };
      box.addEventListener("click", (e) => {
        const chip = e.target.closest(".ab-line");
        if (!chip) return;
        chip.setAttribute("aria-pressed", chip.classList.toggle("on") ? "true" : "false");
        refresh();
      });
      if (clearBtn) clearBtn.addEventListener("click", () => {
        box.querySelectorAll(".ab-line.on").forEach((b) => { b.classList.remove("on"); b.setAttribute("aria-pressed", "false"); });
        refresh();
      });
    }
    // --- Loop mode: circular route from a start + target distance / radius ---
    const loopStart = document.getElementById("loopStart");
    const loopDist = document.getElementById("loopDist");
    const loopRad = document.getElementById("loopRad");
    const loopDistVal = document.getElementById("loopDistVal");
    const loopRadVal = document.getElementById("loopRadVal");
    const loopGoBtn = document.getElementById("loopGo");
    const loopHereBtn = document.getElementById("loopHere");
    const ptpControls = document.getElementById("ptpControls");
    const loopControls = document.getElementById("loopControls");
    const modePtpBtn = document.getElementById("modePtp");
    const modeLoopBtn = document.getElementById("modeLoop");
    function setMode(loop) {
      if (ptpControls) ptpControls.hidden = loop;
      if (loopControls) loopControls.hidden = !loop;
      if (modePtpBtn) { modePtpBtn.classList.toggle("is-on", !loop); modePtpBtn.setAttribute("aria-selected", String(!loop)); }
      if (modeLoopBtn) { modeLoopBtn.classList.toggle("is-on", loop); modeLoopBtn.setAttribute("aria-selected", String(loop)); }
    }
    if (modePtpBtn) modePtpBtn.addEventListener("click", () => setMode(false));
    if (modeLoopBtn) modeLoopBtn.addEventListener("click", () => setMode(true));
    function syncLoopLabels() {
      if (loopDistVal && loopDist) loopDistVal.textContent = `${loopDist.value} km`;
      if (loopRadVal && loopRad) loopRadVal.textContent = +loopRad.value ? `${loopRad.value} km` : "any";
    }
    if (loopDist) loopDist.addEventListener("input", syncLoopLabels);
    if (loopRad) loopRad.addEventListener("input", syncLoopLabels);
    syncLoopLabels();
    function generateLoop() {
      if (!graph) { result.innerHTML = loadingHint; return; }
      result.style.borderLeftColor = "";
      const start = loopStart.value.trim();
      if (!start) { result.innerHTML = `<p class="journey-hint">Pick a start station (or use your location) and I&rsquo;ll trace a loop back to it.</p>`; return; }
      if (!graph.adj[graph.norm(start)]) { result.innerHTML = `<p class="journey-hint">${escapeHtml(start)} isn&rsquo;t a station on the map — start typing and pick from the list.</p>`; return; }
      const target = +loopDist.value, radius = +loopRad.value || 0;
      const res = buildLoop(graph, start, target, radius, allowed);
      if (!res) {
        result.innerHTML = `<p class="journey-hint">Couldn&rsquo;t fit a ${target}&nbsp;km loop from ${escapeHtml(start)}${radius ? ` within ${radius}&nbsp;km` : ""}${allowed ? " on just those lines" : ""} — try a longer distance, a wider radius, or a more connected start.</p>`;
        if (jLayer && jMap) { jMap.removeLayer(jLayer); jLayer = null; }
        last = null;
        return;
      }
      render(res);
      if (window.matchMedia("(max-width: 860px)").matches) mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (loopGoBtn) loopGoBtn.addEventListener("click", generateLoop);
    if (loopStart) loopStart.addEventListener("change", () => { if (loopStart.value.trim()) generateLoop(); });
    if (loopHereBtn) loopHereBtn.addEventListener("click", () => {
      if (!navigator.geolocation) { result.innerHTML = `<p class="journey-hint">Your browser won&rsquo;t share a location — type a start station instead.</p>`; return; }
      loopHereBtn.disabled = true;
      navigator.geolocation.getCurrentPosition((pos) => {
        loopHereBtn.disabled = false;
        const near = graph && nearestStation(graph, pos.coords.latitude, pos.coords.longitude);
        if (!near) return;
        loopStart.value = near.name;
        generateLoop();
      }, () => {
        loopHereBtn.disabled = false;
        result.innerHTML = `<p class="journey-hint">Couldn&rsquo;t get your location — type a start station instead.</p>`;
      }, { enableHighAccuracy: true, timeout: 8000 });
    });
    if (goBtn) goBtn.addEventListener("click", plan);
    const randomBtn = document.getElementById("abRandom");
    if (randomBtn) randomBtn.addEventListener("click", randomRoute);
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
    renderRouteCards(); // cards only — their run-time estimates use rtPace
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
    ["renderFeature", renderFeature], ["showPageVersion", showPageVersion],
    ["renderTubeMap", renderTubeMap], ["renderLineStats", renderLineStats],
    ["renderNext", renderNext], ["renderHeroCard", renderHeroCard],
    ["renderJourneyBoard", renderJourneyBoard], ["renderList", renderList],
    ["renderRoutes", renderRoutes], ["setupPaceState", setupPaceState],
    ["setupPlanner", setupPlanner], ["enrichInterchanges", enrichInterchanges], ["setupBusRunner", setupBusRunner],
    ["setupFollowAlong", setupFollowAlong],
    ["setupJourneyPlanner", setupJourneyPlanner], ["renderLineCollector", renderLineCollector],
    ["renderTimeMachine", renderTimeMachine], ["setupNetToggle", setupNetToggle], ["setupSiteSearch", setupSiteSearch],
    ["setupStripInteractions", setupStripInteractions],
    ["renderGallery", renderGallery], ["wireSocials", wireSocials],
    ["loadWeather", loadWeather], ["setupScrollSpy", setupScrollSpy],
    ["setupUnitToggle", setupUnitToggle], ["setupLiveClock", setupLiveClock],
    ["loadLiveNow", loadLiveNow],
  ].forEach(([name, fn]) => {
    try { fn(); } catch (e) { console.error("init " + name + " failed:", e); }
  });

  // Register the service worker (offline app shell + installable PWA). Best-effort:
  // a failure must never block the app, so the error is swallowed.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }

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
    const sync = () => btns.forEach((b) => { const on = b.dataset.u === distUnit; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
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
      if (routeMap.current >= 0) renderRouteStrip(ROUTES[routeMap.current]); // its leg distances follow the unit
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

  // Exposes pure helpers to tools/test under a flag; never set in production.
  if (typeof window !== "undefined" && window.__TUBERUN_TEST__) {
    window.__tuberunTest = {
      londonParts, londonInstant, londonHM, londonDayNo,
      firstSunday, upcomingSundays, pickNextRun,
      parseClock, clockAdd, arrivalWindow, fmtTime, fmtPace, fmtKm, distText,
      icsFold, icsEsc, runIcs, lineSlug, safeColour,
      haversineKm, legDistanceKm, journeySegments,
      reverseGpxText, gpxFromPoints, tcxFromPoints,
      buildStationGraph, shortestPath, buildLoop, eraLineStyle,
    };
  }
})();
