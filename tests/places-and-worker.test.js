import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNearby, mergePlaces } from '../src/services/overpass.js';
import { photonPlaces } from '../src/services/photon.js';
import { CATEGORIES } from '../src/services/categories.js';
import { googleSearchUrl, searchGeoUrl, searchOsmUrl, mapsSearchUrl } from '../src/logic/placeLinks.js';
import { googleNearby, placesEnabled, clearGoogleMemory, googlePlaceUrl } from '../src/services/googlePlaces.js';
import { NetError } from '../src/services/net.js';
import { handle, takeCalls, groupsFor, FIELD_MASK, GROUPS } from '../worker/index.js';

const centre = { lat: 27.95, lng: 75.24, city: 'Examplepur', pincode: '333705' };
let base = 27.95;
const el = (id, tags, dLat) => ({ type: 'node', id, lat: base + dLat, lon: centre.lng, tags });
const cat = (id) => CATEGORIES.find((c) => c.id === id);

test('Photon results: only the right kind of place, names with the searched word count, distance from the centre is added', () => {
  const found = [
    { id: 'a', name: 'Maa Bhojanalaya', lat: 27.96, lng: 75.24, osmKey: 'building', osmValue: 'yes' },        // untagged, but the name has the word
    { id: 'b', name: 'Raju Restaurant', lat: 27.951, lng: 75.24, osmKey: 'amenity', osmValue: 'restaurant' },
    { id: 'c', name: 'Bhojan Hospital', lat: 27.952, lng: 75.24, osmKey: 'amenity', osmValue: 'hospital' },     // tagged as another kind
    { id: 'd', name: 'Dhaka Village', lat: 27.97, lng: 75.24, osmKey: 'place', osmValue: 'village' },
  ];
  const food = photonPlaces(found, cat('food'), 'bhojanalaya', centre);
  assert.deepEqual(food.map((p) => p.id), ['a', 'b']);
  assert.ok(food.every((p) => p.source === 'photon' && p.distanceKm > 0));
});

test('merge across sources: the same name within 50 m is one place (Overpass first), a far or different one stays', () => {
  const p = (id, name, dLat, source) => ({ id, name, category: 'food', lat: centre.lat + dLat, lng: centre.lng, distanceKm: 0, source });
  const merged = mergePlaces([p('o1', 'Raju Restaurant', 0, 'osm'), p('p1', 'raju restaurant', 0.0003, 'photon'), p('p2', 'Other Dhaba', 0.0003, 'photon'), p('p3', 'Raju Restaurant', 0.02, 'photon')]);
  assert.deepEqual(merged.map((x) => x.id), ['o1', 'p2', 'p3']);
});

test('town-wide: a place 12 km away from a Photon search is kept and its distance is shown; Overpass stays within 5 km', async () => {
  base = 27.95;
  const photon = async (term) => (term === 'restaurant' ? [{ id: 'far', name: 'Hotel Town Palace Restaurant', lat: centre.lat + 0.108, lng: centre.lng, osmKey: 'amenity', osmValue: 'restaurant' }] : []);
  const out = await fetchNearby({ ...centre, lat: 27.95 }, { overpass: async () => ({ elements: [] }), search: async () => [], photon });
  const far = out.items.find((i) => i.id === 'far');
  assert.ok(far && far.distanceKm > 11 && far.distanceKm < 13);
  assert.equal(far.source, 'photon');
});

test('server failed is NOT "no places": Overpass down + Photon empty = failed (retry), Overpass answered empty = really none', async () => {
  base = 27.96;
  const down = await fetchNearby({ ...centre, lat: 27.96 }, { overpass: async () => { throw new NetError('timeout'); }, search: async () => [], photon: async () => [] }).catch((e) => ({ error: e }));
  // every Overpass question failed and nothing else found anything: the whole search reports an error, never an empty list
  assert.ok(down.error || (down.failedTypes.length === CATEGORIES.length && down.emptyTypes.length === 0));
  base = 27.97;
  const answeredEmpty = await fetchNearby({ ...centre, lat: 27.97 }, { overpass: async () => ({ elements: [] }), search: async () => [], photon: async () => [] });
  assert.equal(answeredEmpty.failedTypes.length, 0);
  assert.equal(answeredEmpty.emptyTypes.length, CATEGORIES.length);        // Overpass answered: OpenStreetMap really lists none (the screen says so, with the Google Maps button)
  base = 27.98;
  const partial = await fetchNearby({ ...centre, lat: 27.98 }, { overpass: async (q) => { if (q.includes('"amenity"~"^(toilets)$"')) throw new NetError('timeout'); return { elements: [] }; }, search: async () => [], photon: async () => [] });
  assert.ok(partial.failedTypes.includes('toilet') && !partial.emptyTypes.includes('toilet'));
});

test('Google Maps links: https search near the CENTRE (works in any phone or laptop), geo: link for the phone map app, OpenStreetMap as the laptop back-up', () => {
  const c = { lat: 27.948812, lng: 75.242512 };
  assert.equal(googleSearchUrl(c, 'medical store'), 'https://www.google.com/maps/search/medical%20store/@27.948812,75.242512,15z');
  assert.equal(searchGeoUrl(c, 'hotel'), 'geo:27.948812,75.242512?q=hotel');
  assert.match(searchOsmUrl(c, 'hotel'), /^https:\/\/www\.openstreetmap\.org\/search\?query=hotel&lat=27\.94881&lon=75\.24251#map=15\//);
  assert.ok(mapsSearchUrl(c, 'ATM', { userAgent: 'Android' }).startsWith('geo:27.948812,75.242512'));
  // the link always carries the centre, never "near me" (no 0,0 and no missing position)
  for (const link of [googleSearchUrl(c, 'x'), searchGeoUrl(c, 'x')]) { assert.ok(link.includes('27.948812') && link.includes('75.242512')); assert.ok(!link.includes('geo:0,0')); }
});

// ---------------------------------------------------------------- the optional Google Places and its Worker
const memoryKv = () => { const m = {}; return { get: async (k) => (k in m ? m[k] : null), put: async (k, v) => { m[k] = v; }, data: m }; };
const request = (body, { origin = 'https://app.example', method = 'POST' } = {}) => new Request('https://worker.example/', { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const googleReply = (types) => ({ ok: true, status: 200, json: async () => ({ places: types.map((t, i) => ({ id: `id${t}${i}`, displayName: { text: `Place ${t}` }, location: { latitude: 27.95, longitude: 75.24 }, types: [t], primaryType: t })) }) });

test('Worker: asks Google with only the needed fields, groups kinds into few calls, answers with category and position', async () => {
  const calls = []; const env = { GOOGLE_API_KEY: 'k', COUNTER: memoryKv(), ALLOWED_ORIGIN: 'https://app.example' };
  const res = await handle(request({ lat: 27.95, lng: 75.24, radius: 3000, categories: ['food', 'lodging', 'pharmacy', 'atm', 'fuel', 'bus', 'rail', 'copy', 'toilet'] }), env, { fetch: async (url, init) => { calls.push({ url, init }); return googleReply(JSON.parse(init.body).includedTypes.slice(0, 1)); } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(calls.length, 4);                                       // 9 kinds in 4 calls; photocopy and toilets have no Google type
  assert.equal(calls[0].init.headers['X-Goog-FieldMask'], FIELD_MASK);
  assert.ok(!FIELD_MASK.includes('rating') && !FIELD_MASK.includes('review') && !FIELD_MASK.includes('opening'));   // nothing that costs more
  assert.equal(calls[0].url, 'https://places.googleapis.com/v1/places:searchNearby');
  assert.ok(body.places.every((p) => p.name && p.category && Number.isFinite(p.lat)));
  assert.equal(groupsFor(['food', 'lodging']).length, 2);
  assert.equal(groupsFor(['atm', 'fuel', 'bus', 'rail']).length, 1);
  assert.ok(Object.keys(GROUPS).length <= 4);
});

test('Worker: the daily limit stops the calls (429) and Google is not called after it', async () => {
  const kv = memoryKv(); const env = { GOOGLE_API_KEY: 'k', COUNTER: kv, ALLOWED_ORIGIN: 'https://app.example', DAILY_LIMIT: '5' };
  let googleCalls = 0; const deps = { fetch: async (url, init) => { googleCalls++; return googleReply(['restaurant']); }, now: () => Date.UTC(2026, 9, 7, 10) };
  const ask = (cats) => handle(request({ lat: 27.95, lng: 75.24, categories: cats }), env, deps);
  assert.equal((await ask(['food', 'lodging', 'pharmacy', 'atm'])).status, 200);        // 4 of 5 used
  assert.equal(googleCalls, 4);
  const blocked = await ask(['food', 'lodging']);                                        // would need 2 more: 6 > 5
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /Daily limit/);
  assert.equal(googleCalls, 4);                                                           // Google was NOT called
  assert.equal((await ask(['food'])).status, 200);                                       // one more still fits (5 of 5)
  assert.equal((await ask(['food'])).status, 429);
  // a new day starts again at 0
  const tomorrow = await handle(request({ lat: 27.95, lng: 75.24, categories: ['food'] }), env, { ...deps, now: () => Date.UTC(2026, 9, 8, 1) });
  assert.equal(tomorrow.status, 200);
  // the default limit is 1000 a day
  const r = await takeCalls({ COUNTER: memoryKv() }, 1);
  assert.equal(r.limit, 1000);
});

test('Worker: other websites, positions outside India and a missing key are refused before any Google call', async () => {
  let googleCalls = 0; const deps = { fetch: async () => { googleCalls++; return googleReply([]); } };
  const env = { GOOGLE_API_KEY: 'k', COUNTER: memoryKv(), ALLOWED_ORIGIN: 'https://app.example' };
  assert.equal((await handle(request({ lat: 27.95, lng: 75.24, categories: ['food'] }, { origin: 'https://evil.example' }), env, deps)).status, 403);
  assert.equal((await handle(request({ lat: 48.8, lng: 2.3, categories: ['food'] }), env, deps)).status, 400);
  assert.equal((await handle(request({ lat: 27.95, lng: 75.24, categories: ['food'] }), { ...env, GOOGLE_API_KEY: '' }, deps)).status, 500);
  assert.equal((await handle(request({}, { method: 'GET' }), env, deps)).status, 405);
  assert.equal(googleCalls, 0);
  const options = await handle(request({}, { method: 'OPTIONS' }), env, deps);
  assert.equal(options.status, 204);
});

test('Google Places in the app: OFF by default, works only with a Worker address, 429 = limit message, results kept in memory only', async () => {
  assert.equal(placesEnabled({}), false);
  assert.equal(placesEnabled({ placesEnabled: true, placesWorkerUrl: '' }), false);
  assert.equal(placesEnabled({ placesEnabled: true, placesWorkerUrl: 'http://not-secure.example' }), false);
  assert.equal(placesEnabled({ placesEnabled: true, placesWorkerUrl: 'https://w.example' }), true);
  const off = await googleNearby(centre, ['food'], { settings: {}, doFetch: async () => { throw new Error('must not be called'); } });
  assert.equal(off.off, true);
  const settings = { placesEnabled: true, placesWorkerUrl: 'https://w.example' };
  clearGoogleMemory();
  let asked = 0;
  const doFetch = async () => { asked++; return { places: [{ id: 'g1', name: 'Hotel Palace', lat: 27.96, lng: 75.24, category: 'lodging' }] }; };
  const first = await googleNearby(centre, ['lodging', 'copy', 'toilet'], { settings, doFetch });
  assert.equal(first.places.length, 1); assert.ok(first.places[0].distanceKm > 1);
  await googleNearby(centre, ['lodging', 'copy', 'toilet'], { settings, doFetch });
  assert.equal(asked, 1);                                                                   // the second time comes from memory
  assert.equal((await googleNearby(centre, ['copy', 'toilet'], { settings, doFetch })).places.length, 0);   // kinds without a Google type are not asked
  assert.equal(asked, 1);
  clearGoogleMemory();
  const limited = await googleNearby(centre, ['food'], { settings, doFetch: async () => { throw new NetError('rate'); } });
  assert.equal(limited.limitReached, true);
  assert.match(googlePlaceUrl({ id: 'g1', name: 'Hotel Palace' }), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Hotel%20Palace&query_place_id=g1$/);
});

test('Google data is never written to storage or the plan (policy: only the place id may be stored)', async () => {
  const { readFileSync } = await import('node:fs');
  const client = readFileSync('src/services/googlePlaces.js', 'utf8');
  assert.ok(!/localStorage|cacheSet|savePlan|persistentLru/.test(client.replace(/\/\/.*$/gm, '')));       // (comments excluded)
  const planUi = readFileSync('src/ui/plan.js', 'utf8');
  assert.ok(!/storeNearby\([^)]*google/i.test(planUi));
});

test('whole town: when the town centre is far from the pin, the places around the town centre are added, with their distance from the exam centre', async () => {
  base = 28.01;
  const townCentre = { lat: 28.01 + 0.09, lng: centre.lng };      // about 10 km away
  const photon = async (term, near) => (near.lat === townCentre.lat && term === 'hotel' ? [{ id: 'town-hotel', name: 'Hotel City Centre', lat: townCentre.lat, lng: townCentre.lng, osmKey: 'tourism', osmValue: 'hotel' }] : []);
  const out = await fetchNearby({ ...centre, lat: 28.01 }, { overpass: async () => ({ elements: [] }), search: async () => [], photon, town: async () => [townCentre] });
  const hotel = out.items.find((i) => i.id === 'town-hotel');
  assert.ok(hotel && hotel.category === 'lodging');
  assert.ok(Math.abs(hotel.distanceKm - 10) < 1, `distance from the exam centre: ${hotel.distanceKm}`);
});

// ---------------------------------------------------------------- the "Find more places with Google Maps" button
import { googleView, googleCounts, countsText, GOOGLE_KINDS } from '../src/logic/googleView.js';
import { googleRemembered } from '../src/services/googlePlaces.js';

const labels = { food: 'Food', lodging: 'Stay', pharmacy: 'Medical', atm: 'ATM', fuel: 'Petrol', bus: 'Bus', rail: 'Rail' };
const messages = { unavailable: 'Google Maps search is not available right now', none: 'Google Maps found nothing near here.' };
const many = (kind, n, start = 0.3) => Array.from({ length: n }, (_, i) => ({ id: `${kind}${i}`, name: `${kind} ${i}`, category: kind, lat: 27.95, lng: 75.24, distanceKm: start + i * 0.1 }));

test('button: only there when Google is set up, and only until the results are in', () => {
  assert.equal(googleView({ enabled: false, state: { status: 'idle', places: [] }, labels, messages }).visible, false);       // no Worker address: nothing at all
  const idle = googleView({ enabled: true, state: { status: 'idle', places: [] }, labels, messages });
  assert.deepEqual([idle.visible, idle.showButton], [true, true]);
  assert.equal(googleView({ enabled: true, state: { status: 'loading', places: [] }, labels, messages }).loading, true);
  assert.equal(googleView({ enabled: true, state: { status: 'loading', places: [] }, labels, messages }).showButton, false);
  const done = googleView({ enabled: true, state: { status: 'done', places: many('food', 2) }, labels, messages });
  assert.equal(done.showButton, false);                                                                                       // asking again is not offered: the answer is already there
});

test('count display: "Food: 18 · Stay: 6 · Medical: 9 · ATM: 4", kinds with none left out, places grouped by kind, nearest first', () => {
  const places = [...many('food', 18), ...many('lodging', 6), ...many('pharmacy', 9), ...many('atm', 4)].reverse();
  assert.equal(countsText(places, labels), 'Food: 18 · Stay: 6 · Medical: 9 · ATM: 4');
  assert.deepEqual(googleCounts(places), { food: 18, lodging: 6, pharmacy: 9, atm: 4, fuel: 0, bus: 0, rail: 0 });
  const v = googleView({ enabled: true, state: { status: 'done', places }, labels, messages });
  assert.equal(v.summary, 'Food: 18 · Stay: 6 · Medical: 9 · ATM: 4');
  assert.deepEqual(v.kinds.map((k) => k.kind), ['food', 'lodging', 'pharmacy', 'atm']);
  const food = v.kinds[0].places.map((p) => p.distanceKm);
  assert.deepEqual(food, food.slice().sort((a, b) => a - b));
  assert.equal(googleView({ enabled: true, state: { status: 'done', places: [] }, labels, messages }).message, messages.none);
});

test('daily limit reached or Google not set up: the message replaces the button; nothing else is hidden by it', () => {
  for (const status of ['limit', 'unavailable']) {
    const v = googleView({ enabled: true, state: { status, places: [] }, labels, messages });
    assert.equal(v.message, messages.unavailable);
    assert.equal(v.showButton, false);
    assert.equal(v.summary, '');
  }
});

test('one tap = one search, remembered for the plan: the second tap (even with other kinds) costs nothing', async () => {
  clearGoogleMemory();
  const settings = { placesEnabled: true, placesWorkerUrl: 'https://w.example' };
  let asked = 0; let lastBody;
  const doFetch = async (url, init) => { asked++; lastBody = JSON.parse(init.body); return { places: [{ id: 'g1', name: 'Hotel Palace', lat: 27.96, lng: 75.24, category: 'lodging' }] }; };
  const first = await googleNearby(centre, GOOGLE_KINDS, { settings, doFetch, cacheKey: 'plan:p1' });
  assert.equal(asked, 1);                                                    // ONE request to the Worker (which groups the kinds into at most 4 Google calls)
  assert.deepEqual(lastBody.categories, GOOGLE_KINDS);
  assert.equal(first.places.length, 1);
  assert.ok(googleRemembered('plan:p1'));
  await googleNearby(centre, GOOGLE_KINDS, { settings, doFetch, cacheKey: 'plan:p1' });
  await googleNearby(centre, ['food'], { settings, doFetch, cacheKey: 'plan:p1' });
  assert.equal(asked, 1);
  await googleNearby(centre, GOOGLE_KINDS, { settings, doFetch, cacheKey: 'plan:p2' });   // another plan is another search
  assert.equal(asked, 2);
  clearGoogleMemory();
  assert.equal(googleRemembered('plan:p1'), null);                         // gone when the app is closed: Google's terms allow only the place id to be stored
});

test('the screens wire the button: it asks only on a tap, never by itself, and the free list and Google Maps links stay', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['src/ui/plan.js', 'src/ui/summary.js']) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /async function askGoogle/);
    assert.match(src, /onAsk: askGoogle/);
    assert.ok(!/loadGoogle/.test(src), `${file} must not ask Google by itself`);
    assert.ok(/placesEnabled\(\)/.test(src));
    assert.ok(!/localStorage|savePlan\([^)]*google|storeNearby\([^)]*google/i.test(src.replace(/\/\/.*$/gm, '')));
  }
  const list = readFileSync('src/ui/nearbyList.js', 'utf8');
  assert.match(list, /googleView\(/);
  assert.match(list, /t\('googleFind'\)/);                                    // "Find more places with Google Maps"
  assert.match(list, /t\('googleFrom'\)[^\n]*Google Maps/);                   // "from Google Maps" + the text "Google Maps" (attribution)
  assert.match(list, /mapsBlock\(\), googleBlock\(\)/);                       // the free "See all places on Google Maps" block stays above it
});
