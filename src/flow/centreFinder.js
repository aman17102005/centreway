// Finds the exam centre on the map by itself.
// 1. search the full address; if nothing is found, try shorter versions (centre name + city, street + city, pincode ...)
// 2. rank every candidate (pincode, city, centre name, distance from the pincode area) with my top-K
// 3. if the best match is weak, also look for schools / colleges near the pincode whose name matches the centre name
// Every request goes through the rate limiter and the LRU cache (inside searchPlace / fetchInstitutions).
import { buildQueries, cleanQuery } from '../logic/geocode-plan.js';
import { searchPlace } from '../services/nominatim.js';
import { fetchInstitutions, fetchNamedFeatures } from '../services/overpass.js';
import { editDistance } from '../dsa/editDistance.js';
import { topK } from '../dsa/topK.js';
import { asciiLower } from '../dsa/kmp.js';
import { haversineMetres } from '../dsa/haversine.js';
import { STATES } from '../ingest/geoLists.js';
import { stateFromText } from '../ingest/placeText.js';
export { stateFromText };

// words that are in many centre names and say nothing about WHICH centre it is
const GENERIC = ['online', 'examination', 'exam', 'digital', 'zone', 'test', 'degree', 'jee', 'neet', 'ion', 'school', 'college', 'public', 'senior', 'secondary', 'government', 'govt', 'institute', 'university', 'centre', 'center', 'model', 'higher', 'sector', 'and',
  'the', 'of', 'for', 'girls', 'boys', 'education', 'technology', 'national', 'science', 'research', 'campus', 'block', 'road', 'phase'];

function significantWords(text) {
  return asciiLower(String(text || '')).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !GENERIC.some((g) => g === w || (w.length >= 6 && editDistance(w, g, 1) <= 1)));
}

/** 0..1: how many of the centre name's key words appear (allowing one wrong letter) in `candidateText`. */
export function nameSimilarity(centreName, candidateText) {
  const want = significantWords(centreName);
  if (!want.length) return 0;
  const have = significantWords(candidateText);
  let hit = 0;
  for (const w of want) if (have.some((h) => h === w || (w.length >= 5 && h.length >= 5 && editDistance(w, h, 1) <= 1) || (w.length >= 4 && h.length >= 4 && (h.startsWith(w) || w.startsWith(h))))) hit++;
  return hit / want.length;
}

/** A result that is a whole area (postcode, boundary, city, village), not a building. */
export function isRoughArea(c) {
  const kind = String(c.kind || '');
  return kind === 'area' || /postcode|postal_code|boundary|administrative|^place:|city|town|village|suburb|county|state/.test(kind) || /^\d{6},/.test(String(c.label || ''));
}

const CITY_KEYS = ['city', 'town', 'village', 'municipality', 'county', 'state_district', 'suburb', 'city_district'];
function cityMatches(city, address) {
  if (!city) return false;
  const c = asciiLower(city);
  return CITY_KEYS.some((k) => address[k] && (asciiLower(address[k]).includes(c) || c.includes(asciiLower(address[k])) || editDistance(c, asciiLower(address[k]), 1) <= 1));
}

// every word that is part of a state name (the state is not a way to find the road)
const STATE_WORDS = ['india', ...STATES.filter((x) => x.charCodeAt(0) < 128).flatMap((x) => x.split(' '))];

/**
 * A map result that cannot be the centre: a different state, or a pincode from another postal district (the first three digits).
 * Results without a state / pincode are not rejected.
 */
export function isWrongPlace(candidate, { state = '', pincode = '' }) {
  const a = candidate.address || {};
  if (state && a.state) {
    const s = asciiLower(a.state);
    const same = s.includes(state) || state.includes(s) || editDistance(s, state, 2) <= 2;
    if (!same) return true;
  }
  const post = String(a.postcode || '').replace(/\s/g, '');
  if (/^\d{6}$/.test(pincode) && /^\d{6}$/.test(post) && post.slice(0, 3) !== pincode.slice(0, 3)) return true;
  return false;
}

/** First letters of the unusual words of the address ("Sundarpur" -> "sunda"): enough to find the road or college by name, spelling variants included. */
export function addressWordStarts({ centreName = '', address = '' }) {
  const words = asciiLower(`${centreName} ${address}`).split(/[^a-z]+/).filter((w) => w.length >= 5 && !GENERIC.includes(w) && !STATE_WORDS.includes(w));
  const starts = [];
  for (const w of words) { const s5 = w.slice(0, 5); if (!starts.includes(s5)) starts.push(s5); }
  return starts;
}

/** More ways to ask when the full address finds nothing (shorter, and built from the parts that OpenStreetMap is likely to know). */
export function extraQueries({ centreName = '', address = '', pincode = '', city = '' }) {
  const parts = cleanQuery(address).split(',').map((p) => p.trim()).filter(Boolean);
  const noise = ['plot', 'house', 'h.no', 'near', 'opposite', 'behind', 'beside', 'floor', 'flat', 'p.o', 'post office', 'india'];
  const nameParts = cleanQuery(centreName).split(',').map((p) => p.trim()).filter((p) => p.length >= 6);
  const useful = parts.filter((p) => !noise.some((n) => asciiLower(p).includes(n)) && !/^\d{6}$/.test(p.replace(/\D/g, '')) && !nameParts.includes(p));
  const roads = useful.filter((p) => /(road|marg|bazar|bazaar|chowk|nagar|street|colony|sector|phase)/i.test(p));
  const out = [];
  // each institution name on its own with the city: "Example Degree College, Townname"
  for (const n of nameParts.slice().reverse()) if (city) out.push({ label: 'centre name and city', q: `${n}, ${city}` });
  if (roads.length && city) out.push({ label: 'street and city', q: `${roads[0]}, ${city}` });
  if (useful.length >= 2 && city) out.push({ label: 'street and city', q: `${useful[0]}, ${city}${pincode ? `, ${pincode}` : ''}` });
  if (centreName && useful.length) out.push({ label: 'centre name and street', q: `${nameParts[nameParts.length - 1] || centreName}, ${useful[0]}${city ? `, ${city}` : ''}` });
  return out;
}

/**
 * fields: { centreName, address, pincode, city } (strings). Returns
 * { found, lat, lng, label, confidence: 'high' | 'medium' | 'low', score, usedQuery, tried, postcode, pincodeDistanceKm, cityMismatch, candidates }
 * deps can be replaced in tests: { search(q), institutions(centre) }.
 */
export async function findCentre(fields, deps = {}) {
  const search = deps.search || ((q) => searchPlace(q));
  const institutions = deps.institutions || ((c) => fetchInstitutions(c));
  const features = deps.features || ((area, starts) => fetchNamedFeatures(area, starts));
  const { centreName, address, pincode, city } = fields;
  const base = buildQueries(fields);
  const smart = extraQueries(fields);
  // most exact first, then the short searches OpenStreetMap is most likely to know, then the rest
  // the chain: full address -> centre name + city -> centre name + pincode -> street + city -> everything else -> pincode
  const by = (label) => base.filter((q) => q.label === label);
  const queries = [...by('full address'), ...smart.filter((q) => q.label === 'centre name and city'), ...by('centre name and pincode'), ...smart.filter((q) => q.label !== 'centre name and city'),
    ...base.filter((q) => !['full address', 'centre name and pincode'].includes(q.label))];
  const state = fields.state || stateFromText(`${address} ${centreName}`);
  let rejected = 0;
  const tried = [];
  const candidates = [];
  const seen = [];
  const add = (r, via) => {
    if (seen.some((s) => Math.abs(s.lat - r.lat) < 1e-4 && Math.abs(s.lng - r.lng) < 1e-4)) return;
    seen.push(r);
    candidates.push({ ...r, via });
  };

  // The pincode area first: where the pincode points to (used to judge every candidate).
  let area = null;
  if (pincode) {
    try { const r = (await search(pincode)).filter((x) => !isWrongPlace(x, { state, pincode })); if (r[0]) area = { lat: r[0].lat, lng: r[0].lng }; tried.push('pincode only'); } catch (error) { if (error.code === 'offline') throw error; }
  }

  // Score a candidate: pincode, city, centre name, distance from the pincode area.
  const scoreOf = (c) => {
    let s = 0;
    const post = String(c.address?.postcode || '').replace(/\s/g, '');
    if (pincode && post) s += post === pincode ? 3 : -2.5;            // a different pincode is a strong sign of the wrong place
    const hasPlace = c.address && CITY_KEYS.some((k) => c.address[k]);
    if (city && hasPlace) s += cityMatches(city, c.address) ? 2 : -1.5;
    s += nameSimilarity(centreName, `${c.label} ${c.name || ''}`) * 3;
    if (area) {
      const km = haversineMetres(area.lat, area.lng, c.lat, c.lng) / 1000;
      s += km <= 3 ? 1.5 : km <= 8 ? 0.5 : km > 15 ? -2 : 0;
    }
    if (c.via === 'full address') s += 1; else if (c.via && c.via.includes('name')) s += 0.5;
    if (/school|college|university|amenity/.test(c.kind || '')) s += 0.5;
    if (c.kind === 'area') s -= 1.5; // a pincode area is only a rough place
    if (isRoughArea(c)) s -= 3;       // a postcode / city / boundary result is a whole area, not the centre
    return s;
  };
  const bestNow = () => topK(candidates, 1, (a, b) => b.score - a.score)[0] || null;

  // Search from the most exact question to the simplest. Keep going while the best match is still weak (at most 5 questions).
  let usedQuery = null; let asked = 0;
  for (const query of queries) {
    if (query.label === 'pincode only' || asked >= 5) continue;
    asked++;
    tried.push(query.label);
    let results = [];
    try { results = await search(query.q); } catch (error) { if (!candidates.length && error.code === 'offline') throw error; }
    results.forEach((r) => { if (isWrongPlace(r, { state, pincode })) rejected++; else add(r, query.label); });     // never a match in the wrong state or with another postal district
    candidates.forEach((c) => { c.score = scoreOf(c); });
    if (results.length && !usedQuery) usedQuery = query;
    const now = bestNow();
    if (now && now.score >= 5) break;
  }
  if (!candidates.length && area) { add({ ...area, label: `Pincode area ${pincode}`, address: { postcode: pincode }, kind: 'area' }, 'pincode only'); usedQuery = { label: 'pincode only', q: pincode }; }
  candidates.forEach((c) => { c.score = scoreOf(c); });

  // step 3: a better match among nearby schools and colleges?
  let best = bestNow();
  if ((!best || best.score < 5) && centreName && (area || best)) {
    try {
      const around = area || { lat: best.lat, lng: best.lng };
      const near = await institutions(around);
      const scored = near.map((n) => ({ ...n, sim: nameSimilarity(centreName, n.name) })).filter((n) => n.sim >= 0.6);
      const pick = topK(scored, 1, (a, b) => b.sim - a.sim || haversineMetres(around.lat, around.lng, a.lat, a.lng) - haversineMetres(around.lat, around.lng, b.lat, b.lng))[0];
      if (pick) {
        const c = { lat: pick.lat, lng: pick.lng, label: pick.name, address: { postcode: pincode }, kind: 'amenity:school', via: 'nearby institutions', name: pick.name };
        c.score = 3 + pick.sim * 3 + 1.5 + (cityMatches(city, {}) ? 0 : 0);
        add(c, 'nearby institutions');
        candidates[candidates.length - 1].score = c.score;
        tried.push('nearby schools and colleges');
        best = bestNow();
      }
    } catch { /* optional */ }
  }
  // step 3b: still only a rough area or a weak match? Look for named roads / colleges near the pincode area that share words with the address.
  if ((!best || best.score < 5 || isRoughArea(best)) && (area || best)) {
    try {
      const around = area || { lat: best.lat, lng: best.lng };
      const tokens = addressWordStarts(fields);
      const near = await features(around, tokens);
      const scored = near.map((n) => {
        const hits = tokens.filter((t) => asciiLower(n.name).includes(t)).length;
        const sim = nameSimilarity(centreName, n.name);
        const institution = /amenity|building/.test(Object.keys(n.tags || {}).join(' ')) && !n.isRoad;
        return { ...n, hits, sim, score: 2 + 1.5 * Math.min(hits, 3) + 3 * sim + (institution ? 1 : 0) + (n.isRoad ? 0 : 0.5) };
      }).filter((n) => n.hits >= 1);
      const pick = topK(scored, 1, (a, b) => b.score - a.score || haversineMetres(around.lat, around.lng, a.lat, a.lng) - haversineMetres(around.lat, around.lng, b.lat, b.lng))[0];
      if (pick && (!best || pick.score > best.score || isRoughArea(best))) {
        const c = { lat: pick.lat, lng: pick.lng, label: pick.name, address: { postcode: pincode }, kind: pick.isRoad ? 'highway:road' : 'amenity:named', via: 'named places', name: pick.name, score: pick.score };
        if (best && isRoughArea(best)) c.score = Math.max(c.score, best.score + 0.5);   // a named road or college beats a whole postcode area
        add(c, 'named places');
        candidates[candidates.length - 1].score = c.score;
        tried.push('named roads and colleges');
        best = bestNow();
      }
    } catch { /* optional */ }
  }
  if (!best) return { found: false, rejected, tried, candidates: [] };

  const postcode = String(best.address?.postcode || '').replace(/\s/g, '');
  const pincodeDistanceKm = area ? haversineMetres(area.lat, area.lng, best.lat, best.lng) / 1000 : null;
  return {
    found: true, rejected, lat: best.lat, lng: best.lng, label: best.label, score: best.score, usedQuery: best.via || (usedQuery && usedQuery.label), tried,
    // a road or a name match is a hint, never "high": the user is asked to check the pin
    confidence: isRoughArea(best) ? 'low' : best.via === 'named places' ? (best.kind === 'highway:road' ? 'low' : 'medium') : best.score >= 5 ? 'high' : best.score >= 3 ? 'medium' : 'low',
    postcode, pincodeDistanceKm, mapCity: (best.address && (best.address.city || best.address.town || best.address.village || best.address.suburb || best.address.state_district)) || '', cityMismatch: Boolean(city) && best.address && Object.keys(best.address).length > 0 && !cityMatches(city, best.address) && best.kind !== 'area',
    candidates: topK(candidates, 3, (a, b) => b.score - a.score),
  };
}
