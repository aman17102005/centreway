// Route from the start point to the centre: public OSRM (or the user's own OpenRouteService key); if that fails, my own A* router
// when both points are inside the bundled map area; if that fails too, the straight-line distance.
import { getRoute } from '../services/routing.js';
import { offlineRoute } from '../services/offlineRoute.js';
import { haversineKm } from '../logic/geo.js';

/** Returns { route, error } where route is { distanceKm, durationMin, geometry, source, offline?, straightLine? }. */
export async function routeFor(start, centre, mode, orsKey = '') {
  try {
    return { route: await getRoute(start, centre, mode, orsKey), error: null };
  } catch (e) {
    const own = await offlineRoute(start, centre, mode);
    if (own) return { route: own, error: null };
    return { route: { distanceKm: haversineKm(start, centre), durationMin: null, geometry: null, straightLine: true }, error: e.code || 'failed' };
  }
}
