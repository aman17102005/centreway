// Place names for the start-point suggestions and the "Did you mean ...?" hints.
// Loaded lazily from data/places.json (made by tools/buildGraph.js from OpenStreetMap data, ODbL).
// Everything here runs on the phone: typing never sends a request anywhere.
import { CONFIG } from '../config.js';
import { Trie } from '../dsa/trie.js';
import { HashMap } from '../dsa/hashMap.js';
import { editDistance } from '../dsa/editDistance.js';
import { topK } from '../dsa/topK.js';
import { asciiLower } from '../dsa/kmp.js';

let loading = null;

/** Build the trie from a list of { name, weight, kind, lat, lon }. Every later word of a name is also a way in ("Sector 17" can be found by "17"? no: by "sec", and "Railway Station" by "station"). */
export function buildPlaceIndex(list) {
  const trie = new Trie();
  const knownWords = new HashMap();
  for (let id = 0; id < list.length; id++) {
    const place = list[id];
    const data = { id, name: place.name, lat: place.lat, lon: place.lon, kind: place.kind };
    trie.insert(place.name, place.weight, data);
    const words = place.name.split(' ');
    let offset = 0;
    for (let w = 0; w < words.length; w++) {
      if (w > 0) trie.insert(place.name.slice(offset), place.weight - 1, data); // start from a later word
      offset += words[w].length + 1;
      const word = asciiLower(words[w]);
      if (word.length >= 4 && !knownWords.has(word)) knownWords.set(word, place.weight);
    }
  }
  return { trie, knownWords };
}

/** Load the index once. Resolves to null if the file cannot be loaded (suggestions are then simply off). */
export function loadPlaceIndex() {
  if (!loading) {
    loading = fetch(CONFIG.offline.placesUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error('no places')))).then(buildPlaceIndex).catch(() => null);
  }
  return loading;
}

/** Up to `limit` places for what the user typed. Each place appears once. */
export function suggestPlaces(index, typed, limit = 6) {
  if (!index || typed.trim().length < 2) return [];
  const seen = new HashMap();
  const out = [];
  const raw = index.trie.suggest(typed, limit * 4);
  for (let i = 0; i < raw.length && out.length < limit; i++) {
    const place = raw[i].data;
    if (seen.has(place.id)) continue;
    seen.set(place.id, true);
    out.push(place);
  }
  return out;
}

// Words that appear in every address and must never be "corrected".
const COMMON_WORDS = ['nagar', 'marg', 'colony', 'vihar', 'bagh', 'chowk', 'enclave', 'puram', 'ganj', 'bazar', 'bazaar', 'extension', 'complex', 'society', 'bhawan', 'bhavan', 'mandir', 'highway', 'avenue', 'lane', 'garden', 'gardens', 'town', 'city', 'park', 'hostel', 'hospital', 'station', 'stand', 'gate', 'main', 'road', 'street', 'near', 'school', 'college', 'sector', 'plot', 'block', 'phase', 'village', 'district', 'centre', 'center',
  'public', 'senior', 'secondary', 'university', 'institute', 'campus', 'market', 'behind', 'opposite', 'building', 'floor', 'house', 'ward'];

/** Letters-only words of 5+ characters, with their position in the text. */
function wordsOf(text) {
  const words = [];
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const isLetter = i < text.length && /\p{L}/u.test(text[i]);
    if (isLetter && start < 0) start = i;
    if (!isLetter && start >= 0) { words.push(text.slice(start, i)); start = -1; }
  }
  return words.filter((w) => w.length >= 5);
}

/**
 * "Did you mean ...?" for OCR mistakes. Compares each word of the text with the known place words using
 * edit distance (small limit, early stop). Returns [{ from, to }]. Never changes the text itself.
 */
export function findCorrections(index, text, maxHints = 3) {
  if (!index) return [];
  const hints = [];
  const done = new HashMap();
  const knownList = index.knownWords.keys();
  for (const word of wordsOf(text)) {
    const lower = asciiLower(word);
    if (done.has(lower) || index.knownWords.has(lower) || COMMON_WORDS.includes(lower)) continue;
    done.set(lower, true);
    const limit = lower.length >= 8 ? 2 : 1;
    const close = [];
    for (let i = 0; i < knownList.length; i++) {
      const candidate = knownList[i];
      if (Math.abs(candidate.length - lower.length) > limit) continue;
      const distance = editDistance(lower, candidate, limit);
      if (distance <= limit) close.push({ candidate, distance, weight: index.knownWords.get(candidate) });
    }
    const best = topK(close, 1, (a, b) => (a.distance - b.distance) || (b.weight - a.weight));
    if (best.length) hints.push({ from: word, to: best[0].candidate.charAt(0).toUpperCase() + best[0].candidate.slice(1) });
    if (hints.length >= maxHints) break;
  }
  return hints;
}

/**
 * Like findCorrections but with the details needed to decide automatically.
 * Returns [{ from, to, distance, unique }]. unique = no other known word is equally close.
 */
export function proposeFixes(index, text) {
  if (!index) return [];
  const proposals = [];
  const done = new HashMap();
  const knownList = index.knownWords.keys();
  for (const word of wordsOf(text)) {
    const lower = asciiLower(word);
    if (done.has(lower) || index.knownWords.has(lower) || COMMON_WORDS.includes(lower)) continue;
    done.set(lower, true);
    const limit = lower.length >= 8 ? 2 : 1;
    const close = [];
    for (let i = 0; i < knownList.length; i++) {
      const candidate = knownList[i];
      if (Math.abs(candidate.length - lower.length) > limit) continue;
      const distance = editDistance(lower, candidate, limit);
      if (distance <= limit) close.push({ candidate, distance, weight: index.knownWords.get(candidate) });
    }
    if (!close.length) continue;
    const ranked = topK(close, 2, (a, b) => (a.distance - b.distance) || (b.weight - a.weight));
    const best = ranked[0];
    const tie = ranked.length > 1 && ranked[1].distance === best.distance;
    proposals.push({ from: word, to: best.candidate.charAt(0).toUpperCase() + best.candidate.slice(1), distance: best.distance, unique: !tie });
  }
  return proposals;
}

/** Fix a field's spelling on its own only when the match is very close; otherwise flag it with a suggestion. */
export function applyAutoFixes(result, index) {
  if (!index) return;
  for (const name of ['address', 'city', 'centreName']) {
    const field = result[name];
    if (!field.value) continue;
    for (const p of proposeFixes(index, field.value)) {
      const weight = index.knownWords.get(p.to.toLowerCase()) ?? 0;   // 100 city, 90 station, 80 town, 60 suburb ... 40 village
      const knownCity = weight >= 80;                                  // a big, well-known place name
      // Fix on its own only for important places (weight 60+), never for small villages that could be a different real word
      if (p.distance === 1 && p.unique && weight >= 60 && (p.from.length >= 7 || (p.from.length >= 5 && knownCity))) {
        field.value = field.value.split(p.from).join(p.to);
        field.note = `${field.note ? `${field.note} ` : ''}Spelling fixed: ${p.from} → ${p.to}.`;
        result.fixes.push({ field: name, from: p.from, to: p.to });
      } else {
        field.flag = true;
        field.suggestion = { from: p.from, to: p.to };
        field.note = `${field.note ? `${field.note} ` : ''}Did you mean ${p.to}?`;
      }
    }
  }
}
