import test from 'node:test';
import assert from 'node:assert/strict';
import { pickClosest } from '../src/logic/nearby.js';
import { buildPlaceIndex, suggestPlaces, findCorrections } from '../src/logic/places.js';
import { extractFieldsBest, extractFields } from '../src/logic/extract.js';
import { haversineMetres } from '../src/dsa/haversine.js';
import { SAMPLES } from './samples.js';
import { makeRng } from './rng.js';

const centre = { lat: 30.7333, lng: 76.7794 };

test('pickClosest: empty, one item, outside radius', () => {
  assert.deepEqual(pickClosest([], centre), []);
  const one = pickClosest([{ category: 'atm', lat: 30.7335, lng: 76.7794 }], centre);
  assert.equal(one.length, 1);
  assert.ok(one[0].distanceKm < 0.05);
  assert.deepEqual(pickClosest([{ category: 'atm', lat: 30.9, lng: 76.9 }], centre), []);
});

test('pickClosest: 200 random sets match "filter, sort, take 5 per type"', () => {
  const rng = makeRng(20);
  const kinds = ['food', 'atm', 'toilet'];
  for (let run = 0; run < 200; run++) {
    const items = Array.from({ length: rng.int(0, 60) }, (_, i) => ({
      id: i, category: kinds[rng.int(0, 2)], lat: centre.lat + rng.float(-0.012, 0.012), lng: centre.lng + rng.float(-0.012, 0.012),
    }));
    const fast = pickClosest(items, centre, { radiusMetres: 1000, perType: 5 });
    const slow = [];
    for (const kind of kinds) {
      items.filter((x) => x.category === kind && haversineMetres(centre.lat, centre.lng, x.lat, x.lng) <= 1000)
        .map((x) => ({ ...x, d: haversineMetres(centre.lat, centre.lng, x.lat, x.lng) }))
        .sort((a, b) => a.d - b.d).slice(0, 5).forEach((x) => slow.push(x));
    }
    slow.sort((a, b) => a.d - b.d);
    assert.deepEqual(fast.map((x) => Math.round(x.distanceKm * 1e6)), slow.map((x) => Math.round(x.d * 1e3)));
    for (let i = 1; i < fast.length; i++) assert.ok(fast[i - 1].distanceKm <= fast[i].distanceKm);
  }
});

const places = [
  { name: 'Chandigarh', weight: 100, kind: 'city', lat: 30.73, lon: 76.77 },
  { name: 'Chandigarh Railway Station', weight: 90, kind: 'station', lat: 30.70, lon: 76.82 },
  { name: 'Sector 17 Plaza', weight: 50, kind: 'neighbourhood', lat: 30.74, lon: 76.78 },
  { name: 'Mohali', weight: 80, kind: 'city', lat: 30.70, lon: 76.72 },
  { name: 'Panchkula', weight: 80, kind: 'city', lat: 30.69, lon: 76.85 },
  { name: 'Lucknow', weight: 45, kind: 'city', lat: null, lon: null },
];

test('places: suggestions by prefix, by later word, deduplicated, none for short input', () => {
  const index = buildPlaceIndex(places);
  assert.deepEqual(suggestPlaces(index, 'chand').map((p) => p.name), ['Chandigarh', 'Chandigarh Railway Station']);
  assert.equal(suggestPlaces(index, 'rail')[0].name, 'Chandigarh Railway Station');   // found from its second word
  assert.deepEqual(suggestPlaces(index, 'c'), []);
  assert.deepEqual(suggestPlaces(index, 'zzzz'), []);
  assert.deepEqual(suggestPlaces(null, 'chand'), []);
  assert.equal(suggestPlaces(index, 'luck')[0].lat, null);                               // exam city without coordinates
});

test('places: "Did you mean" fixes OCR mistakes but never touches correct words', () => {
  const index = buildPlaceIndex(places);
  assert.deepEqual(findCorrections(index, 'Plot 4, Chandigrah, Panchkla').map((h) => [h.from, h.to]), [['Chandigrah', 'Chandigarh'], ['Panchkla', 'Panchkula']]);
  assert.deepEqual(findCorrections(index, 'Chandigarh Mohali Sector Road'), []);
  assert.deepEqual(findCorrections(index, ''), []);
  assert.deepEqual(findCorrections(null, 'Chandigrah'), []);
});

test('extractFieldsBest: never worse than the old extractor on every sample', () => {
  for (const s of SAMPLES) {
    const best = extractFieldsBest(s.text);
    const old = extractFields(s.text);
    for (const key of Object.keys(old)) if (old[key]) assert.ok(best[key], `${s.name}: ${key} must not become empty`);
    for (const [k, v] of Object.entries(s.expect)) assert.equal(best[k], v, `${s.name}: ${k}`);
  }
});
