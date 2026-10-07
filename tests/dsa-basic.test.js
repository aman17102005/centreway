import test from 'node:test';
import assert from 'node:assert/strict';
import { HashMap, hashString } from '../src/dsa/hashMap.js';
import { Queue } from '../src/dsa/queue.js';
import { Stack } from '../src/dsa/stack.js';
import { MinHeap } from '../src/dsa/minHeap.js';
import { mergeSort } from '../src/dsa/mergeSort.js';
import { makeRng } from './rng.js';

// ---------- HashMap ----------
test('hashMap: basic set/get/has/delete and overwrite', () => {
  const m = new HashMap();
  assert.equal(m.get('a'), undefined);
  m.set('a', 1); m.set('b', 2); m.set('a', 3);
  assert.equal(m.get('a'), 3);
  assert.equal(m.size, 2);
  assert.ok(m.has('b'));
  assert.ok(m.delete('b'));
  assert.ok(!m.delete('b'));
  assert.equal(m.size, 1);
});

test('hashMap: empty string key, numeric keys and unicode keys', () => {
  const m = new HashMap();
  m.set('', 'empty'); m.set(5, 'five'); m.set('चंडीगढ़', 'city');
  assert.equal(m.get(''), 'empty');
  assert.equal(m.get('5'), 'five');
  assert.equal(m.get('चंडीगढ़'), 'city');
});

test('hashMap: resizes when load factor passes 0.75 and keeps every key', () => {
  const m = new HashMap(4);
  for (let i = 0; i < 1000; i++) m.set(`key${i}`, i);
  assert.equal(m.size, 1000);
  assert.ok(m.buckets.length >= 1000 / 0.75 / 2); // table grew
  assert.ok(m.count / m.buckets.length <= 0.75);
  for (let i = 0; i < 1000; i++) assert.equal(m.get(`key${i}`), i);
});

test('hashMap: colliding keys still work (1 bucket)', () => {
  const m = new HashMap(1);
  m.buckets = [null]; // force everything into one chain, no resize needed for 0.75 check below
  m.set('x', 1); // count 1 -> load 1 > 0.75 triggers resize, fine
  for (let i = 0; i < 20; i++) m.set(`c${i}`, i);
  for (let i = 0; i < 20; i++) assert.equal(m.get(`c${i}`), i);
  assert.equal(hashString('abc'), hashString('abc'));
});

test('hashMap: random operations match a brute-force list', () => {
  const rng = makeRng(1);
  const m = new HashMap(2);
  const slow = []; // [{key, value}]
  for (let step = 0; step < 3000; step++) {
    const key = `k${rng.int(0, 150)}`;
    const op = rng.int(0, 2);
    const at = slow.findIndex((e) => e.key === key);
    if (op === 0) { const v = rng.int(0, 99); m.set(key, v); if (at >= 0) slow[at].value = v; else slow.push({ key, value: v }); }
    else if (op === 1) { assert.equal(m.get(key), at >= 0 ? slow[at].value : undefined); }
    else { assert.equal(m.delete(key), at >= 0); if (at >= 0) slow.splice(at, 1); }
    assert.equal(m.size, slow.length);
  }
  assert.equal(m.keys().length, slow.length);
  assert.equal(m.values().length, slow.length);
});

// ---------- Queue ----------
test('queue: empty, one item, order', () => {
  const q = new Queue(2);
  assert.equal(q.dequeue(), undefined);
  assert.equal(q.peek(), undefined);
  assert.ok(q.isEmpty());
  q.enqueue('a');
  assert.equal(q.peek(), 'a');
  assert.equal(q.dequeue(), 'a');
  assert.ok(q.isEmpty());
});

test('queue: wraps around and grows, keeps order', () => {
  const q = new Queue(2);
  const expected = [];
  let next = 0;
  for (let round = 0; round < 200; round++) {
    q.enqueue(next); expected.push(next); next++;
    q.enqueue(next); expected.push(next); next++;
    assert.equal(q.dequeue(), expected.shift());
  }
  assert.equal(q.size, expected.length);
  while (!q.isEmpty()) assert.equal(q.dequeue(), expected.shift());
});

test('queue: very large input', () => {
  const q = new Queue();
  for (let i = 0; i < 100000; i++) q.enqueue(i);
  for (let i = 0; i < 100000; i++) assert.equal(q.dequeue(), i);
});

// ---------- Stack ----------
test('stack: empty, one item, last-in-first-out', () => {
  const s = new Stack();
  assert.equal(s.pop(), undefined);
  assert.equal(s.peek(), undefined);
  s.push(1); s.push(2); s.push(3);
  assert.equal(s.peek(), 3);
  assert.equal(s.pop(), 3);
  assert.equal(s.pop(), 2);
  assert.equal(s.size, 1);
  s.clear();
  assert.ok(s.isEmpty());
});

test('stack: random push/pop matches a plain array', () => {
  const rng = makeRng(2);
  const s = new Stack();
  const slow = [];
  for (let i = 0; i < 2000; i++) {
    if (rng.int(0, 2) < 2) { const v = rng.int(0, 1000); s.push(v); slow.push(v); }
    else assert.equal(s.pop(), slow.pop());
    assert.equal(s.size, slow.length);
  }
});

// ---------- MinHeap ----------
test('minHeap: empty and single', () => {
  const h = new MinHeap();
  assert.equal(h.pop(), undefined);
  assert.equal(h.peek(), undefined);
  h.push(5);
  assert.equal(h.peek(), 5);
  assert.equal(h.pop(), 5);
  assert.equal(h.size, 0);
});

test('minHeap: duplicates and ties come out in sorted order', () => {
  const h = new MinHeap();
  [3, 1, 3, 1, 2, 2, 3].forEach((x) => h.push(x));
  const out = [];
  while (!h.isEmpty()) out.push(h.pop());
  assert.deepEqual(out, [1, 1, 2, 2, 3, 3, 3]);
});

test('minHeap: 300 random lists, heap order == sorted order', () => {
  const rng = makeRng(3);
  for (let run = 0; run < 300; run++) {
    const list = Array.from({ length: rng.int(0, 60) }, () => rng.int(-50, 50));
    const h = new MinHeap();
    list.forEach((x) => h.push(x));
    const out = [];
    while (!h.isEmpty()) out.push(h.pop());
    assert.deepEqual(out, list.slice().sort((a, b) => a - b));
  }
});

test('minHeap: custom comparison (objects by priority) and very large input', () => {
  const h = new MinHeap((a, b) => a.p < b.p);
  for (let i = 0; i < 50000; i++) h.push({ p: (i * 7919) % 10007 });
  let last = -1;
  while (!h.isEmpty()) { const x = h.pop(); assert.ok(x.p >= last); last = x.p; }
});

// ---------- MergeSort ----------
test('mergeSort: empty, one item, does not change input', () => {
  assert.deepEqual(mergeSort([]), []);
  assert.deepEqual(mergeSort([7]), [7]);
  const input = [3, 1, 2];
  mergeSort(input);
  assert.deepEqual(input, [3, 1, 2]);
});

test('mergeSort: is stable (ties keep original order)', () => {
  const items = [{ k: 2, id: 'a' }, { k: 1, id: 'b' }, { k: 2, id: 'c' }, { k: 1, id: 'd' }, { k: 2, id: 'e' }];
  const out = mergeSort(items, (x, y) => x.k - y.k).map((x) => x.id);
  assert.deepEqual(out, ['b', 'd', 'a', 'c', 'e']);
});

test('mergeSort: 300 random lists match the built-in sort (used only here, in the test)', () => {
  const rng = makeRng(4);
  for (let run = 0; run < 300; run++) {
    const list = Array.from({ length: rng.int(0, 80) }, () => rng.int(-20, 20));
    assert.deepEqual(mergeSort(list), list.slice().sort((a, b) => a - b));
  }
});

test('mergeSort: very large input and reverse order', () => {
  const big = Array.from({ length: 100000 }, (_, i) => 100000 - i);
  const out = mergeSort(big);
  assert.equal(out[0], 1);
  assert.equal(out[99999], 100000);
});
