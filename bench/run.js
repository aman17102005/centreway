// Speed comparisons for the DSA parts. Run:  npm run bench      (writes bench/results.md)
// Plain node script. Timings use performance.now(); every test uses the same random data (fixed seed).
import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import os from 'node:os';
import { topK } from '../src/dsa/topK.js';
import { mergeSort } from '../src/dsa/mergeSort.js';
import { SpatialGrid } from '../src/dsa/spatialGrid.js';
import { KdTree } from '../src/dsa/kdTree.js';
import { Trie } from '../src/dsa/trie.js';
import { haversineMetres, toPlane } from '../src/dsa/haversine.js';
import { RoadGraph } from '../src/dsa/graph.js';
import { dijkstra } from '../src/dsa/dijkstra.js';
import { aStar } from '../src/dsa/aStar.js';
import { OfflineRouter } from '../src/dsa/offlineRouter.js';
import { makeRng } from '../tests/rng.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SIZES = [1000, 10000, 100000];
const rng = makeRng(2026);
const out = [];
const log = (line = '') => { console.log(line); out.push(line); };

/** Run fn `reps` times, return average milliseconds. */
function time(fn, reps = 1) {
  fn(); // warm up
  const start = performance.now();
  for (let i = 0; i < reps; i++) fn();
  return (performance.now() - start) / reps;
}
const fmt = (ms) => (ms >= 100 ? ms.toFixed(0) : ms >= 10 ? ms.toFixed(1) : ms >= 0.1 ? ms.toFixed(2) : ms.toFixed(4));
const table = (head, rows) => {
  log(`| ${head.join(' | ')} |`);
  log(`|${head.map(() => '---').join('|')}|`);
  rows.forEach((r) => log(`| ${r.join(' | ')} |`));
  log();
};

log('# Benchmark results');
log();
log(`Machine: ${os.cpus()[0].model}, Node ${process.version}. Averages over several runs; random data with a fixed seed.`);
log();

// ---------------------------------------------------------------- 1. top-K vs full sort
log('## 1. Top-K (heap of size K) vs full sort — find the 10 smallest numbers');
log();
{
  const rows = [];
  for (const n of SIZES) {
    const data = Array.from({ length: n }, () => rng.int(0, 1e9));
    const cmp = (a, b) => a - b;
    const reps = n >= 100000 ? 3 : 20;
    const heap = time(() => topK(data, 10, cmp), reps);
    const mine = time(() => mergeSort(data, cmp).slice(0, 10), reps);
    const builtin = time(() => data.slice().sort(cmp).slice(0, 10), reps);
    rows.push([n.toLocaleString(), fmt(heap), fmt(mine), fmt(builtin), `${(mine / heap).toFixed(1)}x`]);
  }
  table(['n', 'top-K heap (ms)', 'my merge sort, full (ms)', 'built-in sort, full (ms)', 'heap speed-up vs my sort'], rows);
}

// ---------------------------------------------------------------- 2. nearest search
log('## 2. Nearest point: spatial grid vs k-d tree vs brute force (200 queries each)');
log();
{
  const rows = [];
  for (const n of SIZES) {
    const pts = Array.from({ length: n }, (_, i) => ({ lat: 30.7 + rng.float(-0.12, 0.12), lon: 76.78 + rng.float(-0.18, 0.18), id: i }));
    const queries = Array.from({ length: 200 }, () => ({ lat: 30.7 + rng.float(-0.1, 0.1), lon: 76.78 + rng.float(-0.15, 0.15) }));
    const gridBuild = time(() => { const g = new SpatialGrid(300, 30.7); pts.forEach((p) => g.insert(p.lat, p.lon, p.id)); }, 1);
    const grid = new SpatialGrid(300, 30.7); pts.forEach((p) => grid.insert(p.lat, p.lon, p.id));
    const planar = pts.map((p) => ({ ...toPlane(p.lat, p.lon, 30.7), data: p.id }));
    let tree;
    const kdBuild = time(() => { tree = new KdTree(planar); }, 1);
    const qPlane = queries.map((q) => toPlane(q.lat, q.lon, 30.7));
    const gridQ = time(() => queries.forEach((q) => grid.nearest(q.lat, q.lon, 20000)), 1) / queries.length;
    const kdQ = time(() => qPlane.forEach((q) => tree.nearest(q.x, q.y)), 1) / queries.length;
    const brute = time(() => queries.forEach((q) => { let best = Infinity; for (const p of pts) { const d = haversineMetres(q.lat, q.lon, p.lat, p.lon); if (d < best) best = d; } }), 1) / queries.length;
    rows.push([n.toLocaleString(), fmt(gridBuild), fmt(kdBuild), fmt(gridQ), fmt(kdQ), fmt(brute), `${(brute / gridQ).toFixed(0)}x / ${(brute / kdQ).toFixed(0)}x`]);
  }
  table(['n points', 'grid build (ms)', 'k-d build (ms)', 'grid per query (ms)', 'k-d per query (ms)', 'brute force per query (ms)', 'speed-up grid / k-d'], rows);
}

// ---------------------------------------------------------------- 3. trie
log('## 3. Prefix search: trie vs filtering a list (top 5 by weight, 300 queries each)');
log();
{
  const rows = [];
  for (const n of SIZES) {
    const words = Array.from({ length: n }, () => ({ text: rng.word(rng.int(4, 10)), weight: rng.int(1, 100) }));
    const trie = new Trie();
    const build = time(() => { const t = new Trie(); words.forEach((w) => t.insert(w.text, w.weight)); }, 1);
    words.forEach((w) => trie.insert(w.text, w.weight));
    const prefixes = Array.from({ length: 300 }, () => rng.word(rng.int(2, 3)));
    const trieQ = time(() => prefixes.forEach((p) => trie.suggest(p, 5)), 1) / prefixes.length;
    const listQ = time(() => prefixes.forEach((p) => words.filter((w) => w.text.startsWith(p)).sort((a, b) => b.weight - a.weight).slice(0, 5)), 1) / prefixes.length;
    rows.push([n.toLocaleString(), fmt(build), fmt(trieQ), fmt(listQ), `${(listQ / trieQ).toFixed(1)}x`]);
  }
  table(['n words', 'trie build (ms)', 'trie per query (ms)', 'filter list per query (ms)', 'speed-up'], rows);
}

// ---------------------------------------------------------------- 4. Dijkstra vs A*
log('## 4. Dijkstra vs A* on the real tricity road graph (20 random routes per mode)');
log();
const graphFile = join(ROOT, 'data', 'graph.json');
if (!existsSync(graphFile)) {
  log('`data/graph.json` is missing. Run `node tools/buildGraph.js` first, then `npm run bench` again.');
} else {
  const data = JSON.parse(readFileSync(graphFile, 'utf8'));
  const graph = new RoadGraph(data);
  const router = new OfflineRouter(data);
  log(`Graph: ${graph.nodeCount.toLocaleString()} nodes, ${(graph.arcCount).toLocaleString()} directed roads.`);
  log();
  const rows = [];
  for (const mode of ['car', 'bike', 'foot']) {
    const usable = graph.usableNodes(mode);
    const pool = [];
    for (let i = 0; i < graph.nodeCount; i++) if (usable[i]) pool.push(i);
    let dTime = 0, aTime = 0, dNodes = 0, aNodes = 0, found = 0, same = 0, metres = 0;
    const pairRng = makeRng(77);
    for (let tries = 0; found < 20 && tries < 400; tries++) {
      const s = pool[pairRng.int(0, pool.length - 1)];
      const t = pool[pairRng.int(0, pool.length - 1)];
      if (graph.crowMetres(s, t) < 2000) continue; // skip very short trips
      let d, a;
      const dMs = time(() => { d = dijkstra(graph, s, t, mode); }, 1);
      const aMs = time(() => { a = aStar(graph, s, t, mode); }, 1);
      if (!d.found || !a.found) continue;
      found++; dTime += dMs; aTime += aMs; dNodes += d.nodesVisited; aNodes += a.nodesVisited; metres += d.metres;
      if (Math.abs(d.seconds - a.seconds) < 1e-6) same++;
    }
    rows.push([mode, found, fmt(dTime / found), fmt(aTime / found), Math.round(dNodes / found).toLocaleString(), Math.round(aNodes / found).toLocaleString(),
      `${(dNodes / aNodes).toFixed(1)}x`, `${(metres / found / 1000).toFixed(1)} km`, `${same}/${found}`]);
  }
  table(['mode', 'routes', 'Dijkstra avg (ms)', 'A* avg (ms)', 'Dijkstra nodes visited', 'A* nodes visited', 'fewer nodes with A*', 'avg route length', 'same cost'], rows);
  log('"same cost" = how many of the routes had exactly the same total time with both algorithms (must be all of them).');
  log();
  // snapping speed: grid vs checking every node
  const snapper = router.snapperFor('car');
  const qs = Array.from({ length: 200 }, () => ({ lat: 30.6 + rng.float(0.02, 0.2), lon: 76.55 + rng.float(0.02, 0.38) }));
  const gridMs = time(() => qs.forEach((q) => snapper.nearest(q.lat, q.lon, 1500)), 1) / qs.length;
  const bruteMs = time(() => qs.forEach((q) => { let best = Infinity; for (let i = 0; i < graph.nodeCount; i++) { const d = haversineMetres(q.lat, q.lon, graph.lat[i], graph.lon[i]); if (d < best) best = d; } }), 1) / qs.length;
  log(`Snapping a point to the nearest road node (${graph.nodeCount.toLocaleString()} nodes): grid ${fmt(gridMs)} ms vs brute force ${fmt(bruteMs)} ms per point (${(bruteMs / gridMs).toFixed(0)}x faster).`);
  log();
}

writeFileSync(join(ROOT, 'bench', 'results.md'), `${out.join('\n')}\n`);
console.log('Saved bench/results.md');
