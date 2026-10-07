// Runs the reader (and optionally the centre finder) on a hold-out set and prints the score.
//   node tests/holdout-run.js tests/holdout/tuning                 reader only; prints per-card failures (tuning set only!)
//   node tests/holdout-run.js tests/holdout/hidden-... --summary   prints only totals (no per-card failures): use this for the hidden set
//   add --centre to also run the real centre search (Nominatim, 1 request per second) and --out file.md to write the report
// The hidden set must never be used to change the code for one card: only the totals are looked at.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { nodeEnv } from './nodeEnv.js';
import { readAdmitCard } from '../src/ingest/readAdmitCard.js';
import { findCentre } from '../src/flow/centreFinder.js';
import { draftFields } from '../src/flow/autoPlan.js';
import { getRoute } from '../src/services/routing.js';
import { haversineMetres } from '../src/dsa/haversine.js';
import { compareToTruth, leaksPersonalData } from './accuracy-lib.js';

const dir = process.argv[2];
const SUMMARY = process.argv.includes('--summary'); const CENTRE = process.argv.includes('--centre');
const outFile = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (!dir) { console.log('Usage: node tests/holdout-run.js <folder with truth.json> [--summary] [--centre] [--out report.md]'); process.exit(1); }

// disk cache for server answers (a re-run does not ask the free servers again)
const CACHE = 'tests/.http-cache'; mkdirSync(CACHE, { recursive: true });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const key = createHash('sha1').update(`${url}|${options.body || ''}`).digest('hex'); const file = `${CACHE}/${key}.json`;
  if (existsSync(file)) return new Response(readFileSync(file, 'utf8'), { status: 200 });
  const res = await realFetch(url, options);
  if (res.ok && !String(url).includes('jsdelivr')) { const text = await res.text(); writeFileSync(file, text); return new Response(text, { status: 200 }); }
  return res;
};

const truth = JSON.parse(readFileSync(`${dir}/truth.json`, 'utf8'));
const NOW = new Date('2026-01-10T09:00:00');
const rows = [];
for (const t of truth) {
  const row = { t, ms: 0 };
  const t0 = Date.now();
  try {
    const read = await readAdmitCard({ bytes: new Uint8Array(readFileSync(`${dir}/${t.file}`)), type: t.file.endsWith('.pdf') ? 'application/pdf' : '' }, nodeEnv, { now: NOW });
    row.read = read; row.compare = compareToTruth(t, read.result); row.leaks = leaksPersonalData(t, read.result);
    // "sure but wrong": a field shown without yellow that is wrong
    row.confident = {};
    const r = read.result;
    for (const c of row.compare) {
      const f = ['examName', 'centreName', 'address', 'city', 'pincode'].includes(c.field) ? r[c.field] : null;
      if (f) row.confident[c.field] = { ok: c.ok, level: f.level };
    }
  } catch (e) { row.error = e.message; row.compare = compareToTruth(t, { examName: { value: '' }, centreName: { value: '' }, address: { value: '' }, city: { value: '' }, pincode: { value: '' }, days: [], notAllowed: [] }); row.leaks = []; }
  row.ms = Date.now() - t0;
  if (CENTRE && row.read) {
    try {
      const found = await findCentre(draftFields(row.read.result));
      row.centre = found;
      if (found.found) {
        row.km = haversineMetres(t.near.lat, t.near.lon, found.lat, found.lng) / 1000;
        const start = { lat: t.near.lat + 0.01, lng: t.near.lon + 0.01 };
        try { row.route = await getRoute(start, found, 'car', ''); } catch { /* counted as not found */ }
      }
    } catch (e) { row.centreError = e.message; }
  }
  rows.push(row);
  process.stdout.write(SUMMARY ? '.' : `${t.id.padEnd(34)} ${(rows.at(-1).compare.reduce((a, c) => a + c.ok, 0) / rows.at(-1).compare.length * 100).toFixed(0).padStart(3)}%\n`);
}
console.log('');

const sum = (list) => list.reduce((a, r) => a + r.compare.reduce((x, c) => x + c.ok, 0), 0);
const cnt = (list) => list.reduce((a, r) => a + r.compare.length, 0);
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
const group = (keyFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r.t); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))); };
const fieldName = (f) => f.replace(/^day\d+\./, '');
const byField = {};
for (const r of rows) for (const c of r.compare) { const k = fieldName(c.field); byField[k] = byField[k] || { ok: 0, n: 0 }; byField[k].ok += c.ok; byField[k].n += 1; }
const table = (title, entries) => `\n### ${title}\n\n| | Cards | Fields correct | Accuracy |\n|---|---|---|---|\n${entries.map(([k, list]) => `| ${k} | ${list.length} | ${sum(list).toFixed(1)} / ${cnt(list)} | ${pct(sum(list), cnt(list))} |`).join('\n')}\n`;

// "sure but wrong" = a text field that is wrong although it is not yellow
let sureWrong = 0; let sureTotal = 0; let yellowRight = 0; let yellowTotal = 0;
for (const r of rows) for (const v of Object.values(r.confident || {})) { if (v.level === 'high') { sureTotal++; if (!v.ok) sureWrong++; } else { yellowTotal++; if (v.ok) yellowRight++; } }

let md = `# Hold-out test: ${dir}\n\nCards: ${rows.length}. Overall: **${pct(sum(rows), cnt(rows))}** (${sum(rows).toFixed(1)} / ${cnt(rows)} fields).  Candidate name / roll number found in a result: ${rows.filter((r) => r.leaks.length).length} cards.\n`;
md += `\n### Per field\n\n| Field | Correct | Accuracy |\n|---|---|---|\n${Object.entries(byField).map(([k, v]) => `| ${k} | ${v.ok.toFixed(1)} / ${v.n} | ${pct(v.ok, v.n)} |`).join('\n')}\n`;
md += table('Per exam body', group((t) => t.body)) + table('Per layout style', group((t) => t.layout)) + table('Per photo quality', group((t) => t.quality)) + table('Per city size', group((t) => (t.big ? 'big city' : 'small town')));
md += table('Per language', group((t) => t.lang)) + table('Per date format', group((t) => t.dateStyle)) + table('Per time format', group((t) => t.timeStyle));
md += `\n### Honest colours\n\nText fields (exam name, centre name, address, city, pincode) shown as sure (not yellow): ${sureTotal}, of which wrong: **${sureWrong}** (${pct(sureWrong, sureTotal)}). Shown yellow: ${yellowTotal}, of which actually right: ${yellowRight}.\n`;
if (CENTRE) {
  const found = rows.filter((r) => r.centre && r.centre.found); const within = (km) => found.filter((r) => r.km <= km).length;
  const wrongState = found.filter((r) => r.km > 100).length;
  md += `\n### Centre on the map (real servers)\n\n- Pin found: ${found.length} / ${rows.length}. Within 2 km of the town centre point: ${within(2)}, within 5 km: ${within(5)}, within 10 km: ${within(10)}, further than 100 km (wrong place): ${wrongState}.\n`;
  md += `- Pin shown "sure" (high): ${found.filter((r) => r.centre.confidence === 'high').length}; of those further than 10 km: ${found.filter((r) => r.centre.confidence === 'high' && r.km > 10).length}.\n- Routes found: ${rows.filter((r) => r.route).length} / ${found.length}.\n`;
  md += `- The centres are FAKE, so a pin can only be checked against the town: "within 2 km" means the pin is in the middle area of the right town (usually the pincode area), not at the college.\n`;
}
if (!SUMMARY) {
  md += '\n### Every field that was wrong (tuning set only)\n\n';
  for (const r of rows) { const wrong = r.compare.filter((c) => c.ok < 1); if (!wrong.length && !r.error) continue; md += `**${r.t.id}** (${r.t.layout}, ${r.t.quality}${r.t.damage.length ? ' ' + r.t.damage.join('+') : ''}, ${r.t.lang})${r.error ? ` ERROR ${r.error}` : ''}\n${wrong.map((w) => `- ${w.field}: expected \`${String(w.expected).slice(0, 60)}\` got \`${String(w.actual ?? '').slice(0, 60)}\``).join('\n')}\n\n`; }
}
if (outFile) writeFileSync(outFile, md);
console.log(md.split('\n### Every field')[0]);
await nodeEnv.close();
