import test from 'node:test';
import assert from 'node:assert/strict';
import { geoUrl, osmUrl, distanceText } from '../src/logic/placeLinks.js';
import { chooseStart, saveLastStart, lastStart, nearestHub } from '../src/flow/startPoint.js';
import { findCentre, isRoughArea, addressWordStarts, extraQueries } from '../src/flow/centreFinder.js';
import { buildDraft, leaveForDay } from '../src/flow/autoPlan.js';
import { extractExamFields } from '../src/ingest/examFields.js';
import { linesFromText } from '../src/ingest/layout.js';

// a tiny localStorage for these tests (the app uses the browser's)
function withStorage(fn) {
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
  return fn().finally(() => { delete globalThis.localStorage; });
}

test('map links: geo: link for the phone map app, OpenStreetMap link as back-up, no Google', () => {
  const p = { name: 'Raju Medical Store (Main)', lat: 26.8150327, lng: 83.4001901 };
  assert.equal(geoUrl(p), 'geo:26.815033,83.400190?q=26.815033,83.400190(Raju%20Medical%20Store%20%20Main)');
  assert.equal(geoUrl({ lat: 1, lng: 2 }), 'geo:1.000000,2.000000?q=1.000000,2.000000');
  assert.match(osmUrl(p), /^https:\/\/www\.openstreetmap\.org\/\?mlat=26\.815033&mlon=83\.400190#map=18\//);
  assert.ok(!geoUrl(p).includes('google') && !osmUrl(p).includes('google'));
  assert.equal(distanceText(0.19), '190 m');
  assert.equal(distanceText(0.004), '10 m');
  assert.equal(distanceText(1.449), '1.4 km');
});

test('start point: location first, then the last saved start point, then nothing (the screen asks)', async () => {
  await withStorage(async () => {
    assert.equal(lastStart(), null);
    assert.deepEqual(chooseStart({ ok: false, reason: 'denied' }), { start: null, reason: 'denied' });
    saveLastStart({ lat: 26.7576, lng: 83.3689, label: 'Gorakhpur Junction' });
    assert.equal(lastStart().label, 'Gorakhpur Junction');
    const refused = chooseStart({ ok: false, reason: 'denied' });
    assert.equal(refused.start.source, 'saved');
    assert.equal(refused.start.label, 'Gorakhpur Junction');
    assert.equal(refused.reason, 'denied');
    const gps = chooseStart({ ok: true, lat: 26.8, lng: 83.4 });
    assert.equal(gps.start.source, 'gps');
    assert.equal(chooseStart(null).start.source, 'saved');
    saveLastStart({ lat: NaN, lng: 1 });                       // junk is ignored
    assert.equal(lastStart().label, 'Gorakhpur Junction');
  });
});

test('nearest hub: the first railway station or bus stand from the list', async () => {
  const fetchHubs = async () => ({ rail: [{ name: 'Gorakhpur Junction', lat: 26.7576, lng: 83.3689 }], bus: [] });
  assert.deepEqual(await nearestHub({ lat: 26.8, lng: 83.4 }, 'rail', { fetchHubs }), { lat: 26.7576, lng: 83.3689, label: 'Gorakhpur Junction' });
  assert.equal(await nearestHub({ lat: 26.8, lng: 83.4 }, 'bus', { fetchHubs }), null);
});

test('centre finder: a postcode area is only a rough place (never "high"), and a named road near the pincode area can beat it', async () => {
  const postcodeArea = [{ lat: 26.815, lng: 83.4, label: '273013, Gorakhpur, Uttar Pradesh, India', address: { postcode: '273013', city: 'Gorakhpur' }, kind: 'place:postcode' }];
  const search = async () => postcodeArea;
  const rough = await findCentre({ centreName: 'Neta Jee Subhash Chandra Bose Degree College', address: 'Tura Bazar, Pipraich Road, Gorakhpur - 273013', pincode: '273013', city: 'Gorakhpur' },
    { search, institutions: async () => [], features: async () => [] });
  assert.equal(rough.found, true);
  assert.equal(rough.confidence, 'low');
  assert.ok(isRoughArea({ kind: 'place:postcode' }) && !isRoughArea({ kind: 'amenity:college' }));

  const features = async (area, starts) => { assert.ok(starts.includes('pipra')); return [{ name: 'Pipraich Road', lat: 26.83, lng: 83.42, isRoad: true, tags: { highway: 'primary' } }, { name: 'Other', lat: 26.9, lng: 83.9, isRoad: true, tags: { highway: 'primary' } }]; };
  const better = await findCentre({ centreName: 'Neta Jee Subhash Chandra Bose Degree College', address: 'Tura Bazar, Pipraich Road, Gorakhpur - 273013', pincode: '273013', city: 'Gorakhpur' },
    { search, institutions: async () => [], features });
  assert.equal(better.usedQuery, 'named places');
  assert.ok(Math.abs(better.lat - 26.83) < 1e-6);
  assert.notEqual(better.confidence, 'high');                  // a road is a hint, the user still checks the pin
});

test('centre finder: word starts and extra searches come from the unusual words of the address', () => {
  const starts = addressWordStarts({ centreName: 'Neta Jee Subhash Chandra Bose Online Examination Center', address: 'Tura Bazar, Pipraich Road, Jungle Aurahi, Gorakhpur, Uttar Pradesh' });
  assert.ok(starts.includes('subha') && starts.includes('pipra') && starts.includes('aurah'));
  assert.ok(!starts.includes('onlin') && !starts.includes('india'));
  const q = extraQueries({ centreName: 'Neta Jee Subhash Chandra Bose Online Examination Center, Neta Jee Subhash Chandra Bose Degree College', address: 'Tura Bazar, Pipraich Road, Jungle Aurahi, Near Indian Oil Petrol Pump, Gorakhpur', pincode: '273013', city: 'Gorakhpur' });
  assert.ok(q.some((x) => x.q === 'Neta Jee Subhash Chandra Bose Degree College, Gorakhpur'));
  assert.ok(q.some((x) => x.q === 'Pipraich Road, Gorakhpur' || x.q === 'Tura Bazar, Gorakhpur'));
});

test('past exam date: still yellow, but everything is planned (centre, route, leave-by, nearby)', async () => {
  const text = ['Exam Date: 23.01.2026', 'Reporting Time: 07.00AM (IST)', 'Exam Centre: Demo School', 'Centre Address: Sector 9, Chandigarh - 160009'].join('\n');
  const read = { result: extractExamFields(linesFromText(text), { sourceConf: 100 }), source: 't' };
  const deps = {
    findCentre: async () => ({ found: true, lat: 30.7, lng: 76.8, label: 'x', confidence: 'high', tried: [], postcode: '160009', pincodeDistanceKm: 1 }),
    routeFor: async () => ({ route: { distanceKm: 8, durationMin: 25, geometry: [[30.7, 76.8]] }, error: null }),
    fetchNearby: async () => ({ items: [{ category: 'food' }], emptyTypes: [] }),
  };
  const draft = await buildDraft(read, { location: { ok: true, lat: 1, lng: 1 }, deps, now: new Date('2026-10-06') });   // the card date is long past
  assert.ok(draft.read.days[0].date.flag);                                    // the yellow warning stays
  assert.match(draft.read.days[0].date.note, /passed/);
  assert.ok(draft.centre && draft.route && draft.nearbyCount === 1);
  assert.equal(leaveForDay(draft, draft.read.days[0]).text, '05:35');         // 07:00 - 25 min - 60 min buffer
});
