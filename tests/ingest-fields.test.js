import test from 'node:test';
import assert from 'node:assert/strict';
import { extractExamFields, makeField, confidenceLevel } from '../src/ingest/examFields.js';
import { linesFromText } from '../src/ingest/layout.js';
import { SAMPLES } from './samples.js';
import { findHits } from '../src/ingest/labelHits.js';

const read = (text, opts = { sourceConf: 100 }) => extractExamFields(linesFromText(text), opts);
const day0 = (r) => r.days[0];

test('the 10 older made-up cards still read correctly through the layout reader', () => {
  for (const s of SAMPLES) {
    const r = read(s.text);
    const got = { examDate: day0(r)?.date.value || '', reportTime: day0(r)?.reportTime.value || '', gateTime: day0(r)?.gateTime.value || '', pincode: r.pincode.value, centreName: r.centreName.value };
    for (const [k, v] of Object.entries(s.expect)) if (k in got) assert.equal(got[k], v, `${s.name}: ${k}`);
  }
});

test('label above value in a header table (values sit under their labels)', () => {
  const text = ['Roll No        Date of Exam    Shift    Reporting Time    Gate Closing Time', '1234567890     14-03-2026      1        08:30 AM          09:15 AM', 'Venue of Examination:', 'Demo Public School', 'Sector 5, Panchkula, Haryana - 134109'].join('\n');
  const r = read(text);
  assert.equal(day0(r).date.value, '2026-03-14');
  assert.equal(day0(r).reportTime.value, '08:30');
  assert.equal(day0(r).gateTime.value, '09:15');
  assert.equal(day0(r).shift.value, '1');
  assert.equal(r.centreName.value, 'Demo Public School');
  assert.match(r.address.value, /Sector 5, Panchkula/);
  assert.equal(r.pincode.value, '134109');
  assert.equal(r.city.value, 'Panchkula');
});

test('several fields on one line are cut at the next label', () => {
  const r = read('Exam Date: 12.03.2026   Shift: 2   Reporting Time: 11:30 hrs\nGate Closing Time: 12:30 hrs   Exam Time: 13:00 hrs - 14:30 hrs');
  const d = day0(r);
  assert.deepEqual([d.date.value, d.shift.value, d.reportTime.value, d.gateTime.value, d.startTime.value, d.endTime.value], ['2026-03-12', '2', '11:30', '12:30', '13:00', '14:30']);
});

test('bilingual labels: the Hindi label is not mistaken for the value', () => {
  const r = read('Date of Examination / परीक्षा की तिथि   04/04/2026\nReporting Time / रिपोर्टिंग समय   12:00 PM\nTest Centre Name & Address / परीक्षा केंद्र का नाम   DAV College\nSector 10, Chandigarh - 160011');
  assert.equal(day0(r).date.value, '2026-04-04');
  assert.equal(day0(r).reportTime.value, '12:00');
  assert.equal(r.centreName.value, 'DAV College');
  assert.equal(r.address.value, 'Sector 10, Chandigarh - 160011');
});

test('timetable card: one plan row per exam day, with a shared reporting time', () => {
  const r = read(['Reporting Time: 10:00 AM', 'Date Day Subject Time', '24/02/2026 Tuesday Physics 10:30 AM - 01:30 PM', '27/02/2026 Friday Chemistry 10:30 AM - 01:30 PM', '03/03/2026 Tuesday Mathematics 10:30 AM - 01:30 PM'].join('\n'));
  assert.equal(r.isTimetable, true);
  assert.deepEqual(r.days.map((d) => d.date.value), ['2026-02-24', '2026-02-27', '2026-03-03']);
  assert.ok(r.days.every((d) => d.reportTime.value === '10:00' && d.startTime.value === '10:30' && d.endTime.value === '13:30'));
  assert.equal(r.days[1].subject, 'Chemistry');
});

test('two dates in one label make two exam days', () => {
  const r = read('Exam Dates: 12/03/2026 and 13/03/2026\nReporting Time: 08:00 AM');
  assert.deepEqual(r.days.map((d) => d.date.value), ['2026-03-12', '2026-03-13']);
});

test('no reporting time on the card: assumed one hour before the exam, marked low confidence', () => {
  const r = read('Exam Date: 12/03/2026\nExam Time: 10:00 AM - 12:00 PM\nVenue: ABC School, Pune 411001');
  const d = day0(r);
  assert.equal(d.reportTime.value, '09:00');
  assert.equal(d.reportTime.level, 'low');
  assert.match(d.reportTime.note, /Assumed/);
});

test('exam name: from a label, else from the title line', () => {
  assert.equal(read('Name of the Examination: SSC CGL 2026\nExam Date: 12/03/2026').examName.value, 'SSC CGL 2026');
  const r = read('NATIONAL TESTING AGENCY\nJEE (Main) 2026 - Admit Card\nExam Date: 12/03/2026');
  assert.match(r.examName.value, /JEE Main 2026/);
  assert.equal(r.examName.source, 'title');
});

test('personal details are never kept: name, roll number, birth date, photo and signature captions', () => {
  const text = "Candidate's Name: ANITA DEMOSHARMA\nRoll No: 3009448247\nDate of Birth: 05/06/2002 Photo\nExam Date: 12/03/2026\nExam Centre: ABC School Signature\nCentre Address: Sector 5, Pune - 411001";
  const r = read(text);
  const blob = JSON.stringify(r);
  assert.ok(!/ANITA|DEMOSHARMA|3009448247|05\/06\/2002|2002-06-05|Signature|Photo/.test(blob), blob);
  assert.equal(day0(r).date.value, '2026-03-12');
});

test('address that continues on lines below stops at the next label and at numbered instructions', () => {
  const r = read(['Centre Address: Plot 5, Gandhi Marg,', 'Near Bus Stand, Patna', 'Bihar - 800001', 'Exam Time: 09:00 AM - 11:00 AM', '1. Candidates must carry a printout'].join('\n'));
  assert.equal(r.address.value, 'Plot 5, Gandhi Marg, Near Bus Stand, Patna, Bihar - 800001');
  assert.equal(r.pincode.value, '800001');
  assert.equal(r.city.value, 'Patna');
});

test('empty, junk and one-line input do not crash', () => {
  for (const text of ['', '   ', '????', 'Exam', '12', '\n\n\n']) {
    const r = read(text);
    assert.equal(typeof r.centreName.value, 'string');
    assert.ok(Array.isArray(r.days));
  }
  const none = extractExamFields([], {});
  assert.equal(none.days.length, 1);                    // one empty day, so the summary screen has a row to fill in
  assert.equal(none.days[0].date.value, '');
});

test('very large noisy text is read quickly', () => {
  const noise = 'lorem ipsum dolor 12/ 99:99 ;; ,, \n'.repeat(3000);
  const start = Date.now();
  const r = read(`${noise}Exam Date: 14/03/2026\nReporting Time: 08:30 AM\n`);
  assert.equal(day0(r).date.value, '2026-03-14');
  assert.ok(Date.now() - start < 8000);
});

test('confidence: label with right format is high; scanning without a label or a bad format is lower; OCR confidence matters', () => {
  assert.equal(makeField('x', { base: 0.93, source: 'label' }).level, 'high');
  assert.equal(makeField('x', { base: 0.55, source: 'scan' }).level, 'low');
  assert.equal(makeField('x', { base: 0.93, valid: false, source: 'label' }).level, 'low');
  assert.ok(makeField('x', { base: 0.93, ocrConf: 40, source: 'label' }).confidence < makeField('x', { base: 0.93, ocrConf: 95, source: 'label' }).confidence);
  assert.equal(makeField('', { base: 0.9, source: 'label' }).confidence, 0);
  assert.equal(confidenceLevel(0.65), 'medium');
});

test('OCR mistakes inside a label or a number are repaired (Report1ng Tlme, 10:O0, 1O.3O hrs, 15/O5/2026)', () => {
  const r = read(['Exam Date: 15/O5/2026', 'Report1ng Tlme: 10:O0 AM', 'Gate Closlng Time: 1O.3O hrs'].join('\n'));
  assert.equal(day0(r).date.value, '2026-05-15');
  assert.equal(day0(r).reportTime.value, '10:00');
  assert.equal(day0(r).gateTime.value, '10:30');
});

test('labels: "Centre Name and Address" is one label for name and address; wordings from different exam bodies all match', () => {
  const r = read('Centre Name and Address : AB1234 - Example Public School, Station Road, Sometown, Some State 123456');
  assert.equal(r.centreName.value, 'Example Public School');
  assert.equal(r.centreCode.value, 'AB1234');
  assert.equal(r.pincode.value, '123456');
  const wordings = [['Time of Entry', 'report'], ['Candidate Entry Time', 'report'], ['Last Reporting Time', 'gate'], ['Entry Closes at', 'gate'], ['Examination Timing', 'examTime'], ['Time Slot', 'examTime']];
  for (const [label, kind] of wordings) assert.ok(findHits(label.toLowerCase()).some((h) => h.kind === kind), `${label} -> ${kind}`);
});
