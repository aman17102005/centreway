// Understands the "centre cell" of an admit card:  "AB1234 - Some Institution Name, Locality, Road, Landmark, City, State, India, 123456"
//   code    = AB1234                          (saved separately, removed from the name)
//   name    = the leading parts that name the institution
//   address = the cell text (without the code), ending at the pincode
//   pincode = the first valid pincode in the cell
//   city    = the place just before the state (or before "India" and the pincode); never a date, a label or text with digits
import { asciiLower, kmpFirst } from '../dsa/kmp.js';
import { editDistance } from '../dsa/editDistance.js';
import { tokenize, normalizeText } from '../dsa/fieldScanner.js';

import { STATES } from './geoLists.js';
export { STATES };

const INSTITUTION_WORDS = ['college', 'school', 'center', 'centre', 'institute', 'university', 'vidyalaya', 'ion ', 'digital zone', 'online examination', 'academy', 'polytechnic',
  'campus', 'mahavidyalaya', 'vidyapeeth', 'sansthan', 'kendra', 'engineering', 'technology', 'madhyamik', 'inter college', 'degree college', 'public school', 'महाविद्यालय', 'विद्यालय', 'विश्वविद्यालय', 'केंद्र', 'कॉलेज', 'स्कूल', 'संस्थान'];
const PLACE_WORDS = ['road', 'marg', 'bazar', 'bazaar', 'sector', 'nagar', 'street', 'colony', 'chowk', 'near', 'opposite', 'behind', 'village', 'post', 'tehsil', 'district', 'phase', 'block', 'highway', 'lane', 'plot'];

const hasAny = (lower, words) => words.some((w) => kmpFirst(lower, w) >= 0);

/**
 * A centre code at the start of a centre value: 1-4 letters then 2-6 digits (AB1234, XY123), followed by - : or a comma.
 * OCR often reads the letters as digits ("XY1234" -> "8Y1234" or "XY1234" -> "0Y1234"): a token of 4-8 letters/digits with at least 3 digits,
 * followed by a dash, is also a code; if `stateCode` ("XY") is known and the token ends in 4 digits with a noisy start, the start is repaired.
 * Returns { code, rest } or null.
 */
export function splitCentreCode(text, stateCode = '') {
  let i = 0;
  while (i < text.length && ' \t'.includes(text[i])) i++;
  const start = i;
  let letters = 0;
  while (i < text.length && /[A-Za-z]/.test(text[i]) && letters < 5) { i++; letters++; }
  let digits = 0;
  const digitsStart = i;
  while (i < text.length && text[i] >= '0' && text[i] <= '9') { i++; digits++; }
  let code = null; let end = i;
  if (letters >= 1 && letters <= 4 && digits >= 2 && digits <= 6) {
    code = text.slice(start, digitsStart + digits);
    // OCR often reads the 0 of "AB0802" as "O0": a state code has two letters, so a third letter O is noise
    if (letters === 3 && (code[2] === 'O' || code[2] === 'o')) code = code.slice(0, 2) + code.slice(3);
  } else {
    // a noisy code: 4-8 letters / digits (3 or more digits) and then a dash (not a colon: "Centre: 123456 ..." is something else)
    const m = /^\s*([A-Za-z0-9]{4,8})\s*[-\u2013\u2014]\s+(?=\S)/.exec(text);
    if (!m || (m[1].match(/\d/g) || []).length < 3 || /^\d{6}$/.test(m[1])) return null;
    code = m[1]; end = text.indexOf(m[1]) + m[1].length;
    const tail = /^(.*?)(\d{4})$/.exec(code);
    if (stateCode && tail && tail[1].length >= 1 && tail[1].length <= 3 && /[^A-Za-z]|[Oo]/.test(tail[1]) && editDistance(tail[1].toUpperCase(), stateCode, 2) <= 2) code = `${stateCode}${tail[2]}`;
  }
  let j = end;
  while (j < text.length && ' \t'.includes(text[j])) j++;
  if (!'-\u2013\u2014:,'.includes(text[j] || '')) return null;
  j++;
  return { code, rest: text.slice(j).trim() };
}

/** Where the first pincode in the text is: { value, start, end } or null. */
export function findPincode(text) {
  const tokens = tokenize(text);
  for (const t of tokens) {
    if (t.kind !== 'num' || t.text.length !== 6 || t.text[0] < '1' || t.text[0] > '8') continue;
    const before = t.start > 0 ? text[t.start - 1] : '';
    const after = t.end < text.length ? text[t.end] : '';
    if (before === '/' || before === '.' || after === '/' || after === '.' || after === ':') continue;
    return { value: t.text, start: t.start, end: t.end };
  }
  return null;
}

/** The address must END at the pincode (so "Date of Issue ..." or the next cell never comes along). */
export function cutAtPincode(text) {
  const pin = findPincode(text);
  return pin ? text.slice(0, pin.end).replace(/[\s,;:-]+$/, '') : text;
}

/** The leading parts that name the institution: up to the first comma that starts a place part, at most two parts. */
export function splitName(parts) {
  if (!parts.length) return '';
  const lower = parts.map((p) => asciiLower(p));
  let take = 1;
  const inst = (k) => hasAny(`${lower[k]} `, INSTITUTION_WORDS);
  const place = (k) => hasAny(lower[k], PLACE_WORDS);
  if (parts.length > 1 && inst(1) && !place(1) && (inst(0) || !place(0))) take = 2;
  if (!inst(0) && parts.length > 1 && !inst(1)) take = 1;
  if (!inst(0) && !inst(1) && place(0)) return '';   // "Sector 9, Some City": no institution name on the card
  return parts.slice(0, take).join(', ');
}

/** City: the part just before the state ("..., Townname, Some State, India, 123456" -> Townname). */
export function cityFromParts(parts) {
  const clean = parts.map((p) => p.trim()).filter(Boolean).filter((p) => !(findPincode(p) && p.replace(/\D/g, '').length === 6 && p.replace(/[\d\s-]/g, '') === ''));
  for (let i = clean.length - 1; i >= 0; i--) {
    let part = clean[i];
    const pin = findPincode(part);
    if (pin) part = `${part.slice(0, pin.start)}${part.slice(pin.end)}`;
    part = part.replace(/^(pin\s*code|pincode|pin|पिन)\s*[:-]?/i, '').replace(/^[-–:.\s]+|[-–:.\s]+$/g, '').trim();
    if (!part || STATES.includes(asciiLower(part))) continue;
    if (/\d/.test(part) || part.length < 3 || part.length > 40) return '';   // a date, a code or a label: not a city
    if (hasAny(`${asciiLower(part)} `, INSTITUTION_WORDS)) return '';        // an institution name is never the city
    if (kmpFirst(asciiLower(part), 'date') >= 0 || part.includes(':')) return '';
    return part;
  }
  return '';
}

/** Read a centre cell. text may be the whole cell or the joined lines of a block. */
export function parseCentre(rawText, { stateCode = '' } = {}) {
  const text = normalizeText(String(rawText || '')).replace(/\s*\n\s*/g, ' ').replace(/\b(Cent(?:er|re)|College|School|Institute|University|Campus)\.\s+(?=[A-Z])/g, '$1, ').trim();   // OCR often reads a comma as a full stop
  const codeSplit = splitCentreCode(text, stateCode);
  const body = codeSplit ? codeSplit.rest : text;
  const address = cutAtPincode(body);
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const pin = findPincode(address);
  return {
    code: codeSplit ? codeSplit.code : '',
    name: splitName(parts),
    address,
    pincode: pin ? pin.value : '',
    city: cityFromParts(parts),
  };
}
