// Pick details out of admit card text with simple pattern matching (no AI).
// OCR text is messy, so every field is a best guess that the user can edit.

import { extractFieldsScanner } from '../dsa/fieldScanner.js';

const DEVANAGARI_ZERO = 0x0966;

/** Turn Hindi digits (०-९) into 0-9 so the patterns work. */
export function normaliseDigits(text) {
  return String(text || '').replace(/[\u0966-\u096F]/g, (c) => String(c.charCodeAt(0) - DEVANAGARI_ZERO));
}

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

// Words that start a different field (used to know where an address block ends).
const NAME_LABEL = /(exam(ination)?\s*(centre|center)|test\s*(centre|center)|(centre|center)\s*name|name\s*of\s*(the\s*)?(exam(ination)?\s*)?(centre|center)|venue|परीक्षा\s*केन्द्र|परीक्षा\s*केंद्र|केन्द्र\s*का\s*नाम|केंद्र\s*का\s*नाम|परीक्षा\s*स्थल)/i;
const ADDR_LABEL = /(centre\s*address|center\s*address|address\s*of\s*(the\s*)?(exam\s*)?(centre|center)|venue\s*address|address|केन्द्र\s*का\s*पता|केंद्र\s*का\s*पता|पता)/i;
const SAFE_COLON_PREFIX = /^(pin|pincode|pin\s*code|dist|district|state|city|landmark|near|जिला|राज्य|पिन)/i;

function pad(n) { return String(n).padStart(2, '0'); }

/** Find dates in text. Returns [{iso, index, line}] */
export function findDates(text) {
  const t = normaliseDigits(text);
  const found = [];
  const numeric = /\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})\b/g;
  const named = /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-,.]*([A-Za-z]{3,9})[\s\-,.]*(\d{4})\b/g;
  let m;
  while ((m = numeric.exec(t))) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) found.push({ iso: `${y}-${pad(mo)}-${pad(d)}`, index: m.index });
  }
  while ((m = named.exec(t))) {
    const mo = MONTHS[m[2].toLowerCase()];
    const d = Number(m[1]);
    if (mo && d >= 1 && d <= 31) found.push({ iso: `${m[3]}-${pad(mo)}-${pad(d)}`, index: m.index });
  }
  return found.sort((a, b) => a.index - b.index).map((f) => ({ ...f, before: t.slice(Math.max(0, f.index - 45), f.index) }));
}

/** Exam date: prefer a date next to an "exam date" label, skip birth dates. */
export function extractExamDate(text) {
  const dates = findDates(text);
  const label = /(exam(ination)?\s*date|date\s*of\s*(the\s*)?exam(ination)?|test\s*date|परीक्षा\s*(की\s*)?(तिथि|तारीख)|दिनांक)/i;
  const birth = /(birth|dob|d\.o\.b|जन्म)/i;
  const labelled = dates.find((d) => label.test(d.before) && !birth.test(d.before.slice(-20)));
  if (labelled) return labelled.iso;
  const other = dates.find((d) => !birth.test(d.before));
  return other ? other.iso : '';
}

/** Read a time like "8:30 AM", "08.30 pm", "14:00", "9 बजे". Returns "HH:MM" or "". */
export function parseTimeText(s) {
  const t = normaliseDigits(s);
  const m = /(\d{1,2})\s*[:.]\s*(\d{2})\s*(a\.?m\.?|p\.?m\.?|am|pm)?|(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(t);
  if (!m) return '';
  let h = Number(m[1] ?? m[4]);
  const min = Number(m[2] ?? 0);
  const ap = (m[3] || m[5] || '').toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return '';
  return `${pad(h)}:${pad(min)}`;
}

function timeAfterLabel(text, labelRe) {
  for (const line of normaliseDigits(text).split(/\r?\n/)) {
    const m = labelRe.exec(line);
    if (!m) continue;
    const t = parseTimeText(line.slice(m.index + m[0].length, m.index + m[0].length + 45));
    if (t) return t;
  }
  return '';
}

export function extractReportingTime(text) {
  return timeAfterLabel(text, /(reporting|report(?:ing)?\s*time|time\s*of\s*reporting|entry\s*time|रिपोर्टिंग|रिपोर्ट\s*करने|प्रवेश\s*का\s*समय|centre\s*entry)[^\d\n]{0,25}/i);
}

export function extractGateClosingTime(text) {
  return timeAfterLabel(text, /(gate\s*(closing|closes|close)|closing\s*(time|of\s*gate)|last\s*entry|no\s*entry\s*after|गेट\s*(बंद|बन्द)|प्रवेश\s*बंद)[^\d\n]{0,25}/i);
}

/** Indian pincode: 6 digits, first digit 1-8. Prefer one next to the word "pin". */
export function extractPincode(text) {
  const t = normaliseDigits(text);
  const labelled = /(?:pin\s*code|pincode|pin|पिन\s*कोड|पिन)\s*[:\-–.]?\s*([1-8]\d{2}\s?\d{3})\b/i.exec(t);
  if (labelled) return labelled[1].replace(/\s/g, '');
  const addressWord = /(road|rd\b|nagar|near|dist|district|school|college|vidyalaya|university|marg|colony|sector|plot|village|post|ward|street|chowk|मार्ग|नगर|विद्यालय|जिला|कॉलेज|स्कूल)/i;
  const all = [...t.matchAll(/(?<![\d/\-.])([1-8]\d{2}\s?\d{3})(?![\d/\-:.])/g)];
  const lines = t.split(/\r?\n/);
  for (const m of all.reverse()) {
    const line = lines.find((l) => l.includes(m[0])) || '';
    if (addressWord.test(line)) return m[1].replace(/\s/g, '');
  }
  return '';
}

/** Read a labelled block: the text after the label, plus following lines until another label. */
function readBlock(lines, startIdx, labelRe) {
  const first = lines[startIdx];
  const m = labelRe.exec(first);
  let rest = first.slice(m.index + m[0].length).replace(/^[\s:：\-–.]+/, '').trim();
  const parts = rest ? [rest] : [];
  for (let i = startIdx + 1; i < lines.length && parts.length < 5; i++) {
    const line = lines[i].trim();
    if (!line) { if (parts.length) break; else continue; }
    if (looksLikeNewLabel(line)) break;
    parts.push(line);
  }
  return parts.join(', ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',');
}

function looksLikeNewLabel(line) {
  const m = /^([^:：]{2,40})[:：]/.exec(line);
  if (!m) return false;
  return !SAFE_COLON_PREFIX.test(m[1].trim());
}

/** Best guess of the city: the comma part just before the pincode. */
export function guessCity(address, pincode) {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const idx = pincode ? parts.findIndex((p) => p.replace(/\s/g, '').includes(pincode)) : -1;
  const cleanPart = (p) => p.replace(/(pin\s*code|pincode|pin|पिन\s*कोड|पिन)\s*[:\-–.]?\s*\d{3}\s?\d{3}/i, '').replace(/\d{6}/, '').replace(/^(dist(rict)?|जिला)\s*[:\-.]?\s*/i, '').replace(/[-–:]+\s*$/, '').trim();
  const pick = idx > 0 ? [parts[idx], parts[idx - 1]] : [parts[parts.length - 1]];
  for (const p of pick) {
    const c = cleanPart(p || '');
    if (c && c.length >= 3) return c;
  }
  return '';
}

/** Main function: text in, fields out. Empty string means "not found". */
export function extractFields(rawText) {
  const text = String(rawText || '');
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let centreName = '';
  let address = '';

  const nameIdx = lines.findIndex((l) => NAME_LABEL.test(l) && !/^\W*address/i.test(l));
  if (nameIdx >= 0) centreName = readBlock(lines, nameIdx, NAME_LABEL);

  const addrIdx = lines.findIndex((l) => ADDR_LABEL.test(l));
  if (addrIdx >= 0) address = readBlock(lines, addrIdx, ADDR_LABEL);

  // If the name block already contains the whole address, split off the first part as the name.
  if (centreName && !address && centreName.includes(',')) {
    address = centreName;
    centreName = centreName.split(',')[0].trim();
  }

  const pincode = extractPincode(address || centreName ? `${address}\n${centreName}\n${text}` : text);
  return {
    centreName,
    address,
    pincode,
    city: guessCity(address || centreName, pincode),
    examDate: extractExamDate(text),
    reportTime: extractReportingTime(text),
    gateTime: extractGateClosingTime(text),
  };
}

/**
 * Main extraction path used by the app: my hand-written scanner (src/dsa/fieldScanner.js).
 * If the scanner fails, or leaves a field empty that the older regex extractor can fill,
 * the older result is used for that field. So this is never worse than extractFields().
 */
export function extractFieldsBest(rawText) {
  const older = extractFields(rawText);
  try {
    const fresh = extractFieldsScanner(rawText);
    const merged = {};
    for (const key of Object.keys(older)) merged[key] = fresh[key] || older[key];
    return merged;
  } catch {
    return older;
  }
}
