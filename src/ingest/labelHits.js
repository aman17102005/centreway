// Finding labels in a piece of text (a line or a table cell). Shared by the line reader and the table reader.
import { mergeSort } from '../dsa/mergeSort.js';
import { kmpSearchAll } from '../dsa/kmp.js';
import { editDistance } from '../dsa/editDistance.js';
import { LABELS, KINDS } from './labels.js';

// --------------------------------------------------------------------------- label hits

export const isAlnumAscii = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
const isAsciiLabel = (label) => label.charCodeAt(0) < 128;

/** All labels found in one lower-cased line, left to right, without overlaps (the longer label wins). */
export function findHits(lower, extra = null) {
  const raw = [];
  for (const kind of KINDS) {
    const labels = extra && extra[kind] ? extra[kind].concat(LABELS[kind]) : LABELS[kind];
    for (const label of labels) {
      for (const index of kmpSearchAll(lower, label)) {
        const end = index + label.length;
        // labels of fields we do not use (post, subject ...) are common words: count them only when a colon follows
        if (kind === 'other' || kind === 'city') {
          let k = end;
          while (k < lower.length && lower[k] === ' ') k++;
          if (lower[k] !== ':' && lower[k] !== '：') continue;
        }
        // a bare "Date" is the exam date only when it starts the line or cell, and is not "Date of ..." / "Date and ..." (those have longer labels)
        if (label === 'date' && (index > 2 || /^\s*(of|and|&|\/)\b/.test(lower.slice(end, end + 6)) || /^\s*[-:]?\s*$/.test(lower.slice(end)) === false && /^\s*(of|and)\b/.test(lower.slice(end)))) continue;
        if (isAsciiLabel(label)) {
          if (index > 0 && isAlnumAscii(lower[index - 1])) continue;       // "shipping" must not match "pin"
          if (end < lower.length && isAlnumAscii(lower[end]) && label.length < 9) continue;
        }
        raw.push({ kind, label, index, end });
      }
    }
  }
  for (const hit of fuzzyHits(lower, raw, extra)) raw.push(hit);
  const sorted = mergeSort(raw, (a, b) => a.index - b.index || b.label.length - a.label.length || (a.fuzzy ? 1 : 0) - (b.fuzzy ? 1 : 0));
  const hits = [];
  let lastEnd = -1;
  const colonAfter = (end) => { let k = end; while (k < lower.length && lower[k] === ' ') k++; return lower[k] === ':' || lower[k] === '\uff1a'; };
  for (const hit of sorted) {
    if (hit.index < lastEnd) continue;
    // after the label of a centre / address ("Test Centre Address: ABC School, Exam Centre 4, ...") the rest of the line is the value:
    // label words inside it ("Examination Centre") only count as labels when a colon follows them
    const before = hits[hits.length - 1];
    if (before && ['centreName', 'address'].includes(before.kind) && ['centreName', 'address', 'examName'].includes(hit.kind) && trimValue(lower.slice(before.end, hit.index)) !== '' && !colonAfter(hit.end)) continue;
    hits.push(hit); lastEnd = hit.end;
  }
  // two labels of the same kind side by side ("Reporting Time / रिपोर्टिंग समय") are one label: the value comes after both
  const merged = [];
  for (const hit of hits) {
    const last = merged[merged.length - 1];
    const between = last ? trimValue(lower.slice(last.end, hit.index).split('/').join(' ').split('|').join(' ')) : null;
    if (last && last.kind === hit.kind && between === '') {
      last.end = hit.end;
      last.label = last.label.length >= hit.label.length ? last.label : hit.label;
    } else if (last && last.kind === 'centreName' && hit.kind === 'address' && ['', 'and', '&', ',', 'with', '/'].includes(between)) {
      // "Centre Name and Address", "Venue & Address": one label that asks for name and address together
      last.end = hit.end; last.label = `${last.label} and address`;
    } else if (last && last.kind === 'address' && hit.kind === 'pin' && ['', 'and', '&', ',', 'with'].includes(between)) {
      last.end = hit.end;
    } else merged.push({ ...hit });
  }
  return merged;
}

export function trimValue(text) {
  let start = 0;
  let end = text.length;
  while (start < end && ' :：-–—.|_=•\t'.includes(text[start])) start++;
  while (end > start && ' :：-–—|_,;\t'.includes(text[end - 1])) end--;
  return text.slice(start, end);
}

// ------------------------------------------------------------------ approximate label matching (OCR mistakes in the label itself)
const FUZZY_KINDS = ['examDate', 'report', 'gate', 'examTime', 'centreName', 'address', 'examName'];
const wordsOf = (lower) => { const out = []; const re = /[a-z0-9&()]+/g; let m; while ((m = re.exec(lower))) out.push({ text: m[0], index: m.index, end: m.index + m[0].length }); return out; };
const allowedMistakes = (length) => (length >= 20 ? 3 : length >= 14 ? 2 : length >= 9 ? 1 : 0);
// the word lists per kind that are long enough, with their number of words (computed once)
let fuzzyLabels = null;
function labelsForFuzzy() {
  if (!fuzzyLabels) {
    fuzzyLabels = [];
    for (const kind of FUZZY_KINDS) for (const label of LABELS[kind]) if (isAsciiLabel(label) && label.length >= 9) fuzzyLabels.push({ kind, label, n: label.split(' ').length, first: label.slice(0, 2) });
  }
  return fuzzyLabels;
}

/** Labels that are almost right ("Reportlng Time", "Gate Closing Tlme"): found with my edit distance. Exact hits win over these. */
function fuzzyHits(lower, exact) {
  const words = wordsOf(lower);
  if (words.length < 2) return [];
  const out = [];
  for (const L of labelsForFuzzy()) {
    const limit = allowedMistakes(L.label.length);
    for (let i = 0; i + L.n <= words.length; i++) {
      const first = words[i].text;
      if (first.length < 2 || first[0] !== L.label[0]) continue;                    // a label starts with its first letter (cheap filter)
      const index = words[i].index; const end = words[i + L.n - 1].end;
      if (Math.abs((end - index) - L.label.length) > limit) continue;
      if (exact.some((h) => index < h.end && end > h.index)) continue;             // already found exactly
      const piece = lower.slice(index, end).replace(/\s+/g, ' ');
      if (piece !== L.label && editDistance(piece, L.label, limit) <= limit) out.push({ kind: L.kind, label: L.label, index, end, fuzzy: true });
    }
  }
  return out;
}
