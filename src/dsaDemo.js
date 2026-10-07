// Viva demo page: Dijkstra vs A* side by side, trie suggestions and edit distance.
// Uses the same code as the app (src/dsa/*). Runs on the main thread, so a long search may pause the page for a moment.
import { OfflineRouter } from './dsa/offlineRouter.js';
import { dijkstra } from './dsa/dijkstra.js';
import { aStar } from './dsa/aStar.js';
import { buildPlaceIndex, suggestPlaces } from './logic/places.js';
import { editDistance } from './dsa/editDistance.js';
import { topK } from './dsa/topK.js';
import { asciiLower } from './dsa/kmp.js';
import { planErrands } from './dsa/errandPlanner.js';
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const L = window.L;
let router = null;
let points = []; // [{lat, lng}] at most 2
let layers = [];

const [south, west, north, east] = CONFIG.offline.area;
function makeMap(id) {
  const map = L.map(id).fitBounds([[south, west], [north, east]]);
  L.tileLayer(CONFIG.tiles.url, { maxZoom: 19, attribution: CONFIG.tiles.attribution }).addTo(map);
  return map;
}
const mapD = makeMap('mapD');
const mapA = makeMap('mapA');
// keep both maps looking at the same place
let syncing = false;
function link(a, b) { a.on('move', () => { if (syncing) return; syncing = true; b.setView(a.getCenter(), a.getZoom(), { animate: false }); syncing = false; }); }
link(mapD, mapA); link(mapA, mapD);
for (const map of [mapD, mapA]) map.on('click', (e) => addPoint(e.latlng));

function clearLayers() { layers.forEach((l) => l.remove()); layers = []; }
function clearAll() { points = []; clearLayers(); $('statsD').textContent = 'Dijkstra: no run yet.'; $('statsA').textContent = 'A*: no run yet.'; }

function addPoint(latlng) {
  if (points.length >= 2) clearAll();
  points.push({ lat: latlng.lat, lng: latlng.lng });
  for (const map of [mapD, mapA]) layers.push(L.marker(latlng).addTo(map));
  if (points.length === 2) run();
}

function draw(map, result, colour) {
  const renderer = L.canvas({ padding: 0.5 });
  const g = router.graph;
  for (const node of result.visited) layers.push(L.circleMarker([g.lat[node], g.lon[node]], { radius: 2, color: colour, weight: 0, fillOpacity: 0.7, renderer }).addTo(map));
  if (result.found) layers.push(L.polyline(g.geometryOf(result.nodes[0], result.arcs), { color: '#d00000', weight: 4 }).addTo(map));
}

function run() {
  if (!router || points.length < 2) return;
  const mode = $('mode').value;
  const a = router.snap(points[0].lat, points[0].lng, mode);
  const b = router.snap(points[1].lat, points[1].lng, mode);
  if (!a || !b) { $('statsD').textContent = 'A point is outside the map data (or too far from a road for this mode).'; $('statsA').textContent = ''; return; }
  const g = router.graph;
  const time = (fn) => { const t0 = performance.now(); const r = fn(); return { r, ms: performance.now() - t0 }; };
  const d = time(() => dijkstra(g, a.node, b.node, mode, { trackVisited: true }));
  const s = time(() => aStar(g, a.node, b.node, mode, { trackVisited: true }));
  layers.filter((l) => !(l instanceof L.Marker)).forEach((l) => l.remove());
  layers = layers.filter((l) => l instanceof L.Marker);
  draw(mapD, d.r, '#e69f00');
  draw(mapA, s.r, '#009e73');
  const line = (name, x) => x.r.found
    ? `${name}: visited ${x.r.nodesVisited.toLocaleString()} nodes · ${x.ms.toFixed(1)} ms · path ${(x.r.metres / 1000).toFixed(2)} km · est. ${(x.r.seconds / 60).toFixed(1)} min`
    : `${name}: no path found (visited ${x.r.nodesVisited.toLocaleString()} nodes, ${x.ms.toFixed(1)} ms)`;
  $('statsD').textContent = line('Dijkstra', d);
  $('statsA').textContent = `${line('A*', s)}${d.r.found ? ` · ${(d.r.nodesVisited / Math.max(1, s.r.nodesVisited)).toFixed(1)}x fewer nodes than Dijkstra` : ''}`;
}

$('run').addEventListener('click', run);
$('clear').addEventListener('click', clearAll);
$('mode').addEventListener('change', run);
$('random').addEventListener('click', () => {
  if (!router) return;
  clearAll();
  const g = router.graph;
  const usable = g.usableNodes($('mode').value);
  const pick = () => { for (;;) { const node = Math.floor(Math.random() * g.nodeCount); if (usable[node]) return { lat: g.lat[node], lng: g.lon[node] }; } };
  addPoint(pick());
  addPoint(pick());
});

fetch(CONFIG.offline.graphUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error('missing')))).then((data) => {
  router = new OfflineRouter(data);
  $('graphStatus').textContent = `Road graph loaded: ${router.graph.nodeCount.toLocaleString()} nodes, ${router.graph.arcCount.toLocaleString()} directed roads. Click two points on a map.`;
}).catch(() => { $('graphStatus').textContent = 'Could not load data/graph.json. Run: node tools/buildGraph.js'; $('graphStatus').className = 'note error'; });

// ---- trie + edit distance (word list from data/places.json)
let index = null;
fetch(CONFIG.offline.placesUrl).then((r) => r.json()).then((list) => { index = buildPlaceIndex(list); $('trieInfo').textContent = `${list.length.toLocaleString()} place names loaded into the trie.`; }).catch(() => { $('trieInfo').textContent = 'Could not load data/places.json.'; });

$('prefix').addEventListener('input', (e) => {
  const found = suggestPlaces(index, e.target.value, 8);
  $('trieOut').replaceChildren(...found.map((p) => { const li = document.createElement('li'); li.textContent = `${p.name} (${p.kind}, weight ${index.trie.suggest(p.name, 1)[0]?.weight ?? ''})`; return li; }));
});

$('wrong').addEventListener('input', (e) => {
  if (!index) return;
  const word = asciiLower(e.target.value.trim());
  if (word.length < 3) { $('editOut').replaceChildren(); return; }
  const words = index.knownWords.keys();
  const scored = [];
  for (const w of words) { const d = editDistance(word, w, 3); if (d <= 3) scored.push({ w, d }); }
  const best = topK(scored, 6, (x, y) => x.d - y.d || (x.w < y.w ? -1 : 1));
  $('editOut').replaceChildren(...best.map((x) => { const li = document.createElement('li'); li.textContent = `${x.w}  — distance ${x.d}`; return li; }));
});

// ---- 3. errands: bitmask DP against brute force on random points ----
const KIND_NAMES = ['Photocopy', 'ATM', 'Chemist'];
function runErrands() {
  const n = 2 + 15;                                     // 0 = home, 1 = centre, 2..16 = candidates (5 per kind)
  const pts = []; for (let i = 0; i < n; i++) pts.push({ x: Math.random() * 10, y: Math.random() * 10 });
  const travel = pts.map((a) => pts.map((b) => Math.hypot(a.x - b.x, a.y - b.y) * 3));   // minutes
  const groups = [[2, 3, 4, 5, 6], [7, 8, 9, 10, 11], [12, 13, 14, 15, 16]];
  const dwell = [10, 5, 5];
  let t0 = performance.now();
  const dp = planErrands({ travel, start: 0, centre: 1, groups, dwell });
  const tDp = performance.now() - t0;
  // brute force: every order of the 3 kinds and every shop of each kind
  t0 = performance.now();
  let best = Infinity; let tries = 0;
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const o of orders) for (const a of groups[o[0]]) for (const b of groups[o[1]]) for (const c of groups[o[2]]) {
    tries++;
    const total = travel[0][a] + travel[a][b] + travel[b][c] + travel[c][1] + dwell[0] + dwell[1] + dwell[2];
    if (total < best) best = total;
  }
  const tBrute = performance.now() - t0;
  const lines = dp.order.map((s, i) => `${i + 1}. ${KIND_NAMES[s.group]} (shop #${s.node - 1}) — arrive ${s.arriveMin.toFixed(1)} min, leave ${s.departMin.toFixed(1)} min`);
  lines.push(`Then the centre: arrive ${dp.centreArriveMin.toFixed(1)} min. Total ${dp.totalMin.toFixed(2)} min (travel ${dp.travelMin.toFixed(1)} + stops ${dp.dwellMin}).`);
  $('errandOut').replaceChildren(...lines.map((x) => { const li = document.createElement('li'); li.textContent = x; return li; }));
  const same = Math.abs(best - dp.totalMin) < 1e-6;
  $('errandInfo').textContent = `Bitmask DP: ${tDp.toFixed(3)} ms. Brute force: ${tBrute.toFixed(3)} ms for ${tries} tries. Totals ${same ? 'AGREE' : 'DIFFER (bug!)'}: ${dp.totalMin.toFixed(2)} vs ${best.toFixed(2)}.`;
}
$('errandRun').addEventListener('click', runErrands);
runErrands();
