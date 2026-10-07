// Builds the offline road graph and the place-name list for the Chandigarh–Mohali–Panchkula–Kharar area.
//
//   node tools/buildGraph.js            download from Overpass (once), then build data/graph.json + data/places.json
//   node tools/buildGraph.js --cached   skip the download and use the saved raw files in tools/.cache/
//
// Data: © OpenStreetMap contributors (ODbL). Please be gentle with the public Overpass server:
// this script makes only two requests. Run it once; the result is committed in data/.
//
// This is a build tool, not part of the app, so it may use normal JavaScript (Map, sort, ...).
// The app itself only uses my own data structures in src/dsa/.

import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const CACHE = join(ROOT, 'tools', '.cache');
const DATA = join(ROOT, 'data');
// Public Overpass servers. If the first is busy, the next one is tried.
const OVERPASS_SERVERS = ['https://overpass-api.de/api/interpreter'];
const ROAD_TILES = 6; // roads: the area is cut into 6 x 6 small pieces, because big requests time out. Each piece is saved, so a re-run resumes.
const AREA = { south: 30.60, west: 76.55, north: 30.82, east: 76.95 }; // Chandigarh, Mohali, Panchkula, Kharar, Zirakpur
const SCALE = 1e5;           // coordinates stored as integers = degrees * 100000 (about 1 m)
const SIMPLIFY_METRES = 12;  // road bends smaller than this are dropped (straight pieces get merged)

// Road types we keep. Code numbers are used by src/dsa/graph.js (keep the two in sync).
const TYPE_CODE = {
  motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, unclassified: 5, residential: 6, living_street: 7, pedestrian: 8,
};
const HIGHWAYS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Send one query. Tries each server up to 2 times; waits between tries (be gentle). */
async function overpass(query, label) {
  let lastError = null;
  for (let round = 0; round < 3; round++) {
    for (const server of OVERPASS_SERVERS) {
      try {
        console.log(`  ${label}: asking ${new URL(server).host} ...`);
        const res = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CentreWay-student-project/1.0 (graph build, run once)', Accept: '*/*' },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(110000), // never wait more than 110 s for one piece
        });
        if (res.ok) return await res.text();
        lastError = new Error(`HTTP ${res.status}`);
      } catch (e) { lastError = e; }
      console.log(`    failed: ${lastError.message}`);
      await sleep(String(lastError.message).includes('429') ? 30000 : 5000); // 429 = too many requests: wait longer
    }
  }
  throw new Error(`Overpass failed for ${label}: ${lastError?.message}`);
}

/** The area as TILES x TILES boxes "south,west,north,east". */
function tileBoxes(TILES) {
  const boxes = [];
  const dLat = (AREA.north - AREA.south) / TILES, dLon = (AREA.east - AREA.west) / TILES;
  for (let r = 0; r < TILES; r++) for (let c = 0; c < TILES; c++) {
    boxes.push([AREA.south + r * dLat, AREA.west + c * dLon, AREA.south + (r + 1) * dLat, AREA.west + (c + 1) * dLon].map((x) => x.toFixed(5)).join(','));
  }
  return boxes;
}

/** Download one box. If the server keeps failing (too much data), cut the box into 4 smaller boxes and join the answers. */
async function downloadBox(queryTemplate, box, label, depth) {
  try {
    return await overpass(queryTemplate.replaceAll('%BBOX%', box), label);
  } catch (error) {
    if (depth >= 3) {
      console.log(`  WARNING: ${label} could not be downloaded (${error.message}); skipping this small box. The map will have a small gap there.`);
      return JSON.stringify({ elements: [] });
    }
    console.log(`  ${label}: too heavy, splitting into 4 smaller boxes`);
    const [s, w, n, e] = box.split(',').map(Number);
    const midLat = (s + n) / 2, midLon = (w + e) / 2;
    const parts = [[s, w, midLat, midLon], [s, midLon, midLat, e], [midLat, w, n, midLon], [midLat, midLon, n, e]];
    const elements = [];
    for (let k = 0; k < parts.length; k++) {
      const text = await downloadBox(queryTemplate, parts[k].map((x) => x.toFixed(5)).join(','), `${label}.${k + 1}`, depth + 1);
      elements.push(...JSON.parse(text).elements);
      await sleep(4000);
    }
    return JSON.stringify({ elements });
  }
}

/** Download (or load from the saved copy) the elements for a query that has a %BBOX% placeholder. Duplicates (same type+id) are removed. */
async function loadRaw(name, queryTemplate, useCache, tiles) {
  const file = join(CACHE, `${name}.json`);
  if (useCache && existsSync(file)) { console.log(`Using saved ${name}.json`); return JSON.parse(readFileSync(file, 'utf8')); }
  const pieceDir = join(CACHE, `${name}-pieces`);
  mkdirSync(pieceDir, { recursive: true });
  const boxes = tileBoxes(tiles);
  console.log(`Downloading ${name} in ${boxes.length} piece(s) ...`);
  const seen = new Set();
  const elements = [];
  for (let i = 0; i < boxes.length; i++) {
    const pieceFile = join(pieceDir, `${i}.json`);
    let text;
    if (existsSync(pieceFile)) { text = readFileSync(pieceFile, 'utf8'); console.log(`  piece ${i + 1}/${boxes.length}: saved copy`); }
    else {
      text = await downloadBox(queryTemplate, boxes[i], `${name} piece ${i + 1}/${boxes.length}`, 0);
      writeFileSync(pieceFile, text);
      await sleep(4000); // be gentle with the public server
    }
    for (const el of JSON.parse(text).elements) {
      const key = `${el.type}${el.id}`;
      if (!seen.has(key)) { seen.add(key); elements.push(el); }
    }
  }
  writeFileSync(file, JSON.stringify({ elements }));
  console.log(`  ${name}: ${elements.length} elements`);
  return { elements };
}

// ------------------------------------------------------------ small geometry helpers
const metresPerDegree = 111320;
function lengthMetres(a, b) { // flat approximation, fine for short pieces
  const dy = (b.lat - a.lat) * metresPerDegree;
  const dx = (b.lon - a.lon) * metresPerDegree * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}
function distanceToSegment(p, a, b) {
  const k = Math.cos(a.lat * Math.PI / 180);
  const ax = a.lon * k * metresPerDegree, ay = a.lat * metresPerDegree;
  const bx = b.lon * k * metresPerDegree, by = b.lat * metresPerDegree;
  const px = p.lon * k * metresPerDegree, py = p.lat * metresPerDegree;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Ramer–Douglas–Peucker: keep only the points that bend the line by more than `epsilon` metres. */
function simplify(points, epsilon) {
  if (points.length <= 2) return points;
  let worst = 0, worstIndex = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], points[0], points[points.length - 1]);
    if (d > worst) { worst = d; worstIndex = i; }
  }
  if (worst <= epsilon) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, worstIndex + 1), epsilon);
  const right = simplify(points.slice(worstIndex), epsilon);
  return left.slice(0, -1).concat(right);
}

// ------------------------------------------------------------------------ road graph
function buildRoadGraph(raw) {
  const ways = [];
  for (const el of raw.elements) {
    if (el.type !== 'way' || !el.tags || !el.nodes || !el.geometry || el.nodes.length < 2) continue;
    const base = String(el.tags.highway).replace('_link', '');
    if (!(base in TYPE_CODE)) continue;
    if (el.tags.access === 'private' || el.tags.access === 'no') continue;
    let nodes = el.nodes.slice();
    let geometry = el.geometry.slice();
    let oneway = el.tags.oneway === 'yes' || el.tags.oneway === 'true' || el.tags.oneway === '1' ||
      el.tags.junction === 'roundabout' || (base === 'motorway' && el.tags.oneway !== 'no');
    if (el.tags.oneway === '-1') { nodes.reverse(); geometry.reverse(); oneway = true; }
    if (base === 'pedestrian') oneway = false;
    ways.push({ type: TYPE_CODE[base], oneway, nodes, geometry });
  }
  console.log(`Roads kept: ${ways.length}`);

  // Which OSM nodes are junctions? Used by 2+ ways, or the start/end of a way.
  const uses = new Map();
  for (const w of ways) {
    w.nodes.forEach((id, i) => {
      const extra = (i === 0 || i === w.nodes.length - 1) ? 2 : 1; // ends always count as junctions
      uses.set(id, (uses.get(id) || 0) + extra);
    });
  }

  // Cut each way at junctions. Everything between two junctions becomes ONE edge.
  const coords = new Map(); // junction id -> {lat, lon}
  const edges = [];
  for (const w of ways) {
    let startIndex = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      if (uses.get(w.nodes[i]) < 2) continue; // not a junction: still inside a straight piece
      const piece = w.geometry.slice(startIndex, i + 1);
      let length = 0;
      for (let k = 1; k < piece.length; k++) length += lengthMetres(piece[k - 1], piece[k]);
      const a = w.nodes[startIndex], b = w.nodes[i];
      if (a !== b && length > 0) {
        coords.set(a, piece[0]); coords.set(b, piece[piece.length - 1]);
        edges.push({ a, b, length: Math.max(1, Math.round(length)), type: w.type, oneway: w.oneway, bends: simplify(piece, SIMPLIFY_METRES).slice(1, -1) });
      }
      startIndex = i;
    }
  }

  // Keep only the biggest connected piece, so every kept point can reach every other.
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const id of coords.keys()) parent.set(id, id);
  for (const e of edges) parent.set(find(e.a), find(e.b));
  const sizes = new Map();
  for (const id of coords.keys()) sizes.set(find(id), (sizes.get(find(id)) || 0) + 1);
  let bigRoot = null;
  for (const [root, size] of sizes) if (bigRoot === null || size > sizes.get(bigRoot)) bigRoot = root;
  const keptEdges = edges.filter((e) => find(e.a) === bigRoot);

  // Number the nodes 0..n-1 and write flat arrays.
  const index = new Map();
  const nodes = [];
  const idOf = (osmId) => {
    if (!index.has(osmId)) {
      index.set(osmId, index.size);
      const c = coords.get(osmId);
      nodes.push(Math.round(c.lat * SCALE), Math.round(c.lon * SCALE));
    }
    return index.get(osmId);
  };
  const flatEdges = []; // a, b, length(m), type, oneway, number of bend points
  const geo = [];       // bend points: lat, lon, lat, lon ...
  for (const e of keptEdges) {
    flatEdges.push(idOf(e.a), idOf(e.b), e.length, e.type, e.oneway ? 1 : 0, e.bends.length);
    for (const p of e.bends) geo.push(Math.round(p.lat * SCALE), Math.round(p.lon * SCALE));
  }
  console.log(`Graph: ${nodes.length / 2} nodes, ${keptEdges.length} edges, ${geo.length / 2} bend points`);
  return {
    version: 1, scale: SCALE, bbox: [AREA.south, AREA.west, AREA.north, AREA.east],
    credit: '© OpenStreetMap contributors (ODbL)', edgeFields: 'a,b,metres,type,oneway,bendCount',
    nodes, edges: flatEdges, geo,
  };
}

// ----------------------------------------------------------------- place names (trie)
const PLACE_WEIGHT = { city: 100, town: 80, suburb: 60, quarter: 50, neighbourhood: 50, village: 40, locality: 30 };

function buildPlaces(raw) {
  const out = new Map(); // lower-case name -> best entry (avoid duplicates)
  const add = (name, weight, kind, lat, lon) => {
    name = String(name || '').trim();
    if (name.length < 3 || name.length > 60) return;
    const key = name.toLowerCase();
    if (!out.has(key) || out.get(key).weight < weight) out.set(key, { name, weight, kind, lat: lat == null ? null : Number(lat.toFixed(5)), lon: lon == null ? null : Number(lon.toFixed(5)) });
  };
  for (const el of raw.elements) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null) continue;
    const name = t['name:en'] || t.name;
    if (t.railway === 'station' || t.public_transport === 'station') add(name, 90, 'station', lat, lon);
    else if (t.amenity === 'bus_station') add(name, 85, 'bus', lat, lon);
    else if (t.tourism === 'hostel') add(name, 35, 'hostel', lat, lon);
    else if (t.place && PLACE_WEIGHT[t.place]) add(name, PLACE_WEIGHT[t.place], t.place, lat, lon);
  }
  // Major Indian exam cities (no coordinates: choosing one searches for it by name).
  for (const city of EXAM_CITIES) add(city, 45, 'city', null, null);
  return [...out.values()].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
}

const EXAM_CITIES = ['Delhi', 'New Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow',
  'Kanpur', 'Nagpur', 'Patna', 'Bhopal', 'Indore', 'Ranchi', 'Raipur', 'Bhubaneswar', 'Guwahati', 'Dehradun', 'Shimla', 'Jammu', 'Srinagar',
  'Amritsar', 'Ludhiana', 'Jalandhar', 'Patiala', 'Ambala', 'Karnal', 'Rohtak', 'Hisar', 'Gurugram', 'Faridabad', 'Noida', 'Ghaziabad',
  'Meerut', 'Agra', 'Varanasi', 'Prayagraj', 'Gorakhpur', 'Bareilly', 'Aligarh', 'Moradabad', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner',
  'Surat', 'Vadodara', 'Rajkot', 'Gwalior', 'Jabalpur', 'Bilaspur', 'Visakhapatnam', 'Vijayawada', 'Tirupati', 'Coimbatore', 'Madurai',
  'Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Mysuru', 'Mangaluru', 'Hubballi', 'Nashik', 'Aurangabad', 'Kolhapur', 'Gaya', 'Muzaffarpur',
  'Bhagalpur', 'Dhanbad', 'Jamshedpur', 'Cuttack', 'Siliguri', 'Imphal', 'Shillong', 'Agartala', 'Panaji', 'Chandigarh', 'Mohali', 'Panchkula'];

// ------------------------------------------------------------------------------- main
const useCache = process.argv.includes('--cached');
const roadsQuery = `[out:json][timeout:90][bbox:%BBOX%];way["highway"~"^(${HIGHWAYS})(_link)?$"];out geom;`;
const placesQuery = `[out:json][timeout:120][bbox:%BBOX%];(node["place"~"^(city|town|suburb|quarter|neighbourhood|village|locality)$"]["name"];` +
  `node["railway"="station"]["name"];node["public_transport"="station"]["name"];node["amenity"="bus_station"]["name"];nwr["tourism"="hostel"]["name"];);out center;`;

const roads = await loadRaw('roads', roadsQuery, useCache, ROAD_TILES);
const places = await loadRaw('places', placesQuery, useCache, 1);
mkdirSync(DATA, { recursive: true });
const graph = buildRoadGraph(roads);
writeFileSync(join(DATA, 'graph.json'), JSON.stringify(graph));
const placeList = buildPlaces(places);
writeFileSync(join(DATA, 'places.json'), JSON.stringify(placeList));
console.log(`graph.json ${(statSync(join(DATA, 'graph.json')).size / 1e6).toFixed(2)} MB, places.json ${placeList.length} names (${(statSync(join(DATA, 'places.json')).size / 1e3).toFixed(0)} KB)`);
