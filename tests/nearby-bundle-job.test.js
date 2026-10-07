import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBundle } from '../src/services/bundledNearby.js';
import { storeNearby, runNearbyAttempt, startNearbyJob, resumeNearbyJobs, stopNearbyJobs, RETRY_WINDOW_MS } from '../src/flow/nearbyJob.js';
import { newPlan, savePlan, getPlan } from '../src/store.js';
import { searchGeoUrl, searchOsmUrl, mapsSearchUrl, isPhone } from '../src/logic/placeLinks.js';
import { CATEGORIES } from '../src/services/categories.js';

// a tiny localStorage for these tests (the app uses the browser's)
const memory = {};
globalThis.localStorage = { getItem: (k) => (k in memory ? memory[k] : null), setItem: (k, v) => { memory[k] = String(v); }, removeItem: (k) => { delete memory[k]; } };

const ids = CATEGORIES.map((c) => c.id);
const AREA = { south: 30.0, west: 76.0, north: 30.5, east: 76.5 };
// places along a line east of 30.25, 76.25: food at 200 m, 400 m, 600 m; a pharmacy 1.5 km away (only found after widening); nothing else
const at = (lngOffset) => Math.round((76.25 + lngOffset) * 1e5);
const bundle = makeBundle({ area: AREA, scale: 1e5, types: ids, places: [
  [ids.indexOf('food'), Math.round(30.25 * 1e5), at(0.002), 'Food A'], [ids.indexOf('food'), Math.round(30.25 * 1e5), at(0.004), 'Food B'], [ids.indexOf('food'), Math.round(30.25 * 1e5), at(0.006), 'Food C'],
  [ids.indexOf('pharmacy'), Math.round(30.25 * 1e5), at(0.016), 'Chem Far'],
] });

test('bundled places: instant answer inside the area, widening like the live search, nothing outside the area or near its edge', () => {
  const centre = { lat: 30.25, lng: 76.25 };
  assert.equal(bundle.covers(centre), true);
  assert.equal(bundle.covers({ lat: 30.49, lng: 76.25 }), false);       // too near the edge: places beyond it are missing, the live search is used
  assert.equal(bundle.covers({ lat: 28.6, lng: 77.2 }), false);
  const out = bundle.nearby(centre);
  assert.equal(out.bundled, true);
  assert.equal(out.items.filter((i) => i.category === 'food').length, 3);
  const chem = out.items.filter((i) => i.category === 'pharmacy');
  assert.equal(chem.length, 1);                                           // 1.5 km: found because the type was widened from 1 km to 2 km
  assert.equal(out.radiusByType.pharmacy, 5000);                          // fewer than 3 places: widened up to 5 km, like the live search
  assert.equal(out.radiusByType.food, 1000);
  assert.deepEqual(out.failedTypes, []);
  assert.ok(out.emptyTypes.includes('toilet'));
  assert.ok(out.items.every((i) => i.distanceKm >= 0 && i.source === 'bundled'));
});

test('maps-app search buttons: geo: link on a phone, OpenStreetMap search link on a laptop, never Google', () => {
  const centre = { lat: 30.25, lng: 76.25 };
  assert.equal(searchGeoUrl(centre, 'hotel'), 'geo:30.250000,76.250000?q=hotel');
  assert.match(searchOsmUrl(centre, 'petrol pump'), /^https:\/\/www\.openstreetmap\.org\/search\?query=petrol%20pump&lat=30\.25000&lon=76\.25000#map=15\/30\.25000\/76\.25000$/);
  assert.equal(isPhone({ userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome Mobile' }), true);
  assert.equal(isPhone({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' }), false);
  assert.equal(isPhone({ userAgentData: { mobile: true }, userAgent: '' }), true);
  assert.ok(mapsSearchUrl(centre, 'ATM', { userAgent: 'iPhone' }).startsWith('geo:'));
  assert.ok(mapsSearchUrl(centre, 'ATM', { userAgent: 'Macintosh' }).startsWith('https://www.openstreetmap.org/'));
  for (const c of CATEGORIES) assert.ok(c.search && c.search.length > 2, `${c.id} has a search word for the maps button`);
});

function planWithCentre(createdAt = Date.now()) {
  const p = newPlan(); p.centre = { lat: 30.25, lng: 76.25 }; p.fields.city = 'Examplepur'; p.fields.pincode = '123456'; p.createdAt = createdAt; savePlan(p); return p;
}

test('nearby places are saved inside the plan (partial answers too) and marked done only when every type answered', async () => {
  const p = planWithCentre();
  storeNearby(p.id, { items: [{ id: 1, category: 'food' }], failedTypes: [], pendingTypes: ['atm'] });
  assert.equal(getPlan(p.id).nearby.status, 'partial');
  assert.deepEqual(getPlan(p.id).nearby.failedTypes, ['atm']);
  const status = await runNearbyAttempt(p.id, { fetchNearby: async () => ({ items: [{ id: 1, category: 'food' }], failedTypes: [], pendingTypes: [] }) });
  assert.equal(status, 'done');
  assert.equal(getPlan(p.id).nearby.status, 'done');
  assert.equal(getPlan(p.id).nearby.items.length, 1);
});

test('background retries: a failed attempt is retried quietly, only within one hour of the plan being made', async () => {
  stopNearbyJobs();
  const fresh = planWithCentre(Date.now());
  let calls = 0;
  const failing = { fetchNearby: async () => { calls++; return { items: [], failedTypes: ['food'], pendingTypes: [] }; } };
  await startNearbyJob(fresh.id, failing);
  assert.equal(calls, 1);
  assert.equal(getPlan(fresh.id).nearby.status, 'partial');
  stopNearbyJobs();
  // resume at app start: a plan younger than one hour continues, an older one does not
  const old = planWithCentre(Date.now() - RETRY_WINDOW_MS - 60000);
  const done = planWithCentre(Date.now()); storeNearby(done.id, { items: [{ id: 1 }], failedTypes: [], final: true });
  const started = resumeNearbyJobs([getPlan(fresh.id), getPlan(old.id), getPlan(done.id)], Date.now(), { fetchNearby: async () => ({ items: [], failedTypes: ['food'], pendingTypes: [] }) });
  await new Promise((r) => setTimeout(r, 30));
  stopNearbyJobs();
  assert.deepEqual(started, [fresh.id]);
});

test('the real bundled file (data/nearby-tricity.json): small, and a point in the middle of the area gets places of most types at once', async () => {
  const { readFileSync, statSync } = await import('node:fs');
  assert.ok(statSync('data/nearby-tricity.json').size < 400000, 'the file stays small');
  const real = makeBundle(JSON.parse(readFileSync('data/nearby-tricity.json', 'utf8')));
  const out = real.nearby({ lat: 30.7333, lng: 76.7794 });
  assert.equal(out.failedTypes.length, 0);
  const have = ids.filter((id) => out.items.some((i) => i.category === id));
  assert.ok(have.length >= 7, `types with places: ${have.join(',')}`);
  assert.ok(out.items.every((i) => i.distanceKm <= 5.01));
});
