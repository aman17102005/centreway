import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLines, makeLine, linesFromText, linesFromWordLines, wordsFromPdfItems, wordIndexAt, linesToText } from '../src/ingest/layout.js';
import { findTimetable, assignRowTimes } from '../src/ingest/timetable.js';
import { findNotAllowed } from '../src/ingest/instructions.js';
import { findHits } from '../src/ingest/examFields.js';

const w = (text, x0, y0, conf = 90) => ({ text, conf, x0, x1: x0 + text.length * 10, y0, y1: y0 + 20 });

test('buildLines: same row joins, order is top-to-bottom and left-to-right; noise symbols are dropped', () => {
  const lines = buildLines([w('08:30', 300, 102), w('Reporting', 100, 100), w('Time:', 200, 99), w('Exam', 100, 160), w('|', 5, 100), w('Centre', 160, 161)]);
  assert.deepEqual(lines.map((l) => l.text), ['Reporting Time: 08:30', 'Exam Centre']);
  assert.deepEqual(buildLines([]), []);
  assert.equal(buildLines([w('  ', 1, 1)]).length, 0);
});

test('linesFromWordLines: table cells at the same height are joined, stacked lines are not', () => {
  const lines = linesFromWordLines([[w('Reporting', 50, 100), w('Time', 160, 100)], [w('08:30', 400, 103)], [w('Exam', 50, 150)], []]);
  assert.deepEqual(lines.map((l) => l.text), ['Reporting Time 08:30', 'Exam']);
});

test('makeLine remembers where each word starts, wordIndexAt finds the word', () => {
  const line = makeLine([w('a', 0, 0), w('bcd', 20, 0), w('e', 80, 0)]);
  assert.equal(line.text, 'a bcd e');
  assert.equal(wordIndexAt(line, 3), 1);
  assert.equal(wordIndexAt(line, 6), 2);
  assert.equal(linesToText([line]), 'a bcd e');
});

test('linesFromText keeps blank lines as blank and Hindi digits are turned into 0-9', () => {
  const lines = linesFromText('परीक्षा तिथि: १४/०३/२०२६\n\nVenue: X');
  assert.equal(lines[0].text, 'परीक्षा तिथि: 14/03/2026');
  assert.ok(lines[1].blank);
  assert.equal(lines.length, 3);
});

test('pdf items become words with positions (y flipped)', () => {
  const words = wordsFromPdfItems([{ str: 'Exam Date', transform: [1, 0, 0, 1, 50, 700], width: 60, height: 10 }, { str: '   ', transform: [1, 0, 0, 1, 0, 0], width: 5, height: 5 }], 800);
  assert.deepEqual(words.map((x) => x.text), ['Exam', 'Date']);
  assert.ok(words[0].y0 < words[0].y1 && words[0].x1 <= words[1].x0 + 1);
  assert.equal(words[0].conf, 100);
});

test('label hits: longest label wins, short labels need word edges, neighbour labels of one kind merge', () => {
  const hits = findHits('reporting time / रिपोर्टिंग समय 08:30 am');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'report');
  assert.equal(findHits('shipping 123456').length, 0);       // "pin" inside a word
  assert.equal(findHits('post graduate college').length, 0); // "post" without a colon is not a label
  assert.equal(findHits('knowledge city, sector 81').length, 0);
  assert.equal(findHits('city: mohali')[0].kind, 'city');
});

test('timetable: rows with date + time, sorted; a single date is not a timetable', () => {
  const lines = linesFromText(['Date Day Subject Time', '03/03/2026 Tuesday Mathematics 10:30 AM - 01:30 PM', '24/02/2026 Tuesday Physics (042) 10:30 AM - 01:30 PM', 'Date of Birth 05/06/2002'].join('\n'));
  const tt = findTimetable(lines);
  assert.deepEqual(tt.rows.map((r) => r.date), ['2026-02-24', '2026-03-03']);
  assert.equal(tt.rows[0].subject, 'Physics (042)');
  assert.deepEqual(tt.rows[0].times, ['10:30', '13:30']);
  assert.equal(findTimetable(linesFromText('Exam Date: 14/03/2026 Reporting 08:30 AM')), null);
  assert.equal(findTimetable([]), null);
});

test('timetable: shift digit and column meaning', () => {
  const lines = linesFromText(['12/03/2026 1 07:30 AM 08:30 AM 09:00 AM - 10:30 AM', '13/03/2026 2 12:00 PM 01:00 PM 01:30 PM - 03:00 PM'].join('\n'));
  const tt = findTimetable(lines);
  assert.equal(tt.rows[1].shift, '2');
  assert.deepEqual(assignRowTimes(['07:30', '08:30', '09:00', '10:30'], ['report', 'gate', 'examTime']), { reportTime: '07:30', gateTime: '08:30', startTime: '09:00', endTime: '10:30' });
  assert.deepEqual(assignRowTimes(['09:00', '10:30'], []), { reportTime: '', gateTime: '', startTime: '09:00', endTime: '10:30' });
  assert.deepEqual(assignRowTimes(['09:00'], null), { reportTime: '', gateTime: '', startTime: '09:00', endTime: '' });
});

test('instructions: items before "not allowed", after "do not bring", after a colon, Hindi, junk stubs ignored', () => {
  const cases = [
    [['Candidates will not be allowed to carry mobile phones, calculators and smart watches into the examination hall.'], ['Mobile phones', 'Calculators', 'Smart watches']],
    [['Do not bring books, notes, bags.'], ['Books', 'Notes', 'Bags']],
    [['2. Prohibited items: mobile phones, calculators.'], ['Mobile phones', 'Calculators']],
    [['Mobile phones and calculators are strictly prohibited.'], ['Mobile phones', 'Calculators']],
    [['3. Report at the centre by the reporting time. Entry is not permitted after gate closing time.'], []],
  ];
  for (const [text, expected] of cases) assert.deepEqual(findNotAllowed(text.map((t) => ({ text: t }))), expected, text[0]);
  const hindi = findNotAllowed([{ text: '2. मोबाइल फोन, कैलकुलेटर परीक्षा केंद्र में लाना मना है।' }]);
  assert.ok(hindi[0].includes('मोबाइल') && !hindi[0].startsWith('2.'));
  assert.deepEqual(findNotAllowed([]), []);
  assert.deepEqual(findNotAllowed([{ text: '' }]), []);
});
