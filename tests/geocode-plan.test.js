import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueries, searchWithFallback, cleanQuery } from '../src/logic/geocode-plan.js';

test('cleanQuery tidies text', () => {
  assert.equal(cleanQuery('A school |\n Demo Road,, \n Pune'), 'A school, Demo Road, Pune');
});

test('buildQueries goes from exact to simple, without repeats', () => {
  const q = buildQueries({ centreName: 'Demo School', address: 'Demo Road, Pune', pincode: '411001', city: 'Pune' });
  assert.equal(q[0].label, 'full address');
  assert.match(q[0].q, /Demo School/);
  assert.match(q[0].q, /411001/);
  assert.equal(q.at(-1).q, '411001');
  assert.equal(new Set(q.map((x) => x.q.toLowerCase())).size, q.length);
});

test('buildQueries with only a pincode', () => {
  assert.deepEqual(buildQueries({ pincode: '411001' }), [{ label: 'pincode only', q: '411001' }]);
  assert.deepEqual(buildQueries({}), []);
});

test('searchWithFallback stops at first hit and reports what was used', async () => {
  const calls = [];
  const fake = async (q) => { calls.push(q); return q === '411001' ? [{ lat: 1, lng: 2 }] : []; };
  const queries = buildQueries({ centreName: 'Demo School', address: 'Demo Road, Pune', pincode: '411001', city: 'Pune' });
  const r = await searchWithFallback(queries, fake);
  assert.equal(r.used.label, 'pincode only');
  assert.equal(r.results.length, 1);
  assert.equal(calls.length, queries.length);
});

test('searchWithFallback returns empty when nothing is found', async () => {
  const r = await searchWithFallback(buildQueries({ address: 'Nowhere Lane' }), async () => []);
  assert.equal(r.used, null);
  assert.deepEqual(r.results, []);
});

test('searchWithFallback does not search more after a hit', async () => {
  let n = 0;
  const r = await searchWithFallback([{ label: 'a', q: 'a' }, { label: 'b', q: 'b' }], async () => { n++; return [1]; });
  assert.equal(n, 1);
  assert.equal(r.used.label, 'a');
});
