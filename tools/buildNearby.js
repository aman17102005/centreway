// Builds data/nearby-tricity.json: the nearby places (food, stay, ATM, chemist, photocopy, toilets, petrol pump, bus stand, railway station)
// of the Chandigarh–Mohali–Panchkula–Kharar area, so the app shows them instantly there, offline, without asking Overpass.
//
//   node tools/buildNearby.js            download from Overpass (small pieces, each saved in tools/.cache/nearby-pieces, a re-run resumes)
//
// Data: © OpenStreetMap contributors (ODbL). The area is cut into 4 x 4 pieces and each piece is asked in 3 small groups, slowly,
// because the public servers time out on big questions. This is a build tool, not part of the app.
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CATEGORIES, categoryOfTags } from '../src/services/categories.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const CACHE = join(ROOT, 'tools', '.cache', 'nearby-pieces'); mkdirSync(CACHE, { recursive: true });
const AREA = { south: 30.60, west: 76.55, north: 30.82, east: 76.95 };   // the same area as the offline road graph
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const TILES = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GROUPS = [['food', 'atm', 'pharmacy'], ['copy', 'toilet', 'fuel'], ['bus', 'rail', 'lodging']];

function queryFor(box, ids) {
  const rows = [];
  for (const c of CATEGORIES.filter((x) => ids.includes(x.id))) for (const [key, values] of c.tags) for (const v of values) rows.push(`nwr["${key}"="${v}"](${box});`);
  return `[out:json][timeout:60];(${rows.join('')});out center tags;`;
}

async function ask(query) {
  for (let round = 0; round < 12; round++) {
    const server = SERVERS[round % SERVERS.length];
    try {
      const res = await fetch(server, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CentreWay/1.0 (free exam-day planner; student project; data build)' }, body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(90000) });
      if (res.ok) return await res.json();
      console.log(`    ${new URL(server).host}: HTTP ${res.status}`);
    } catch (e) { console.log(`    ${new URL(server).host}: ${e.name}`); }
    await sleep(8000 + round * 4000);
  }
  throw new Error('Overpass did not answer');
}

const dLat = (AREA.north - AREA.south) / TILES; const dLon = (AREA.east - AREA.west) / TILES;
let done = 0; const total = TILES * TILES * GROUPS.length;
for (let r = 0; r < TILES; r++) for (let c = 0; c < TILES; c++) {
  const box = [AREA.south + r * dLat, AREA.west + c * dLon, AREA.south + (r + 1) * dLat, AREA.west + (c + 1) * dLon].map((x) => x.toFixed(5)).join(',');
  for (let g = 0; g < GROUPS.length; g++) {
    const file = join(CACHE, `t${r}${c}g${g}.json`); done++;
    if (existsSync(file)) continue;
    console.log(`piece ${done}/${total} (${box}) group ${GROUPS[g].join('+')}`);
    const data = await ask(queryFor(box, GROUPS[g]));
    writeFileSync(file, JSON.stringify(data.elements));
    await sleep(2500);
  }
}

// merge, drop duplicates (same type + same name within about 50 m), store compact: [typeIndex, lat*1e5, lon*1e5, name]
const SCALE = 1e5; const ids = CATEGORIES.map((c) => c.id); const seen = new Map(); const out = [];
for (const f of readdirSync(CACHE).filter((x) => x.endsWith('.json')).sort()) {
  for (const el of JSON.parse(readFileSync(join(CACHE, f), 'utf8'))) {
    const tags = el.tags || {}; const cat = categoryOfTags(tags); const lat = el.lat ?? el.center?.lat; const lon = el.lon ?? el.center?.lon;
    if (!cat || lat == null || lon == null) continue;
    const name = String(tags.name || tags['name:en'] || tags.brand || tags.operator || '').trim();
    const key = `${cat.id}|${name.toLowerCase()}|${Math.round(lat * 2000)}|${Math.round(lon * 2000)}`;   // about 55 m cells
    if (seen.has(key)) continue;
    seen.set(key, 1);
    out.push([ids.indexOf(cat.id), Math.round(lat * SCALE), Math.round(lon * SCALE), name]);
  }
}
writeFileSync(join(ROOT, 'data', 'nearby-tricity.json'), JSON.stringify({ area: AREA, scale: SCALE, types: ids, places: out }));
const counts = {}; for (const p of out) counts[ids[p[0]]] = (counts[ids[p[0]]] || 0) + 1;
console.log(`Saved data/nearby-tricity.json: ${out.length} places`, counts);
