import test from 'node:test';
import assert from 'node:assert/strict';
import { editDistance } from '../src/dsa/editDistance.js';
import { kmpSearchAll, kmpFirst, buildFailureTable, findFirstLabel, asciiLower } from '../src/dsa/kmp.js';
import { Trie } from '../src/dsa/trie.js';
import { topK } from '../src/dsa/topK.js';
import { tokenize, scanDates, scanTimes, scanPincode, extractFieldsScanner, normalizeText } from '../src/dsa/fieldScanner.js';
import { extractFields } from '../src/logic/extract.js';
import { SAMPLES } from './samples.js';
import { makeRng } from './rng.js';

// ---------- editDistance ----------
function fullTableDistance(a, b) { // slow textbook version: whole table
  const A = Array.from(a); const B = Array.from(b);
  const d = Array.from({ length: A.length + 1 }, (_, i) => Array.from({ length: B.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  }
  return d[A.length][B.length];
}

test('editDistance: known answers and edge cases', () => {
  assert.equal(editDistance('', ''), 0);
  assert.equal(editDistance('abc', ''), 3);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('chandigrah', 'chandigarh'), 2);
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('same', 'same'), 0);
  assert.equal(editDistance('चंडीगढ़', 'चंडीगढ'), 1);
});

test('editDistance: early stop returns limit+1', () => {
  assert.equal(editDistance('abcdef', 'uvwxyz', 2), 3);
  assert.equal(editDistance('a', 'abcdefgh', 2), 3);
  assert.equal(editDistance('abc', 'abd', 2), 1);
});

test('editDistance: 500 random pairs match the full-table version (with and without limit)', () => {
  const rng = makeRng(6);
  for (let i = 0; i < 500; i++) {
    const a = rng.word(rng.int(0, 9)); const b = rng.word(rng.int(0, 9));
    const exact = fullTableDistance(a, b);
    assert.equal(editDistance(a, b), exact);
    const limit = rng.int(0, 5);
    assert.equal(editDistance(a, b, limit), exact > limit ? limit + 1 : exact);
  }
});

// ---------- KMP ----------
function slowSearchAll(text, pattern) {
  const out = [];
  if (!pattern) return out;
  for (let i = 0; i + pattern.length <= text.length; i++) if (text.slice(i, i + pattern.length) === pattern) out.push(i);
  return out;
}

test('kmp: failure table and simple matches', () => {
  assert.deepEqual(buildFailureTable('abab'), [0, 0, 1, 2]);
  assert.deepEqual(kmpSearchAll('aaaa', 'aa'), [0, 1, 2]);
  assert.deepEqual(kmpSearchAll('abc', ''), []);
  assert.deepEqual(kmpSearchAll('', 'a'), []);
  assert.deepEqual(kmpSearchAll('ab', 'abc'), []);
  assert.equal(kmpFirst('hello world', 'world'), 6);
  assert.equal(kmpFirst('hello', 'xyz'), -1);
});

test('kmp: labels, case-insensitive and Hindi', () => {
  const text = asciiLower('Candidate\nREPORTING TIME: 8:30\nगेट बंद: 9');
  assert.equal(text.length, 'Candidate\nREPORTING TIME: 8:30\nगेट बंद: 9'.length);
  assert.equal(findFirstLabel(text, ['gate closing', 'reporting time']).label, 'reporting time');
  assert.equal(findFirstLabel(text, ['गेट बंद']).label, 'गेट बंद');
  assert.equal(findFirstLabel(text, ['nothing']), null);
  // longest wins on a tie
  assert.equal(findFirstLabel('exam centre name', ['exam', 'exam centre']).label, 'exam centre');
});

test('kmp: 400 random texts match the slow search', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 400; i++) {
    const alphabet = 'ab'; // tiny alphabet = many partial matches
    const text = Array.from({ length: rng.int(0, 40) }, () => alphabet[rng.int(0, 1)]).join('');
    const pattern = Array.from({ length: rng.int(1, 4) }, () => alphabet[rng.int(0, 1)]).join('');
    assert.deepEqual(kmpSearchAll(text, pattern), slowSearchAll(text, pattern));
  }
});

test('kmp: very large text', () => {
  const text = `${'a'.repeat(200000)}b`;
  assert.deepEqual(kmpSearchAll(text, `${'a'.repeat(50)}b`), [200000 - 50]);
});

// ---------- topK ----------
test('topK: edge cases and 300 random lists vs full sort', () => {
  assert.deepEqual(topK([], 3, (a, b) => a - b), []);
  assert.deepEqual(topK([5], 3, (a, b) => a - b), [5]);
  assert.deepEqual(topK([3, 1, 2], 0, (a, b) => a - b), []);
  assert.deepEqual(topK([2, 2, 2, 1], 2, (a, b) => a - b), [1, 2]);
  const rng = makeRng(8);
  for (let i = 0; i < 300; i++) {
    const list = Array.from({ length: rng.int(0, 60) }, () => rng.int(0, 30));
    const k = rng.int(0, 10);
    assert.deepEqual(topK(list, k, (a, b) => a - b), list.slice().sort((a, b) => a - b).slice(0, k));
  }
});

// ---------- Trie ----------
test('trie: insert, prefix search by weight, no match, empty prefix', () => {
  const t = new Trie();
  t.insert('Chandigarh', 100); t.insert('Chandni Chowk', 40); t.insert('Chamba', 10); t.insert('Mohali', 90);
  assert.deepEqual(t.suggest('cha').map((x) => x.text), ['Chandigarh', 'Chandni Chowk', 'Chamba']);
  assert.deepEqual(t.suggest('CHANDI', 1).map((x) => x.text), ['Chandigarh']);
  assert.deepEqual(t.suggest('zzz'), []);
  assert.equal(t.suggest('', 10).length, 4);
  assert.deepEqual(t.suggest('mohali')[0].text, 'Mohali');
  assert.deepEqual(new Trie().suggest('a'), []);
});

test('trie: duplicates, ties alphabetical, data kept, Hindi', () => {
  const t = new Trie();
  t.insert('Sector 17', 5, { id: 1 }); t.insert('Sector 17', 5, { id: 2 }); t.insert('Sector 9', 5); t.insert('चंडीगढ़', 50);
  const s = t.suggest('sector');
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => x.text), ['Sector 17', 'Sector 17', 'Sector 9']);
  assert.deepEqual(t.suggest('चंड')[0].text, 'चंडीगढ़');
  assert.equal(t.allWords().length, 4);
});

test('trie: 200 random prefix searches match filtering a list', () => {
  const rng = makeRng(9);
  const words = Array.from({ length: 300 }, (_, i) => ({ text: rng.word(rng.int(2, 7)), weight: rng.int(1, 20), id: i }));
  const trie = new Trie();
  words.forEach((w) => trie.insert(w.text, w.weight));
  for (let i = 0; i < 200; i++) {
    const prefix = rng.word(rng.int(1, 2));
    const slow = words.filter((w) => w.text.startsWith(prefix))
      .sort((a, b) => (b.weight - a.weight) || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)).slice(0, 5);
    const fast = trie.suggest(prefix, 5);
    assert.deepEqual(fast.map((x) => [x.text, x.weight]), slow.map((x) => [x.text, x.weight]));
  }
});

// ---------- Field scanner ----------
test('scanner: tokenizer states (numbers, words, punctuation, newlines)', () => {
  const tokens = tokenize('Date: 14/03\n8:30 a.m.');
  assert.deepEqual(tokens.map((t) => t.kind), ['word', 'punct', 'num', 'punct', 'num', 'newline', 'num', 'punct', 'num', 'word', 'punct']);
  assert.equal(tokens[9].text, 'am'); // the dot inside a.m is dropped
  assert.deepEqual(tokenize(''), []);
  assert.equal(normalizeText('a \t   b\r\n१२'), 'a b\n12');
});

test('scanner: dates', () => {
  const d = (s) => scanDates(tokenize(normalizeText(s))).map((x) => x.iso);
  assert.deepEqual(d('14/03/2026'), ['2026-03-14']);
  assert.deepEqual(d('01-02-26 and 25 Jan, 2027'), ['2026-02-01', '2027-01-25']);
  assert.deepEqual(d('31/13/2026'), []);          // month 13 is invalid
  assert.deepEqual(d('3rd Sept 2026'), ['2026-09-03']);
  assert.deepEqual(d('no date here 12'), []);
});

test('scanner: times', () => {
  const t = (s) => scanTimes(tokenize(normalizeText(s))).map((x) => x.hhmm);
  assert.deepEqual(t('08:30 AM'), ['08:30']);
  assert.deepEqual(t('2:00 PM'), ['14:00']);
  assert.deepEqual(t('12:00 am'), ['00:00']);
  assert.deepEqual(t('9 pm'), ['21:00']);
  assert.deepEqual(t('7.30 a.m.'), ['07:30']);
  assert.deepEqual(t('25:00'), []);
  assert.deepEqual(t('roll 1234'), []);
  assert.deepEqual(t('02.06.2026'), []);          // a date, not a time
});

test('scanner: pincodes', () => {
  assert.equal(scanPincode('Pin: 160019'), '160019');
  assert.equal(scanPincode('pincode 560 001'), '560001');
  assert.equal(scanPincode('Roll 123456 only'), '');             // no address word on the line
  assert.equal(scanPincode('Sector 9, Mohali 140301'), '140301');
  assert.equal(scanPincode('Sector 9 call 05/123456'), '');     // part of something else
  assert.equal(scanPincode('Pin: 960001'), '');                 // first digit must be 1-8
  assert.equal(scanPincode(''), '');
});

test('scanner: every sample card gives the expected fields', () => {
  for (const s of SAMPLES) {
    const f = extractFieldsScanner(s.text);
    for (const [k, v] of Object.entries(s.expect)) assert.equal(f[k], v, `${s.name}: ${k}`);
    for (const piece of s.addressHas || []) assert.ok(f.address.includes(piece), `${s.name}: address has ${piece}`);
    for (const piece of s.addressNot || []) assert.ok(!f.address.includes(piece), `${s.name}: address lacks ${piece}`);
  }
});

test('scanner: same or better than the old regex extractor on every sample', () => {
  let newCorrect = 0; let oldCorrect = 0;
  for (const s of SAMPLES) {
    const fresh = extractFieldsScanner(s.text);
    const old = extractFields(s.text);
    for (const [k, v] of Object.entries(s.expect)) {
      if (fresh[k] === v) newCorrect++;
      if (old[k] === v) oldCorrect++;
      // wherever the old path was right, the new path must be right too
      if (old[k] === v) assert.equal(fresh[k], v, `${s.name}: ${k} regressed`);
    }
  }
  assert.ok(newCorrect >= oldCorrect);
});

test('scanner: very large noisy text finishes quickly and does not crash', () => {
  const noise = 'lorem ipsum 12/ 99:99 ;; ,, '.repeat(20000);
  const start = Date.now();
  const f = extractFieldsScanner(`${noise}\nExam Date: 14/03/2026\nReporting Time: 8:30 AM`);
  assert.equal(f.examDate, '2026-03-14');
  assert.ok(Date.now() - start < 5000);
});

test('scanner: real admit card time formats (09.00AM, Noon, IST, Sharp, hrs, ranges, Hindi)', () => {
  const t = (s) => scanTimes(tokenize(normalizeText(s))).map((x) => x.hhmm);
  assert.deepEqual(t('09.00AM to 12.00Noon (IST)'), ['09:00', '12:00']);
  assert.deepEqual(t('07.00AM (IST)'), ['07:00']);
  assert.deepEqual(t('08.30AM Sharp (IST)'), ['08:30']);
  assert.deepEqual(t('09:00AM'), ['09:00']);
  assert.deepEqual(t('0900 hrs'), ['09:00']);
  assert.deepEqual(t('09.00 hrs'), ['09:00']);
  assert.deepEqual(t('1430hrs'), ['14:30']);
  assert.deepEqual(t('12 Noon'), ['12:00']);
  assert.deepEqual(t('Noon'), ['12:00']);
  assert.deepEqual(t('Midnight'), ['00:00']);
  assert.deepEqual(t('11 Noon'), ['12:00']);                             // "11" alone is not a time; "Noon" still means 12:00
  assert.deepEqual(t('9.00-12.00'), ['09:00', '12:00']);
  assert.deepEqual(t('9.00–12.00'), ['09:00', '12:00']);
  assert.deepEqual(t('from 9 AM to 12 PM'), ['09:00', '12:00']);
  assert.deepEqual(t('Indian Standard Time onwards 7.30 AM'), ['07:30']);
  assert.deepEqual(t('9.00 पूर्वाह्न से 12.00 अपराह्न'), ['09:00', '12:00']);
  assert.deepEqual(t('सुबह 9 बजे'), ['09:00']);
  assert.deepEqual(t('दोपहर 2 बजे'), ['14:00']);
  assert.deepEqual(t('23.01.2026'), []);                                // a date
  assert.deepEqual(t('02.06.2026 09.00 AM'), ['09:00']);
});
