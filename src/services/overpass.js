// Nearby places from OpenStreetMap (Overpass API) with a free Nominatim search as a back-up.
// Start with 1 km; a type with fewer than 3 places is widened on its own to 2 km, then 5 km (stays start at 5 km).
// Nodes, ways and relations are all used (buildings use their centre point). Results are merged without duplicates,
// ordered by distance with my spatial grid + top-K + merge sort, and cached with my LRU cache.
import { CONFIG } from '../config.js';
import { fetchJson, NetError } from './net.js';
import { persistentLru } from './lruStore.js';
import { searchPlace } from './nominatim.js';
import { pickClosest } from '../logic/nearby.js';
import { SpatialGrid } from '../dsa/spatialGrid.js';
import { haversineMetres } from '../dsa/haversine.js';
import { asciiLower } from '../dsa/kmp.js';
import { CATEGORIES, categoryOfTags } from './categories.js';
import { loadBundled } from './bundledNearby.js';
import { photonSearch, photonPlaces } from './photon.js';

const nearbyCache = persistentLru('nearby', 12, CONFIG.overpass.cacheDays * 86400000);

export { CATEGORIES, categoryOfTags };

/** One Overpass query: for each type its own radius. Nodes, ways and relations; ways and relations give their centre. */
export function buildQuery(centre, radiusByType) {
  const rows = [];
  for (const c of CATEGORIES) {
    const radius = radiusByType[c.id];
    if (!radius) continue;
    for (const [key, values] of c.tags) rows.push(`nwr["${key}"~"^(${values.join('|')})$"](around:${radius},${centre.lat},${centre.lng});`);
  }
  return `[out:json][timeout:25];(${rows.join('')});out center ${CONFIG.overpass.maxItems};`;
}

/**
 * One Overpass question. A busy server answers 429 / 504 or is slow: the next free mirror is tried (up to 3 attempts).
 * `deadline` (a time in ms) stops all attempts, so a dead server never makes the user wait for minutes.
 */
let preferredMirror = 0;     // the mirror that answered last time is asked first (a dead one costs 15 seconds every time)
const mirrorBadUntil = {};   // a mirror that just failed is skipped for two minutes (when another one is left)

async function askOverpass(query, deadline = Infinity) {
  const mirrors = CONFIG.overpass.mirrors && CONFIG.overpass.mirrors.length ? CONFIG.overpass.mirrors : [CONFIG.overpass.url];
  const order = mirrors.map((m, i) => i).sort((a, b) => ((mirrorBadUntil[a] > Date.now()) - (mirrorBadUntil[b] > Date.now())) || (((a - preferredMirror + mirrors.length) % mirrors.length) - ((b - preferredMirror + mirrors.length) % mirrors.length)));
  let last = null;
  for (let attempt = 0; attempt < Math.min(2, order.length); attempt++) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    const index = order[attempt];
    try {
      const data = await fetchJson(mirrors[index], {
        method: 'POST', timeout: Math.min(CONFIG.overpass.requestMs, left), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}`,
      });
      preferredMirror = index; delete mirrorBadUntil[index];
      return data;
    } catch (e) {
      last = e;
      if (e.code === 'offline' || e.code === 'auth') throw e;
      mirrorBadUntil[index] = Date.now() + 120000;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw last || new NetError('timeout');
}

/** Cache key for a centre (about 100 m accuracy). */
const keyFor = (c) => `nearby2_${c.lat.toFixed(3)}_${c.lng.toFixed(3)}`;

/** Items already saved for this centre, or null. Used by the plan screen. */
export function cachedNearby(centre) {
  return nearbyCache.get(keyFor(centre));
}

/** Overpass elements -> places. */
function placesFrom(elements, centre) {
  const out = [];
  for (const el of elements || []) {
    const tags = el.tags || {};
    const cat = categoryOfTags(tags);
    const lat = el.lat ?? el.center?.lat; const lng = el.lon ?? el.center?.lon;
    if (!cat || lat == null || lng == null) continue;
    out.push({
      id: `${el.type}${el.id}`, name: String(tags.name || tags['name:en'] || tags.brand || tags.operator || ''), category: cat.id, icon: cat.icon,
      lat, lng, distanceKm: haversineMetres(centre.lat, centre.lng, lat, lng) / 1000, source: 'osm',
    });
  }
  return out;
}

/**
 * Remove duplicates: the same type and the same name within 50 m (or two unnamed places on the same spot) is one place.
 * My spatial grid finds the neighbours, so this stays fast for hundreds of places.
 */
export function mergePlaces(places) {
  const grid = new SpatialGrid(60, places.length ? places[0].lat : 0);
  const kept = [];
  for (const p of places) {
    const near = grid.within(p.lat, p.lng, CONFIG.overpass.dedupeMetres);
    const nameP = asciiLower(p.name).trim();
    const same = near.some((n) => n.data.category === p.category && (asciiLower(n.data.name).trim() === nameP || nameP === '' || n.data.name === '' || n.distance < 15));
    if (same) continue;
    grid.insert(p.lat, p.lng, p);
    kept.push(p);
  }
  return kept;
}

const countByType = (items) => { const c = {}; for (const cat of CATEGORIES) c[cat.id] = 0; for (const i of items) c[i.category] = (c[i.category] || 0) + 1; return c; };

/**
 * Nearby places for a centre. deps (for tests): { overpass(query) -> data, search(q, opts) -> results }.
 * Returns { items (closest 5 per type, nearest first), fromCache, radiusByType, counts, emptyTypes, failedTypes, partial }.
 */
const inflight = {};   // the same search asked twice (the flow gave up waiting, the screen asks again) shares one request

export function fetchNearby(centre, deps = {}) {
  const key = keyFor(centre);
  if (inflight[key] && !deps.overpass) return inflight[key];
  const promise = fetchNearbyNow(centre, deps, key).finally(() => { delete inflight[key]; });
  if (!deps.overpass) inflight[key] = promise;
  return promise;
}

// Types are asked in a few small groups (a big combined question often times out on the public servers); two at a time, which is what
// the public servers allow. Each group is shown on the screen as soon as it arrives.
const GROUPS = [['food', 'atm', 'pharmacy'], ['copy', 'toilet', 'fuel'], ['bus', 'rail'], ['lodging']];

async function fetchNearbyNow(centre, deps, key) {
  const cached = nearbyCache.get(key);
  if (cached) return { items: cached, fromCache: true, counts: countByType(cached), emptyTypes: CATEGORIES.map((c) => c.id).filter((id) => !cached.some((i) => i.category === id)), failedTypes: [], partial: false };

  // inside the area whose places are bundled with the app: answer at once, no network
  const bundle = deps.bundle !== undefined ? deps.bundle : await loadBundled();
  if (bundle && bundle.covers(centre)) {
    const out = bundle.nearby(centre);
    if (!deps.bundle) nearbyCache.put(key, out.items);
    return out;
  }

  const deadline = Date.now() + (deps.budgetMs ?? CONFIG.overpass.totalBudgetMs);     // everything together must finish in this time
  const hardStop = (promise) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new NetError('timeout')), Math.max(0, deadline - Date.now()) + 300))]);
  const ask = (query) => hardStop(deps.overpass ? deps.overpass(query) : askOverpass(query, deadline));      // never later than the time limit
  const search = deps.search || ((q, opts) => searchPlace(q, opts));
  const maxRadius = CONFIG.overpass.radii[CONFIG.overpass.radii.length - 1];
  const left = () => deadline - Date.now();

  const radiusByType = {};
  for (const c of CATEGORIES) radiusByType[c.id] = c.startRadius || CONFIG.overpass.radii[0];
  let all = [];
  const answered = new Set(); const failed = new Set();
  let overpassError = null;
  const pick = () => { try { return pickClosest(all, centre, { radiusMetres: CONFIG.overpass.townRadiusM, perType: CONFIG.overpass.perTypeShown }); } catch { return all.slice().sort((a, b) => a.distanceKm - b.distanceKm); } };
  const snapshot = () => ({
    items: pick(), radiusByType: { ...radiusByType }, failedTypes: CATEGORIES.map((c) => c.id).filter((id) => failed.has(id) && !all.some((p) => p.category === id)),
    pendingTypes: CATEGORIES.map((c) => c.id).filter((id) => !answered.has(id) && !failed.has(id)),
  });
  const emit = () => { if (deps.onPartial) { try { deps.onPartial(snapshot()); } catch { /* the screen may be gone */ } } };

  const askGroup = async (ids) => {
    const radii = {}; for (const id of ids) radii[id] = radiusByType[id];
    try {
      const data = await ask(buildQuery(centre, radii));
      all = mergePlaces(all.concat(placesFrom(data.elements, centre)));
      for (const id of ids) { answered.add(id); failed.delete(id); }
    } catch (e) { overpassError = e; for (const id of ids) failed.add(id); }
    emit();
  };
  const pool = async (groups) => {
    const queue = groups.slice();
    const worker = async () => { while (queue.length && left() > 1500) await askGroup(queue.shift()); };
    await Promise.all([worker(), worker()]);
  };
  const chunk = (ids, n) => { const out = []; for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n)); return out; };
  const typeIds = new Set(CATEGORIES.map((c) => c.id));

  // Photon (free search on OpenStreetMap data): every English / Hindi / local word for every type, three at a time, while Overpass is asked.
  // It also finds places anywhere in the town (their distance from the centre is shown); a failure here is never an error.
  const photon = deps.photon || (deps.overpass ? async () => [] : (term, near) => photonSearch(term, near, { timeout: Math.min(6000, Math.max(1500, left())) }));      // (tests give their own Overpass: then no real network is used)
  const photonStage = async () => {
    const jobs = []; for (const c of CATEGORIES) for (const t of c.terms) jobs.push([c, t]);
    const worker = async () => {
      while (jobs.length && left() > 1000) {
        const [c, t] = jobs.shift();
        try { const found = photonPlaces(await hardStop(photon(t, centre)), c, t, centre); if (found.length) { all = mergePlaces(all.concat(found)); emit(); } } catch { /* optional source */ }
      }
    };
    await Promise.all(Array.from({ length: CONFIG.photon.concurrency }, worker));
  };

  // In a small town the hotels, the bus stand and the shops are in the middle of the TOWN, not next to the exam centre (and the pin may be only
  // the pincode area). So the town centre is looked up (one Nominatim question) and the two main words of every type are searched there too.
  // Distances shown are always from the exam centre.
  const townStage = async () => {
    const name = [centre.city, centre.pincode].filter(Boolean).join(' ');
    if (!name || deps.town === false || (deps.overpass && !deps.town)) return;
    try {
      const found = await hardStop(deps.town ? deps.town(name) : search(name, {}));
      const town = found && found[0];
      if (!town || haversineMetres(centre.lat, centre.lng, town.lat, town.lng) < 1500) return;       // the centre is already in the middle of the town
      const jobs = []; for (const c of CATEGORIES) for (const t of c.terms.slice(0, 2)) jobs.push([c, t]);
      const worker = async () => {
        while (jobs.length && left() > 1000) {
          const [c, t] = jobs.shift();
          try {
            const results = await hardStop(photon(t, town));
            const found2 = photonPlaces(results, c, t, town).map((p) => ({ ...p, distanceKm: haversineMetres(centre.lat, centre.lng, p.lat, p.lng) / 1000 }));
            if (found2.length) { all = mergePlaces(all.concat(found2)); emit(); }
          } catch { /* optional */ }
        }
      };
      await Promise.all(Array.from({ length: CONFIG.photon.concurrency }, worker));
    } catch { /* optional */ }
  };

  // 1) round one: every type at its start radius (1 km, stays 5 km), together with the Photon searches (near the centre and in the town)
  await Promise.all([pool(GROUPS.map((g) => g.filter((id) => typeIds.has(id)))), photonStage(), townStage()]);
  // 2) a failed group is asked once more (the next mirror); then types with fewer than 3 places are widened: 1 km -> 2 km -> 5 km
  for (let round = 1; round < CONFIG.overpass.radii.length + 1 && left() > 3000; round++) {
    const retry = CATEGORIES.map((c) => c.id).filter((id) => failed.has(id) && !answered.has(id));
    const thin = CATEGORIES.map((c) => c.id).filter((id) => answered.has(id) && !failed.has(id) && all.filter((p) => p.category === id && p.distanceKm * 1000 <= radiusByType[id]).length < CONFIG.overpass.minPerType && radiusByType[id] < maxRadius);
    for (const id of thin) radiusByType[id] = CONFIG.overpass.radii.find((r) => r > radiusByType[id]) || maxRadius;
    const todo = [...new Set([...(round === 1 ? retry : []), ...thin])];
    if (!todo.length) break;
    await pool(chunk(todo, 3));
  }

  // 3) still thin after 5 km (or the server did not answer)? Ask Nominatim ("hotel near <city> <pincode>"), one question per type, if there is time
  const thinNow = CATEGORIES.filter((c) => all.filter((p) => p.category === c.id).length < CONFIG.overpass.minPerType);
  const place = centre.city || centre.pincode ? `${centre.city || ''} ${centre.pincode || ''}`.trim() : '';
  let asked = 0;
  for (const c of thinNow) {
    if (left() < 2500 || asked >= 4) break;
    asked++;
    try {
      // the search words of this type inside a box around the centre (about 5 km), first the English word, then the local one
      let found = await search(c.terms[0], { near: centre, bounded: true, delta: 0.05 });
      if (!found.length && c.terms[1] && left() > 3500) found = await search(c.terms[1], { near: centre, bounded: true, delta: 0.05 });
      const extra = found.map((r, i) => ({
        id: `nom${c.id}${i}`, name: String(r.label || '').split(',')[0].trim(), category: c.id, icon: c.icon, lat: r.lat, lng: r.lng,
        distanceKm: haversineMetres(centre.lat, centre.lng, r.lat, r.lng) / 1000, source: 'nominatim',
      })).filter((p) => p.distanceKm * 1000 <= CONFIG.overpass.townRadiusM);
      all = mergePlaces(all.concat(extra));
      if (extra.length) { failed.delete(c.id); }
      emit();
    } catch { /* the back-up is optional */ }
  }

  // nothing at all from either source: let the screen show its friendly error
  if (!all.length && overpassError && !answered.size) throw overpassError;

  const snap = snapshot();
  const failedTypes = snap.failedTypes.concat(snap.pendingTypes);      // not answered in time counts as failed
  if (!failedTypes.length) nearbyCache.put(key, snap.items);           // an incomplete answer is never saved: the next visit asks again
  return { items: snap.items, fromCache: false, radiusByType, counts: countByType(snap.items), failedTypes, partial: failedTypes.length > 0,
    emptyTypes: CATEGORIES.map((c) => c.id).filter((id) => !snap.items.some((i) => i.category === id) && !failedTypes.includes(id)) };
}

/**
 * Schools, colleges and universities near a point whose name we can compare with the centre name.
 * One small request (cached). Returns [{ name, lat, lng }].
 */
export async function fetchInstitutions(centre, radiusM = 4000) {
  const key = `inst_${centre.lat.toFixed(2)}_${centre.lng.toFixed(2)}`;
  const cached = nearbyCache.get(key);
  if (cached) return cached;
  const a = `(around:${radiusM},${centre.lat},${centre.lng})`;
  const query = `[out:json][timeout:20];(nwr["amenity"~"^(school|college|university|kindergarten)$"]["name"]${a};nwr["building"~"^(school|college|university)$"]["name"]${a};);out center 300;`;
  const data = await askOverpass(query, Date.now() + CONFIG.overpass.optionalBudgetMs);
  const found = [];
  for (const el of data.elements || []) {
    const lat = el.lat ?? el.center?.lat; const lng = el.lon ?? el.center?.lon;
    const name = el.tags?.name || el.tags?.['name:en'];
    if (name && lat != null && lng != null) found.push({ name: String(name), lat, lng });
  }
  nearbyCache.put(key, found);
  return found;
}

/**
 * Railway stations and bus stands around the centre's city (up to 15 km), nearest to the centre first.
 * Used by the quick buttons "Nearest railway station" / "Nearest bus stand" for students who arrive from another city.
 * Returns { rail: [{name, lat, lng, distanceKm}], bus: [...] }.
 */
export async function fetchHubs(centre, deps = {}) {
  const key = `hubs_${centre.lat.toFixed(2)}_${centre.lng.toFixed(2)}`;
  const cached = nearbyCache.get(key);
  if (cached) return cached;
  const ask = deps.overpass || ((q) => askOverpass(q, Date.now() + CONFIG.overpass.optionalBudgetMs));
  const a = `(around:15000,${centre.lat},${centre.lng})`;
  const data = await ask(`[out:json][timeout:25];(nwr["railway"="station"]["name"]${a};nwr["amenity"="bus_station"]["name"]${a};);out center 120;`);
  const rail = []; const bus = [];
  for (const el of data.elements || []) {
    const lat = el.lat ?? el.center?.lat; const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const item = { name: String(el.tags.name || el.tags['name:en'] || ''), lat, lng, distanceKm: haversineMetres(centre.lat, centre.lng, lat, lng) / 1000 };
    if (el.tags.railway === 'station') rail.push(item); else bus.push(item);
  }
  const closest = (list) => pickClosest(list.map((x, i) => ({ ...x, id: `${i}`, category: 'x' })), centre, { radiusMetres: 15000, perType: 3 });
  const result = { rail: closest(rail), bus: closest(bus) };
  nearbyCache.put(key, result);
  return result;
}

/**
 * Named places (roads, colleges, shops ...) near a point whose name contains one of the given word starts.
 * Used when the full address is not in the search index: "Sundarpur", "Harinagar", "Netaji" find the road or the college by its name.
 * Returns [{ name, lat, lng, isRoad, tags }].
 */
export async function fetchNamedFeatures(area, wordStarts, deps = {}, radiusM = 8000) {
  const starts = wordStarts.filter((w) => /^[a-z]{4,10}$/i.test(w)).slice(0, 8);
  if (!starts.length) return [];
  const key = `named_${area.lat.toFixed(2)}_${area.lng.toFixed(2)}_${starts.join('')}`;
  const cached = nearbyCache.get(key);
  if (cached) return cached;
  const ask = deps.overpass || ((q) => askOverpass(q, Date.now() + CONFIG.overpass.optionalBudgetMs));
  const data = await ask(`[out:json][timeout:25];(nwr["name"~"${starts.join('|')}",i](around:${radiusM},${area.lat},${area.lng}););out center 200;`);
  const found = [];
  for (const el of data.elements || []) {
    const lat = el.lat ?? el.center?.lat; const lng = el.lon ?? el.center?.lon;
    const name = el.tags?.name || el.tags?.['name:en'];
    if (name && lat != null && lng != null) found.push({ name: String(name), lat, lng, isRoad: Boolean(el.tags.highway), tags: el.tags });
  }
  nearbyCache.put(key, found);
  return found;
}
