// Small towns: OpenStreetMap has little data there, but the places exist. So a kind with few places is called "thin" (never "none here"),
// and when most kinds are thin the town is "small" and the Google Maps buttons are made prominent at the top of the nearby section.
export const THIN_BELOW = 3;           // fewer than 3 places within 5 km = thin
export const THIN_RADIUS_KM = 5;
export const SMALL_TOWN_SHARE = 0.7;   // thin kinds / judged kinds at or above this = a small town
export const MIN_JUDGED = 3;           // at least this many kinds must be judged (not failed, not still loading)

/**
 * items: the places found (with distanceKm). kinds: all kind ids. failed / pending: kinds whose server failed / that are still loading.
 * Returns { thin: Set, judged, small } - a failed or loading kind is never called thin (we do not know yet).
 */
export function thinInfo(items, kinds, { failed = [], pending = [] } = {}) {
  const thin = new Set(); let judged = 0;
  for (const kind of kinds) {
    if (failed.includes(kind) || pending.includes(kind)) continue;
    judged++;
    const near = items.filter((i) => i.category === kind && i.distanceKm <= THIN_RADIUS_KM).length;
    if (near < THIN_BELOW) thin.add(kind);
  }
  return { thin, judged, small: judged >= MIN_JUDGED && thin.size / judged >= SMALL_TOWN_SHARE };
}
