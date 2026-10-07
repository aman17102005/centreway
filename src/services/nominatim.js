// Address search with Nominatim. Called only when the user taps a button.
// Follows the policy: 1 request per second, cached, no search-as-you-type.
import { CONFIG } from '../config.js';
import { fetchJson } from './net.js';
import { RateLimiter } from '../dsa/rateLimiter.js';
import { persistentLru } from './lruStore.js';

const DAY = 86400000;
// My queue-based limiter: at most one Nominatim request starts per minGapMs.
const limiter = new RateLimiter(CONFIG.nominatim.minGapMs);
// My LRU cache: a repeated search is answered from memory/storage.
const searchCache = persistentLru('search', 40, 30 * DAY);

/** Returns [{ lat, lng, label }]. Optional `near` {lat,lng} makes results near it come first. */
export async function searchPlace(query, { near, bounded = false, delta = 0.5 } = {}) {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) return [];
  const key = `geo2_${q.toLowerCase()}_${near ? `${near.lat.toFixed(bounded ? 3 : 1)}_${near.lng.toFixed(bounded ? 3 : 1)}` : ''}_${bounded ? `b${delta}` : ''}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const p = new URLSearchParams({
    q, format: 'jsonv2', limit: String(CONFIG.nominatim.limit), countrycodes: CONFIG.nominatim.countryCodes, addressdetails: '1',
  });
  if (near) {
    const d = delta;
    p.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
    if (bounded) p.set('bounded', '1');       // only results inside the box (a search for "restaurant" near the centre)
  }
  const data = await limiter.schedule(() => fetchJson(`${CONFIG.nominatim.url}?${p}`, { headers: { Accept: 'application/json' } }));
  const results = (Array.isArray(data) ? data : []).map((r) => ({
    lat: Number(r.lat), lng: Number(r.lon), label: String(r.display_name || ''), address: r.address || {}, kind: `${r.category || r.class || ''}:${r.type || ''}`,
  })).filter((r) => !Number.isNaN(r.lat) && !Number.isNaN(r.lng));
  if (results.length) searchCache.put(key, results);
  return results;
}
