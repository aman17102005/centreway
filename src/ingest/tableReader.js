// Reads a table as a table: every cell is read on its own, and a label cell is paired with the value cell to its right,
// or (in a header row) with the cell directly below it. Text of two different cells is never joined into one value.
import { asciiLower } from '../dsa/kmp.js';
import { findHits, trimValue } from './labelHits.js';

const hasDigit = (text) => /\d/.test(text);
/** A cell with fewer than 3 letters or digits is OCR noise (a stray bracket or a border piece), not a value. */
const isJunk = (text) => (text.match(/[\p{L}\p{N}]/gu) || []).length < 3;
const wordCount = (text) => text.split(' ').filter((w) => w).length;

/**
 * What kind of cell is this? Returns { kind, label, isLabel, inline } or null.
 *   label cell : mostly a label, e.g. "Reporting Time at Centre", "Timing of Test (Indian Standard Time)", "Test Centre Code, Name and Address"
 *   inline     : label and value in the same cell, e.g. "Exam Date: 12.03.2026"
 */
export function analyseCell(cell, extra = null) {
  const text = cell.text || '';
  if (!text) return null;
  const lower = asciiLower(text);
  const hits = findHits(lower, extra);
  if (!hits.length || hits[0].index > 3) return null;
  const h = hits[0];
  const rest = text.slice(h.end);
  const restTrim = trimValue(rest);
  if (h.kind === 'shift' && /^[\s\-–:]*(?:[ivxl|]{1,3}|\d)\s*$/i.test(rest)) return null;   // "Shift-I" is a value, not a label
  const colonAfter = /^\s*[:：]/.test(rest);
  if (colonAfter && restTrim) return { kind: h.kind, label: h.label, isLabel: false, inline: restTrim };
  // a label cell: nothing but a few words after the label (no digits), like "at Centre" or "(Indian Standard Time)"
  if (!restTrim || (!hasDigit(restTrim) && wordCount(restTrim) <= 6 && !restTrim.includes(','))) return { kind: h.kind, label: h.label, isLabel: true, inline: '' };
  if (hits.length === 1 && h.kind !== 'other' && restTrim.length > 0) return { kind: h.kind, label: h.label, isLabel: false, inline: restTrim };
  return null;
}

const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

/** The cell to the right on the same row (nearest first). */
function rightOf(cell, cells, minShare = 0.5) {
  let best = null;
  for (const c of cells) {
    if (c === cell || c.x0 < cell.x1 - 8) continue;
    if (overlap(cell.y0, cell.y1, c.y0, c.y1) < minShare * Math.min(cell.y1 - cell.y0, c.y1 - c.y0)) continue;
    // nearest to the right first; at the same distance the higher one (a label centred between two value lines has the first line above it)
    if (!best || c.x0 < best.x0 - 6 || (Math.abs(c.x0 - best.x0) <= 6 && c.y0 < best.y0)) best = c;
  }
  return best;
}

/** The cell directly below (nearest first). */
function belowOf(cell, cells) {
  let best = null;
  for (const c of cells) {
    if (c === cell || c.y0 < cell.y1 - 8) continue;
    if (overlap(cell.x0, cell.x1, c.x0, c.x1) < 0.5 * Math.min(cell.x1 - cell.x0, c.x1 - c.x0)) continue;
    if (!best || c.y0 < best.y0) best = c;
  }
  return best;
}

/**
 * Cells made from word gaps have no lines around them, so a value that goes on in the next line (the address under the centre name)
 * is a separate cell right below, starting at the same place. Join those lines to the value (only for the centre block).
 */
function withLinesBelow(cell, cells, info) {
  let text = cell.valueText || cell.text; let last = cell; let conf = cell.conf;
  for (let n = 0; n < 4; n++) {
    const next = cells.find((c) => c !== last && Math.abs(c.x0 - cell.x0) <= 12 && c.y0 >= last.y1 - 2 && c.y0 - last.y1 <= 0.9 * Math.max(10, last.y1 - last.y0) + 6
      && c.text && !isJunk(c.text) && !(info.get(c) && (info.get(c).isLabel || info.get(c).inline)));
    if (!next) break;
    text = `${text}${text.endsWith(',') ? ' ' : ', '}${next.valueText || next.text}`; last = next; conf = Math.min(conf, next.conf);
  }
  return last === cell ? cell : { ...cell, text, valueText: text, conf };
}

/**
 * Values for one kind of label (examDate, report, centreName ...) from the cells.
 * options: { extra (template labels), where: 'right' | 'below' (the template's preference), ignoreBelow (y: ignore cells at or under this line) }.
 * Returns [{ text, via: 'right' | 'below' | 'inline', conf, label, complete: true }] from the top of the page down.
 */
export function tableValues(cells, kind, { extra = null, where = null, ignoreBelow = Infinity, stack = false } = {}) {
  const usable = cells.filter((c) => c.y0 < ignoreBelow);
  const info = new Map();
  for (const c of usable) info.set(c, analyseCell(c, extra));
  const values = [];
  for (const cell of usable) {
    const a = info.get(cell);
    if (!a || a.kind !== kind) continue;
    if (a.inline) { values.push({ text: a.inline, via: 'inline', conf: cell.conf, label: a.label, complete: true, y: cell.y0, x: cell.x0 }); continue; }
    const right = rightOf(cell, usable, stack ? 0.25 : 0.5);     // cells made from word gaps: a label centred in a tall cell touches its value lines only a little
    const below = belowOf(cell, usable);
    const centreKind = kind === 'centreName' || kind === 'address';
    const dateLine = (t) => /\b(issued|generated|downloaded|printed|date)\b/i.test(t) && /\d{4}/.test(t);
    const need = kind === 'report' || kind === 'gate' || kind === 'examTime' || kind === 'examDate' ? /\d/ : null;   // a time or date value has digits
    const okRight = right && right.text && !isJunk(right.text) && (!need || need.test(right.text)) && !(centreKind && dateLine(right.text)) && !(info.get(right) && (info.get(right).isLabel || info.get(right).inline));
    const okBelow = below && below.text && !isJunk(below.text) && (!need || need.test(below.text)) && !(centreKind && dateLine(below.text)) && !(info.get(below) && (info.get(below).isLabel || info.get(below).inline));
    let pick = null;
    if (where === 'below' && okBelow) pick = { cell: below, via: 'below' };
    else if (okRight) pick = { cell: right, via: 'right' };
    else if (okBelow) pick = { cell: below, via: 'below' };
    if (pick && stack && pick.via === 'right' && (kind === 'centreName' || kind === 'address')) pick = { ...pick, cell: withLinesBelow(pick.cell, usable, info) };
    if (pick) values.push({ text: pick.cell.valueText || pick.cell.text, via: pick.via, conf: pick.cell.conf, label: a.label, complete: true, y: cell.y0, x: cell.x0 });
  }
  return values.sort((p, q) => p.y - q.y || p.x - q.x);
}
