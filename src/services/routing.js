// Routes. Default: public OSRM servers (no key). Optional: user's own OpenRouteService key.
import { CONFIG } from '../config.js';
import { fetchJson } from './net.js';
import { persistentLru } from './lruStore.js';
import { RateLimiter } from '../dsa/rateLimiter.js';

const routeCache = persistentLru('route', 10, 3 * 86400000);

/** Convert GeoJSON [lng,lat] pairs to [lat,lng] pairs for the map. */
const flip = (coords) => coords.map(([lng, lat]) => [lat, lng]);

async function osrm(base, from, to) {
  const url = `${base}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const data = await fetchJson(url);
  const r = data.routes && data.routes[0];
  if (data.code !== 'Ok' || !r) throw new Error('no route');
  return { distanceKm: r.distance / 1000, durationMin: r.duration / 60, geometry: flip(r.geometry.coordinates) };
}

async function ors(key, profile, from, to) {
  const url = `${CONFIG.ors.url}/${profile}/geojson`;
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
    body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
  });
  const f = data.features && data.features[0];
  if (!f) throw new Error('no route');
  return {
    distanceKm: f.properties.summary.distance / 1000,
    durationMin: f.properties.summary.duration / 60,
    geometry: flip(f.geometry.coordinates),
  };
}

/**
 * mode: 'car' | 'bike' (motorbike) | 'foot'.
 * Motorbike has no real profile, so it uses the car route (the UI says so).
 * Returns { distanceKm, durationMin, geometry, source }. Throws if every try fails.
 */
export async function getRoute(from, to, mode, orsKey) {
  const key = `${mode}_${from.lat.toFixed(5)}_${from.lng.toFixed(5)}_${to.lat.toFixed(5)}_${to.lng.toFixed(5)}`;
  const cached = routeCache.get(key);
  if (cached) return cached;
  const fresh = await requestRoute(from, to, mode, orsKey);
  routeCache.put(key, fresh);
  return fresh;
}

async function requestRoute(from, to, mode, orsKey) {
  const osrmMode = mode === 'bike' ? 'car' : mode; // motorbike ~ car road network
  const errors = [];
  if (orsKey) {
    try {
      const r = await ors(orsKey, CONFIG.ors.profiles[osrmMode], from, to);
      return { ...r, source: 'OpenRouteService' };
    } catch (e) { errors.push(e); }
  }
  try {
    return { ...(await osrm(CONFIG.osrm[osrmMode], from, to)), source: 'OSRM' };
  } catch (e) { errors.push(e); }
  if (osrmMode === 'car') {
    try {
      return { ...(await osrm(CONFIG.osrm.carBackup, from, to)), source: 'OSRM (backup)' };
    } catch (e) { errors.push(e); }
  }
  const err = new Error('route failed');
  err.causes = errors;
  err.code = errors.find((e) => e.code === 'offline') ? 'offline' : 'failed';
  throw err;
}

// ---------------------------------------------------------------- travel times between many places (OSRM "table" service)
// One request gives the time between every pair of places. At most one request per second (my queue-based rate limiter) and the answer
// is remembered (my LRU cache). If every server fails the caller estimates the times instead (and says so).
const tableLimiter = new RateLimiter(1000);
const tableCache = persistentLru('table', 8, 3 * 86400000);

/** points: [{lat, lng}] (at most 20). Returns minutes[i][j]. Throws when every server fails. */
export async function getMatrix(points, mode = 'car') {
  const key = `${mode}_${points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
  const cached = tableCache.get(key);
  if (cached) return cached;
  const osrmMode = mode === 'bike' ? 'car' : mode;
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const bases = [CONFIG.osrm[osrmMode]];
  if (osrmMode === 'car') bases.push(CONFIG.osrm.carBackup);
  let last = null;
  for (const base of bases) {
    try {
      const url = `${base.replace('/route/', '/table/')}/${coords}?annotations=duration`;
      const data = await tableLimiter.schedule(() => fetchJson(url));
      if (data.code !== 'Ok' || !Array.isArray(data.durations)) throw new Error('no table');
      const minutes = data.durations.map((row) => row.map((sec) => (sec === null ? null : sec / 60)));
      if (minutes.some((row) => row.some((v) => v === null))) throw new Error('some places cannot be reached');
      tableCache.put(key, minutes);
      return minutes;
    } catch (e) { last = e; }
  }
  const err = new Error('table failed'); err.cause = last; err.code = last && last.code === 'offline' ? 'offline' : 'failed';
  throw err;
}
