// Runs every sample admit card through the WHOLE flow and measures how often each field is right.
//   npm run accuracy            uses saved server answers if they exist (tests/.http-cache), otherwise asks the real servers
//   npm run accuracy -- --fresh asks the real servers again (Nominatim at most 1 request per second, answers cached)
// Steps per card: upload (file bytes) -> read fields -> find centre on the map (Nominatim / Overpass) -> route (OSRM) -> leave-by.
// Writes tests/ocr-accuracy.md. Photo reading (OCR) language files are downloaded once from the jsDelivr CDN by Tesseract.js.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { nodeEnv } from './nodeEnv.js';
import { readAdmitCard } from '../src/ingest/readAdmitCard.js';
import { findCentre } from '../src/flow/centreFinder.js';
import { getRoute } from '../src/services/routing.js';
import { fetchNearby, CATEGORIES } from '../src/services/overpass.js';
import { buildPlaceIndex } from '../src/logic/places.js';
import { draftFields, leaveForDay } from '../src/flow/autoPlan.js';
import { validateResult } from '../src/ingest/validate.js';
import { haversineMetres } from '../src/dsa/haversine.js';
import { compareToTruth, leaksPersonalData, categoryOf } from './accuracy-lib.js';

const FRESH = process.argv.includes('--fresh');
const CACHE_DIR = 'tests/.http-cache';
mkdirSync(CACHE_DIR, { recursive: true });
const realFetch = globalThis.fetch;
const stats = { cached: 0, real: 0 };
// Disk cache for server answers so a re-run does not hit the free servers again.
globalThis.fetch = async (url, options = {}) => {
  const key = createHash('sha1').update(`${url}|${options.body || ''}`).digest('hex');
  const file = `${CACHE_DIR}/${key}.json`;
  if (!FRESH && existsSync(file)) { stats.cached++; return new Response(readFileSync(file, 'utf8'), { status: 200 }); }
  stats.real++;
  const res = await realFetch(url, options);
  if (res.ok && !String(url).includes('jsdelivr')) { const text = await res.text(); writeFileSync(file, text); return new Response(text, { status: 200 }); }
  return res;
};

const truth = JSON.parse(readFileSync('tests/fixtures/truth.json', 'utf8'));
const placeIndex = buildPlaceIndex(JSON.parse(readFileSync('data/places.json', 'utf8')));
const NOW = new Date('2026-01-10T09:00:00');
const STARTS = { Chandigarh: [30.7417, 76.7822], Mohali: [30.7417, 76.7822], Panchkula: [30.7417, 76.7822], Delhi: [28.643, 77.2197], Jaipur: [26.9196, 75.7878],
  Lucknow: [26.8315, 80.921], Patna: [25.6003, 85.1383], Bhopal: [23.267, 77.4116], Gorakhpur: [26.7576, 83.3689], 'लखनऊ': [26.8315, 80.921] };
const startFor = (t) => { const c = STARTS[t.city] || STARTS.Chandigarh; return { lat: c[0], lng: c[1] }; };

const rows = [];
for (const t of truth) {
  const row = { t, category: categoryOf(t), ms: {} };
  const bytes = new Uint8Array(readFileSync(`tests/fixtures/samples/${t.file}`));
  let t0 = Date.now();
  try {
    const read = await readAdmitCard({ bytes, type: t.file.endsWith('.pdf') ? 'application/pdf' : '' }, nodeEnv, { now: NOW, placeIndex });
    row.read = read; row.compare = compareToTruth(t, read.result); row.leaks = leaksPersonalData(t, read.result);
  } catch (e) {
    row.error = e.message;
    row.compare = compareToTruth(t, { examName: { value: '' }, centreName: { value: '' }, address: { value: '' }, city: { value: '' }, pincode: { value: '' }, days: [], notAllowed: [] });
    row.leaks = [];
  }
  row.ms.read = Date.now() - t0;

  if (row.read) {
    const result = row.read.result;
    t0 = Date.now();
    try {
      const found = await findCentre(draftFields(result));
      row.centre = found;
      if (found.found) { row.km = haversineMetres(t.near.lat, t.near.lon, found.lat, found.lng) / 1000; validateResult(result, { now: NOW, geo: found }); }
      if (found.found && t.id.startsWith('s28')) {
        const t1 = Date.now();
        try { row.nearby = await fetchNearby({ lat: found.lat, lng: found.lng, city: result.city.value, pincode: result.pincode.value }); } catch (e) { row.nearbyError = e.message; }
        row.ms.nearby = Date.now() - t1;
      }
    } catch (e) { row.centreError = e.message; }
    row.ms.centre = Date.now() - t0;
    if (row.centre?.found) {
      t0 = Date.now();
      try {
        const r = await getRoute(startFor(t), row.centre, 'car', '');
        row.route = r;
        row.leave = leaveForDay({ buffer: 60, extra: 0, route: r, travelMin: null }, result.days[0] || { reportTime: { value: '' }, gateTime: { value: '' } });
      } catch (e) { row.routeError = e.code || e.message; }
      row.ms.route = Date.now() - t0;
    }
  }
  const score = row.compare.reduce((s, x) => s + x.ok, 0);
  console.log(`${t.id.padEnd(30)} ${(score / row.compare.length * 100).toFixed(0).padStart(3)}%  map ${row.km == null ? ' -- ' : `${row.km.toFixed(1)}km`.padStart(6)} ${row.centre?.confidence || ''}  route ${row.route ? `${row.route.distanceKm.toFixed(0)}km` : 'none'}  ${row.error || ''}`);
  rows.push(row);
}
await nodeEnv.close();

// ------------------------------------------------------------------------------- report
const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '-');
const sum = (list) => list.reduce((s, r) => s + r.compare.reduce((x, c) => x + c.ok, 0), 0);
const cnt = (list) => list.reduce((s, r) => s + r.compare.length, 0);
const cats = ['PDF with text', 'Scanned PDF (image only)', 'Normal phone photos and screenshots', 'Hard photos (blur / low light / shadow / cropped)'];
const catRows = cats.map((c) => { const l = rows.filter((r) => r.category === c); return { c, n: l.length, score: sum(l), total: cnt(l) }; });
const targetPdf = catRows[0].score / catRows[0].total;
const targetPhoto = catRows[2].score / catRows[2].total;

const byField = {};
for (const r of rows) for (const c of r.compare) {
  const name = c.field.replace(/^day\d\./, '');
  (byField[name] = byField[name] || { ok: 0, n: 0 }); byField[name].ok += c.ok; byField[name].n++;
}
const conf = { high: { ok: 0, n: 0 }, medium: { ok: 0, n: 0 }, low: { ok: 0, n: 0 } };
const fieldKeys = ['examName', 'centreName', 'address', 'city', 'pincode'];
for (const r of rows) if (r.read) for (const k of fieldKeys) {
  const f = r.read.result[k]; if (!f.value) continue;
  const c = r.compare.find((x) => x.field === k);
  conf[f.level].n++; conf[f.level].ok += c.ok;
}
const withMap = rows.filter((r) => r.km != null);
const within = (r) => r.km <= (r.t.nearRadiusKm || 5);
const mapOk = withMap.filter(within).length;
const mapHigh = rows.filter((r) => r.centre?.confidence === 'high').length;
const mapHighCorrect = rows.filter((r) => r.centre?.confidence === 'high' && within(r)).length;
const routeOk = rows.filter((r) => r.route && !r.route.straightLine && r.route.distanceKm > 0).length;
const leaks = rows.filter((r) => r.leaks.length);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

let md = `# OCR and full-flow accuracy\n\n`;
md += `Generated by \`npm run accuracy\` on ${new Date().toISOString().slice(0, 10)} (${os.cpus()[0].model}, Node ${process.version}). `;
md += `${rows.length} sample admit cards in \`tests/fixtures/samples/\` (answer key: \`tests/fixtures/truth.json\`). `;
md += `Server answers: ${stats.real} real requests, ${stats.cached} from the saved cache${FRESH ? ' (run with --fresh)' : ''}.\n\n`;
md += `**Important honesty note.** The samples are made-up cards that I generated (fake people, real public exam centres) in 8 layouts, English, Hindi and bilingual, with text PDFs, image-only PDFs and photos made worse on purpose. They are realistic but they are not real admit cards, and I wrote the reader and the samples together, so real-world accuracy will be lower. The "expected centre position" is my own approximate coordinate for each real institution (within about 5 km).\n\n`;
md += `## Targets\n\n| Target | Result | Met? |\n|---|---|---|\n`;
md += `| PDFs with real text: at least 95% of fields correct | ${(targetPdf * 100).toFixed(1)}% | ${targetPdf >= 0.95 ? 'Yes' : 'No'} |\n`;
md += `| Normal phone photos and screenshots: at least 80% | ${(targetPhoto * 100).toFixed(1)}% | ${targetPhoto >= 0.8 ? 'Yes' : 'No'} |\n\n`;
md += `"Normal phone photos" = normal photos (slight tilt/blur/noise), screenshots and the 5° tilted photo. Hard photos (blur, low light, shadow, cropped edge) and scanned PDFs are reported separately.\n\n`;
md += `## By kind of file\n\n| Kind | Cards | Fields correct | Accuracy |\n|---|---|---|---|\n`;
for (const c of catRows) md += `| ${c.c} | ${c.n} | ${c.score.toFixed(1)} / ${c.total} | ${pct(c.score, c.total)} |\n`;
md += `| **All files** | ${rows.length} | ${sum(rows).toFixed(1)} / ${cnt(rows)} | **${pct(sum(rows), cnt(rows))}** |\n\n`;
md += `## How often each field is read correctly (all cards)\n\n| Field | Correct | Accuracy |\n|---|---|---|\n`;
for (const [name, v] of Object.entries(byField)) md += `| ${name} | ${v.ok.toFixed(1)} / ${v.n} | ${pct(v.ok, v.n)} |\n`;
md += `\n## Does the confidence colour mean something?\n\nOf the text fields (exam name, centre, address, city, pincode) the reader marks **high** confidence (shown normal) or **medium/low** (shown yellow).\n\n| Level | Fields | Correct | Accuracy |\n|---|---|---|---|\n`;
for (const k of ['high', 'medium', 'low']) md += `| ${k} | ${conf[k].n} | ${conf[k].ok} | ${pct(conf[k].ok, conf[k].n)} |\n`;
md += `\n## Map and route (real servers)\n\n`;
md += `- Centre found on the map: ${withMap.length} / ${rows.length} cards. Within 5 km (12 km for the Gorakhpur cards) of the expected spot: **${mapOk} / ${rows.length}**.\n`;
md += `- Pin marked "high confidence" (no yellow warning): ${mapHigh} cards, of which ${mapHighCorrect} were within 5 km.\n`;
md += `- Route from a start point in the same city (public OSRM server): **${routeOk} / ${withMap.length}** found.\n`;
md += `- Median time per card on this laptop: reading ${median(rows.map((r) => r.ms.read))} ms, finding the centre ${median(rows.filter((r) => r.ms.centre).map((r) => r.ms.centre))} ms (includes the 1 request/second limit), route ${median(rows.filter((r) => r.ms.route).map((r) => r.ms.route))} ms.\n`;
md += `- Candidate name or roll number found anywhere in the result: **${leaks.length}** cards ${leaks.length ? `(${leaks.map((r) => r.t.id).join(', ')})` : '(none)'}.\n\n`;
const nta = rows.find((r) => r.t.id.startsWith('s28'));
md += `## The real-style NTA card (Gorakhpur, s28: drawn like the real file): pin, route and nearby places\n\n`;
if (nta && nta.centre && nta.centre.found) {
  md += `- Pin: ${nta.centre.lat.toFixed(4)}, ${nta.centre.lng.toFixed(4)} (${nta.km == null ? '?' : nta.km.toFixed(1)} km from the middle of Gorakhpur), confidence **${nta.centre.confidence}**${nta.centre.confidence === 'high' ? '' : ' (shown yellow: "please check the pin")'}.\n`;
  md += `- Route: ${nta.route ? nta.route.distanceKm.toFixed(1) + ' km found' : 'not found'}.\n`;
  if (nta.nearby) {
    md += `- Nearby (${nta.ms.nearby} ms). Radius used per type, number found, nearest:\n\n| Type | Radius | Found | Nearest |\n|---|---|---|---|\n`;
    for (const c of CATEGORIES) {
      const list = nta.nearby.items.filter((i) => i.category === c.id);
      md += `| ${c.icon} ${c.id} | ${((nta.nearby.radiusByType[c.id] || 0) / 1000).toFixed(0)} km | ${list.length} | ${list.length ? `${list[0].name || '(no name)'}, ${list[0].distanceKm.toFixed(2)} km` : (nta.nearby.failedTypes || []).includes(c.id) ? '**server did not answer** (try again)' : 'none within 5 km (asked, really empty)'} |\n`;
    }
    md += `\n`;
  } else md += `- Nearby: not available (${nta.nearbyError || 'no answer'}). Public Overpass servers are often busy; run again later.\n\n`;
}
const before = existsSync('tests/ocr-accuracy-before.md') ? readFileSync('tests/ocr-accuracy-before.md', 'utf8') : '';
md += `## Before and after the fixes\n\n| | Original (20 cards) | After the 1st table fix (27 cards) | Now (${rows.length} cards, incl. a copy drawn like the real file) |\n|---|---|---|---|\n| All files | 97.2% | 97.1% | ${pct(sum(rows), cnt(rows))} |\n| PDF with text | 99.1% | 99.2% | ${pct(catRows.find((c) => c.c.startsWith('PDF'))?.score ?? 0, catRows.find((c) => c.c.startsWith('PDF'))?.total ?? 1)} |\n| Normal photos | 98.9% | 98.7% | ${(targetPhoto * 100).toFixed(1)}% |\n| Centre within 5 km | 19 / 20 | 26 / 27 | ${mapOk} / ${rows.length} |\n| Route found | 20 / 20 | 27 / 27 | ${routeOk} / ${withMap.length} |\n\nThe first table fix passed on my own fake cards but FAILED on the real JEE Main card: the real card has faint 1-pixel grey lines, a small 768x1024 picture, and a title split in two lines. The cards s21 to s27 did not look like that. s28 is drawn to look like the real file (same size, same cell positions, same faint lines, Arial text, JPEG) and the reader had to be fixed until s28 and the real card both read correctly.\n\n`;
md += `## Every card\n\n| Card | Kind | Read as | Fields | Map km | Pin | Route km | Leave by |\n|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) {
  const s = r.compare.reduce((a, c) => a + c.ok, 0);
  md += `| ${r.t.id} | ${r.category.split(' (')[0]} | ${r.read ? `${r.read.source}${r.read.variant ? '/' + r.read.variant : ''}` : 'ERROR'} | ${pct(s, r.compare.length)} | ${r.km == null ? '-' : r.km.toFixed(1)} | ${r.centre?.confidence || '-'} | ${r.route ? r.route.distanceKm.toFixed(0) : '-'} | ${r.leave ? r.leave.text : '-'} |\n`;
}
md += `\n## What went wrong (every field that was not exactly right)\n\n`;
for (const r of rows) {
  const wrong = r.compare.filter((c) => c.ok < 1);
  if (!wrong.length && !r.error) continue;
  md += `**${r.t.id}**${r.error ? ` (could not read: ${r.error})` : ''}\n`;
  for (const w of wrong) md += `- ${w.field}: expected \`${String(w.expected).slice(0, 60)}\`, got \`${String(w.actual ?? '').slice(0, 60)}\`\n`;
  md += '\n';
}
md += `## Limits of this test\n\n- Synthetic cards from my own generator; fonts are clean and layouts are ones I thought of.\n- Hard photos use simple effects (blur, darkening, one shadow, tight crop); real phone photos have perspective, glare, folds and fingers.\n- Hindi PDFs store text in scrambled order, so those are read by photo reading instead (the report shows "pdf-text+ocr").\n- Centre positions are checked against my approximate coordinates, not surveyed ones.\n- Timing is from a laptop; a low-end phone is several times slower.\n`;
writeFileSync('tests/ocr-accuracy.md', md);
console.log(`\nPDF with text ${(targetPdf * 100).toFixed(1)}% | normal photos ${(targetPhoto * 100).toFixed(1)}% | map ${mapOk}/${rows.length} | route ${routeOk}/${withMap.length} | leaks ${leaks.length}`);
console.log('Saved tests/ocr-accuracy.md');
