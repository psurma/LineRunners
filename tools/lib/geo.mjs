// Great-circle distance between two [lat, lon] points, shared by the tools.
// Half a dozen scripts carried their own copy of the same haversine, differing
// only in how the constant was spelled (R * 2 vs the folded 12742) and whether
// it returned km or metres — so a fix in one never reached the others.
//
//   distM(a, b)   metres
//   distKm(a, b)  kilometres
//
// Both fold the radius into a single multiply, which keeps distKm bit-identical
// to the `12742 * asin(…)` and `R * 2 * asin(…)` forms it replaces: the callers'
// generated artifacts don't shift by an ulp.

const toR = Math.PI / 180;

// The haversine's asin term, radius-free.
const hav = (a, b) => Math.asin(Math.sqrt(
  Math.sin((b[0] - a[0]) * toR / 2) ** 2 +
  Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin((b[1] - a[1]) * toR / 2) ** 2));

export const distM = (a, b) => 12742000 * hav(a, b);
export const distKm = (a, b) => 12742 * hav(a, b);
