// Reads the exam details out of an admit card, using layout (where each word sits) and the KMP / scanner code.
// Input : lines (from layout.js)  -> each line has words with x/y positions and OCR confidence.
// Output: every field as { value, confidence (0..1), level: 'high' | 'medium' | 'low', source, note? }.
// Never keeps the candidate's name, roll number, photo or signature: those labels are only used to know where a value ENDS.
import { HashMap } from '../dsa/hashMap.js';
import { mergeSort } from '../dsa/mergeSort.js';
import { asciiLower, kmpFirst } from '../dsa/kmp.js';
import { tokenize, scanDates, scanTimes, scanPincode, scanExamDate, guessCity, normalizeText, isPlausibleExamDate } from '../dsa/fieldScanner.js';
import { CARD_TITLE_WORDS } from './labels.js';
import { findExamTitle, shortenExamName, withoutHeaderWords, isHeaderOnly } from './examTitle.js';
import { findHits, trimValue, isAlnumAscii } from './labelHits.js';
import { wordIndexAt, makeLine } from './layout.js';
import { findTimetable, assignRowTimes } from './timetable.js';
import { findNotAllowed } from './instructions.js';
import { redactText, isPersonalLine } from './redact.js';
import { tableValues } from './tableReader.js';
import { parseCentre, splitCentreCode, cutAtPincode, cityFromParts, findPincode, STATES as STATE_NAMES } from './centreParse.js';
import { stateFromText, stateCodeFromText } from './placeText.js';
import { STATE_PIN_DIGITS } from './geoLists.js';

/** Take away words that only repeat the label ("Name:", "Address:", "of") from the front of a value. */
function stripLabelEcho(value) {
  let v = value;
  for (;;) {
    const lower = asciiLower(v);
    let cut = 0;
    for (const w of ['name', 'address', 'time', 'date', 'of', 'का नाम', 'का पता', 'का']) {
      if (lower.startsWith(w) && (lower.length === w.length || !isAlnumAscii(lower[w.length]) || w.charCodeAt(0) > 0x900)) { cut = w.length; break; }
    }
    if (!cut) return v;
    const rest = trimValue(v.slice(cut));
    // only strip when a separator followed ("Name: X"); a real value that starts with "Of..." stays
    if (rest.length === v.length - cut - (v.slice(cut).length - v.slice(cut).trimStart().length)) return v;
    v = rest;
  }
}

// ------------------------------------------------------------------------ one line = segments

/**
 * A label that is vertically centred in a tall cell sits BETWEEN the value lines ("Name, College" above it, "address" below it).
 * The line reader would then see the label with only the address below. Such a label is moved above its value lines.
 */
function liftCentredLabels(lines, extra) {
  const out = lines.slice();
  for (let i = 1; i + 1 < out.length; i++) {
    const L = out[i]; const P = out[i - 1]; const N = out[i + 1];
    if (!L.text || !P.text || !N.text || !L.words || !L.words.length) continue;
    const lower = asciiLower(L.text);
    const hits = findHits(lower, extra);
    if (!hits.length || hits[0].index > 2 || trimValue(lower.slice(hits[hits.length - 1].end)) !== '') continue;        // the line is a label and nothing else
    if (!['centreName', 'address'].includes(hits[0].kind)) continue;
    const lineH = Math.max(1, L.y1 - L.y0);
    const valueAbove = P.x0 >= L.x1 - 4 && P.y1 > L.y0 - 0.2 * lineH && !findHits(asciiLower(P.text), extra).length;       // starts right of the label and touches its height
    const alignedBelow = Math.abs(N.x0 - P.x0) <= 0.8 * lineH + 6;
    if (valueAbove && alignedBelow) { out[i - 1] = { ...L, y0: P.y0 - lineH * 1.4, y1: P.y0 - lineH * 0.2 }; out[i] = P; }      // the label now sits (also in height) above its value lines
  }
  return out;
}

/** Prepare every line: lower text, label hits. */
function annotate(lines, extra = null) {
  lines = liftCentredLabels(lines, extra);
  return lines.map((line) => {
    const lower = asciiLower(line.text);
    return { line, lower, hits: line.text ? findHits(lower, extra) : [] };
  });
}

/** Text to the right of hit i (up to the next label on the same line). */
const isHindiWord = (w) => /[\u0900-\u097f]/.test(w);

function rightText(entry, i) {
  const h = entry.hits[i];
  const next = entry.hits[i + 1];
  let value = trimValue(entry.line.text.slice(h.end, next ? next.index : undefined));
  // "English label / हिंदी लेबल  value": drop the Hindi translation of the label when a non-Hindi value follows it
  if (value.startsWith('/') && h.label.charCodeAt(0) < 128) {
    const words = value.slice(1).trim().split(' ').filter((w) => w);
    let k = 0;
    while (k < words.length && (isHindiWord(words[k]) || ':：-'.includes(words[k]))) k++;
    if (k > 0 && k < words.length) value = trimValue(words.slice(k).join(' '));
  }
  return value;
}

/** Words on the next lines that sit under hit i (a table header, or a label above its value). */
function belowText(entries, li, i, maxLines = 1) {
  const entry = entries[li];
  const h = entry.hits[i];
  const startWord = entry.line.words[wordIndexAt(entry.line, h.index)];
  if (!startWord) return '';
  const aloneOnLine = entry.hits.length === 1 && trimValue(entry.line.text.slice(h.end)) === '' && trimValue(entry.line.text.slice(0, h.index)) === '';
  const left = aloneOnLine ? -Infinity : startWord.x0 - 25;
  const nextHit = entry.hits[i + 1];
  const nextWord = nextHit ? entry.line.words[wordIndexAt(entry.line, nextHit.index)] : null;
  const right = nextWord ? nextWord.x0 - 25 : Infinity;
  const parts = [];
  for (let k = li + 1; k < entries.length && parts.length < maxLines; k++) {
    const below = entries[k];
    if (below.line.blank || !below.line.words.length) break;
    const gap = below.line.y0 - entries[k - 1].line.y1;
    if (gap > 2.2 * (below.line.y1 - below.line.y0)) break;                 // too far away: a different block
    const picked = below.line.words.filter((w) => w.x0 >= left && w.x0 < right).map((w) => w.text);
    if (picked.length === 0) break;
    // the line below starts with its own label (for a label alone on its line, only a label with a colon counts: "Venue Details" above "Centre Address: ...")
    if (below.hits.length && below.hits[0].index === 0 && (!aloneOnLine || /^\s*[:\uff1a]/.test(below.line.text.slice(below.hits[0].end)))) break;
    parts.push(picked.join(' '));
  }
  return trimValue(parts.join(' '));
}

/** The value for hit i: right of the label, else below it. Also returns the mean OCR confidence of the line. */
function valueFor(entries, li, i, opts = {}) {
  const right = rightText(entries[li], i);
  // one or two stray characters after a label ("Venue of Examination: a") are OCR noise, not a value
  if (right.length >= 3 || (right && /\d/.test(right)) || (entries[li].hits[i].kind === 'shift' && /^[ivlIVL|]{1,3}$/.test(right))) return { text: right, via: 'right', conf: entries[li].line.conf, lineIndex: li };
  const below = belowText(entries, li, i, opts.belowLines || 1);
  if (below) return { text: below, via: 'below', conf: entries[li + 1] ? entries[li + 1].line.conf : entries[li].line.conf, lineIndex: li };
  return { text: '', via: 'none', conf: entries[li].line.conf, lineIndex: li };
}

/** Collect every hit of a kind: [{ text, via, conf, lineIndex, label }]. */
// The table (cells of the card) for the card being read now. extractExamFields() sets it; it is cleared again when it returns.
let CONTEXT = null;

function collect(entries, kind, opts) {
  const found = [];
  if (CONTEXT && CONTEXT.table) {
    const t = CONTEXT.template;
    const values = tableValues(CONTEXT.table.cells, kind, { extra: t ? t.labels : null, where: t ? t.where[kind] || null : null, ignoreBelow: CONTEXT.cutY, stack: CONTEXT.table.source === 'gaps' });
    for (const v of values) found.push({ ...v, lineIndex: -1, hitIndex: 0 });
    if (found.length) return found;     // the table answered: text from outside the cells is never mixed in
  }
  for (let li = 0; li < entries.length; li++) {
    const e = entries[li];
    for (let i = 0; i < e.hits.length; i++) {
      if (e.hits[i].kind !== kind) continue;
      const v = valueFor(entries, li, i, opts);
      found.push({ ...v, label: e.hits[i].label, hitIndex: i });
    }
  }
  return found;
}

// ---------------------------------------------------------------------- blocks (name, address)

function tidyCommas(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ',') {
      while (out.endsWith(' ')) out = out.slice(0, -1);
      if (out.endsWith(',')) continue;
    }
    out += text[i];
  }
  return out;
}

/** Value that can continue on the next lines (centre address): stop at blank gaps, labels, numbered lists. */
function blockFor(entries, found) {
  if (found.complete) return { text: tidyCommas(found.text), parts: [found.text], conf: found.conf }; // a whole table cell: never joined with other text
  let text = found.text;
  const base = entries[found.lineIndex];
  if (!text) return { text: '', parts: [], conf: base.line.conf };
  const parts = [text];
  let previous = found.via === 'below' ? found.lineIndex + 1 : found.lineIndex;
  let confSum = found.conf; let confCount = 1;
  const leftEdge = Math.min(...base.line.words.map((w) => w.x0)) - 40;
  for (let k = previous + 1; k < entries.length && parts.length < 4; k++) {
    const e = entries[k];
    if (e.line.blank || !e.line.words.length) break;
    const gap = e.line.y0 - entries[k - 1].line.y1;
    if (gap > 1.3 * (e.line.y1 - e.line.y0) + 6) break;
    if (e.line.words[0].x0 < leftEdge) break;
    const first = e.line.text;
    if (first.length > 1 && first[0] >= '0' && first[0] <= '9' && (first[1] === '.' || first[1] === ')')) break; // "1. Candidates must ..."
    const labels = e.hits.filter((h) => h.kind !== 'pin' && h.kind !== 'city'); // "City" and "Pin" can be part of an address
    if (labels.length) {
      const before = trimValue(first.slice(0, labels[0].index));
      if (before) parts.push(before);
      break;
    }
    if (kmpFirst(e.lower, 'instruction') >= 0 || kmpFirst(e.lower, 'निर्देश') >= 0) break;
    parts.push(first); confSum += e.line.conf; confCount++;
  }
  return { text: tidyCommas(parts.join(', ')), parts, conf: confSum / confCount };
}

// ---------------------------------------------------------------------------------- helpers

const isValidDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

function level(confidence) {
  return confidence >= 0.8 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
}

/** Build a field. base = how trustworthy the way we found it is; ocrConf = mean OCR confidence (0-100); valid = format ok. */
export function makeField(value, { base, ocrConf = 100, valid = true, source, note = '' }) {
  if (!value) return { value: '', confidence: 0, level: 'low', source: source || 'none', note };
  const ocrFactor = 0.7 + 0.3 * Math.min(1, ocrConf / 90);
  const confidence = Math.max(0, Math.min(1, base * ocrFactor * (valid ? 1 : 0.5)));
  return { value, confidence: Math.round(confidence * 100) / 100, level: level(confidence), source, note };
}
const empty = (note = '') => makeField('', { base: 0, source: 'none', note });

const BASE = { right: 0.93, below: 0.86, scan: 0.55, title: 0.72, derived: 0.45, qr: 0.95 };

function firstValid(list, test) {
  for (const item of list) { const r = test(item); if (r) return { ...item, result: r }; }
  return null;
}

/** Date(s) in a value text. */
// a date years in the past (a birth date) or far ahead is never the exam date
const plausibleExamDate = (iso) => isPlausibleExamDate(iso);
function datesIn(text) {
  return scanDates(tokenize(normalizeText(text))).map((d) => d.iso).filter(isValidDate).filter(plausibleExamDate);
}
function timesIn(text) {
  const clean = normalizeText(text);
  // skip up to 25 characters that are not digits (like "Time:"), then read within 45 characters
  let skip = 0;
  while (skip < clean.length && skip < 25 && !(clean[skip] >= '0' && clean[skip] <= '9')) skip++;
  // a Hindi am/pm word comes BEFORE the number ("दोपहर 12:00 बजे"): keep it
  const words = clean.slice(0, skip).trimEnd().split(' ');
  const marker = words[words.length - 1];
  if (['सुबह', 'प्रातः', 'प्रात', 'दोपहर', 'शाम', 'अपराह्न', 'पूर्वाह्न'].includes(marker)) skip = clean.slice(0, skip).trimEnd().length - marker.length;
  return scanTimes(tokenize(clean.slice(skip, skip + 60))).map((t) => t.hhmm);
}

const SHIFT_WORDS = ['morning', 'afternoon', 'evening', 'forenoon', 'fn', 'an', 'first', 'second', 'third', 'सुबह', 'दोपहर', 'शाम', 'पहली', 'दूसरी'];
function normaliseShift(text) {
  const t = trimValue(asciiLower(text)).split('-').join(' ').split(':').join(' ');   // "Shift-I" -> "shift i"
  const words = t.split(' ').filter((w) => w !== '');
  if (!words.length) return '';
  const w = words[0] === 'shift' || words[0] === 'session' || words[0] === 'slot' ? (words[1] || '') : words[0];
  if (/^[1-9]$/.test(w)) return w;
  if (/^[1il|]{2,3}$/.test(w)) return String(w.length);                  // "Shift-III" read as "Shift-111" / "Shift-Ill": the strokes are counted
  const roman = w.split('l').join('i').split('|').join('i');            // OCR often reads the letter I as l or |
  if (/^(i|ii|iii|iv)$/.test(roman)) return String({ i: 1, ii: 2, iii: 3, iv: 4 }[roman]);
  if (/^[a-d]$/.test(w) && words.length <= 2) return w.toUpperCase();
  if (SHIFT_WORDS.includes(w)) return w.charAt(0).toUpperCase() + w.slice(1);
  return '';
}

/** True when the text starts with a centre code like "AB1234 -". */
function startsWithCode(text, stateCode = '') { return splitCentreCode(text, stateCode) !== null; }

/** "ABC School, Sector 5, Town" -> "ABC School" (the leading institution part). */
function splitNameFromAddress(address) {
  const parsed = parseCentre(address);
  return parsed.name || address.split(',')[0].trim();
}

// ------------------------------------------------------------------------------ city

/** City = the last part of the address that is not a state, a number or a pincode. */
function cityFromAddress(address, pincode) {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    let part = pincode ? parts[i].split(pincode).join('') : parts[i];
    part = part.replace(/^(pin\s*code|pincode|pin|पिन)\s*[:-]?/i, '').trim();
    while (part.length && '-–:. '.includes(part[part.length - 1])) part = part.slice(0, -1);
    while (part.length && '-–:. '.includes(part[0])) part = part.slice(1);
    const lower = asciiLower(part);
    if (part.length < 3 || /^\d+$/.test(part) || STATE_NAMES.includes(lower)) continue;
    // "Town - State" style: keep the first word group before a dash if the rest is a state
    return part;
  }
  return guessCity(address, pincode);
}

// ------------------------------------------------------------------------------ exam name

const EXAM_KEYWORDS = ['jee', 'neet', 'ssc', 'rrb', 'ibps', 'cuet', 'upsc', 'cbse', 'police', 'constable', 'recruitment', 'examination', 'exam', 'test', 'entrance', 'clerk', 'officer'];

/** A name needs real words: "2026 Session 1" or "- 2026" alone is not an exam name. */
const hasRealWords = (name) => name.replace(/\b(20\d\d|session|phase|tier|shift|[ivx]+|\d+)\b/gi, ' ').replace(/[^A-Za-z\u0900-\u097f]/g, '').length >= 4;

function findExamName(entries, headerLines = []) {
  // 1) a label such as "Name of the Examination"
  const labelled = collect(entries, 'examName')
    .map((f) => ({ ...f, name: stripLabelEcho(f.text) }))
    .find((f) => f.name.length >= 3 && f.name.length <= 100);
  if (labelled) return { value: shortenExamName(trimValue(labelled.name)), base: BASE[labelled.via === 'below' ? 'below' : 'right'], conf: labelled.conf, source: 'label' };
  // 2) a known exam in the title area at the top (JEE, NEET, CUET, SSC, RRB, IBPS, UPSC ...): the short name, with year and session
  const topTexts = entries.slice(0, 14).map((e) => e.line.text);
  const known = findExamTitle(headerLines.concat(topTexts));
  if (known) return { value: known.value, base: BASE.title + 0.05, conf: 90, source: 'title' };
  // 3) the title line near the top that has "Admit Card" in it
  const top = entries.slice(0, 8);
  for (const e of top) {
    for (const word of CARD_TITLE_WORDS.slice().sort((a, b) => b.length - a.length)) {
      const at = kmpFirst(e.lower, word);
      if (at < 0) continue;
      let name = trimValue(e.line.text.slice(0, at) + ' ' + e.line.text.slice(at + word.length));
      name = withoutHeaderWords(name.replace(/\s+/g, ' ').trim());   // never the ministry / department header
      for (const lead of ['for ', 'of ', '- ', '– ', ': ']) if (asciiLower(name).startsWith(lead)) name = name.slice(lead.length).trim();
      if (name.length < 3) { // the title is on the line above, e.g. "ABC Recruitment Board" / "ADMIT CARD"
        const above = entries[entries.indexOf(e) - 1];
        if (above) name = withoutHeaderWords(above.line.text);
      }
      if (name.length >= 3 && name.length <= 110 && !isHeaderOnly(name) && hasRealWords(name)) return { value: shortenExamName(trimValue(name)), base: BASE.title, conf: e.line.conf, source: 'title' };
    }
  }
  // 4) the first top line that sounds like an exam
  for (const e of top) {
    if (e.hits.length === 0 && !isHeaderOnly(e.line.text) && !e.line.text.includes(':') && EXAM_KEYWORDS.some((k) => kmpFirst(e.lower, k) >= 0) && e.line.text.length <= 100) return { value: shortenExamName(trimValue(withoutHeaderWords(e.line.text))), base: 0.5, conf: e.line.conf, source: 'title' };
  }
  return null;
}

// ------------------------------------------------------------------------------------ main

/**
 * lines: from buildLines / linesFromText / PDF text. opts.sourceConf (0-100) overrides OCR confidence (100 for PDF text).
 * Returns the structured result described at the top of this file.
 */
const CAPTIONS = ['photo', 'photograph', 'signature', 'sign', 'thumb', 'फोटो', 'हस्ताक्षर'];

/** The boxes for the photo and signature have captions ("Photo", "Signature") that sit on the same row as real text: drop them. */
function withoutCaptions(lines) {
  const out = [];
  for (const line of lines) {
    if (!line.words || line.words.length === 0) { out.push(line); continue; }
    const kept = line.words.filter((w) => !CAPTIONS.includes(asciiLower(w.text)));
    if (kept.length === 0) continue; // a line that is only a box caption
    out.push(kept.length === line.words.length ? line : makeLine(kept));
  }
  return out;
}

const CUT_HEADINGS = ['self declaration', 'self-declaration', 'undertaking', 'declaration by the candidate', 'important instructions', 'instructions to the candidate', 'instructions to candidates',
  'general instructions', 'instructions for candidates', 'स्वघोषणा', 'घोषणा पत्र', 'महत्वपूर्ण निर्देश'];

/** Index of the first line that starts the self-declaration or the instructions (everything from there on is ignored for fields), or -1. */
const DECLARATION_SENTENCE = /\b(resident of|r\/o|s\/o|d\/o|w\/o|son of|daughter of|do hereby (solemnly )?(declare|affirm|state)|hereby (solemnly )?declare)\b/i;
function findCutIndex(lines) {
  // a declaration sentence ("I, NAME, resident of ... do hereby declare") holds the candidate's HOME address: nothing from there on is read
  for (let i = 0; i < lines.length; i++) if (DECLARATION_SENTENCE.test(lines[i].text || '') && /^\s*(i|मैं)\b/i.test(lines[i].text || '')) return i;
  for (let i = 0; i < lines.length; i++) {
    const lower = asciiLower(lines[i].text || '');
    if (lower.length > 90) continue;
    if (CUT_HEADINGS.some((h) => { const at = kmpFirst(lower, h); return at >= 0 && at <= 3; })) return i;
  }
  return -1;
}

/**
 * Read the exam details. opts: { sourceConf, keepAiText, table: { cells } (from the grid / gap reader), template (known layout) }.
 * The candidate's self-declaration and the instructions are never used for fields; the instructions are only searched for "not allowed" items.
 */
export function extractExamFields(rawLines, opts = {}) {
  const allLines = withoutCaptions(rawLines);
  const cut = findCutIndex(allLines);
  const lines = cut >= 0 ? allLines.slice(0, cut) : allLines;
  CONTEXT = { table: opts.table || null, template: opts.template || null, cutY: cut >= 0 ? allLines[cut].y0 - 2 : Infinity };
  try { return readFields(lines, allLines, { ...opts, rawLines }); } finally { CONTEXT = null; }
}

// words of the candidate's own home address in the self-declaration: a pincode on such a line is never the centre's
const HOME_LINE = /resident|\bh\.?\s?no\b|house\s*no|do hereby|\bson of\b|daughter of|\br\/o\b|permanent address|correspondence address|मकान|निवासी/i;

/**
 * The pincode when the centre block itself has none: from the other lines, but never from a line about the candidate's home,
 * and a pincode whose first digit does not fit the state named on the card is only used when nothing else is there.
 */
function fallbackPincode(address, centreName, fullText) {
  const lines = fullText.split('\n').filter((l) => !HOME_LINE.test(l));
  const text = `${address}\n${centreName}\n${lines.join('\n')}`;
  const state = stateFromText(text);
  const digits = STATE_PIN_DIGITS[state];
  const found = [];
  for (const l of [address, centreName, ...lines]) { const one = scanPincode(l); if (one && !found.includes(one)) found.push(one); }     // in order: the centre block first, then the other lines
  if (!found.length) return '';
  return found.find((p) => !digits || digits.includes(Number(p[0]))) || found[0];
}

/**
 * The instruction lines of the card (from the first "Instructions" / "Declaration" heading on), for the "Can I bring...?" checker.
 * Personal lines (the candidate's own details, the home-address declaration, numbers) are left out. At most 80 lines of 240 characters.
 */
function instructionLinesOf(allLines) {
  const cut = findCutIndex(allLines);
  const from = cut >= 0 ? cut : 0;
  const out = [];
  for (let i = from; i < allLines.length && out.length < 80; i++) {
    const text = String(allLines[i].text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 12) continue;
    if (cut < 0 && !/not allowed|prohibited|must|should|bring|carry|banned|permitted|अनुमति|निषिद्ध|अनिवार्य/i.test(text)) continue;      // no heading found: only lines that sound like rules
    const ruleWords = /not allowed|prohibited|banned|must|should|bring|carry|permitted|allowed|अनुमति|वर्जित|अनिवार्य|निषिद्ध/i.test(text);      // "Mobile phones are not allowed" is a rule, not the candidate's phone number
    if ((isPersonalLine(text) && !ruleWords) || HOME_LINE.test(text) || /^\s*(i|मैं)\s*,/i.test(text) || /\b\d{6,}\b/.test(text)) continue;
    out.push(text.length > 240 ? `${text.slice(0, 237)}...` : text);
  }
  return out;
}

function readFields(lines, allLines, opts) {
  const entries = annotate(lines, opts.template ? opts.template.labels : null);
  const fullText = lines.map((l) => l.text).join('\n');
  const meanConf = opts.sourceConf ?? (lines.length ? lines.reduce((s, l) => s + l.conf, 0) / lines.length : 0);
  const result = { instructions: instructionLinesOf(opts.rawLines || allLines), examName: empty(), centreName: empty(), centreCode: empty(), address: empty(), city: empty(), pincode: empty(), days: [], notAllowed: [], isTimetable: false, fixes: [], issues: [] };

  // ---- exam name
  const nameFound = findExamName(entries, opts.headerLines || []);
  if (nameFound) result.examName = makeField(nameFound.value, { base: nameFound.base, ocrConf: opts.sourceConf ?? nameFound.conf, source: nameFound.source });

  // ---- centre name and address
  const cardStateCode = stateCodeFromText(fullText);      // the two letters of the state: repairs a centre code the OCR misread
  const nameHits = collect(entries, 'centreName', { belowLines: 1 }).filter((f) => stripLabelEcho(f.text).length >= 3);
  let addrHits = [];
  let centreName = ''; let centreVia = 'right'; let centreConf = meanConf;
  let centreCode = ''; let parsedCentre = null;
  let combinedAddress = ''; let incompleteCell = false;
  if (nameHits.length) {
    const f = nameHits[0];
    const block = blockFor(entries, { ...f, text: stripLabelEcho(f.text) });
    centreName = block.text; centreVia = f.via; centreConf = f.conf;
    const whole = f.complete ? block.text : (block.parts || [block.text]).join(' ');
    // "Test Centre Code, Name and Address" (or a cell that starts with a code like "AB1234 -"): code, name, address, pincode and city come from this one cell
    if (startsWithCode(block.text, cardStateCode) || (f.complete && f.label.includes('address'))) {
      parsedCentre = parseCentre(whole, { stateCode: cardStateCode });
      centreCode = parsedCentre.code;
      centreName = parsedCentre.name || (block.parts && block.parts[0]) || '';
      combinedAddress = parsedCentre.address;
      // only a name (no comma, no pincode): the address is in its own labelled field
      if (!parsedCentre.pincode && !parsedCentre.address.includes(',')) { combinedAddress = ''; incompleteCell = true; }
    } else if ((f.label.includes('address') || collect(entries, 'address', { belowLines: 1 }).filter((x) => x.text.length >= 3).length === 0) && block.parts && block.parts.length > 1) {
      // a bare "Venue of Examination" with name and address lines below it: the first line is the name, the lines after it are the address
      centreName = block.parts[0];
      combinedAddress = tidyCommas(block.parts.slice(1).join(', '));
    }
  }
  if (!parsedCentre || incompleteCell) addrHits = collect(entries, 'address', { belowLines: 1 }).filter((f) => f.text.length >= 3);
  let address = ''; let addressVia = 'right'; let addressConf = meanConf;
  if (addrHits.length) {
    const f = addrHits[0];
    const block = blockFor(entries, { ...f, text: stripLabelEcho(f.text) });
    address = block.text; addressVia = f.via; addressConf = block.conf;
  }
  if (combinedAddress && !address) address = combinedAddress;
  // the name line already holds the whole address: "Centre: ABC School, Sector 5, Town 123456"
  if (centreName && !address && centreName.includes(',')) {
    address = centreName;
    centreName = splitNameFromAddress(address);
  }
  // a block that grew too long means the name block swallowed the address block
  if (!parsedCentre && centreName && address && centreName.length > address.length && centreName.includes(address.slice(0, 12))) {
    centreName = centreName.slice(0, centreName.indexOf(address.slice(0, 12))).replace(/[,\s]+$/, '');
  }
  // a name that stops where the address begins (name block ran on into it)
  if (!parsedCentre && centreName && address) {
    const at = centreName.indexOf(address.split(',')[0]);
    if (at > 3) centreName = centreName.slice(0, at).replace(/[,\s]+$/, '');
  }
  // "Test Centre Address: <Institution>, <road>, <town> ...": no separate name label, so the institution part is the centre name
  if (!centreName && address && !parsedCentre) {
    const guess = parseCentre(address, { stateCode: cardStateCode });
    if (guess.name) { centreName = guess.name; if (guess.code && !centreCode) centreCode = guess.code; }
  }
  address = cutAtPincode(address);                      // the address ends at the pincode: nothing from the next cell or row
  if (centreName) result.centreName = makeField(centreName, { base: BASE[centreVia === 'below' ? 'below' : 'right'], ocrConf: opts.sourceConf ?? centreConf, source: 'label' });
  if (centreCode) result.centreCode = makeField(centreCode, { base: BASE.right, ocrConf: opts.sourceConf ?? centreConf, source: 'label' });
  if (address) result.address = makeField(address, { base: BASE[addressVia === 'below' ? 'below' : 'right'], ocrConf: opts.sourceConf ?? addressConf, source: 'label' });

  // ---- pincode: prefer one inside the address block, else the label, else any address-looking line
  const pinText = address || centreName ? `${address}\n${centreName}\n${fullText}` : fullText;
  const pinInBlock = (parsedCentre && parsedCentre.pincode) || scanPincode(address || centreName || '', true);
  const pin = pinInBlock || fallbackPincode(address, centreName, fullText);
  if (pin) result.pincode = makeField(pin, { base: pinInBlock ? BASE.right : BASE.scan + 0.15, ocrConf: opts.sourceConf ?? addressConf, valid: /^[1-8]\d{5}$/.test(pin), source: pinInBlock ? 'label' : 'scan' });

  // ---- city: from a "City / District" label, else from the address
  const cityHit = collect(entries, 'city').map((f) => trimValue(f.text)).find((t) => t.length >= 3 && t.length <= 40 && !/\d/.test(t));
  const guessed = (parsedCentre && parsedCentre.city) || cityFromParts((address || centreName).split(',')) || cityFromAddress(address || centreName, pin);
  if (cityHit) result.city = makeField(cityHit, { base: BASE.right, ocrConf: opts.sourceConf ?? meanConf, source: 'label' });
  else if (guessed) result.city = makeField(guessed, { base: parsedCentre && parsedCentre.city ? 0.84 : BASE.derived + 0.15, ocrConf: opts.sourceConf ?? meanConf, source: 'address' });

  // ---- instructions
  result.notAllowed = findNotAllowed(allLines);

  // ---- dates and times: a timetable (many rows) or a single day described by labels
  const timetable = findTimetable(lines);
  if (timetable) {
    result.isTimetable = true;
    // header: the first line above the first row that names columns (report / gate / exam time)
    const firstRow = timetable.rows.reduce((m, r) => Math.min(m, r.lineIndex), Infinity);
    let kinds = [];
    for (let k = firstRow - 1; k >= Math.max(0, firstRow - 3) && kinds.length < 2; k--) {
      const cols = entries[k].hits.filter((h) => h.kind === 'report' || h.kind === 'gate' || h.kind === 'examTime').map((h) => h.kind);
      if (cols.length >= 2) kinds = cols;
    }
    const reportAll = firstValid(collect(entries, 'report'), (f) => timesIn(f.text)[0]);
    const gateAll = firstValid(collect(entries, 'gate'), (f) => timesIn(f.text)[0]);
    for (const row of timetable.rows) {
      const t = assignRowTimes(row.times, kinds);
      const conf = lines[row.lineIndex].conf;
      const common = { ocrConf: opts.sourceConf ?? conf, source: 'timetable' };
      result.days.push({
        date: makeField(row.date, { base: 0.9, ...common }),
        reportTime: makeField(t.reportTime || (reportAll ? reportAll.result : ''), { base: t.reportTime ? 0.85 : 0.75, ...common }),
        gateTime: makeField(t.gateTime || (gateAll ? gateAll.result : ''), { base: t.gateTime ? 0.85 : 0.75, ...common }),
        startTime: makeField(t.startTime, { base: 0.85, ...common }),
        endTime: makeField(t.endTime, { base: 0.8, ...common }),
        shift: row.shift ? makeField(row.shift, { base: 0.8, ...common }) : empty(),
        subject: row.subject,
      });
    }
  } else {
    const dateHits = collect(entries, 'examDate');
    let dates = [];
    let dateVia = 'right'; let dateConf = meanConf;
    for (const f of dateHits) {
      const d = datesIn(f.text);
      if (d.length) { dates = d; dateVia = f.via; dateConf = f.conf; break; }
    }
    let dateBase = BASE[dateVia === 'below' ? 'below' : 'right'];
    if (!dates.length) {
      const any = scanExamDate(fullText);
      if (any && isValidDate(any) && plausibleExamDate(any)) { dates = [any]; dateBase = BASE.scan; }
    }
    const distinctDates = [];
    for (const d of dates) if (!distinctDates.includes(d)) distinctDates.push(d);

    const timeOf = (kind) => firstValid(collect(entries, kind), (f) => { const t = timesIn(f.text); return t.length ? t : null; });
    const rep = timeOf('report');
    const gate = timeOf('gate');
    let exam = timeOf('examTime');
    let start = ''; let end = '';
    // the label of the exam time was not recognised (OCR): a line with two times joined by to / till / a dash is the exam time
    if (!exam) {
      const rangeLine = lines.find((l) => {
        if (!l.text || findHits(asciiLower(l.text), opts.template ? opts.template.labels : null).some((h) => ['report', 'gate'].includes(h.kind))) return false;
        const t = timesIn(l.text);
        return t.length === 2 && /\d\s*(?:am|pm|noon|hrs?|ist|\))?\s*(?:to|till|until|-|\u2013|\u2014|\u0938\u0947)\s*\(?\d/i.test(l.text);
      });
      if (rangeLine) exam = { result: timesIn(rangeLine.text), label: '', via: 'right', conf: rangeLine.conf, text: rangeLine.text };
    }
    if (exam) {
      const isEnd = exam.label.includes('end time');
      if (isEnd) end = exam.result[0]; else { start = exam.result[0]; end = exam.result[1] || ''; }
    }
    // the exam start/end may be written beside the date: "Date & Time of Exam: 12/03/2026, 09:00 AM - 12:00 PM"
    if (!start) {
      const withDate = dateHits.find((f) => datesIn(f.text).length && timesIn(f.text.slice(Math.max(0, f.text.search(/\d{4}/)) + 4)).length);
      if (withDate) { const t = timesIn(withDate.text.slice(withDate.text.search(/\d{4}/) + 4)); start = t[0]; end = t[1] || ''; }
    }
    const endHit = firstValid(collect(entries, 'examTime').filter((f) => f.label.includes('end time')), (f) => timesIn(f.text)[0]);
    if (endHit && !end) end = endHit.result[0];
    const shiftHit = firstValid(collect(entries, 'shift'), (f) => normaliseShift(f.text));

    const oc = (hit, fallback) => opts.sourceConf ?? (hit ? hit.conf : fallback);
    const days = distinctDates.length ? distinctDates : [''];
    for (const date of days) {
      result.days.push({
        date: date ? makeField(date, { base: dateBase, ocrConf: opts.sourceConf ?? dateConf, source: dateBase === BASE.scan ? 'scan' : 'label' }) : empty('No exam date found'),
        reportTime: rep ? makeField(rep.result[0], { base: BASE[rep.via === 'below' ? 'below' : 'right'], ocrConf: oc(rep), source: 'label' }) : empty(),
        gateTime: gate ? makeField(gate.result[0], { base: BASE[gate.via === 'below' ? 'below' : 'right'], ocrConf: oc(gate), source: 'label' }) : empty(),
        startTime: start ? makeField(start, { base: BASE[exam?.via === 'below' ? 'below' : 'right'], ocrConf: oc(exam), source: 'label' }) : empty(),
        endTime: end ? makeField(end, { base: BASE[exam?.via === 'below' ? 'below' : 'right'] - 0.03, ocrConf: oc(exam), source: 'label' }) : empty(),
        shift: shiftHit ? makeField(shiftHit.result, { base: BASE.right, ocrConf: oc(shiftHit), source: 'label' }) : empty(),
        subject: '',
      });
    }
  }

  // ---- no reporting time on the card: assume one hour before the exam starts (marked as a low-confidence guess)
  for (const day of result.days) {
    if (!day.reportTime.value && !day.gateTime.value && day.startTime.value) {
      const [h, m] = day.startTime.value.split(':').map(Number);
      const t = (((h * 60 + m - 60) % 1440) + 1440) % 1440;
      day.reportTime = makeField(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, { base: BASE.derived, source: 'derived', note: 'Not on the card. Assumed 1 hour before the exam starts.' });
    }
  }
  // Only when asked (the optional Gemini step): the text with the candidate's personal lines removed
  if (opts.keepAiText) result.aiText = redactText(lines);
  return result;
}

export { level as confidenceLevel, findHits };
