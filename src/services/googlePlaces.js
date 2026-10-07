// Optional Google Places, through YOUR OWN Cloudflare Worker (see worker/README.md). OFF by default; the app works fully without it.
// The Google key is never in the app: only the Worker address is (in Settings, on this phone).
// Google's rules (https://developers.google.com/maps/documentation/places/web-service/policies):
//   - show "Google Maps" next to the results (done in the nearby list);
//   - never put Google places on the OpenStreetMap map (only in the list);
//   - do not store Google content (only the place id may be stored): results are kept in MEMORY for this visit only, never in localStorage or the plan.
import { getSettings } from '../store.js';
import { fetchJson, NetError } from './net.js';
import { haversineMetres } from '../dsa/haversine.js';
import { CATEGORIES } from './categories.js';

const memory = new Map();      // this visit only (a page reload forgets it, on purpose)

export function placesEnabled(settings = getSettings()) {
  return Boolean(settings.placesEnabled && /^https:\/\/.+/.test(String(settings.placesWorkerUrl || '').trim()));
}

/**
 * Ask the Worker for the kinds of place in `categories` (ids like 'food'). Returns { places: [{id, name, lat, lng, category, distanceKm}], limitReached }.
 * Kinds with no Google type (photocopy, toilets) are not asked. Throws NetError on a failure.
 */
export async function googleNearby(centre, categories, { settings = getSettings(), doFetch = fetchJson, radius = 3000, cacheKey = null } = {}) {
  if (!placesEnabled(settings)) return { places: [], limitReached: false, off: true };
  const wanted = categories.filter((id) => CATEGORIES.some((c) => c.id === id) && !['copy', 'toilet'].includes(id));
  if (!wanted.length) return { places: [], limitReached: false };
  // the answer is remembered for this plan (or place) while the app stays open: asking again costs no search
  const key = cacheKey || `${centre.lat.toFixed(3)}_${centre.lng.toFixed(3)}_${wanted.slice().sort().join(',')}`;
  if (memory.has(key)) return memory.get(key);
  let data;
  try {
    data = await doFetch(String(settings.placesWorkerUrl).trim(), { method: 'POST', timeout: 9000, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: centre.lat, lng: centre.lng, radius, categories: wanted }) });
  } catch (e) {
    if (e instanceof NetError && e.code === 'rate') return { places: [], limitReached: true };       // the Worker's daily limit (429)
    throw e;                                                                                         // anything else: Google is not set up / not reachable
  }
  const places = (data.places || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map((p) => ({
    id: p.id, name: p.name || '', category: p.category, lat: p.lat, lng: p.lng, distanceKm: haversineMetres(centre.lat, centre.lng, p.lat, p.lng) / 1000, source: 'google',
  })).sort((a, b) => a.distanceKm - b.distanceKm);
  const out = { places, limitReached: false };
  memory.set(key, out);
  return out;
}

export function clearGoogleMemory() { memory.clear(); }

/** The remembered answer for this plan, or null (never asks). */
export function googleRemembered(cacheKey) { return memory.get(cacheKey) || null; }

/** A link that opens one Google place in Google Maps by its place id. */
export function googlePlaceUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || 'place')}&query_place_id=${encodeURIComponent(place.id)}`;
}
