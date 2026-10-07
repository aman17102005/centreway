// Finds the things the card says you must NOT bring (phones, calculators, watches ...).
// Works line by line with KMP phrase search. Output: a short list of items, at most 8.
import { HashMap } from '../dsa/hashMap.js';
import { asciiLower, kmpFirst } from '../dsa/kmp.js';
import { NOT_ALLOWED_PHRASES } from './labels.js';

const AFTER_PHRASES = ['do not bring', 'should not bring', 'must not bring', 'not to bring', 'not carry']; // items come AFTER these phrases
const LEADING_NOISE = ['candidates', 'candidate', 'the following', 'following items', 'following', 'items such as', 'items like', 'items', 'articles',
  'electronic devices such as', 'electronic gadgets such as', 'any of', 'any', 'all', 'strictly', 'is', 'are', 'will', 'shall', 'must', 'should', 'may', 'the', 'a', 'an', 'no'];

const TRAILING_CUTS = [' into the', ' into ', ' inside the', ' inside ', ' in the', ' to the', ' at the', ' during', ' within', ' in examination', ' in exam'];
const NOT_ITEMS = ['entry', 'candidates', 'candidate', 'use', 'usage', 'carrying', 'possession', 'report', 'this', 'it', 'they', 'items'];

function cleanItem(text) {
  let t = text.replace(/\s+/g, ' ').trim();
  // numbering like "2." or "3)"
  let n = 0;
  while (n < t.length && t[n] >= '0' && t[n] <= '9') n++;
  if (n > 0 && n < 3 && (t[n] === '.' || t[n] === ')')) t = t.slice(n + 1).trim();
  const lowerAll = asciiLower(t);
  for (const cut of TRAILING_CUTS) { const at = lowerAll.indexOf(cut); if (at > 0) { t = t.slice(0, at).trim(); break; } }
  let changed = true;
  while (changed) {
    changed = false;
    const lower = asciiLower(t);
    for (const noise of LEADING_NOISE) {
      if (lower.startsWith(`${noise} `) || lower === noise) { t = t.slice(noise.length).trim(); changed = true; break; }
    }
    const first = t[0];
    if (first && ':;-–.,)('.includes(first)) { t = t.slice(1).trim(); changed = true; }
  }
  while (t.length && '.:;,-–'.includes(t[t.length - 1])) t = t.slice(0, -1).trim();
  // "calculators are" (before "strictly prohibited"): drop the trailing helper words
  for (let again = true; again;) {
    again = false;
    const lower = asciiLower(t);
    for (const tail of [' will be', ' shall be', ' must be', ' should be', ' are', ' is', ' be']) {
      if (lower.endsWith(tail)) { t = t.slice(0, t.length - tail.length).trim(); again = true; break; }
    }
  }
  return t;
}

/** Split "mobile phones, calculators and smart watches" into items. */
function splitItems(text) {
  const pieces = [];
  let current = '';
  const lower = asciiLower(text);
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ',' || text[i] === ';' || text[i] === '/') { pieces.push(current); current = ''; continue; }
    if (lower.startsWith(' and ', i) || lower.startsWith(' or ', i)) { pieces.push(current); current = ''; i += lower.startsWith(' and ', i) ? 4 : 3; continue; }
    current += text[i];
  }
  pieces.push(current);
  return pieces.map(cleanItem).filter((p) => {
    const lower = asciiLower(p);
    if (p.length < 3 || p.length > 50 || p.split(' ').length > 6) return false;
    if (NOT_ITEMS.includes(lower)) return false;
    // "Entry is", "Photo copies are": a sentence stub, not an item
    const words = lower.split(' ');
    return !['is', 'are', 'be', 'was', 'will'].includes(words[words.length - 1]);
  });
}

/** lines: [{text}]. Returns up to 8 short item names. */
export function findNotAllowed(lines) {
  const found = new HashMap();
  const items = [];
  const add = (item) => {
    const key = asciiLower(item);
    if (found.has(key)) return;
    found.set(key, true);
    items.push(item.charAt(0).toUpperCase() + item.slice(1));
  };
  for (let i = 0; i < lines.length && items.length < 8; i++) {
    const text = lines[i].text;
    if (!text) continue;
    const lower = asciiLower(text);
    let hitPhrase = null; let hitAt = -1;
    for (const phrase of NOT_ALLOWED_PHRASES) {
      const at = kmpFirst(lower, phrase);
      if (at >= 0 && (hitAt < 0 || at < hitAt)) { hitPhrase = phrase; hitAt = at; }
    }
    if (hitPhrase === null) continue;
    const isHindi = hitPhrase.charCodeAt(0) > 0x900;
    if (isHindi) { const t = cleanItem(text); add(t.length > 90 ? `${t.slice(0, 87)}...` : t); continue; }
    // "not allowed to carry X, Y": the items come after the verb
    const tail = lower.slice(hitAt + hitPhrase.length);
    const verb = [' to carry', ' to bring', ' to use', ' to wear', ' to take', ' to keep'].find((v) => tail.startsWith(v));
    if (verb) {
      for (const item of splitItems(text.slice(hitAt + hitPhrase.length + verb.length))) add(item);
      continue;
    }
    if (AFTER_PHRASES.includes(hitPhrase)) {
      for (const item of splitItems(text.slice(hitAt + hitPhrase.length))) add(item);
      continue;
    }
    // a header like "Prohibited items: a, b, c": the items are AFTER the colon
    let before = text.slice(0, hitAt);
    const colon = text.indexOf(':', hitAt);
    if (colon >= 0 && cleanItem(before).split(' ').filter((w) => w).length <= 2) before = text.slice(colon + 1);
    // "X, Y and Z are not allowed": the items are BEFORE the phrase (maybe on the previous line, if this line is short)
    else if (cleanItem(before).length < 3 && i > 0) before = lines[i - 1].text;
    // keep only the last sentence before the phrase
    const dot = before.lastIndexOf('. ');
    if (dot >= 0) before = before.slice(dot + 2);
    for (const item of splitItems(before)) add(item);
  }
  return items.slice(0, 8);
}
