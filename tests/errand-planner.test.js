import test from 'node:test';
import assert from 'node:assert/strict';
import { planErrands } from '../src/dsa/errandPlanner.js';
import { makeRng } from './rng.js';

/** Brute force: every order of the kinds times every choice of shop. Only for checking the DP. */
function bruteForce({ travel, start, centre, groups, dwell }) {
  const T = groups.length;
  if (groups.some((g) => !g.length)) return null;
  let best = Infinity;
  const used = new Array(T).fill(false);
  const go = (place, doneKinds, cost) => {
    if (cost >= best) return;
    if (doneKinds === T) { best = Math.min(best, cost + travel[place][centre]); return; }
    for (let g = 0; g < T; g++) {
      if (used[g]) continue;
      used[g] = true;
      for (const c of groups[g]) go(c, doneKinds + 1, cost + travel[place][c] + dwell[g]);
      used[g] = false;
    }
  };
  go(start, 0, 0);
  return best;
}

function randomCase(rng, T, perKind) {
  const groups = []; let n = 2;                       // 0 = home, 1 = centre
  for (let g = 0; g < T; g++) { const list = []; const count = rng.int(1, perKind); for (let k = 0; k < count; k++) list.push(n++); groups.push(list); }
  // not symmetric on purpose (one-way roads), not metric either: the DP must not rely on either
  const travel = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : rng.int(1, 60))));
  return { travel, start: 0, centre: 1, groups, dwell: Array.from({ length: T }, () => rng.int(0, 15)) };
}

test('DP gives the same total time as brute force on 300 random inputs (1 to 4 kinds, up to 5 shops each, unequal travel times)', () => {
  const rng = makeRng(2026);
  for (let i = 0; i < 300; i++) {
    const c = randomCase(rng, rng.int(1, 4), 5);
    const dp = planErrands(c); const bf = bruteForce(c);
    assert.equal(dp.totalMin, bf, `case ${i}`);
  }
});

test('the order and shops it returns really add up to the total (kinds once each, shop of the right kind, times in order)', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 100; i++) {
    const c = randomCase(rng, rng.int(1, 4), 5);
    const r = planErrands(c);
    const seen = new Set();
    let at = c.start; let clock = 0;
    for (const stop of r.order) {
      assert.ok(c.groups[stop.group].includes(stop.node), 'a shop of that kind');
      assert.ok(!seen.has(stop.group)); seen.add(stop.group);
      clock += c.travel[at][stop.node];
      assert.equal(stop.arriveMin, clock);
      clock += c.dwell[stop.group];
      assert.equal(stop.departMin, clock);
      at = stop.node;
    }
    assert.equal(seen.size, c.groups.length);
    clock += c.travel[at][c.centre];
    assert.equal(r.totalMin, clock);
    assert.equal(r.centreArriveMin, clock);
    assert.equal(r.travelMin + r.dwellMin, r.totalMin);
  }
});

test('no stops: straight home to centre; a kind without a shop: null (the caller drops that kind first)', () => {
  const travel = [[0, 25], [30, 0]];
  const r = planErrands({ travel, start: 0, centre: 1, groups: [], dwell: [] });
  assert.equal(r.totalMin, 25); assert.deepEqual(r.order, []);
  assert.equal(planErrands({ travel, start: 0, centre: 1, groups: [[]], dwell: [5] }), null);
});

test('a worked example: the shop on the way beats the nearer shop that is a detour', () => {
  // places: 0 home, 1 centre, 2 ATM-near (detour), 3 ATM-onway, 4 copy-onway
  const travel = [
    [0, 30, 5, 12, 14],
    [30, 0, 40, 20, 18],
    [5, 40, 0, 20, 22],
    [12, 20, 20, 0, 4],
    [14, 18, 22, 4, 0],
  ];
  const r = planErrands({ travel, start: 0, centre: 1, groups: [[2, 3], [4]], dwell: [5, 10] });
  assert.deepEqual(r.order.map((s) => s.node), [3, 4]);          // ATM on the way (3), then the copy shop (4)
  assert.equal(r.totalMin, 12 + 5 + 4 + 10 + 18);
});

test('too many kinds is refused; the DP stays fast for 8 kinds with 3 shops each', () => {
  const rng = makeRng(5);
  const big = randomCase(rng, 8, 3);
  const t0 = Date.now(); const r = planErrands(big); const ms = Date.now() - t0;
  assert.ok(r && ms < 2000, `${ms} ms`);
  assert.throws(() => planErrands({ ...big, groups: [...big.groups, [2], [2]] }), /too many/);
});
