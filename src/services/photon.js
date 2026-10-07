// Photon (komoot): a free search on OpenStreetMap data, no key. We ask it for each kind of place near the centre
// ("restaurant", "dhaba", "hotel", "medical store" ...) and it returns named places with their coordinates.
// It finds places that the Overpass question missed (or could not answer because the server was busy).
import { CONFIG } from '../config.js';
import { fetchJson } from './net.js';
import { persistentLru } from './lruStore.js';
import { categoryOfTags } from './categories.js';
import { haversineMetres } from '../dsa/haversine.js';
import { asciiLower } from '../dsa/kmp.js';

const cache = persistentLru('photon', 60, 7 * 86400000);

/** One Photon search. Returns [{ name, lat, lng, osmKey, osmValue, id }] (as asked: nearest to `near` first). */
export async function photonSearch(term, near, { limit = CONFIG.photon.limit, timeout = 6000, box = 0.25 } = {}) {
  const key = `ph_${term}_${near.lat.toFixed(2)}_${near.lng.toFixed(2)}_${limit}_${box}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new URLSearchParams({ q: term, lat: near.lat.toFixed(5), lon: near.lng.toFixed(5), limit: String(limit), lang: 'en', location_bias_scale: '0.6', bbox: `${(near.lng - box).toFixed(4)},${(near.lat - box).toFixed(4)},${(near.lng + box).toFixed(4)},${(near.lat + box).toFixed(4)}` });   // bbox: only places in this box (about 28 km wide): the whole town, not the world
  const data = await fetchJson(`${CONFIG.photon.url}?${p}`, { timeout, headers: { Accept: 'application/json' } });
  const out = (data && data.features ? data.features : []).map((f) => {
    const pr = f.properties || {}; const c = (f.geometry && f.geometry.coordinates) || [];
    return { name: String(pr.name || ''), lat: Number(c[1]), lng: Number(c[0]), osmKey: pr.osm_key || '', osmValue: pr.osm_value || '', id: `ph${pr.osm_type || ''}${pr.osm_id || ''}`, city: pr.city || pr.district || '' };
  }).filter((x) => !Number.isNaN(x.lat) && !Number.isNaN(x.lng));
  if (out.length) cache.put(key, out);
  return out;
}

/**
 * Turn Photon results into places of one category. A result counts when its OpenStreetMap tag is that category ("amenity=restaurant"),
 * or when it has a name containing the searched word (a "Maa Bhojanalaya" tagged only as a building). Distance from the centre is added.
 */
export function photonPlaces(results, category, term, centre) {
  const word = asciiLower(term).split(' ')[0];
  const out = [];
  for (const r of results) {
    const cat = categoryOfTags({ [r.osmKey]: r.osmValue });
    const nameHit = r.name && asciiLower(r.name).includes(word);
    if (!(cat && cat.id === category.id) && !nameHit) continue;
    if (cat && cat.id !== category.id) continue;                       // tagged as another kind of place: not this one
    out.push({ id: r.id, name: r.name, category: category.id, icon: category.icon, lat: r.lat, lng: r.lng, distanceKm: haversineMetres(centre.lat, centre.lng, r.lat, r.lng) / 1000, source: 'photon' });
  }
  return out;
}
