// What the "Find more places with Google Maps" part of the nearby section shows, as plain data (so it can be tested without a screen).
// state: { status: 'idle' | 'loading' | 'done' | 'limit' | 'unavailable', places: [{ id, name, category, distanceKm, lat, lng }] }
// enabled: the Google option is set up (Worker address added in Settings). Without it nothing is shown and the app works as before.

export const GOOGLE_KINDS = ['food', 'lodging', 'pharmacy', 'atm', 'fuel', 'bus', 'rail'];     // kinds that Google can answer (no photocopy / toilets)

/** Count per kind: { food: 18, lodging: 6 ... } (kinds with none are 0). */
export function googleCounts(places) {
  const counts = {};
  for (const k of GOOGLE_KINDS) counts[k] = 0;
  for (const p of places || []) if (p.category in counts) counts[p.category]++;
  return counts;
}

/** "Food: 18 · Stay: 6 · Medical: 9 · ATM: 4" (kinds with none are left out). labels = { food: 'Food', ... }. */
export function countsText(places, labels) {
  const counts = googleCounts(places);
  return GOOGLE_KINDS.filter((k) => counts[k] > 0).map((k) => `${labels[k] || k}: ${counts[k]}`).join(' · ');
}

/** Places of one kind, nearest first. */
export const placesOfKind = (places, kind) => (places || []).filter((p) => p.category === kind).sort((a, b) => a.distanceKm - b.distanceKm);

/**
 * The model of the block: { visible, showButton, loading, message, summary, kinds: [{ kind, places }] }.
 * The button is only there when Google is set up and there are no results yet; a reached daily limit or a Google problem shows the message instead.
 */
export function googleView({ enabled, state, labels, messages }) {
  if (!enabled) return { visible: false, showButton: false, loading: false, message: '', summary: '', kinds: [] };
  const s = state || { status: 'idle', places: [] };
  if (s.status === 'limit' || s.status === 'unavailable') return { visible: true, showButton: false, loading: false, message: messages.unavailable, summary: '', kinds: [] };
  if (s.status === 'loading') return { visible: true, showButton: false, loading: true, message: '', summary: '', kinds: [] };
  if (s.status === 'done') {
    return { visible: true, showButton: false, loading: false, message: s.places.length ? '' : messages.none, summary: countsText(s.places, labels),
      kinds: GOOGLE_KINDS.map((kind) => ({ kind, places: placesOfKind(s.places, kind) })).filter((k) => k.places.length) };
  }
  return { visible: true, showButton: true, loading: false, message: '', summary: '', kinds: [] };
}
