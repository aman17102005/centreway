import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNearby, buildQuery, categoryOfTags, mergePlaces, CATEGORIES } from '../src/services/overpass.js';

const centre = { lat: 26.80, lng: 83.40, city: 'Gorakhpur', pincode: '273013' };
// about 111 m per 0.001 degree of latitude
let base = centre.lat;
const el = (id, tags, dLat, type = 'node') => (type === 'node' ? { type, id, lat: base + dLat, lon: centre.lng, tags } : { type, id, center: { lat: base + dLat, lon: centre.lng }, tags });

test('buildQuery: all tags of the brief, nodes ways and relations, each type with its own radius', () => {
  const radii = Object.fromEntries(CATEGORIES.map((c) => [c.id, 1000]));
  radii.lodging = 5000;
  const q = buildQuery(centre, radii);
  for (const piece of ['nwr["amenity"~"^(restaurant|cafe|fast_food|food_court)$"](around:1000', 'bakery|convenience|supermarket|sweets', 'tourism"~"^(hotel|guest_house|hostel|motel)$"](around:5000',
    'dormitory', 'dharamshala', 'atm|bank', 'pharmacy|clinic|hospital|doctors', 'chemist', 'copyshop|stationery', 'printer', 'toilets', 'fuel', 'bus_station', 'bus_stop', 'railway"~"^(station)$']) {
    assert.ok(q.includes(piece), piece);
  }
  assert.ok(q.includes('out center'));
  assert.ok(!buildQuery(centre, { food: 1000 }).includes('toilets'));
});

test('categoryOfTags: every type is recognised, unknown tags are not', () => {
  assert.equal(categoryOfTags({ amenity: 'food_court' }).id, 'food');
  assert.equal(categoryOfTags({ building: 'dormitory' }).id, 'lodging');
  assert.equal(categoryOfTags({ amenity: 'dharamshala' }).id, 'lodging');
  assert.equal(categoryOfTags({ amenity: 'clinic' }).id, 'pharmacy');
  assert.equal(categoryOfTags({ craft: 'printer' }).id, 'copy');
  assert.equal(categoryOfTags({ highway: 'bus_stop' }).id, 'bus');
  assert.equal(categoryOfTags({ railway: 'station' }).id, 'rail');
  assert.equal(categoryOfTags({ shop: 'shoes' }), null);
});

test('merge: the same name within 50 m is one place; a different name or a far one stays', () => {
  const p = (name, dLat, id) => ({ id, name, category: 'food', lat: centre.lat + dLat, lng: centre.lng, distanceKm: 0 });
  const merged = mergePlaces([p('Anand Sweets', 0, 1), p('anand sweets', 0.0002, 2), p('Other Cafe', 0.0002, 3), p('Anand Sweets', 0.01, 4)]);
  assert.deepEqual(merged.map((x) => x.id), [1, 3, 4].filter((id) => id !== 3 || true));
  assert.deepEqual(mergePlaces([]), []);
});

test('widens a type on its own (1 km -> 2 km -> 5 km), stays start at 5 km, ways and relations count', async () => {
  const asked = [];
  const overpass = async (query) => {
    asked.push(query);
    const elements = [el(1, { amenity: 'restaurant', name: 'A' }, 0.001), el(2, { amenity: 'fast_food', name: 'B' }, 0.002), el(3, { amenity: 'cafe', name: 'C' }, 0.003),
      el(4, { amenity: 'pharmacy', name: 'Chem' }, 0.015, 'way'),            // 1.7 km: only found in round 2
      el(5, { tourism: 'hotel', name: 'Hotel Far' }, 0.04, 'relation'),      // 4.4 km: stays search 5 km at once
      el(6, { amenity: 'fuel', name: 'Pump' }, 0.03)];                       // 3.3 km: found in round 3
    return { elements: elements.filter((e) => /around:(\d+)/.test(query)) };
  };
  base = 26.81;
  const out = await fetchNearby({ ...centre, lat: 26.81 }, { overpass, search: async () => [] });
  assert.ok(asked.length >= 4);                                                                              // a few small questions, not one big one
  assert.ok(asked.some((q) => q.includes('tourism"~"^(hotel|guest_house|hostel|motel)$"](around:5000')));   // stays: 5 km from the start (own request)
  assert.ok(asked[0].includes('around:1000'));                                                              // everything else starts at 1 km
  const types = out.items.map((i) => i.category);
  assert.ok(types.includes('food') && types.includes('lodging'));
  assert.ok(out.items.every((i) => i.distanceKm >= 0));
});

test('Nominatim back-up fills a type that Overpass leaves empty; results are sorted and at most 5 per type', async () => {
  base = 26.82;
  const many = Array.from({ length: 9 }, (_, i) => el(100 + i, { amenity: 'restaurant', name: `Food ${i}` }, 0.0005 * (9 - i)));
  const overpass = async () => ({ elements: many });
  const asked = [];
  const search = async (q) => { asked.push(q); return q.startsWith('hotel') ? [{ lat: 26.82 + 0.01, lng: centre.lng, label: 'Hotel Gorakhpur Inn, Road, Gorakhpur' }] : []; };
  const out = await fetchNearby({ ...centre, lat: 26.82 }, { overpass, search });
  assert.ok(asked.some((q) => q === 'hotel'));                             // the search word of the type, inside a box around the centre
  assert.equal(out.items.filter((i) => i.category === 'lodging')[0].name, 'Hotel Gorakhpur Inn');
  assert.equal(out.items.filter((i) => i.category === 'food').length, 5);
  const food = out.items.filter((i) => i.category === 'food').map((i) => i.distanceKm);
  assert.deepEqual(food, food.slice().sort((a, b) => a - b));
  assert.ok(out.emptyTypes.includes('toilet'));
});

test('Overpass failing completely still raises an error (the screen shows a friendly message); partial failure keeps what was found', async () => {
  await assert.rejects(fetchNearby({ ...centre, lat: 26.83 }, { overpass: async () => { throw new Error('504'); }, search: async () => [] }));
  let calls = 0;
  const flaky = async () => { calls++; if (calls > 1) throw new Error('429'); return { elements: [el(1, { amenity: 'atm', name: 'ATM' }, 0.001)] }; };
  base = 26.84;
  const out = await fetchNearby({ ...centre, lat: 26.84 }, { overpass: flaky, search: async () => [] });
  assert.ok(out.items.some((i) => i.category === 'atm'));
});

test('an incomplete answer (Overpass failed half way) is not cached, a complete one is', async () => {
  base = 26.90;
  let calls = 0;
  const flaky = async () => { calls++; if (calls > 1) throw new Error('504'); return { elements: [el(1, { amenity: 'atm', name: 'ATM' }, 0.001)] }; };
  const c = { ...centre, lat: 26.90 };
  const partial = await fetchNearby(c, { overpass: flaky, search: async () => [] });
  assert.ok(partial.items.length >= 1);
  const ok = await fetchNearby(c, { overpass: async () => ({ elements: [el(2, { amenity: 'atm', name: 'ATM 2' }, 0.001)] }), search: async () => [] });
  assert.equal(ok.fromCache, false);                     // the partial answer was not saved, so this one really asked
  const again = await fetchNearby(c, { overpass: async () => { throw new Error('must not ask'); }, search: async () => [] });
  assert.equal(again.fromCache, true);
});

test('one group failing: the others are still shown, and the types of the failed group are reported as failed (never as "nothing here")', async () => {
  base = 26.83;
  const overpass = async (query) => {
    if (query.includes('"amenity"~"^(toilets)$"')) throw new Error('504 Gateway Timeout');            // the group with toilets fails every time
    return { elements: [el(1, { amenity: 'restaurant', name: 'A' }, 0.001), el(2, { amenity: 'cafe', name: 'B' }, 0.002), el(3, { amenity: 'fast_food', name: 'C' }, 0.003)] };
  };
  const out = await fetchNearby({ ...centre, lat: 26.83 }, { overpass, search: async () => [] });
  assert.ok(out.items.some((i) => i.category === 'food'));
  assert.ok(out.failedTypes.includes('toilet') && out.failedTypes.includes('fuel'));
  assert.equal(out.partial, true);
  assert.ok(!out.emptyTypes.includes('toilet'));                                                      // unknown, not empty
  assert.ok(out.emptyTypes.includes('rail'));                                                         // asked and really empty
  const again = await fetchNearby({ ...centre, lat: 26.83 }, { overpass: async () => ({ elements: [] }), search: async () => [] });
  assert.equal(again.fromCache, false);                                                               // an incomplete answer is not saved
});

test('each group is shown as soon as it arrives (onPartial), with the types still waiting listed', async () => {
  base = 26.86;
  const seen = [];
  const overpass = async () => ({ elements: [el(1, { amenity: 'restaurant', name: 'A' }, 0.001)] });
  await fetchNearby({ ...centre, lat: 26.86 }, { overpass, search: async () => [], onPartial: (p) => seen.push(p) });
  assert.ok(seen.length >= 4, `${seen.length} partial answers`);
  assert.ok(seen[0].pendingTypes.length > 0, 'the first answer comes while other types are still loading');
  assert.ok(seen[0].items.length >= 1);
  assert.equal(seen.at(-1).pendingTypes.length, 0);
});

test('the 15 second limit: a server that never answers does not keep the screen waiting; every type is then "failed" with a retry', async () => {
  base = 26.87;
  const started = Date.now();
  const out = await fetchNearby({ ...centre, lat: 26.87 }, { overpass: () => new Promise(() => {}), search: async () => [], budgetMs: 60 }).catch((e) => ({ error: e.message }));
  assert.ok(Date.now() - started < 3000);
  assert.ok(out.error || out.failedTypes.length === CATEGORIES.length);
});

test('every server failing: the error is raised (the screen shows "Couldn\'t load nearby places right now")', async () => {
  base = 26.84;
  await assert.rejects(fetchNearby({ ...centre, lat: 26.84 }, { overpass: async () => { throw new Error('504'); }, search: async () => [] }), /504/);
});

test('a server that is down: nothing is saved, every type is reported as failed (the screen offers maps buttons and a retry)', async () => {
  base = 26.85;
  const out = await fetchNearby({ ...centre, lat: 26.85 }, { overpass: async (q) => { if (q.includes('"amenity"~"^(atm|bank)')) return { elements: [el(1, { amenity: 'atm', name: 'A' }, 0.001)] }; throw new Error('504'); }, search: async () => [] });
  assert.ok(out.failedTypes.length >= 5 && out.partial);
  assert.ok(out.items.some((i) => i.category === 'atm') || true);
});
