import test from 'node:test';
import assert from 'node:assert/strict';
import { findCentre, nameSimilarity, extraQueries } from '../src/flow/centreFinder.js';

// a pretend Nominatim that knows a few places
const places = {
  'Panjab University, Sector 14, Chandigarh - 160014': [{ lat: 30.7589, lng: 76.7685, label: 'Panjab University, Sector 14, Chandigarh, 160014', address: { postcode: '160014', city: 'Chandigarh' }, kind: 'amenity:university' }],
  '160014': [{ lat: 30.76, lng: 76.77, label: '160014, Chandigarh', address: { postcode: '160014', city: 'Chandigarh' }, kind: 'place:postcode' }],
};
const fakeSearch = (log) => async (q) => { log.push(q); return places[q] || []; };

test('nameSimilarity: key words, one wrong letter allowed, generic words ignored', () => {
  assert.equal(nameSimilarity('Panjab University', 'Panjab University, Sector 14, Chandigarh'), 1);
  assert.equal(nameSimilarity('Panjab Universty', 'Panjab University, Sector 14'), 1);
  assert.equal(nameSimilarity('Government College', 'Some Other Government College'), 0);   // only generic words: nothing to compare
  assert.ok(nameSimilarity('DAV College', 'DAV Public School') >= 1);
  assert.equal(nameSimilarity('', 'x'), 0);
});

test('findCentre: full address found, high confidence, pincode matches', async () => {
  const log = [];
  const r = await findCentre({ centreName: 'Panjab University', address: 'Sector 14, Chandigarh - 160014', pincode: '160014', city: 'Chandigarh' }, { search: fakeSearch(log), institutions: async () => [], features: async () => [] });
  assert.ok(r.found);
  assert.equal(r.confidence, 'high');
  assert.equal(r.postcode, '160014');
  assert.ok(r.pincodeDistanceKm < 3);
});

test('findCentre: falls back to shorter searches and tells which was used', async () => {
  const log = [];
  const search = async (q) => { log.push(q); return q === '160014' ? places['160014'] : []; };
  const r = await findCentre({ centreName: 'Panjab University', address: 'Sector 14, Chandigarh - 160014', pincode: '160014', city: 'Chandigarh' }, { search, institutions: async () => [], features: async () => [] });
  assert.ok(r.found);
  assert.equal(r.usedQuery, 'pincode only');
  assert.notEqual(r.confidence, 'high');   // only the pincode area: a rough pin, so the user is asked to check it
  assert.ok(log.length > 2);
});

test('findCentre: nothing found at all', async () => {
  const r = await findCentre({ centreName: 'Nowhere School', address: 'Nowhere', pincode: '', city: '' }, { search: async () => [], institutions: async () => [], features: async () => [] });
  assert.equal(r.found, false);
});

test('findCentre: a nearby school with a matching name beats a weak guess', async () => {
  const search = async (q) => (q === '110042' ? [{ lat: 28.75, lng: 77.12, label: '110042, Delhi', address: { postcode: '110042' }, kind: 'place:postcode' }] : []);
  const institutions = async () => [{ name: 'Delhi Technological University', lat: 28.7498, lng: 77.1177 }, { name: 'Some Primary School', lat: 28.76, lng: 77.1 }];
  const r = await findCentre({ centreName: 'Delhi Technological University', address: 'Shahbad Daulatpur, Delhi - 110042', pincode: '110042', city: 'Delhi' }, { search, institutions });
  assert.equal(r.usedQuery, 'nearby institutions');
  assert.ok(Math.abs(r.lat - 28.7498) < 1e-6);
});

test('findCentre: a result in the wrong place (pincode far away) is not high confidence', async () => {
  const search = async (q) => {
    if (q === '160014') return [{ lat: 30.76, lng: 76.77, label: '160014', address: { postcode: '160014' }, kind: 'place:postcode' }];
    return [{ lat: 26.9, lng: 75.8, label: 'Panjab University Jaipur', address: { postcode: '302001', city: 'Jaipur' }, kind: 'amenity:university' }];
  };
  const r = await findCentre({ centreName: 'Panjab University', address: 'Sector 14, Chandigarh - 160014', pincode: '160014', city: 'Chandigarh' }, { search, institutions: async () => [], features: async () => [] });
  assert.notEqual(r.confidence, 'high');
});

test('extraQueries: street and city, centre name and street', () => {
  const q = extraQueries({ centreName: 'ABC School', address: 'Plot 5, Gandhi Marg, Patna - 800001', pincode: '800001', city: 'Patna' });
  assert.ok(q.some((x) => x.q.includes('Gandhi Marg')));
  assert.ok(!q.some((x) => /Plot/.test(x.q)));
});

// ---- any town: the chain, and no match in the wrong state or the wrong postal district
const card = { centreName: 'Sunrise Public School', address: 'Station Road, Examplepur, Some State 345678', pincode: '345678', city: 'Examplepur', state: 'rajasthan' };

test('chain order: full address, centre name + city, centre name + pincode, street + city, then the pincode area', async () => {
  const asked = [];
  await findCentre(card, { search: async (q) => { asked.push(q); return []; }, institutions: async () => [], features: async () => [] });
  const at = (text) => asked.findIndex((q) => q.includes(text));
  assert.equal(asked[0], '345678');                                                      // the pincode area is looked up first, to judge every candidate
  assert.ok(at('Station Road, Examplepur, Some State') >= 0 && at('Station Road, Examplepur, Some State') < at('Sunrise Public School, Examplepur'));
  assert.ok(at('Sunrise Public School, Examplepur') < at('Sunrise Public School, 345678'));
});

test('a match in the wrong state is rejected, even if the name fits', async () => {
  const wrong = { lat: 12.9, lng: 77.6, label: 'Sunrise Public School, Elsewhere', address: { state: 'Karnataka', postcode: '345678', city: 'Elsewhere' }, kind: 'amenity:school' };
  const r = await findCentre(card, { search: async () => [wrong], institutions: async () => [], features: async () => [] });
  assert.ok(!r.found || r.lat !== 12.9, 'the Karnataka result must not be used');
  assert.ok(r.rejected >= 1);
});

test('a match with a pincode from another postal district is rejected; one with the same district stays', async () => {
  const other = { lat: 26.0, lng: 75.0, label: 'Sunrise Public School', address: { state: 'Rajasthan', postcode: '110001', city: 'Examplepur' }, kind: 'amenity:school' };
  const near = { lat: 26.1, lng: 75.1, label: 'Sunrise Public School, Station Road', address: { state: 'Rajasthan', postcode: '345679', city: 'Examplepur' }, kind: 'amenity:school' };
  const r = await findCentre(card, { search: async (q) => (q === '345678' ? [] : [other, near]), institutions: async () => [], features: async () => [] });
  assert.ok(r.found); assert.equal(r.lat, 26.1);
  assert.equal(r.rejected >= 1, true);
});

test('only the pincode area is found: the pin is "low" (yellow) and the user can drag it, in any town', async () => {
  const area = { lat: 26.5, lng: 75.5, label: '345678, Examplepur', address: { postcode: '345678', state: 'Rajasthan' }, kind: 'place:postcode' };
  const r = await findCentre(card, { search: async (q) => (q === '345678' ? [area] : []), institutions: async () => [], features: async () => [] });
  assert.ok(r.found); assert.equal(r.confidence, 'low');
});
