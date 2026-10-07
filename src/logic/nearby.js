// Picks the closest places per type, using my DSA parts:
// spatial grid (who is within the radius) -> top-K heap (K closest per type) -> merge sort (final order).
import { SpatialGrid } from '../dsa/spatialGrid.js';
import { HashMap } from '../dsa/hashMap.js';
import { topK } from '../dsa/topK.js';
import { mergeSort } from '../dsa/mergeSort.js';

const byDistance = (a, b) => a.distanceKm - b.distanceKm;

/** items: [{ category, lat, lng, ... }]. Returns items (with distanceKm) sorted by distance, at most perType per category. */
export function pickClosest(items, centre, { radiusMetres = 1000, perType = 10 } = {}) {
  const grid = new SpatialGrid(150, centre.lat);
  for (let i = 0; i < items.length; i++) grid.insert(items[i].lat, items[i].lng, items[i]);

  const byCategory = new HashMap();
  const inside = grid.within(centre.lat, centre.lng, radiusMetres);
  for (let i = 0; i < inside.length; i++) {
    const item = { ...inside[i].data, distanceKm: inside[i].distance / 1000 };
    let list = byCategory.get(item.category);
    if (list === undefined) { list = []; byCategory.set(item.category, list); }
    list.push(item);
  }
  let chosen = [];
  const categories = byCategory.keys();
  for (let i = 0; i < categories.length; i++) chosen = chosen.concat(topK(byCategory.get(categories[i]), perType, byDistance));
  return mergeSort(chosen, byDistance);
}
