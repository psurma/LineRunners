// Great-circle distance between two [lat, lon] points, shared by the tools.
// Half a dozen scripts carried their own copy of the same haversine, differing
// only in how the constant was spelled (R * 2 vs the folded 12742) and whether
// it returned km or metres — so a fix in one never reached the others.
//
//   distM(a, b)   metres
//   distKm(a, b)  kilometres
//
// Both fold the radius into a single multiply. That is bit-identical to the
// callers that already folded it (validate-data, build-shoreditch-10k). Two
// callers instead wrote `(d * Math.PI) / 180` where this writes `d * (PI/180)`,
// which is not the same in IEEE-754: measured over the real orbital geometry,
// 6253 of 19124 segments differ, by at most 1.11e-16 km. Both round through
// `+km.toFixed(1)` before they are written, so no generated artifact shifts.

const toR = Math.PI / 180;

// The haversine's asin term, radius-free.
const hav = (a, b) => Math.asin(Math.sqrt(
  Math.sin((b[0] - a[0]) * toR / 2) ** 2 +
  Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin((b[1] - a[1]) * toR / 2) ** 2));

export const distM = (a, b) => 12742000 * hav(a, b);
export const distKm = (a, b) => 12742 * hav(a, b);
