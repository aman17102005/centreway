// Reads a timetable: many rows of date + time (+ subject). One row = one exam day (or one paper).
import { mergeSort } from '../dsa/mergeSort.js';
import { asciiLower, kmpFirst } from '../dsa/kmp.js';
import { tokenize, scanDates, scanTimes, isPlausibleExamDate } from '../dsa/fieldScanner.js';
import { BIRTH_WORDS, WEEKDAYS } from './labels.js';

const FILLER = ['to', 'am', 'pm', 'hrs', 'hr', 'hours', 'onwards', 'shift', 'a', 'm', 'p'];

function containsAny(lower, words) {
  for (const w of words) if (kmpFirst(lower, w) >= 0) return true;
  return false;
}

/** Words of the row that are left after removing dates, times, weekdays and filler: that is the subject. */
function subjectOf(text) {
  const tokens = tokenize(text);
  const words = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'word') {
      const lower = asciiLower(t.text);
      if (WEEKDAYS.includes(lower) || FILLER.includes(lower) || lower.length < 2) continue;
      // a month name that belongs to a written date such as "15 March 2026"
      if (['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'].includes(lower.slice(0, 3)) && tokens[i - 1]?.kind === 'num' && tokens[i - 1].text.length <= 2) continue;
      words.push(t.text);
    } else if (t.kind === 'num' && t.text.length === 3 && words.length) words.push(`(${t.text})`); // paper codes like (042)
  }
  return words.join(' ').trim();
}

/** A single digit standing alone in the row (not part of a date or a time) is the shift number. */
function loneDigit(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'num' || t.text.length !== 1 || t.text === '0') continue;
    const near = [tokens[i - 1], tokens[i + 1]].filter(Boolean);
    if (near.some((n) => n.kind === 'punct' && ':./-'.includes(n.text))) continue;
    if (tokens[i + 1] && tokens[i + 1].kind === 'word' && ['am', 'pm', 'a', 'p'].includes(asciiLower(tokens[i + 1].text))) continue; // "9 AM"
    return t.text;
  }
  return '';
}

/**
 * lines: layout lines. headerKinds: column order from the header ('report', 'gate', 'examTime' ...).
 * Returns { rows: [{date, times:[...], subject, lineIndex}] } sorted by date and time, or null if the card has no timetable.
 */
export function findTimetable(lines) {
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    if (!text) continue;
    const lower = asciiLower(text);
    if (containsAny(lower, BIRTH_WORDS)) continue;
    const tokens = tokenize(text);
    const dates = scanDates(tokens).filter((d) => isPlausibleExamDate(d.iso));
    if (dates.length !== 1) continue;
    const times = scanTimes(tokens);
    if (times.length === 0) continue;
    rows.push({ date: dates[0].iso, times: times.map((t) => t.hhmm), subject: subjectOf(text), shift: loneDigit(tokens), lineIndex: i });
  }
  const distinct = [];
  for (const r of rows) if (!distinct.includes(r.date)) distinct.push(r.date);
  if (rows.length < 2 || distinct.length < 2) return null; // one date only: it is not a timetable
  return { rows: mergeSort(rows, (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.times[0] < b.times[0] ? -1 : a.times[0] > b.times[0] ? 1 : 0)) };
}

/**
 * Give each time of a row a meaning. kinds = column order read from the header (like ['report','gate','examTime']);
 * without a header: 1 time = start, 2 = start+end, 3 = report+start+end, 4 = report+gate+start+end.
 */
export function assignRowTimes(times, kinds) {
  const out = { reportTime: '', gateTime: '', startTime: '', endTime: '' };
  const order = kinds && kinds.length >= 2 ? kinds : ({ 1: ['examTime'], 2: ['examTime'], 3: ['report', 'examTime'], 4: ['report', 'gate', 'examTime'] }[Math.min(4, times.length)] || ['examTime']);
  let next = 0;
  for (const kind of order) {
    if (next >= times.length) break;
    if (kind === 'report') out.reportTime = times[next++];
    else if (kind === 'gate') out.gateTime = times[next++];
    else if (kind === 'examTime') {
      out.startTime = times[next++];
      if (next < times.length && !order.slice(order.indexOf(kind) + 1).length) out.endTime = times[next++];
      else if (next < times.length && order.indexOf(kind) === order.length - 1) out.endTime = times[next++];
    }
  }
  if (times.length === 2 && !out.endTime && !kinds?.length) { out.startTime = times[0]; out.endTime = times[1]; }
  return out;
}
