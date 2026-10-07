import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseCell, tableValues } from '../src/ingest/tableReader.js';
import { extractExamFields } from '../src/ingest/examFields.js';
import { linesFromText } from '../src/ingest/layout.js';
import { findHits } from '../src/ingest/labelHits.js';
import { mergeBest } from '../src/ingest/extractBest.js';

// A cell: position + text (label cells can have their lines already joined with spaces)
const c = (x0, y0, x1, y1, text, conf = 95) => ({ x0, y0, x1, y1, text, valueText: text, conf, words: [], lines: [] });

test('cells: a label cell, a label with its value in the same cell, a value, noise', () => {
  assert.equal(analyseCell(c(0, 0, 1, 1, 'Reporting Time at Centre')).isLabel, true);
  assert.equal(analyseCell(c(0, 0, 1, 1, 'Timing of Test (Indian Standard Time)')).kind, 'examTime');
  assert.equal(analyseCell(c(0, 0, 1, 1, 'Entry Gate Closing Time at Centre')).kind, 'gate');
  assert.equal(analyseCell(c(0, 0, 1, 1, 'Test Centre Code, Name and Address')).kind, 'centreName');
  assert.equal(analyseCell(c(0, 0, 1, 1, 'Exam Date: 12.03.2026')).inline, '12.03.2026');
  assert.equal(analyseCell(c(0, 0, 1, 1, '07.00AM (IST)')), null);
  assert.equal(analyseCell(c(0, 0, 1, 1, '')), null);
  assert.equal(analyseCell(c(0, 0, 1, 1, 'Neta Jee Degree College centre road')), null);   // a value that only contains a label word later on
});

const nta = [
  c(0, 0, 100, 40, 'Medium of Question Paper'), c(100, 0, 300, 40, 'Date of Examination'), c(300, 0, 400, 40, 'Shift'), c(400, 0, 600, 40, 'Timing of Test (Indian Standard Time)'),
  c(0, 40, 100, 70, 'English'), c(100, 40, 300, 70, '23.01.2026'), c(300, 40, 400, 70, 'Shift-I'), c(400, 40, 600, 70, '09.00AM to 12.00Noon (IST)'),
  c(0, 70, 100, 110, 'Reporting Time at Centre'), c(100, 70, 300, 110, '07.00AM (IST)'), c(300, 70, 400, 110, 'Entry Gate Closing Time at Centre'), c(400, 70, 600, 110, '08.30AM Sharp (IST)'),
  c(0, 110, 100, 200, 'Test Centre Code, Name and Address'), c(100, 110, 400, 200, 'UP0802 - Neta Jee Online Examination Center, Neta Jee Degree College, Tura Bazar, Gorakhpur, Uttar Pradesh, India, 273013'),
  c(400, 110, 600, 200, 'Photo ID uploaded by candidate@ Aadhaar 1234'),
];

test('table: label cell -> value on the right; header row -> value directly below; values stop at the cell edge', () => {
  const v = (kind) => tableValues(nta, kind).map((x) => [x.text, x.via]);
  assert.deepEqual(v('examDate'), [['23.01.2026', 'below']]);
  assert.deepEqual(v('shift'), [['Shift-I', 'below']]);
  assert.deepEqual(v('examTime'), [['09.00AM to 12.00Noon (IST)', 'below']]);
  assert.deepEqual(v('report'), [['07.00AM (IST)', 'right']]);
  assert.deepEqual(v('gate'), [['08.30AM Sharp (IST)', 'right']]);
  const centre = v('centreName');
  assert.equal(centre.length, 1);
  assert.ok(centre[0][0].endsWith('273013') && !centre[0][0].includes('Photo ID'));      // the next cell is never joined
});

test('table: a stray bracket on the right is noise, the value below is used; template can prefer "below"', () => {
  const cells = [c(0, 0, 100, 40, 'Venue of Examination'), c(500, 0, 560, 40, 'Ee]'), c(0, 40, 300, 80, 'Government College, Sector 1, Panchkula - 134109')];
  assert.deepEqual(tableValues(cells, 'centreName').map((x) => x.via), ['below']);
  const two = [c(0, 0, 100, 40, 'Date of Examination'), c(100, 0, 200, 40, '24.01.2026'), c(0, 40, 100, 80, '23.01.2026')];
  assert.equal(tableValues(two, 'examDate', { where: 'below' })[0].text, '23.01.2026');
  assert.equal(tableValues(two, 'examDate')[0].text, '24.01.2026');
  assert.deepEqual(tableValues([], 'shift'), []);
  assert.deepEqual(tableValues(nta, 'examDate', { ignoreBelow: 10 }), []);             // cells under the cut line (self-declaration) are ignored
});

test('every time label of the brief is understood (English and Hindi)', () => {
  const kinds = {
    examTime: ['Timing of Test', 'Time of Exam', 'Exam Timing', 'Test Time', 'परीक्षा का समय'],
    gate: ['Entry Gate Closing Time', 'Gate Closing', 'Gate Closes', 'Last Entry', 'Entry Closing', 'गेट बंद होने का समय'],
    report: ['Reporting Time at Centre', 'Reporting Time', 'रिपोर्टिंग समय'],
  };
  for (const [kind, labels] of Object.entries(kinds)) for (const label of labels) {
    const hits = findHits(label.toLowerCase());
    assert.equal(hits[0] && hits[0].kind, kind, label);
  }
});

test('the same labels written as plain lines (no table) give the same answer', () => {
  const text = ['Date of Examination: 23.01.2026', 'Shift: Shift-I', 'Timing of Test (Indian Standard Time): 09.00AM to 12.00Noon (IST)',
    'Reporting Time at Centre: 07.00AM (IST)', 'Entry Gate Closing Time at Centre: 08.30AM Sharp (IST)'].join('\n');
  const r = extractExamFields(linesFromText(text), { sourceConf: 100 });
  const d = r.days[0];
  assert.deepEqual([d.date.value, d.shift.value, d.reportTime.value, d.gateTime.value, d.startTime.value, d.endTime.value], ['2026-01-23', '1', '07:00', '08:30', '09:00', '12:00']);
});

test('self-declaration and instructions are never used for fields (only for the not-allowed items)', () => {
  const text = ['Exam Date: 23.01.2026', 'Test Centre Code, Name and Address: UP0802 - ABC College, Gorakhpur, Uttar Pradesh, India, 273013', 'Self Declaration / Undertaking',
    'I, DEMO NAME, resident of H.No. 12, Demo Colony, Gorakhpur, Uttar Pradesh - 273012 declare this.', 'Important Instructions', '1. Candidates must reach early. Reporting Time: 5.00AM'].join('\n');
  const r = extractExamFields(linesFromText(text), { sourceConf: 100 });
  assert.equal(r.pincode.value, '273013');
  assert.ok(!JSON.stringify(r).includes('273012'));
  assert.notEqual(r.days[0].reportTime.value, '05:00');
});

test('date of issue is never the exam date', () => {
  const r = extractExamFields(linesFromText('Date of Issue: 17.01.2026\nCentre Address: ABC School, Pune - 411001'), { sourceConf: 100 });
  assert.equal(r.days[0].date.value, '');
  assert.equal(extractExamFields(linesFromText('Date of Issue: 17.01.2026\nDate of Examination: 23.01.2026'), { sourceConf: 100 }).days[0].date.value, '2026-01-23');
});

test('best of several readings: each group (centre, days) comes from the reading you can trust most', () => {
  const field = (value, confidence) => ({ value, confidence, level: confidence >= 0.8 ? 'high' : 'low' });
  const make = (centre, conf, date) => ({ examName: field('X', 0.7), centreName: field(centre, conf), centreCode: field('', 0), address: field(`${centre}, Pune`, conf), city: field('Pune', conf), pincode: field('411001', conf),
    days: [{ date: field(date, conf), reportTime: field('', 0), gateTime: field('', 0), startTime: field('', 0), endTime: field('', 0), shift: field('', 0) }], notAllowed: [], isTimetable: false, fixes: [], issues: [] });
  const merged = mergeBest([make('Weak', 0.4, '2026-01-01'), make('Strong', 0.9, '2026-01-02')]);
  assert.equal(merged.centreName.value, 'Strong');
  assert.equal(merged.address.value, 'Strong, Pune');       // the group stays together
  assert.equal(merged.days[0].date.value, '2026-01-02');
});
