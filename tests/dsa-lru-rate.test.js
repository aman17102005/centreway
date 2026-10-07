import test from 'node:test';
import assert from 'node:assert/strict';
import { LRUCache } from '../src/dsa/lruCache.js';
import { RateLimiter } from '../src/dsa/rateLimiter.js';
import { makeRng } from './rng.js';

// A slow, obviously-correct LRU made from a plain array (most recent LAST).
class SlowLRU {
  constructor(cap) { this.cap = cap; this.list = []; }
  get(k) { const i = this.list.findIndex((e) => e[0] === k); if (i < 0) return undefined; const [e] = this.list.splice(i, 1); this.list.push(e); return e[1]; }
  put(k, v) { const i = this.list.findIndex((e) => e[0] === k); if (i >= 0) this.list.splice(i, 1); else if (this.list.length >= this.cap) this.list.shift(); this.list.push([k, v]); }
}

test('lru: get/put basics and eviction of the least recently used', () => {
  const c = new LRUCache(2);
  assert.equal(c.get('a'), undefined);
  c.put('a', 1); c.put('b', 2);
  assert.equal(c.get('a'), 1);   // a is now newest
  c.put('c', 3);                 // evicts b
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('c'), 3);
});

test('lru: capacity 1, overwrite, delete, has does not reorder', () => {
  const c = new LRUCache(1);
  c.put('x', 1); c.put('x', 2);
  assert.equal(c.size, 1);
  assert.equal(c.get('x'), 2);
  c.put('y', 3);
  assert.ok(!c.has('x'));
  assert.ok(c.delete('y'));
  assert.ok(!c.delete('y'));
  const d = new LRUCache(2);
  d.put('a', 1); d.put('b', 2);
  d.has('a');                    // must not make 'a' newest
  d.put('c', 3);
  assert.ok(!d.has('a'));        // 'a' was still the oldest
});

test('lru: entries() / load() round trip keeps order', () => {
  const c = new LRUCache(3);
  c.put('a', 1); c.put('b', 2); c.put('c', 3); c.get('a');
  const saved = c.entries();
  assert.deepEqual(saved.map((e) => e[0]), ['b', 'c', 'a']);
  const d = new LRUCache(3);
  d.load(saved);
  d.put('z', 9); // evicts b
  assert.ok(!d.has('b'));
  assert.ok(d.has('c') && d.has('a') && d.has('z'));
});

test('lru: 200 random runs match the slow list version', () => {
  const rng = makeRng(5);
  for (let run = 0; run < 200; run++) {
    const cap = rng.int(1, 6);
    const fast = new LRUCache(cap);
    const slow = new SlowLRU(cap);
    for (let step = 0; step < 100; step++) {
      const key = `k${rng.int(0, 9)}`;
      if (rng.int(0, 1)) { const v = rng.int(0, 99); fast.put(key, v); slow.put(key, v); }
      else assert.equal(fast.get(key), slow.get(key));
    }
    assert.equal(fast.size, slow.list.length);
  }
});

test('lru: very large input stays within capacity', () => {
  const c = new LRUCache(1000);
  for (let i = 0; i < 100000; i++) c.put(`k${i}`, i);
  assert.equal(c.size, 1000);
  assert.equal(c.get('k99999'), 99999);
  assert.equal(c.get('k0'), undefined);
});

// ---- rate limiter with a fake clock ----
function fakeClock() {
  let time = 0; const timers = [];
  return {
    now: () => time,
    setTimer: (fn, ms) => timers.push({ at: time + ms, fn }),
    // run timers in time order until none are left; returns when finished
    async runAll() {
      for (let guard = 0; guard < 1000; guard++) {
        await Promise.resolve(); await Promise.resolve();
        if (!timers.length) return;
        timers.sort((a, b) => a.at - b.at);
        const t = timers.shift(); time = Math.max(time, t.at); t.fn();
      }
    },
  };
}

test('rateLimiter: starts are at least the gap apart and keep order', async () => {
  const clock = fakeClock();
  const limiter = new RateLimiter(1000, clock);
  const starts = []; const order = [];
  const jobs = [0, 1, 2, 3, 4].map((i) => limiter.schedule(() => { starts.push(clock.now()); order.push(i); return i * 10; }));
  await clock.runAll();
  assert.deepEqual(await Promise.all(jobs), [0, 10, 20, 30, 40]);
  assert.deepEqual(order, [0, 1, 2, 3, 4]);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 1000);
});

test('rateLimiter: a failing task rejects but does not block the others', async () => {
  const clock = fakeClock();
  const limiter = new RateLimiter(500, clock);
  const bad = limiter.schedule(() => { throw new Error('boom'); });
  const good = limiter.schedule(() => 'ok');
  await clock.runAll();
  await assert.rejects(bad, /boom/);
  assert.equal(await good, 'ok');
  assert.equal(limiter.pending, 0);
});

test('rateLimiter: an idle limiter runs the first task at once', async () => {
  const clock = fakeClock();
  const limiter = new RateLimiter(1000, clock);
  const p = limiter.schedule(() => clock.now());
  await clock.runAll();
  assert.equal(await p, 0);
});
