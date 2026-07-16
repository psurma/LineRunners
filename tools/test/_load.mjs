// Test loader: runs the whole script.js IIFE in a node:vm context under the
// minimal DOM stubs proven by the earlier smoke recipe, with window.__TUBERUN_TEST__
// set so the IIFE publishes its pure helpers on window.__tuberunTest.
//
// Options (each distinct combination boots one extra context; results are cached):
//   now:   ISO instant string — inject a frozen Date class into the sandbox, so the
//          schedule builder and pickNextRun() see a fixed "today".
//   units: "mi" — the localStorage stub answers "mi" for tuberun_units, flipping the
//          module-internal distUnit that fmtKm/distText consult (only reachable at boot).
//
// The vm context deliberately has NO real timers (stubs return 0), so the site's
// live-clock setInterval can never keep the test process alive, and a
// never-settling fetch stub, so boot-time data loads neither resolve nor reject.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../../script.js", import.meta.url), "utf8");
const cache = new Map();

// Objects born inside the vm context carry that realm's prototypes, which
// assert.deepEqual (deepStrictEqual) rejects against host literals. Normalise
// JSON-safe values into host-realm objects before deep comparison.
export const plain = (x) => JSON.parse(JSON.stringify(x));

function frozenDateClass(nowMs) {
  return class FrozenDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(nowMs);
      else super(...args);
    }
    static now() { return nowMs; }
  };
}

function makeSandbox({ now, units } = {}) {
  const noop = () => {};
  const sandbox = {
    __TUBERUN_TEST__: true,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop,
      removeEventListener: noop,
      createElement: () => ({ style: {}, setAttribute: noop, addEventListener: noop, appendChild: noop }),
      body: { classList: { add: noop, remove: noop, toggle: noop }, style: {}, appendChild: noop, contains: () => true },
      documentElement: { style: { setProperty: noop } },
    },
    localStorage: { getItem: (k) => (k === "tuberun_units" && units === "mi" ? "mi" : null), setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { userAgent: "node-test", language: "en-GB" },
    addEventListener: noop,
    removeEventListener: noop,
    fetch: () => new Promise(noop),
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    // Web APIs the smoke recipe got for free from Node's globalThis; a bare vm
    // context has only ECMAScript intrinsics, so pass the host's through.
    TextEncoder, TextDecoder, URL, URLSearchParams, Blob, performance,
  };
  // Boot logs "init <section> failed" for DOM-dependent sections the stubs can't
  // satisfy (expected). Buffer instead of spamming test output; loadTubeRun
  // replays the buffer only if the load fails outright.
  const logs = [];
  const log = (...a) => logs.push(a.join(" "));
  sandbox.console = { log, warn: log, error: log, info: log, debug: log };
  sandbox.__logs = logs;
  sandbox.window = sandbox;
  if (now) sandbox.Date = frozenDateClass(new Date(now).getTime());
  return sandbox;
}

export function loadTubeRun(opts = {}) {
  const key = `${opts.now || ""}|${opts.units || "km"}`;
  if (cache.has(key)) return cache.get(key);
  const sandbox = makeSandbox(opts);
  vm.createContext(sandbox);
  try {
    vm.runInContext(src, sandbox, { filename: "script.js" });
    if (!sandbox.__tuberunTest) throw new Error("script.js ran but did not set window.__tuberunTest");
  } catch (err) {
    for (const line of sandbox.__logs) console.error("[script.js boot]", line);
    throw err;
  }
  cache.set(key, sandbox.__tuberunTest);
  return sandbox.__tuberunTest;
}
