// Morning errands: stops on the way to the exam centre (photocopy shop, ATM, chemist).
// Picks up to 5 candidate shops of each ticked kind (least detour first, my top-K heap), gets the travel times between all places
// (OSRM table service, or an estimate from straight distance if that fails) and lets the bitmask DP (src/dsa/errandPlanner.js)
// choose which shop of each kind and in which order.
import { CONFIG } from '../config.js';
import { planErrands } from '../dsa/errandPlanner.js';
import { topK } from '../dsa/topK.js';
import { haversineMetres } from '../dsa/haversine.js';

export const ERRAND_KINDS = ['copy', 'atm', 'pharmacy'];     // photocopy shop, ATM, chemist (the ids of the nearby kinds)

const km = (a, b) => haversineMetres(a.lat, a.lng, b.lat, b.lng) / 1000;

/** The `k` best shops of one kind: the ones that cost the least extra distance (start -> shop -> centre compared with start -> centre). */
export function pickCandidates(items, kind, start, centre, k = CONFIG.errands.candidatesPerKind) {
  const shops = (items || []).filter((i) => i.category === kind && Number.isFinite(i.lat) && Number.isFinite(i.lng));
  const direct = km(start, centre);
  const detour = (p) => km(start, p) + km(p, centre) - direct;
  return topK(shops, k, (a, b) => detour(a) - detour(b));
}

/** Minutes between all pairs from straight distance: distance x detour factor / average speed. Used when the table service fails. */
export function estimateMatrix(points, { speedKmh = CONFIG.errands.estimateSpeedKmh, detour = CONFIG.errands.estimateDetour } = {}) {
  return points.map((a, i) => points.map((b, j) => (i === j ? 0 : (km(a, b) * detour / speedKmh) * 60)));
}

/**
 * start, centre: {lat, lng}. items: the nearby places (with category, name, lat, lng). kinds: the ticked kinds. dwell: minutes per kind.
 * deps.getMatrix(points, mode) -> minutes[i][j] (throws on failure). Returns
 * { kinds, missing: [kinds without a shop], estimated, order: [{ kind, name, lat, lng, arriveMin, departMin, dwellMin }], totalMin, travelMin, centreArriveMin }.
 * Times are minutes after leaving home. `order` is empty (and totalMin null) when there is nothing to stop for.
 */
export async function planMorningErrands({ start, centre, items, kinds, dwell = CONFIG.errands.dwellMin, mode = 'car', deps = {} }) {
  const wanted = ERRAND_KINDS.filter((k) => kinds.includes(k));
  const found = wanted.map((kind) => ({ kind, shops: pickCandidates(items, kind, start, centre) }));
  const missing = found.filter((f) => f.shops.length === 0).map((f) => f.kind);
  const used = found.filter((f) => f.shops.length > 0);
  if (!used.length) return { kinds: wanted, missing, estimated: false, order: [], totalMin: null, travelMin: null, centreArriveMin: null };

  const points = [start]; const groups = [];
  for (const f of used) { const idx = []; for (const shop of f.shops) { idx.push(points.length); points.push(shop); } groups.push(idx); }
  const centreIndex = points.length; points.push(centre);

  let matrix; let estimated = false;
  try { matrix = await (deps.getMatrix || (async () => { throw new Error('no table service'); }))(points, mode); } catch { matrix = null; }
  if (!matrix || matrix.length !== points.length) { matrix = estimateMatrix(points); estimated = true; }

  const plan = planErrands({ travel: matrix, start: 0, centre: centreIndex, groups, dwell: used.map((f) => Number(dwell[f.kind]) || 0) });
  const order = plan.order.map((s) => {
    const shop = points[s.node];
    return { kind: used[s.group].kind, name: shop.name || '', lat: shop.lat, lng: shop.lng, distanceKm: shop.distanceKm, arriveMin: s.arriveMin, departMin: s.departMin, dwellMin: s.departMin - s.arriveMin };
  });
  return { kinds: wanted, missing, estimated, order, totalMin: plan.totalMin, travelMin: plan.travelMin, centreArriveMin: plan.centreArriveMin };
}

/**
 * The clock time (minutes after midnight of the exam day, can be negative = the day before) of every stop, for a given leave-home time
 * (leave = { leaveMinutes, dayOffset }). A stop before 08:00 is marked early (shops may be closed).
 */
export function stopClockTimes(result, leave) {
  const base = leave.leaveMinutes + 1440 * leave.dayOffset;
  return (result.order || []).map((s) => {
    const arrive = base + s.arriveMin;
    return { ...s, arriveClock: arrive, departClock: base + s.departMin, early: arrive < CONFIG.errands.earlyShopMinutes };      // before 08:00 of the exam day (the night before counts too)
  });
}
