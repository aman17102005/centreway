// Nearby places that are bundled with the app for the Chandigarh–Mohali–Panchkula–Kharar area (data/nearby-tricity.json, from the
// OpenStreetMap download made by tools/buildNearby.js). Inside that area they show up at once, offline, with no server.
// Search = my spatial grid (all places once), then 1 km -> 2 km -> 5 km widening per type, like the live search.
import { CONFIG } from '../config.js';
import { CATEGORIES } from './categories.js';
import { SpatialGrid } from '../dsa/spatialGrid.js';
import { haversineMetres } from '../dsa/haversine.js';
import { pickClosest } from '../logic/nearby.js';

const EDGE_MARGIN = 0.025;    // about 2.5 km: near the edge of the downloaded area places are missing, so the live search is used there

/** data = { area, scale, types, places: [[typeIndex, lat*scale, lon*scale, name]] }. */
export function makeBundle(data) {
  const { area, scale, types, places } = data;
  const byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const grid = new SpatialGrid(100, (area.south + area.north) / 2);
  places.forEach((p, i) => {
    const cat = byId[types[p[0]]]; if (!cat) return;
    const lat = p[1] / scale; const lng = p[2] / scale;
    grid.insert(lat, lng, { id: `b${i}`, name: p[3], category: cat.id, icon: cat.icon, lat, lng, source: 'bundled' });
  });
  const radii = CONFIG.overpass.radii; const maxR = radii[radii.length - 1];
  return {
    covers: (c) => c.lat > area.south + EDGE_MARGIN && c.lat < area.north - EDGE_MARGIN && c.lng > area.west + EDGE_MARGIN && c.lng < area.east - EDGE_MARGIN,
    nearby(centre) {
      const around = grid.within(centre.lat, centre.lng, maxR).map((n) => ({ ...n.data, distanceKm: haversineMetres(centre.lat, centre.lng, n.data.lat, n.data.lng) / 1000 }));
      const radiusByType = {}; const keep = [];
      for (const c of CATEGORIES) {
        const mine = around.filter((p) => p.category === c.id);
        let r = c.startRadius || radii[0];
        while (mine.filter((p) => p.distanceKm * 1000 <= r).length < CONFIG.overpass.minPerType && r < maxR) r = radii.find((x) => x > r) || maxR;
        radiusByType[c.id] = r;
        keep.push(...mine.filter((p) => p.distanceKm * 1000 <= r));
      }
      const items = pickClosest(keep, centre, { radiusMetres: maxR, perType: CONFIG.overpass.perTypeShown });
      const counts = {}; for (const c of CATEGORIES) counts[c.id] = items.filter((i) => i.category === c.id).length;
      return { items, fromCache: false, bundled: true, radiusByType, counts, failedTypes: [], partial: false, emptyTypes: CATEGORIES.map((c) => c.id).filter((id) => !counts[id]) };
    },
  };
}

let loading = null;
/** The bundle, or null (no file, not in a browser, or the file could not be read). Loaded once. */
export function loadBundled() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!loading) loading = fetch('data/nearby-tricity.json').then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.places ? makeBundle(d) : null)).catch(() => null);
  return loading;
}
