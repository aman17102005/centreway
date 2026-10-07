// Turns recognised words (with their positions on the page) into text lines.
// A word is { text, conf (0-100), x0, y0, x1, y1 }. A line is { words, text, x0, x1, y0, y1, conf }.
import { mergeSort } from '../dsa/mergeSort.js';
import { normalizeText } from '../dsa/fieldScanner.js';

/** Put words on the same line when they overlap vertically; lines come out top to bottom, words left to right. */
export function buildLines(words) {
  const usable = words.filter((w) => w.text && w.text.trim() !== '');
  const byHeight = mergeSort(usable, (a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const groups = [];
  for (const word of byHeight) {
    const centre = (word.y0 + word.y1) / 2;
    const height = Math.max(1, word.y1 - word.y0);
    let line = groups.length ? groups[groups.length - 1] : null;
    // same line if the word's centre lies inside the line's vertical band (with a little slack)
    if (line && Math.abs(centre - line.centre) <= 0.55 * Math.max(height, line.height)) {
      line.words.push(word);
      line.centre = (line.centre * (line.words.length - 1) + centre) / line.words.length;
      line.height = Math.max(line.height, height);
    } else groups.push({ words: [word], centre, height });
  }
  return groups.map((g) => makeLine(mergeSort(g.words, (a, b) => a.x0 - b.x0)));
}

/** Build one line object from its words (already left to right). */
export function makeLine(words) {
  // page borders and table lines are often read as "|" or "[": they are not text and they stretch the line's height
  const cleaned = words.map((w) => ({ ...w, text: normalizeText(w.text).replace(/\n/g, ' ').trim() }))
    .filter((w) => w.text !== '' && !/^[|[\]{}_=~`\\]+$/.test(w.text));
  let text = '';
  let offset = 0;
  for (let i = 0; i < cleaned.length; i++) {
    if (i > 0) { text += ' '; offset++; }
    cleaned[i].start = offset; // where the word starts inside line.text
    text += cleaned[i].text;
    offset += cleaned[i].text.length;
  }
  const n = cleaned.length || 1;
  return {
    words: cleaned,
    text,
    x0: cleaned.length ? cleaned[0].x0 : 0,
    x1: cleaned.length ? cleaned[cleaned.length - 1].x1 : 0,
    y0: Math.min(...cleaned.map((w) => w.y0), Infinity),
    y1: Math.max(...cleaned.map((w) => w.y1), -Infinity),
    conf: cleaned.reduce((s, w) => s + (w.conf ?? 100), 0) / n,
  };
}

/** Which word of the line holds character `charIndex` of line.text? */
export function wordIndexAt(line, charIndex) {
  let found = 0;
  for (let i = 0; i < line.words.length; i++) if (line.words[i].start <= charIndex) found = i;
  return found;
}

/** Whole-document text: lines joined with line breaks. */
export function linesToText(lines) {
  return lines.map((l) => l.text).join('\n');
}

/**
 * Lines from plain text (no positions): used for pasted text and tests. Each character is 10 units wide and each line 30 high,
 * so the "below the label" rule still works for text that was laid out in columns with spaces.
 */
export function linesFromText(text, { conf = 100 } = {}) {
  const lines = [];
  String(text || '').split(/\r?\n/).forEach((raw, row) => {
    const words = [];
    const pattern = /\S+/g;
    let m;
    while ((m = pattern.exec(raw))) words.push({ text: m[0], conf, x0: m.index * 10, x1: (m.index + m[0].length) * 10, y0: row * 30, y1: row * 30 + 24 });
    if (words.length) lines.push(makeLine(words));
    else lines.push({ words: [], text: '', x0: 0, x1: 0, y0: row * 30, y1: row * 30 + 24, conf, blank: true });
  });
  return lines;
}

/** Words from pdf.js text items. y grows downward in our lines, so flip it using the page height. */
export function wordsFromPdfItems(items, pageHeight) {
  const words = [];
  for (const item of items) {
    if (!item.str || item.str.trim() === '') continue;
    const [, , , , x, yBase] = item.transform;
    const height = item.height || Math.abs(item.transform[3]) || 10;
    const parts = item.str.split(/(\s+)/);
    const totalChars = item.str.length || 1;
    let cursor = 0;
    for (const part of parts) {
      if (part !== '' && part.trim() !== '') {
        const x0 = x + (item.width * cursor) / totalChars;
        const x1 = x + (item.width * (cursor + part.length)) / totalChars;
        words.push({ text: part, conf: 100, x0, x1, y0: pageHeight - yBase - height, y1: pageHeight - yBase });
      }
      cursor += part.length;
    }
  }
  return words;
}

/**
 * Lines from OCR: each entry of `wordLines` is one line found by Tesseract (it follows tilted text well).
 * Cells of a table can come out as separate lines at the same height; those are joined into one line.
 */
export function linesFromWordLines(wordLines) {
  const lines = wordLines.filter((ws) => ws.length).map((ws) => makeLine(mergeSort(ws, (a, b) => a.x0 - b.x0))).filter((l) => l.words.length > 0);
  const sorted = mergeSort(lines, (a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const merged = [];
  for (const line of sorted) {
    const centre = (line.y0 + line.y1) / 2;
    const height = line.y1 - line.y0;
    let target = null;
    for (let k = merged.length - 1; k >= 0 && k >= merged.length - 4; k--) {
      const m = merged[k];
      const mCentre = (m.y0 + m.y1) / 2;
      const limit = 0.4 * Math.min(height, m.y1 - m.y0);
      const overlapsInX = line.x0 < m.x1 && m.x0 < line.x1;
      if (Math.abs(centre - mCentre) <= limit && !overlapsInX) { target = k; break; }
    }
    if (target === null) merged.push(line);
    else merged[target] = makeLine(mergeSort(merged[target].words.concat(line.words), (a, b) => a.x0 - b.x0));
  }
  return merged;
}
