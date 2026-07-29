// Shared Overpass client for the OSM-backed route generators. Each of them used
// to POST straight at overpass-api.de with no pacing, no retry and a vague
// User-Agent — and because Overpass answers a 429 or a 504 with a plain-text or
// HTML body, a throttled run looked exactly like "the query matched nothing".
// The caller then wrote a truncated artifact and reported success. This client
// retries transient failures and THROWS when it runs out, so a rate-limited run
// can never be mistaken for an empty one.
//
//   overpassJson(query, opts)  the query against each endpoint in turn, retried
//     with backoff on 429/5xx, a non-JSON body, or a transport error. Returns
//     the parsed JSON. Throws once every endpoint and attempt is exhausted; a
//     400 (the query itself is malformed) throws immediately, since neither a
//     retry nor a different mirror can help.
//
// Requests are paced MIN_INTERVAL_MS apart module-wide, so a script that runs
// several queries queues politely behind itself — the public instances are
// donated capacity and ask for it.

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const DEFAULT_UA = "LineRunners/1.0 (route tools; https://psurma.github.io/LineRunners)";
const MIN_INTERVAL_MS = 1500;
const BACKOFF_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;
async function pace() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export async function overpassJson(query, { userAgent = DEFAULT_UA, endpoints = ENDPOINTS, tries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await sleep(BACKOFF_MS * attempt); // 5 s, then 10 s — Overpass slots free up slowly
    for (const url of endpoints) {
      await pace();
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": userAgent },
          body: "data=" + encodeURIComponent(query),
        });
        const text = await res.text();
        if (res.ok && text.trimStart().startsWith("{")) return JSON.parse(text);
        if (res.status === 400) throw Object.assign(new Error(`${url} 400 — the query is malformed: ${text.trim().slice(0, 200)}`), { fatal: true });
        lastErr = new Error(`${url} ${res.status}: ${text.trim().slice(0, 160) || "empty body"}`);
      } catch (e) {
        if (e.fatal) throw e;
        lastErr = e;
      }
    }
  }
  throw new Error(`Overpass failed after ${tries} attempt(s) across ${endpoints.length} endpoint(s) — last error: ${lastErr ? lastErr.message : "unknown"}`);
}
