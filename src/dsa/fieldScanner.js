/*
 * FIELD SCANNER (hand-written character scanner + KMP labels)
 * What:  pulls the exam details out of messy OCR text without regular expressions.
 *        Step 1  normalise: Hindi digits -> 0-9, many spaces -> one space.
 *        Step 2  tokenise with a tiny state machine that reads one character at a
 *                time and is always in one of three states: NONE, IN_NUMBER, IN_WORD.
 *                It produces tokens: number, word, punctuation, newline.
 *        Step 3  look at token patterns:
 *                  date   = number / number / number   or   number Month number
 *                  time   = number : number [am|pm]    or   number am|pm
 *                  pincode = a 6-digit number (first digit 1-8), or "pin" + number
 *        Step 4  find labels ("Reporting Time", "Gate Closing Time", "Exam Date",
 *                "Venue", "Address", and Hindi ones) with KMP, then read the value
 *                that follows the label.
 * Used by: the admit card screen (main extraction path). The older regex-based
 *          extractor in src/logic/extract.js stays as a fallback.
 * Time:  O(n) to tokenise + O(n * labels) for label search with KMP, n = text length.
 * Space: O(n) for the tokens.
 * Why a scanner and KMP? They show exactly how the text is read, character by
 *        character, with guaranteed linear time and no hidden regex engine.
 */
import { HashMap } from './hashMap.js';
import { asciiLower, findFirstLabel, kmpFirst } from './kmp.js';

// ---------------------------------------------------------------- normalise

const isDigit = (code) => code >= 48 && code <= 57;
const isHindiDigit = (code) => code >= 0x0966 && code <= 0x096f;

/** Hindi digits -> ASCII digits, tabs/non-breaking spaces -> space, runs of spaces -> one, \r removed. */
export function normalizeText(text) {
  let out = '';
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    const code = text.charCodeAt(i);
    if (isHindiDigit(code)) ch = String.fromCharCode(code - 0x0966 + 48);
    if (ch === '\r') continue;
    if (ch === '\t' || ch === ' ') ch = ' ';
    if (ch === ' ') {
      if (lastWasSpace) continue;
      lastWasSpace = true;
    } else lastWasSpace = false;
    out += ch;
  }
  return fixDigitLetters(out);
}

/** OCR reads 0 as O and 1 as l / I inside numbers: "10:O0" -> "10:00", "1O.3O" -> "10.30". Only a letter between digits (or next to a time / date mark after a digit) is changed. */
function fixDigitLetters(text) {
  return text
    .replace(/(?<=[0-9][:./-]?)[Oo](?=[0-9])/g, '0')
    .replace(/(?<=[0-9])[Oo](?=[:./-]?[0-9])/g, '0')
    .replace(/(?<=[0-9][:.][0-9])[Oo](?![A-Za-z])/g, '0')
    .replace(/(?<=[0-9][:./-])[lI](?=[0-9])/g, '1')
    .replace(/(?<=[0-9])[lI](?=[:./-][0-9])/g, '1');
}

// ----------------------------------------------------------------- tokeniser

function isLetterCode(code) {
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return true; // A-Z a-z
  if (code >= 0x0900 && code <= 0x097f) return !isHindiDigit(code) && code !== 0x0964 && code !== 0x0965; // Devanagari
  return code >= 0xc0 && code < 0x2000; // accented Latin and others
}

const NONE = 0;
const IN_NUMBER = 1;
const IN_WORD = 2;

/** Token = { kind: 'num' | 'word' | 'punct' | 'newline', text, start, end }. Spaces are skipped. */
export function tokenize(text) {
  const tokens = [];
  let state = NONE;
  let tokenStart = 0;
  let current = '';
  const finish = (endIndex) => {
    if (state === IN_NUMBER) tokens.push({ kind: 'num', text: current, start: tokenStart, end: endIndex });
    else if (state === IN_WORD) tokens.push({ kind: 'word', text: current, start: tokenStart, end: endIndex });
    state = NONE;
    current = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (state === IN_NUMBER) {
      if (isDigit(code)) { current += ch; continue; }
      finish(i);
    } else if (state === IN_WORD) {
      if (isLetterCode(code)) { current += ch; continue; }
      // "a.m" / "p.m": keep a dot inside a one-letter word when a letter follows
      if (ch === '.' && current.length === 1 && i + 1 < text.length && isLetterCode(text.charCodeAt(i + 1))) continue;
      finish(i);
    }
    // state is NONE here: start something new
    if (isDigit(code)) { state = IN_NUMBER; tokenStart = i; current = ch; }
    else if (isLetterCode(code)) { state = IN_WORD; tokenStart = i; current = ch; }
    else if (ch === '\n') tokens.push({ kind: 'newline', text: ch, start: i, end: i + 1 });
    else if (ch !== ' ') tokens.push({ kind: 'punct', text: ch, start: i, end: i + 1 });
  }
  finish(text.length);
  return tokens;
}

// ---------------------------------------------------------------------- dates

const MONTHS = new HashMap();
['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  .forEach((name, i) => { MONTHS.set(name, i + 1); MONTHS.set(name.slice(0, 3), i + 1); });
MONTHS.set('sept', 9);
// Hindi month names (and the usual spelling variants)
[['जनवरी'], ['फरवरी', 'फ़रवरी'], ['मार्च'], ['अप्रैल', 'अप्रेल'], ['मई'], ['जून'], ['जुलाई'], ['अगस्त'], ['सितंबर', 'सितम्बर'], ['अक्टूबर', 'अक्तूबर'], ['नवंबर', 'नवम्बर'], ['दिसंबर', 'दिसम्बर']]
  .forEach((names, i) => names.forEach((n) => MONTHS.set(n, i + 1)));

const isSeparator = (token) => token && token.kind === 'punct' && (token.text === '/' || token.text === '-' || token.text === '.');
const pad2 = (n) => (n < 10 ? `0${n}` : String(n));

/** A date years in the past (a birth date) or far ahead is never an exam date: the exam is within about 6 years back and 3 ahead. */
export function isPlausibleExamDate(iso, now = new Date()) {
  const year = now.getFullYear(); const y = Number(String(iso).slice(0, 4));
  return y >= year - 6 && y <= year + 3;
}

/** All dates in the tokens: [{ iso: 'YYYY-MM-DD', start }]. */
export function scanDates(tokens) {
  const found = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // month first: "January 23, 2026", "Jan. 23rd 2026"
    if (t.kind === 'word' && MONTHS.get(asciiLower(t.text)) !== undefined) {
      let j = i + 1;
      while (tokens[j]?.kind === 'punct' && (tokens[j].text === '.' || tokens[j].text === ',' || tokens[j].text === '-')) j++;
      const d = tokens[j];
      if (d?.kind === 'num' && d.text.length <= 2 && Number(d.text) >= 1 && Number(d.text) <= 31) {
        let k = j + 1;
        if (tokens[k]?.kind === 'word' && isOrdinalSuffix(tokens[k].text)) k++;
        while (tokens[k]?.kind === 'punct' && (tokens[k].text === ',' || tokens[k].text === '-' || tokens[k].text === '.')) k++;
        if (tokens[k]?.kind === 'num' && tokens[k].text.length === 4) {
          found.push({ iso: `${tokens[k].text}-${pad2(MONTHS.get(asciiLower(t.text)))}-${pad2(Number(d.text))}`, start: t.start });
          i = k;
          continue;
        }
      }
    }
    if (t.kind !== 'num' || t.text.length > 2) continue;
    const day = Number(t.text);
    if (day < 1 || day > 31) continue;

    // 14/03/2026, 14-03-26, 14.03.2026
    if (isSeparator(tokens[i + 1]) && tokens[i + 2]?.kind === 'num' && isSeparator(tokens[i + 3]) && tokens[i + 4]?.kind === 'num') {
      const month = Number(tokens[i + 2].text);
      const yearText = tokens[i + 4].text;
      if (tokens[i + 2].text.length <= 2 && month >= 1 && month <= 12 && (yearText.length === 2 || yearText.length === 4)) {
        const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
        found.push({ iso: `${year}-${pad2(month)}-${pad2(day)}`, start: t.start });
        i += 4;
        continue;
      }
    }

    // 3rd April 2026, 25 Jan, 2026, 12-March-2026
    let j = i + 1;
    if (tokens[j]?.kind === 'word' && isOrdinalSuffix(tokens[j].text)) j++;
    while (tokens[j]?.kind === 'punct' && (tokens[j].text === ',' || tokens[j].text === '-' || tokens[j].text === '.')) j++;
    if (tokens[j]?.kind === 'word') {
      const month = MONTHS.get(asciiLower(tokens[j].text));
      let k = j + 1;
      while (tokens[k]?.kind === 'punct' && (tokens[k].text === ',' || tokens[k].text === '-' || tokens[k].text === '.')) k++;
      if (month !== undefined && tokens[k]?.kind === 'num' && tokens[k].text.length === 4) {
        found.push({ iso: `${tokens[k].text}-${pad2(month)}-${pad2(day)}`, start: t.start });
        i = k;
      }
    }
  }
  return found;
}

function isOrdinalSuffix(word) {
  const w = asciiLower(word);
  return w === 'st' || w === 'nd' || w === 'rd' || w === 'th';
}

// ---------------------------------------------------------------------- times

/**
 * All clock times in the tokens: [{ hhmm: '08:30', start }].
 * Understands: 09.00AM, 9:00 a.m., 12.00Noon, 12 Noon, Noon, Midnight, 0900 hrs, 14.30 hrs, and Hindi am/pm words.
 * Words such as (IST), Sharp, onwards are simply ignored.
 */
export function scanTimes(tokens) {
  const found = [];
  const add = (hour, minute, start) => found.push({ hhmm: `${pad2(hour)}:${pad2(minute)}`, start });
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'word') { // "Noon" or "Midnight" on their own
      const mark = readAmPm(t);
      if (mark === 'noon') add(12, 0, t.start); else if (mark === 'midnight') add(0, 0, t.start);
      continue;
    }
    if (t.kind !== 'num') continue;
    // 0900-1200 hrs, 1430 to 1630 hrs: two 4-digit times with "hrs" after the second
    if (t.text.length === 4 && tokens[i + 1] && tokens[i + 2]) {
      const sepTok = tokens[i + 1]; const second = tokens[i + 2];
      const isSep = (sepTok.kind === 'punct' && (sepTok.text === '-' || sepTok.text === '\u2013' || sepTok.text === '\u2014')) || (sepTok.kind === 'word' && ['to', 'till', 'से'].includes(asciiLower(sepTok.text)));
      if (isSep && second.kind === 'num' && second.text.length === 4 && tokens[i + 3]?.kind === 'word' && HOUR_WORDS.includes(asciiLower(tokens[i + 3].text))) {
        const h1 = Number(t.text.slice(0, 2)); const m1 = Number(t.text.slice(2)); const h2 = Number(second.text.slice(0, 2)); const m2 = Number(second.text.slice(2));
        if (h1 <= 23 && m1 <= 59 && h2 <= 23 && m2 <= 59) { add(h1, m1, t.start); add(h2, m2, second.start); i += 3; continue; }
      }
    }
    // 0900 hrs, 1430hrs
    if (t.text.length === 4 && tokens[i + 1]?.kind === 'word' && HOUR_WORDS.includes(asciiLower(tokens[i + 1].text))) {
      const h = Number(t.text.slice(0, 2)); const m = Number(t.text.slice(2));
      if (h <= 23 && m <= 59) { add(h, m, t.start); i++; }
      continue;
    }
    if (t.text.length > 2) continue;
    let hour = Number(t.text);
    let minute = 0;
    let next = i + 1;
    const separator = tokens[i + 1];
    if (separator?.kind === 'punct' && (separator.text === ':' || separator.text === '.') && tokens[i + 2]?.kind === 'num' && tokens[i + 2].text.length === 2) {
      minute = Number(tokens[i + 2].text);
      next = i + 3;
      // "02.06.2026" or "02.06/2026" is a date, not a time
      const after = tokens[next];
      if (separator.text === '.' && after && after.kind === 'punct' && (after.text === '.' || after.text === '/') && after.start === tokens[i + 2].end) continue;
    }
    // Hindi: "सुबह 9 बजे", "दोपहर 2:30 बजे" (the marker comes BEFORE the number, "बजे" after it)
    if (tokens[next]?.kind === 'word' && tokens[next].text === 'बजे') {
      const before = readAmPm(tokens[i - 1]);
      let h = Number(t.text);
      if (before === 'pm' && h < 12) h += 12;
      if (before === 'am' && h === 12) h = 0;
      if (h <= 23 && minute <= 59) { add(h, minute, t.start); i = next; }
      continue;
    }
    const marker = readAmPm(tokens[next]);
    if ((marker === 'am' || marker === 'pm') && Number(t.text) === 0) continue;   // "0 AM" is no time (rubbish from a misread digit)
    if (next === i + 1 && marker === '') continue; // a lone number with no ":" and no am/pm is not a time
    if (marker === 'pm' && hour < 12) hour += 12;
    if (marker === 'am' && hour === 12) hour = 0;
    if (marker === 'noon' && hour !== 12) { if (next === i + 1) continue; } // "11 Noon" makes no sense: not a time
    if (marker === 'midnight' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) continue;
    add(hour, minute, t.start);
    i = marker ? next : next - 1; // skip the tokens we just used
  }
  return found;
}

const HOUR_WORDS = ['hrs', 'hr', 'hours', 'hour', 'h'];
const HINDI_AM = ['पूर्वाह्न', 'पूर्वान्ह', 'प्रातः', 'सुबह', 'पूर्वाह्', 'प्रात'];
const HINDI_PM = ['अपराह्न', 'अपरान्ह', 'दोपहर', 'शाम', 'अपराह्'];

/** 'am', 'pm', 'noon' or 'midnight' if the token says so (English or Hindi), else ''. */
function readAmPm(token) {
  if (!token || token.kind !== 'word') return '';
  let letters = '';
  for (let i = 0; i < token.text.length; i++) if (token.text[i] !== '.') letters += token.text[i];
  letters = asciiLower(letters);
  if (letters === 'am' || letters === 'pm') return letters;
  if (letters === 'noon') return 'noon';
  if (letters === 'midnight') return 'midnight';
  if (HINDI_AM.includes(letters)) return 'am';
  if (HINDI_PM.includes(letters)) return 'pm';
  return '';
}

// ------------------------------------------------------------------- pincodes

const PIN_WORDS = ['pin', 'pincode', 'पिन'];
const ADDRESS_WORDS = ['road', 'nagar', 'near', 'dist', 'district', 'school', 'college', 'vidyalaya', 'university', 'marg',
  'colony', 'sector', 'plot', 'village', 'post', 'ward', 'street', 'chowk', 'मार्ग', 'नगर', 'विद्यालय', 'जिला', 'कॉलेज', 'स्कूल'];

const isPinNumber = (token) => token && token.kind === 'num' && token.text.length === 6 && token.text[0] >= '1' && token.text[0] <= '8';

/** The text of the line that contains index `at`. */
function lineAround(text, at) {
  let start = at;
  while (start > 0 && text[start - 1] !== '\n') start--;
  let end = at;
  while (end < text.length && text[end] !== '\n') end++;
  return text.slice(start, end);
}

export function lineHasAddressWord(line) {
  const lower = asciiLower(line);
  for (let i = 0; i < ADDRESS_WORDS.length; i++) if (kmpFirst(lower, ADDRESS_WORDS[i]) >= 0) return true;
  const words = tokenize(lower);
  for (let i = 0; i < words.length; i++) if (words[i].kind === 'word' && words[i].text === 'rd') return true;
  return false;
}

/** Pincode: one next to the word "pin" first, else the last 6-digit number on an address-looking line. */
export function scanPincode(text, trustContext = false) {
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'word' || !PIN_WORDS.includes(asciiLower(tokens[i].text))) continue;
    let j = i + 1;
    if (tokens[j]?.kind === 'word' && (asciiLower(tokens[j].text) === 'code' || tokens[j].text === 'कोड')) j++;
    while (tokens[j]?.kind === 'punct') j++;
    if (isPinNumber(tokens[j])) return tokens[j].text;
    // "560 001" written with a space in the middle
    if (tokens[j]?.kind === 'num' && tokens[j].text.length === 3 && tokens[j + 1]?.kind === 'num' && tokens[j + 1].text.length === 3 &&
        tokens[j + 1].start - tokens[j].end === 1 && tokens[j].text[0] >= '1' && tokens[j].text[0] <= '8') {
      return tokens[j].text + tokens[j + 1].text;
    }
  }
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (!isPinNumber(t)) continue;
    const before = t.start > 0 ? text[t.start - 1] : '';
    const after = t.end < text.length ? text[t.end] : '';
    if (before === '/' || before === '-' || before === '.') continue; // part of a date or a longer number
    if (after === '/' || after === '-' || after === ':' || after === '.') continue;
    if (trustContext || lineHasAddressWord(lineAround(text, t.start))) return t.text;
  }
  return '';
}

// --------------------------------------------------------------------- labels

const EXAM_DATE_LABELS = ['exam date', 'examination date', 'date of exam', 'date of the exam', 'date of examination',
  'date of the examination', 'test date', 'परीक्षा की तिथि', 'परीक्षा तिथि', 'परीक्षा की तारीख', 'परीक्षा तारीख', 'दिनांक'];
const BIRTH_WORDS = ['birth', 'dob', 'd.o.b', 'जन्म', 'issue', 'issued', 'generated', 'printed', 'downloaded', 'जारी'];
const REPORTING_LABELS = ['reporting', 'report time', 'time of reporting', 'entry time', 'centre entry', 'center entry',
  'रिपोर्टिंग', 'रिपोर्ट करने', 'प्रवेश का समय'];
const GATE_LABELS = ['gate closing', 'gate closes', 'gate close', 'closing time', 'closing of gate', 'last entry', 'no entry after',
  'गेट बंद', 'गेट बन्द', 'प्रवेश बंद'];
const NAME_LABELS = ['exam centre', 'exam center', 'examination centre', 'examination center', 'test centre', 'test center',
  'centre name', 'center name', 'name of centre', 'name of center', 'name of the centre', 'name of the center',
  'name of exam centre', 'name of exam center', 'name of the exam centre', 'name of the exam center',
  'name of examination centre', 'venue', 'परीक्षा केन्द्र', 'परीक्षा केंद्र', 'केन्द्र का नाम', 'केंद्र का नाम', 'परीक्षा स्थल'];
const ADDRESS_LABELS = ['centre address', 'center address', 'address of centre', 'address of center', 'address of the centre',
  'address of the center', 'venue address', 'address', 'केन्द्र का पता', 'केंद्र का पता', 'पता'];
// A line like "Phone: 123" starts a new field, but these words before a colon are still part of an address.
const ADDRESS_CONTINUES_WORDS = ['pin', 'pincode', 'pin code', 'dist', 'district', 'state', 'city', 'landmark', 'near', 'जिला', 'राज्य', 'पिन'];

function containsAny(lowerText, words) {
  for (let i = 0; i < words.length; i++) if (kmpFirst(lowerText, words[i]) >= 0) return true;
  return false;
}

/** Exam date (YYYY-MM-DD). Prefers a date right after an "exam date" label; skips birth dates. */
export function scanExamDate(text) {
  const dates = scanDates(tokenize(text));
  const before = (d) => asciiLower(text.slice(Math.max(0, d.start - 45), d.start));
  for (let i = 0; i < dates.length; i++) {
    const context = before(dates[i]);
    if (findFirstLabel(context, EXAM_DATE_LABELS) !== null && !containsAny(context.slice(-20), BIRTH_WORDS)) return dates[i].iso;
  }
  for (let i = 0; i < dates.length; i++) {
    if (!containsAny(before(dates[i]), BIRTH_WORDS)) return dates[i].iso;
  }
  return '';
}

/** First time (HH:MM) that appears shortly after one of the labels, line by line. */
function scanTimeAfterLabel(lines, labels) {
  for (let i = 0; i < lines.length; i++) {
    const hit = findFirstLabel(asciiLower(lines[i]), labels);
    if (hit === null) continue;
    const rest = lines[i].slice(hit.end);
    let skip = 0;
    while (skip < rest.length && skip < 25 && !isDigit(rest.charCodeAt(skip))) skip++; // up to 25 non-digits
    const times = scanTimes(tokenize(rest.slice(skip, skip + 45)));
    if (times.length > 0) return times[0].hhmm;
  }
  return '';
}

// ----------------------------------------------------------- name and address

/** A line like "Roll No: 123" starts a new field (a colon within the first 40 characters). */
function startsNewLabel(line) {
  let colon = -1;
  for (let i = 0; i < line.length && i < 41; i++) {
    if (line[i] === ':' || line[i] === '：') { colon = i; break; }
  }
  if (colon < 2) return false;
  const prefix = asciiLower(line.slice(0, colon).trim());
  for (let i = 0; i < ADDRESS_CONTINUES_WORDS.length; i++) {
    if (prefix.slice(0, ADDRESS_CONTINUES_WORDS[i].length) === ADDRESS_CONTINUES_WORDS[i]) return false;
  }
  return true;
}

/** Remove spaces before commas and double commas: "a ,, b" -> "a, b". */
function tidyCommas(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ',') {
      while (out.length > 0 && out[out.length - 1] === ' ') out = out.slice(0, -1);
      if (out.length > 0 && out[out.length - 1] === ',') continue;
    }
    out += text[i];
  }
  return out;
}

/** Text after the label on the same line, plus following lines until a blank line or a new label (max 5 parts). */
function readBlock(lines, lineIndex, labelEnd) {
  let start = labelEnd;
  const first = lines[lineIndex];
  while (start < first.length && ' :：-–.'.includes(first[start])) start++;
  const firstPart = first.slice(start).trim();
  const parts = firstPart ? [firstPart] : [];
  for (let i = lineIndex + 1; i < lines.length && parts.length < 5; i++) {
    const line = lines[i].trim();
    if (line === '') { if (parts.length > 0) break; continue; }
    if (startsNewLabel(line)) break;
    parts.push(line);
  }
  return tidyCommas(parts.join(', '));
}

/** Index of the first line with one of the labels, or -1. */
function findLabelLine(lines, labels, skipLine) {
  for (let i = 0; i < lines.length; i++) {
    if (skipLine && skipLine(lines[i])) continue;
    const hit = findFirstLabel(asciiLower(lines[i]), labels);
    if (hit !== null) return { index: i, end: hit.end };
  }
  return null;
}

/** True if the line starts with the word "address" (ignoring leading symbols). */
function startsWithAddressWord(line) {
  let i = 0;
  while (i < line.length && !isLetterCode(line.charCodeAt(i)) && !isDigit(line.charCodeAt(i))) i++;
  return asciiLower(line.slice(i, i + 7)) === 'address';
}

/** Best guess for the city: the comma part just before (or holding) the pincode. */
export function guessCity(address, pincode) {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter((p) => p !== '');
  let at = -1;
  for (let i = 0; i < parts.length; i++) if (pincode && parts[i].includes(pincode)) at = i;
  const candidates = at > 0 ? [parts[at], parts[at - 1]] : [parts[parts.length - 1]];
  for (let i = 0; i < candidates.length; i++) {
    let c = candidates[i] || '';
    if (pincode) c = c.split(pincode).join('');
    c = c.trim();
    while (c.length > 0 && '-–:. '.includes(c[c.length - 1])) c = c.slice(0, -1);
    const lower = asciiLower(c);
    if (lower.slice(-3) === 'pin') c = c.slice(0, -3).trim();
    if (c.length >= 3) return c;
  }
  return '';
}

// ----------------------------------------------------------------- main entry

/** Text in, fields out. Empty string = not found. Same fields as the older extractor. */
export function extractFieldsScanner(rawText) {
  const text = normalizeText(String(rawText || ''));
  const lines = text.split('\n').map((l) => l.trim());

  let centreName = '';
  let address = '';
  const nameLine = findLabelLine(lines, NAME_LABELS, startsWithAddressWord);
  if (nameLine !== null) centreName = readBlock(lines, nameLine.index, nameLine.end);
  const addressLine = findLabelLine(lines, ADDRESS_LABELS, null);
  if (addressLine !== null) address = readBlock(lines, addressLine.index, addressLine.end);

  // One line holding both name and address: the first comma part is the name.
  if (centreName && !address && centreName.includes(',')) {
    address = centreName;
    centreName = centreName.split(',')[0].trim();
  }

  const pincode = scanPincode(address || centreName ? `${address}\n${centreName}\n${text}` : text);
  return {
    centreName,
    address,
    pincode,
    city: guessCity(address || centreName, pincode),
    examDate: scanExamDate(text),
    reportTime: scanTimeAfterLabel(lines, REPORTING_LABELS),
    gateTime: scanTimeAfterLabel(lines, GATE_LABELS),
  };
}
