import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAdmitCard } from '../src/ingest/readAdmitCard.js';
import { nodeEnv } from './nodeEnv.js';
import { compareToTruth, leaksPersonalData } from './accuracy-lib.js';
import { parseCentre, splitCentreCode, cutAtPincode, cityFromParts, splitName } from '../src/ingest/centreParse.js';
import { detectTemplate } from '../src/ingest/templates.js';
import { buildPlaceIndex } from '../src/logic/places.js';

// The fake copy of the real JEE Main (NTA) card: same table, labels, centre address and times; fake name, roll number, application number and ID.
const truth = JSON.parse(readFileSync('tests/fixtures/truth.json', 'utf8'));
const placeIndex = buildPlaceIndex(JSON.parse(readFileSync('data/places.json', 'utf8')));
const noOcr = { ...nodeEnv, getOcr: async () => { throw new Error('OCR is not used in this test'); } };
const NOW = new Date('2026-01-10');
after(async () => { await nodeEnv.close(); });          // stop the OCR worker so the test run can end

/** Every field of the card, checked one by one. */
function checkCard(result, label, { notAllowed = true } = {}) {
  const d = result.days[0];
  assert.equal(result.days.length, 1, `${label}: one exam day`);
  assert.equal(d.date.value, '2026-01-23', `${label}: date 23 Jan 2026`);
  assert.equal(d.shift.value, '1', `${label}: shift 1 (Shift-I)`);
  assert.equal(d.reportTime.value, '07:00', `${label}: reporting 7:00 AM`);
  assert.equal(d.gateTime.value, '08:30', `${label}: gate closing 8:30 AM`);
  assert.equal(d.startTime.value, '09:00', `${label}: exam starts 9:00 AM`);
  assert.equal(d.endTime.value, '12:00', `${label}: exam ends 12:00 PM (12.00Noon)`);
  assert.equal(result.centreCode.value, 'UP0802', `${label}: centre code`);
  assert.ok(result.centreName.value.startsWith('Neta Jee Subhash Chandra Bose'), `${label}: centre name starts right: ${result.centreName.value}`);
  assert.ok(!/code|name and|address/i.test(result.centreName.value), `${label}: no part of the label in the name`);
  assert.ok(result.address.value.endsWith('273013'), `${label}: address ends at the pincode: ${result.address.value}`);
  assert.ok(result.address.value.includes('Tura Bazar') && result.address.value.includes('Gorakhpur'), `${label}: whole address kept`);
  assert.ok(!/candidate@|Photo ID|Aadhaar|Date of Issue|9999|17\.01\.2026/i.test(result.address.value), `${label}: nothing from the next cell or row: ${result.address.value}`);
  assert.equal(result.city.value, 'Gorakhpur', `${label}: city`);
  assert.equal(result.pincode.value, '273013', `${label}: pincode (not the home pincode 273012)`);
  assert.ok(!JSON.stringify(result).includes('273012'), `${label}: the candidate's home pincode is never used`);
  assert.equal(result.examName.value, 'JEE Main 2026 Session 1', `${label}: exam name is the short name with year and session, not the ministry header`);
  if (notAllowed) assert.ok(result.notAllowed.join(' ').toLowerCase().includes('mobile'), `${label}: not-allowed items`);
}

test('NTA card as a PDF with text (table drawn with lines): every field is right, no personal data kept', async () => {
  const t = truth.find((x) => x.id.startsWith('s27'));
  const r = await readAdmitCard({ bytes: new Uint8Array(readFileSync(`tests/fixtures/samples/${t.file}`)), type: 'application/pdf' }, noOcr, { now: NOW, placeIndex });
  checkCard(r.result, 'pdf');
  assert.deepEqual(leaksPersonalData(t, r.result), []);
  assert.equal(compareToTruth(t, r.result).filter((x) => x.ok < 1).length, 0);
});

// Photo reading needs the English + Hindi language files (downloaded once from the CDN). If they cannot be loaded (offline), these tests are skipped.
async function ocrAvailable() {
  try { const e = await nodeEnv.getOcr(); await e.recognize(nodeEnv.toEngineImage({ width: 60, height: 20, data: new Uint8ClampedArray(1200).fill(255) })); return true; } catch { return false; }
}

for (const id of ['s21', 's22', 's28']) {
  test(`NTA card as an image (${id === 's21' ? 'clear' : id === 's28' ? 'drawn to look exactly like the real file: 768x1024 JPEG, faint grey lines' : 'phone-style photo: tilted, slightly blurry'}): every field is right`, async (ctx) => {
    if (!(await ocrAvailable())) { ctx.skip('OCR language data not available (offline)'); return; }
    const t = truth.find((x) => x.id.startsWith(id));
    const r = await readAdmitCard({ bytes: new Uint8Array(readFileSync(`tests/fixtures/samples/${t.file}`)), type: '' }, nodeEnv, { now: NOW, placeIndex });
    checkCard(r.result, id, { notAllowed: id !== 's28' });     // the real card has no list of banned items on page 1
    assert.deepEqual(leaksPersonalData(t, r.result), []);
  });
}

test('centre cell: code, name, address ending at the pincode, city before the state (the exact cell from the real card)', () => {
  const cell = 'UP0802 - Neta Jee Subhash Chandra Bose Online Examination Center, Neta Jee Subhash Chandra Bose Degree College, Tura Bazar, Pipraich Road, Jungle Aurahi, Near Indian Oil Petrol Pump, Gorakhpur, Uttar Pradesh, India, 273013';
  const p = parseCentre(cell);
  assert.equal(p.code, 'UP0802');
  assert.equal(p.name, 'Neta Jee Subhash Chandra Bose Online Examination Center, Neta Jee Subhash Chandra Bose Degree College');
  assert.ok(p.address.startsWith('Neta Jee') && p.address.endsWith('India, 273013'));
  assert.equal(p.pincode, '273013');
  assert.equal(p.city, 'Gorakhpur');
  // text after the pincode (the next cell, the next row) is cut off
  assert.equal(parseCentre(`${cell} Photo ID uploaded by candidate@ Kor 2 N Date of Issue: 17.01.2026`).address.endsWith('273013'), true);
  assert.equal(parseCentre(`${cell} Date of Issue: 17.01.2026`).city, 'Gorakhpur');
});

test('centre cell: other shapes (no code, "iON Digital Zone", no institution word, no pincode, Hindi state)', () => {
  assert.deepEqual(splitCentreCode('DL123: iON Digital Zone, Noida'), { code: 'DL123', rest: 'iON Digital Zone, Noida' });
  assert.equal(splitCentreCode('UPO0802 - Name').code, 'UP0802');                       // OCR read "0" as "O0"
  assert.equal(splitCentreCode('Government College, Pune'), null);
  assert.equal(parseCentre('iON Digital Zone iDZ 2, Plot 5, Sector 62, Noida, Uttar Pradesh 201301').city, 'Noida');
  assert.equal(parseCentre('Government College, Sector 1, Panchkula, Haryana - 134109').name, 'Government College');
  assert.equal(parseCentre('Sector 9, Chandigarh - 160009').name, '');                  // no institution name on the card
  assert.equal(parseCentre('Sector 9, Chandigarh - 160009').city, 'Chandigarh');
  assert.equal(parseCentre('Some School, Pune').pincode, '');
  assert.equal(cutAtPincode('A, B, 273013 trailing'), 'A, B, 273013');
  assert.equal(cutAtPincode('no pin here'), 'no pin here');
  assert.equal(cityFromParts(['X School', 'Date of Issue: 17.01.2026']), '');             // never a date or a label
  assert.equal(cityFromParts(['Lucknow', 'उत्तर प्रदेश', 'भारत']), 'Lucknow');
  assert.equal(splitName(['Neta Jee Centre', 'Neta Jee College', 'Tura Bazar']), 'Neta Jee Centre, Neta Jee College');
  assert.equal(splitName([]), '');
});

test('known layouts are picked from words on the card', () => {
  assert.equal(detectTemplate('National Testing Agency\nJoint Entrance Examination (Main)').id, 'nta');
  assert.equal(detectTemplate('STAFF SELECTION COMMISSION').id, 'ssc');
  assert.equal(detectTemplate('Railway Recruitment Board').id, 'rrb');
  assert.equal(detectTemplate('Institute of Banking Personnel Selection').id, 'ibps');
  assert.equal(detectTemplate('Union Public Service Commission e-admit').id, 'upsc');
  assert.equal(detectTemplate('उत्तर प्रदेश पुलिस भर्ती').id, 'state');
  assert.equal(detectTemplate('University of Somewhere'), null);
});

test('exam name: from the title area, short name, never the ministry header', async () => {
  const { findExamTitle, shortenExamName, isHeaderOnly } = await import('../src/ingest/examTitle.js');
  // the header of the real card as OCR reads it: logos left and right, the title in the middle (two lines), the card type below
  const header = ['Department of Higher Education eigen DV) राष्ट्रीय परीक्षा एजेंसी', 'Ministry of Education VJ National Testing Agency',
    'Joint Entrance Examination (Main', "! 2026 Session 1", 'www Government of India Admit Card-Provisional'];
  assert.equal(findExamTitle(header).value, 'JEE Main 2026 Session 1');
  assert.equal(findExamTitle(['Joint Entrance Examination (Main) –', '2026 Session 2']).value, 'JEE Main 2026 Session 2');
  assert.equal(findExamTitle(['National Eligibility cum Entrance Test (UG) - 2026', 'Admit Card']).value, 'NEET UG 2026');
  assert.equal(findExamTitle(['Common University Entrance Test (UG) - 2026']).value, 'CUET UG 2026');
  assert.equal(findExamTitle(['Staff Selection Commission', 'Combined Graduate Level Examination 2026 (Tier-I)']).value, 'SSC CGL Tier-I 2026');
  assert.equal(findExamTitle(['Railway Recruitment Board', 'NTPC CBT-2 2026']).value, 'RRB NTPC CBT-2 2026');
  assert.equal(shortenExamName('Institute of Banking Personnel Selection PO Mains 2026'), 'IBPS PO Mains 2026');
  assert.equal(shortenExamName('Union Public Service Commission Civil Services Preliminary Examination 2026'), 'UPSC Civil Services 2026');
  // the ministry / department header alone is never a name
  for (const t of ['Government of India', 'Department of Higher Education', 'Ministry of Education', 'Admit Card-Provisional', 'Government of India Admit Card - Provisional']) {
    assert.equal(isHeaderOnly(t), true, t);
    assert.equal(findExamTitle([t]), null, t);
  }
  assert.equal(isHeaderOnly('Combined Graduate Level Examination'), false);
});

test('exam name: with only the ministry header and no title the field stays empty (never "Government of India")', async () => {
  const { extractExamFields } = await import('../src/ingest/examFields.js');
  const { linesFromText } = await import('../src/ingest/layout.js');
  const r = extractExamFields(linesFromText('Department of Higher Education\nMinistry of Education\nGovernment of India\nAdmit Card-Provisional\nExam Date: 23.01.2026'), { sourceConf: 100 });
  assert.equal(r.examName.value, '');
});
