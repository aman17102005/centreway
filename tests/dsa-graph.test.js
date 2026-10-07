import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadGraph } from '../src/dsa/graph.js';
import { dijkstra } from '../src/dsa/dijkstra.js';
import { aStar } from '../src/dsa/aStar.js';
import { OfflineRouter } from '../src/dsa/offlineRouter.js';
import { makeRng } from './rng.js';
import { makeGraphData, bellmanFordSeconds } from './graphFactory.js';

// A tiny hand-made graph:  0 --(res)-- 1 --(res)-- 2     and a shortcut 0 -> 2 one-way, slow type
const tiny = () => ({
  version: 1, scale: 1e5, bbox: [30, 76, 31, 77],
  nodes: [3070000, 7678000, 3070000, 7678100, 3070000, 7678200, 3071000, 7678000],
  // a, b, metres, type, oneway, bends
  edges: [0, 1, 100, 6, 0, 0, 1, 2, 100, 6, 0, 0, 0, 2, 500, 8, 1, 0],
  geo: [],
});

test('graph: arcs, one-way and mode permissions', () => {
  const g = new RoadGraph(tiny());
  assert.equal(g.nodeCount, 4);
  assert.equal(g.firstArc[g.nodeCount], 5);               // 2 two-way edges (4 arcs) + 1 one-way (1 arc)
  assert.equal(g.firstArc[1] - g.firstArc[0], 2);           // node 0: to 1 and to 2
  assert.equal(g.firstArc[3 + 1] - g.firstArc[3], 0);       // node 3 has no roads
  let arc02 = -1;                                          // find the 0 -> 2 pedestrian arc
  for (let a = g.firstArc[0]; a < g.firstArc[1]; a++) if (g.arcTo[a] === 2) arc02 = a;
  assert.equal(g.arcSeconds(arc02, 'car'), Infinity);       // cars may not use pedestrian roads
  assert.ok(g.arcSeconds(arc02, 'foot') < Infinity);
});

test('dijkstra: shortest path, same node, unreachable, bad ids, one-way', () => {
  const g = new RoadGraph(tiny());
  const r = dijkstra(g, 0, 2, 'car');
  assert.deepEqual(r.nodes, [0, 1, 2]);
  assert.equal(r.metres, 200);
  assert.ok(r.nodesVisited >= 3);
  assert.deepEqual(dijkstra(g, 1, 1, 'car').nodes, [1]);
  assert.equal(dijkstra(g, 0, 3, 'car').found, false);       // node 3 unreachable
  assert.equal(dijkstra(g, 0, 99, 'car').found, false);
  assert.equal(dijkstra(g, -1, 2, 'car').found, false);
  const walk = dijkstra(g, 0, 2, 'foot');                    // on foot the 500 m pedestrian road is slower than 200 m of streets
  assert.deepEqual(walk.nodes, [0, 1, 2]);
  assert.equal(dijkstra(g, 2, 0, 'foot').metres, 200);       // the 0 -> 2 road is one-way, so going back uses the streets
});

test('aStar: same tiny cases as dijkstra', () => {
  const g = new RoadGraph(tiny());
  assert.deepEqual(aStar(g, 0, 2, 'car').nodes, [0, 1, 2]);
  assert.equal(aStar(g, 0, 3, 'car').found, false);
  assert.equal(aStar(g, 0, 0, 'car').metres, 0);
  assert.equal(aStar(g, 0, 99, 'car').found, false);
});

test('dijkstra and A* match brute-force Bellman-Ford; A* never visits more in total', () => {
  const rng = makeRng(16);
  let dijkstraVisited = 0; let aStarVisited = 0; let checked = 0;
  for (let run = 0; run < 12; run++) {
    const g = new RoadGraph(makeGraphData(rng, { width: rng.int(3, 9), height: rng.int(3, 9) }));
    for (let q = 0; q < 20; q++) {
      const mode = ['car', 'bike', 'foot'][rng.int(0, 2)];
      const s = rng.int(0, g.nodeCount - 1); const t = rng.int(0, g.nodeCount - 1);
      const slow = bellmanFordSeconds(g, s, t, mode);
      const d = dijkstra(g, s, t, mode);
      const a = aStar(g, s, t, mode);
      assert.equal(d.found, slow !== Infinity);
      assert.equal(a.found, slow !== Infinity);
      if (slow !== Infinity) {
        assert.ok(Math.abs(d.seconds - slow) < 1e-6, 'dijkstra cost');
        assert.ok(Math.abs(a.seconds - slow) < 1e-6, 'a* cost equals dijkstra cost');
        dijkstraVisited += d.nodesVisited; aStarVisited += a.nodesVisited; checked++;
      }
    }
  }
  assert.ok(checked > 100);
  assert.ok(aStarVisited <= dijkstraVisited);
});

test('graph: very large grid (10,000 nodes) routes correctly', () => {
  const rng = makeRng(17);
  const g = new RoadGraph(makeGraphData(rng, { width: 100, height: 100, dropChance: 0, onewayChance: 0, islands: 0, types: [4] }));
  const d = dijkstra(g, 0, g.nodeCount - 1, 'car');
  const a = aStar(g, 0, g.nodeCount - 1, 'car');
  assert.ok(d.found && a.found);
  assert.ok(Math.abs(d.seconds - a.seconds) < 1e-6);
  assert.ok(a.nodesVisited <= d.nodesVisited);
});

test('graph: geometryOf joins start, bends and ends', () => {
  const data = tiny();
  data.edges[5] = 1; data.geo = [3070050, 7678050];          // one bend point on edge 0 (0 -> 1)
  const g = new RoadGraph(data);
  const r = dijkstra(g, 0, 1, 'car');
  const line = g.geometryOf(r.nodes[0], r.arcs);
  assert.equal(line.length, 3);
  assert.ok(Math.abs(line[1][0] - 30.7005) < 1e-9);
});

test('offline router: outside the map, far from roads, and a normal route', () => {
  const data = makeGraphData(makeRng(18), { width: 10, height: 10, dropChance: 0, onewayChance: 0, islands: 0, types: [4] });
  const router = new OfflineRouter(data);
  const from = { lat: 30.7005, lng: 76.7805 }; const to = { lat: 30.7075, lng: 76.7875 };
  const ok = router.route(from, to, 'car');
  assert.ok(ok && ok.distanceKm > 0.5 && ok.durationMin > 0);
  assert.equal(ok.geometry[0][0], from.lat);
  const astarResult = router.route(from, to, 'car', 'astar');
  const dijkstraResult = router.route(from, to, 'car', 'dijkstra');
  assert.ok(Math.abs(astarResult.durationMin - dijkstraResult.durationMin) < 1e-6);
  assert.equal(router.route({ lat: 28.6, lng: 77.2 }, to, 'car'), null);          // Delhi: outside the data area
  assert.equal(router.route({ lat: 30.9, lng: 77.1 }, to, 'car'), null);          // inside bbox but far from any road
  assert.equal(router.route(from, to, 'rocket'), null);
  assert.ok(router.route(from, to, 'foot').durationMin > ok.durationMin);         // walking is slower
});
