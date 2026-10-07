// Reads every table cell on its own. A whole-page read struggles with faint lines, shaded header cells and bold text;
// a small picture of one cell (with a white margin, away from the ruling lines) is read almost perfectly.
// Each cell with digits is read at three sizes and the answer most readings agree on is used (a single read sometimes turns a 9 into a 5).
// Everything stays on the phone.
import { resizeGrey } from './pixels.js';

const INSET = 5;       // pixels cut off every cell edge, so the ruling lines are not in the picture
const MARGIN = 12;     // white margin put around the cell, which the OCR engine needs
const MIN_W = 50;
const MIN_H = 20;
const MAX_CELLS = 48;
const SCALES = [1, 1.5, 2];

/** A white-framed copy of one cell of the grey picture (the lines are NOT erased in it, only cut away by the inset). */
function cropCell(grey, cell) {
  const x0 = Math.max(0, Math.round(cell.x0) + INSET); const x1 = Math.min(grey.width, Math.round(cell.x1) - INSET);
  const y0 = Math.max(0, Math.round(cell.y0) + INSET); const y1 = Math.min(grey.height, Math.round(cell.y1) - INSET);
  const w = x1 - x0; const h = y1 - y0;
  if (w < MIN_W - 2 * INSET || h < MIN_H - 2 * INSET) return null;
  const width = w + 2 * MARGIN; const height = h + 2 * MARGIN;
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(y + MARGIN) * width + x + MARGIN] = grey.data[(y0 + y) * grey.width + x0 + x];
  return { crop: { width, height, data }, x0: x0 - MARGIN, y0: y0 - MARGIN };
}

/** The reading that most reads agree on (same text); on a tie, the one with the best confidence. */
function vote(reads) {
  const usable = reads.filter((r) => r.text);
  if (!usable.length) return null;
  const same = (a, b) => a.text.toLowerCase() === b.text.toLowerCase();
  let best = null; let bestVotes = 0;
  for (const r of usable) {
    const votes = usable.filter((o) => same(o, r)).length;
    if (!best || votes > bestVotes || (votes === bestVotes && r.conf > best.conf)) { best = r; bestVotes = votes; }
  }
  return best;
}

/**
 * OCR every cell. `grey` is the picture without any lines erased. Returns all words in PAGE coordinates
 * (so they can be given to fillCells() like the words of a whole-page read).
 */
export async function readCells(grey, cells, engine, env, { maxY = Infinity, onStep = () => {} } = {}) {
  const words = [];
  // cells under the self-declaration (maxY) and cells that are too small are not read
  const todo = cells.filter((c) => c.x1 - c.x0 >= MIN_W && c.y1 - c.y0 >= MIN_H && c.y0 < maxY).slice(0, MAX_CELLS);
  for (let i = 0; i < todo.length; i++) {
    const piece = cropCell(grey, todo[i]);
    if (!piece) continue;
    onStep(i / todo.length);
    const reads = [];
    for (const scale of SCALES) {
      // one read is enough for plain words; cells with digits (dates, times, numbers) are read at three sizes and the readings vote
      if (scale !== 1 && !reads.some((r) => /\d/.test(r.text))) break;
      const img = scale === 1 ? piece.crop : resizeGrey(piece.crop, Math.round(piece.crop.width * scale), Math.round(piece.crop.height * scale));
      try {
        const r = await engine.recognize(env.toEngineImage(img));
        const text = r.words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
        reads.push({ scale, words: r.words, text, conf: r.words.length ? r.words.reduce((n, w) => n + (w.conf || 0), 0) / r.words.length : 0 });
      } catch { /* a failed read is just one vote less */ }
    }
    const pick = vote(reads);
    if (!pick) continue;
    for (const w of pick.words) words.push({ ...w, x0: w.x0 / pick.scale + piece.x0, x1: w.x1 / pick.scale + piece.x0, y0: w.y0 / pick.scale + piece.y0, y1: w.y1 / pick.scale + piece.y0 });
  }
  return words;
}

/**
 * The title area above the table, read on its own: the whole width, and the middle part alone (logos of the ministry and the
 * agency sit left and right and confuse a whole-page read, so a centred title like "2026 Session 1" gets lost).
 * Returns the lines of text found (several readings together, duplicates are fine).
 */
export async function readHeader(grey, topY, engine, env) {
  const height = Math.max(0, Math.min(Math.round(topY), Math.round(grey.height * 0.3)));
  if (height < 40) return [];
  const pieces = [[0, grey.width], [Math.round(grey.width * 0.34), Math.round(grey.width * 0.7)]];
  const out = [];
  for (const [x0, x1] of pieces) {
    const w = x1 - x0;
    const data = new Uint8ClampedArray((w + 2 * MARGIN) * (height + 2 * MARGIN)).fill(255);
    const width = w + 2 * MARGIN;
    for (let y = 0; y < height; y++) for (let x = 0; x < w; x++) data[(y + MARGIN) * width + x + MARGIN] = grey.data[y * grey.width + x0 + x];
    const crop = { width, height: height + 2 * MARGIN, data };
    for (const scale of [1, 1.5]) {
      const img = scale === 1 ? crop : resizeGrey(crop, Math.round(crop.width * scale), Math.round(crop.height * scale));
      try { const r = await engine.recognize(env.toEngineImage(img)); for (const l of r.lines) out.push(l.text); } catch { /* the header is optional */ }
    }
  }
  return out;
}
