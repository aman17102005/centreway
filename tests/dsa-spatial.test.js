import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialGrid } from '../src/dsa/spatialGrid.js';
import { KdTree } from '../src/dsa/kdTree.js';
import { haversineMetres, toPlane } from '../src/dsa/haversine.js';
import { makeRng } from './rng.js';

const REF_LAT = 30.7;
const randomPoints = (rng, n, spread = 0.1) => Array.from({ length: n }, (_, i) => ({ lat: 30.7 + rng.float(-spread, spread), lon: 76.78 + rng.float(-spread, spread), id: i }));

test('haversine: known distance, zero distance, symmetric', () => {
  const d = haversineMetres(28.6139, 77.209, 19.076, 72.8777); // Delhi - Mumbai, about 1150 km
  assert.ok(d > 1.1e6 && d < 1.2e6);
  assert.equal(haversineMetres(30, 76, 30, 76), 0);
  assert.ok(Math.abs(haversineMetres(30, 76, 31, 77) - haversineMetres(31, 77, 30, 76)) < 1e-6);
});

// ---------------- spatial grid ----------------
test('grid: empty, one point, duplicates', () => {
  const g = new SpatialGrid(300, REF_LAT);
  assert.equal(g.nearest(30.7, 76.78), null);
  assert.deepEqual(g.within(30.7, 76.78, 1000), []);
  g.insert(30.7, 76.78, 'a'); g.insert(30.7, 76.78, 'b');
  assert.equal(g.size, 2);
  assert.equal(g.within(30.7, 76.78, 1).length, 2);
  assert.equal(g.nearest(30.7001, 76.78).distance < 20, true);
});

test('grid: point outside the max distance is not returned', () => {
  const g = new SpatialGrid(300, REF_LAT);
  g.insert(30.7, 76.78, 'far');
  assert.equal(g.nearest(30.8, 76.9, 2000), null);   // about 15 km away
  assert.equal(g.nearest(30.8, 76.9, 20000).data, 'far');
});

test('grid: 150 random within() queries match brute force', () => {
  const rng = makeRng(10);
  const pts = randomPoints(rng, 400);
  const g = new SpatialGrid(250, REF_LAT);
  pts.forEach((p) => g.insert(p.lat, p.lon, p.id));
  for (let i = 0; i < 150; i++) {
    const q = { lat: 30.7 + rng.float(-0.1, 0.1), lon: 76.78 + rng.float(-0.1, 0.1) };
    const radius = rng.float(50, 3000);
    const fast = g.within(q.lat, q.lon, radius).map((x) => x.data).sort((a, b) => a - b);
    const slow = pts.filter((p) => haversineMetres(q.lat, q.lon, p.lat, p.lon) <= radius).map((p) => p.id).sort((a, b) => a - b);
    assert.deepEqual(fast, slow);
  }
});

test('grid: 300 random nearest() queries match brute force', () => {
  const rng = makeRng(11);
  const pts = randomPoints(rng, 300);
  const g = new SpatialGrid(250, REF_LAT);
  pts.forEach((p) => g.insert(p.lat, p.lon, p.id));
  for (let i = 0; i < 300; i++) {
    const q = { lat: 30.7 + rng.float(-0.12, 0.12), lon: 76.78 + rng.float(-0.12, 0.12) };
    let best = null;
    for (const p of pts) { const d = haversineMetres(q.lat, q.lon, p.lat, p.lon); if (best === null || d < best.d) best = { d, id: p.id }; }
    const fast = g.nearest(q.lat, q.lon, 1e6);
    assert.ok(Math.abs(fast.distance - best.d) < 1e-6, 'same distance');
  }
});

test('grid: very large input still answers quickly', () => {
  const rng = makeRng(12);
  const g = new SpatialGrid(300, REF_LAT);
  randomPoints(rng, 100000, 0.2).forEach((p) => g.insert(p.lat, p.lon, p.id));
  const start = Date.now();
  for (let i = 0; i < 200; i++) g.nearest(30.7 + rng.float(-0.1, 0.1), 76.78 + rng.float(-0.1, 0.1), 5000);
  assert.ok(Date.now() - start < 2000);
});

// ---------------- k-d tree ----------------
const planePoints = (rng, n) => Array.from({ length: n }, (_, i) => ({ x: rng.float(0, 1000), y: rng.float(0, 1000), data: i }));

test('kdTree: empty tree and one point', () => {
  const empty = new KdTree([]);
  assert.equal(empty.nearest(1, 1), null);
  assert.deepEqual(empty.rangeSearch(0, 0, 10, 10), []);
  const one = new KdTree([{ x: 5, y: 5, data: 'p' }]);
  assert.equal(one.nearest(0, 0).point.data, 'p');
  assert.equal(one.rangeSearch(5, 5, 5, 5).length, 1);
});

test('kdTree: duplicates and points on the same line', () => {
  const pts = [{ x: 1, y: 1, data: 'a' }, { x: 1, y: 1, data: 'b' }, { x: 1, y: 5, data: 'c' }, { x: 1, y: 9, data: 'd' }];
  const t = new KdTree(pts);
  assert.equal(t.nearest(1, 8).point.data, 'd');
  assert.equal(t.rangeSearch(1, 1, 1, 5).length, 3);
});

test('kdTree: 300 random nearest queries match brute force', () => {
  const rng = makeRng(13);
  const pts = planePoints(rng, 400);
  const tree = new KdTree(pts);
  for (let i = 0; i < 300; i++) {
    const q = { x: rng.float(-100, 1100), y: rng.float(-100, 1100) };
    let best = Infinity;
    for (const p of pts) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
    assert.ok(Math.abs(tree.nearest(q.x, q.y).distance - best) < 1e-9);
  }
});

test('kdTree: 200 random range and radius searches match brute force', () => {
  const rng = makeRng(14);
  const pts = planePoints(rng, 400);
  const tree = new KdTree(pts);
  for (let i = 0; i < 200; i++) {
    const x1 = rng.float(0, 1000), y1 = rng.float(0, 1000), x2 = x1 + rng.float(0, 300), y2 = y1 + rng.float(0, 300);
    const fast = tree.rangeSearch(x1, y1, x2, y2).map((p) => p.data).sort((a, b) => a - b);
    const slow = pts.filter((p) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2).map((p) => p.data).sort((a, b) => a - b);
    assert.deepEqual(fast, slow);
    const r = rng.float(10, 300);
    const fastR = tree.withinRadius(x1, y1, r).map((x) => x.point.data).sort((a, b) => a - b);
    const slowR = pts.filter((p) => Math.hypot(p.x - x1, p.y - y1) <= r).map((p) => p.data).sort((a, b) => a - b);
    assert.deepEqual(fastR, slowR);
  }
});

test('kdTree: very large input builds and answers', () => {
  const rng = makeRng(15);
  const pts = planePoints(rng, 50000);
  const tree = new KdTree(pts);
  assert.equal(tree.size, 50000);
  assert.ok(tree.nearest(500, 500).distance < 20);
});

test('toPlane: north-south distance is about 111 km per degree', () => {
  const a = toPlane(30, 76, 30); const b = toPlane(31, 76, 30);
  assert.ok(Math.abs(b.y - a.y - 111195) < 200);
});
