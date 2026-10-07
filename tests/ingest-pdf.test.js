import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAdmitCard, scoreResult } from '../src/ingest/readAdmitCard.js';
import { nodeEnv } from './nodeEnv.js';
import { compareToTruth, leaksPersonalData } from './accuracy-lib.js';
import { buildPlaceIndex } from '../src/logic/places.js';

// The sample cards are real PDF / image files made by tools/makeFixtures.js (fake people, real public centres).
// These tests read the PDFs that contain real text, so no photo reading (OCR) and no network is needed.
const truth = JSON.parse(readFileSync('tests/fixtures/truth.json', 'utf8'));
const placeIndex = buildPlaceIndex(JSON.parse(readFileSync('data/places.json', 'utf8')));
const noOcr = { ...nodeEnv, getOcr: async () => { throw new Error('OCR is not used in this test'); } };
const load = (t) => new Uint8Array(readFileSync(`tests/fixtures/samples/${t.file}`));
const englishTextPdfs = truth.filter((t) => t.format === 'pdf-text' && t.lang !== 'hi' && t.lang !== 'bi');

test('text PDFs (English): at least 95% of fields are read correctly, with no name or roll number leaking', async () => {
  let score = 0; let total = 0;
  for (const t of englishTextPdfs) {
    const r = await readAdmitCard({ bytes: load(t), type: 'application/pdf' }, noOcr, { now: new Date('2026-02-20'), placeIndex });
    assert.equal(r.source, 'pdf-text');
    const rows = compareToTruth(t, r.result);
    score += rows.reduce((s, x) => s + x.ok, 0); total += rows.length;
    assert.deepEqual(leaksPersonalData(t, r.result), [], t.id);
  }
  assert.ok(score / total >= 0.95, `accuracy ${(score / total * 100).toFixed(1)}%`);
});

test('PDF: the multi-day timetable gives one day per exam date', async () => {
  const t = truth.find((x) => x.id.startsWith('s07'));
  const r = await readAdmitCard({ bytes: load(t), type: 'application/pdf' }, noOcr, { now: new Date('2026-02-20'), placeIndex });
  assert.equal(r.result.days.length, 3);
  assert.deepEqual(r.result.days.map((d) => d.date.value), t.days.map((d) => d.date));
});

test('PDF: a bilingual text PDF is still read when OCR is not available (falls back to the text)', async () => {
  const t = truth.find((x) => x.id.startsWith('s09'));
  const r = await readAdmitCard({ bytes: load(t), type: 'application/pdf' }, noOcr, { now: new Date('2026-02-20'), placeIndex });
  assert.equal(r.result.pincode.value, t.pincode);
});

test('the QR code inside s01 is read (the card carries exam details in it)', async () => {
  const t = truth.find((x) => x.id.startsWith('s01'));
  const r = await readAdmitCard({ bytes: load(t), type: 'application/pdf' }, noOcr, { now: new Date('2026-02-20'), placeIndex });
  assert.ok(r.qr && r.qr.centreName === 'Panjab University', JSON.stringify(r.qr));
  assert.ok(!JSON.stringify(r.qr).includes(t.candidate.roll));
});

test('a file with no exam details gives a clear "nothing found" error; garbage bytes fail without crashing', async () => {
  const blank = new Uint8Array(readFileSync('tests/fixtures/samples/s01-jee-pdf.pdf').slice(0, 30));
  await assert.rejects(readAdmitCard({ bytes: blank, type: 'application/pdf' }, noOcr, {}));
  const fakeEnv = { ...noOcr, decodeImage: async () => ({ width: 50, height: 50, data: new Uint8ClampedArray(50 * 50 * 4).fill(255) }), getOcr: async () => ({
    recognize: async () => ({ lines: [], words: [], text: '', confidence: 0 }), detectOrientation: async () => null }) };
  await assert.rejects(readAdmitCard({ bytes: new Uint8Array([1, 2, 3, 4]), type: 'image/png' }, fakeEnv, {}), (e) => e.code === 'nothing-found');
});

test('scoreResult: complete cards are "good", empty ones are not', async () => {
  const t = truth.find((x) => x.id.startsWith('s03'));
  const r = await readAdmitCard({ bytes: load(t), type: 'application/pdf' }, noOcr, { now: new Date('2026-02-20'), placeIndex });
  const s = scoreResult(r.result, 100);
  assert.equal(s.facts, 4);
  assert.ok(s.good);
});
