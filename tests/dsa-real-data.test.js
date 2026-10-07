import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { RoadGraph } from '../src/dsa/graph.js';
import { dijkstra } from '../src/dsa/dijkstra.js';
import { aStar } from '../src/dsa/aStar.js';
import { OfflineRouter } from '../src/dsa/offlineRouter.js';
import { buildPlaceIndex, suggestPlaces, findCorrections } from '../src/logic/places.js';
import { makeRng } from './rng.js';

// These tests use the real files made by tools/buildGraph.js. They are skipped if the files do not exist.
const root = join(fileURLToPath(import.meta.url), '..', '..');
const graphFile = join(root, 'data', 'graph.json');
const placesFile = join(root, 'data', 'places.json');
const options = { skip: !existsSync(graphFile) && 'data/graph.json not built (run npm run graph)' };

test('real graph: file is small and well formed', options, () => {
  const data = JSON.parse(readFileSync(graphFile, 'utf8'));
  assert.ok(readFileSync(graphFile).length < 3 * 1024 * 1024, 'under 3 MB');
  assert.equal(data.edges.length % 6, 0);
  assert.equal(data.nodes.length % 2, 0);
  assert.match(data.credit, /OpenStreetMap/);
});

test('real graph: A* and Dijkstra give the same cost on 15 random routes per mode', options, () => {
  const graph = new RoadGraph(JSON.parse(readFileSync(graphFile, 'utf8')));
  const rng = makeRng(31);
  for (const mode of ['car', 'bike', 'foot']) {
    const usable = graph.usableNodes(mode);
    const pool = []; for (let i = 0; i < graph.nodeCount; i++) if (usable[i]) pool.push(i);
    let checked = 0;
    for (let tries = 0; tries < 200 && checked < 15; tries++) {
      const s = pool[rng.int(0, pool.length - 1)]; const t = pool[rng.int(0, pool.length - 1)];
      const d = dijkstra(graph, s, t, mode); const a = aStar(graph, s, t, mode);
      assert.equal(d.found, a.found);
      if (d.found) { assert.ok(Math.abs(d.seconds - a.seconds) < 1e-6); assert.ok(a.nodesVisited <= d.nodesVisited + 5); checked++; }
    }
    assert.ok(checked >= 5, `${mode}: enough reachable pairs`);
  }
});

test('real graph: Sector 17 Chandigarh to Mohali Phase 7 is a sensible trip, and Delhi is outside the area', options, () => {
  const router = new OfflineRouter(JSON.parse(readFileSync(graphFile, 'utf8')));
  const car = router.route({ lat: 30.7416, lng: 76.7820 }, { lat: 30.7046, lng: 76.7179 }, 'car');
  assert.ok(car, 'route found');
  assert.ok(car.distanceKm > 6 && car.distanceKm < 20, `distance ${car.distanceKm}`);
  assert.ok(car.durationMin > 8 && car.durationMin < 60, `time ${car.durationMin}`);
  const walk = router.route({ lat: 30.7416, lng: 76.7820 }, { lat: 30.7330, lng: 76.7794 }, 'foot');
  assert.ok(walk && walk.durationMin > 5);
  assert.equal(router.route({ lat: 28.61, lng: 77.2 }, { lat: 30.7, lng: 76.7 }, 'car'), null);
});

test('real places: suggestions and corrections work on the bundled list', { skip: !existsSync(placesFile) && 'places.json missing' }, () => {
  const index = buildPlaceIndex(JSON.parse(readFileSync(placesFile, 'utf8')));
  assert.ok(suggestPlaces(index, 'chand').some((p) => p.name === 'Chandigarh'));
  assert.ok(suggestPlaces(index, 'moh').length > 0);
  const hints = findCorrections(index, 'Plot 5, Chandigrah');
  assert.deepEqual(hints.map((h) => h.to), ['Chandigarh']);
});
