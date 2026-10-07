// The start point of the trip. Order: the user's location (asked once on upload) -> the last start point the user chose -> ask.
// "Nearest railway station / bus stand" buttons help students who arrive from another city.
import { getSettings, saveSettings } from '../store.js';
import { fetchHubs } from '../services/overpass.js';

/** The last start point the user chose (a typed place, a station, a bus stand), or null. */
export function lastStart() {
  const s = getSettings().lastStart;
  return s && Number.isFinite(s.lat) && Number.isFinite(s.lng) ? s : null;
}

/** Remember a start point the user chose, so next time (or when location is refused) it is used on its own. */
export function saveLastStart(start) {
  if (!start || !Number.isFinite(start.lat) || !Number.isFinite(start.lng)) return;
  try { saveSettings({ lastStart: { lat: start.lat, lng: start.lng, label: String(start.label || '').slice(0, 80) } }); } catch { /* optional */ }
}

/** Start point for the draft: GPS if we have it, else the saved one. Returns { start, reason }. */
export function chooseStart(location) {
  if (location && location.ok) return { start: { lat: location.lat, lng: location.lng, label: 'My location', source: 'gps' }, reason: null };
  const saved = lastStart();
  const reason = location ? location.reason : 'unavailable';
  if (saved) return { start: { ...saved, label: saved.label || 'Saved start point', source: 'saved' }, reason };
  return { start: null, reason };
}

/** Nearest railway station or bus stand to the centre's city. kind: 'rail' | 'bus'. Returns { lat, lng, label } or null. */
export async function nearestHub(centre, kind, deps = {}) {
  const hubs = await (deps.fetchHubs || fetchHubs)(centre);
  const list = kind === 'rail' ? hubs.rail : hubs.bus;
  const best = list && list[0];
  return best ? { lat: best.lat, lng: best.lng, label: best.name || (kind === 'rail' ? 'Railway station' : 'Bus stand') } : null;
}
