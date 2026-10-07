// Finds the table in a picture: the horizontal and vertical ruling lines, then the cells between them.
// Works on the black-and-white picture (0 = ink). Everything is plain pixel maths, so it runs in the browser and in tests.
import { buildLines } from './layout.js';
import { mergeSort } from '../dsa/mergeSort.js';

/** A "run" of ink along a row, allowing tiny gaps (a slightly tilted line breaks into short pieces). */
function runsInRow(bw, y, minLength, vertical) {
  const { width, height, data } = bw;
  const length = vertical ? height : width;
  const at = (i) => {
    // look one pixel to each side as well, so a line that wobbles by a pixel is still one run
    const lo = vertical ? Math.max(0, y - 1) : Math.max(0, y - 1);
    const hi = vertical ? Math.min(width - 1, y + 1) : Math.min(height - 1, y + 1);
    for (let k = lo; k <= hi; k++) if ((vertical ? data[i * width + k] : data[k * width + i]) === 0) return true;
    return false;
  };
  const runs = [];
  let start = -1; let last = -1; let gap = 0;
  for (let i = 0; i < length; i++) {
    if (at(i)) { if (start < 0) start = i; last = i; gap = 0; }
    else if (start >= 0 && ++gap > 2) { if (last - start + 1 >= minLength) runs.push([start, last]); start = -1; }
  }
  if (start >= 0 && last - start + 1 >= minLength) runs.push([start, last]);
  return runs;
}

/** Join runs that sit on neighbouring rows and overlap along the line into one line: { pos, a, b } (pos = y or x). */
function collectLines(bw, minLength, vertical) {
  const size = vertical ? bw.width : bw.height;
  const open = [];
  const done = [];
  for (let pos = 0; pos < size; pos++) {
    const runs = runsInRow(bw, pos, minLength, vertical);
    for (const [a, b] of runs) {
      const hit = open.find((l) => l.last >= pos - 2 && Math.min(l.b, b) - Math.max(l.a, a) >= 0.6 * Math.min(l.b - l.a, b - a));
      if (hit) { hit.p1 = pos; hit.a = Math.min(hit.a, a); hit.b = Math.max(hit.b, b); hit.last = pos; }
      else open.push({ p0: pos, p1: pos, a, b, last: pos });
    }
    for (let k = open.length - 1; k >= 0; k--) if (open[k].last < pos - 3) done.push(open.splice(k, 1)[0]);
  }
  done.push(...open);
  return done.filter((l) => l.p1 - l.p0 < 12).map((l) => ({ pos: (l.p0 + l.p1) / 2, a: l.a, b: l.b, thick: l.p1 - l.p0 + 1 }));
}

/**
 * Horizontal lines { pos: y, a: x0, b: x1 } and vertical lines { pos: x, a: y0, b: y1 } of the table.
 * Short strokes (letters, underscores) are ignored: a ruling line is at least minShare of the page long.
 */
export function detectGrid(bw, { minShareH = 0.06, minShareV = 0.04, minPixelsV = 45 } = {}) {
  const h = collectLines(bw, Math.round(bw.width * minShareH), false);
  // a vertical ruling line is much taller than a letter (letter strokes are about 30 pixels at this size)
  const v = collectLines(bw, Math.max(minPixelsV, Math.round(bw.height * minShareV)), true);
  return { h: keepLongRows(mergeSort(h, (a, b) => a.pos - b.pos), bw.width * 0.25), v: keepLongRows(mergeSort(v, (a, b) => a.pos - b.pos), bw.height * 0.1) };
}

/**
 * A real ruling line is broken into pieces in a faint photo, but the pieces on one row add up to a long line.
 * Pieces on neighbouring rows are one "row"; rows whose pieces add up to less than minTotal are text edges, not ruling lines.
 */
function keepLongRows(lines, minTotal) {
  const kept = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const total = group.reduce((n, l) => n + (l.b - l.a + 1), 0);
    if (total >= minTotal) kept.push(...group);
    group = [];
  };
  for (const l of lines) {
    if (group.length && l.pos - group[group.length - 1].pos > 6) flush();
    group.push(l);
  }
  flush();
  return kept;
}

/** How much of [x0, x1] is covered by horizontal lines near y (0..1). */
function coverage(lines, y, x0, x1, tol = 9) {
  let covered = 0;
  for (const l of lines) {
    if (Math.abs(l.pos - y) > tol) continue;
    const overlap = Math.min(l.b, x1) - Math.max(l.a, x0);
    if (overlap > 0) covered += overlap;
  }
  return covered / Math.max(1, x1 - x0);
}

/**
 * Cells = rectangles enclosed by the lines. Band by band (between two horizontal lines) the vertical lines that cross the band
 * give the columns; a cell whose bottom has no line under it keeps going into the next band (cells that span several rows).
 * Returns [] when the picture has no real table (fewer than 6 cells: a photo box or a single frame is not a table).
 */
export function buildCells(grid) {
  const hs = [];
  for (const l of grid.h) { const last = hs[hs.length - 1]; if (last && Math.abs(last.pos - l.pos) < 6) { last.a = Math.min(last.a, l.a); last.b = Math.max(last.b, l.b); } else hs.push({ ...l }); }
  const ys = hs.map((l) => l.pos);
  // Faint photos often lose the outer left / right border of a table. The long horizontal lines show where the table really ends.
  const longest = hs.reduce((m, l) => Math.max(m, l.b - l.a), 0);
  const wide = hs.filter((l) => l.b - l.a >= 0.7 * longest);
  const leftEdge = wide.length ? Math.min(...wide.map((l) => l.a)) : null;
  const rightEdge = wide.length ? Math.max(...wide.map((l) => l.b)) : null;
  const cells = [];
  let open = []; // cells still waiting for a bottom line
  for (let k = 0; k + 1 < ys.length; k++) {
    const top = ys[k]; const bottom = ys[k + 1];
    if (bottom - top < 10) continue;
    // vertical lines that cross this band
    const xs = [];
    for (const v of grid.v) if (v.a <= top + 8 && v.b >= bottom - 8) { const last = xs[xs.length - 1]; if (last === undefined || v.pos - last > 6) xs.push(v.pos); }
    if (xs.length && leftEdge != null && xs[0] - leftEdge > 40 && coverage(hs, top, leftEdge, xs[0]) >= 0.5) xs.unshift(leftEdge);
    if (xs.length && rightEdge != null && rightEdge - xs[xs.length - 1] > 40 && coverage(hs, top, xs[xs.length - 1], rightEdge) >= 0.5) xs.push(rightEdge);
    const next = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i]; const x1 = xs[i + 1];
      if (x1 - x0 < 20) continue;
      if (coverage(hs, top, x0, x1) < 0.5 && !open.some((c) => Math.abs(c.x0 - x0) < 8 && Math.abs(c.x1 - x1) < 8)) continue; // not closed at the top: not a cell
      const continuing = open.find((c) => Math.abs(c.x0 - x0) < 8 && Math.abs(c.x1 - x1) < 8);
      const cell = continuing || { x0, x1, y0: top };
      cell.y1 = bottom;
      if (coverage(hs, bottom, x0, x1) >= 0.5) cells.push({ x0: cell.x0, y0: cell.y0, x1: cell.x1, y1: cell.y1 });
      else next.push(cell);
    }
    open = next;
  }
  return cells.length >= 6 ? cells : [];
}

/**
 * Put the OCR words into the cells (by the middle of each word). Returns { cells, outside } where each cell has
 * { x0, y0, x1, y1, words, lines, text, conf } and `outside` are the words that are not inside any table cell.
 */
export function fillCells(cells, words) {
  const filled = cells.map((c) => ({ ...c, words: [] }));
  const outside = [];
  for (const w of words) {
    const cx = (w.x0 + w.x1) / 2; const cy = (w.y0 + w.y1) / 2;
    let best = null;
    for (const c of filled) {
      if (cx >= c.x0 - 2 && cx <= c.x1 + 2 && cy >= c.y0 - 2 && cy <= c.y1 + 2) {
        if (!best || (c.x1 - c.x0) * (c.y1 - c.y0) < (best.x1 - best.x0) * (best.y1 - best.y0)) best = c; // the smallest cell that holds the word
      }
    }
    if (best) best.words.push(w); else outside.push(w);
  }
  for (const c of filled) {
    c.lines = buildLines(c.words);
    c.text = c.lines.map((l) => l.text).join(' ').trim();                 // lines joined with spaces: used to recognise labels
    // For values: a line that stops well before the cell edge ended on purpose (a new part, like name / address): join with a comma.
    // A line that runs to the edge was only wrapped by the cell: join with a space.
    const inner = c.x1 - c.x0;
    let broken = '';
    c.lines.forEach((l, i) => {
      if (i > 0) { const prev = c.lines[i - 1]; const wrapped = prev.x1 > c.x1 - 0.45 * inner - 6 || prev.text.endsWith(','); broken += wrapped ? ' ' : ', '; }
      broken += l.text;
    });
    c.valueText = broken.trim();
    c.conf = c.words.length ? c.words.reduce((s, w) => s + (w.conf ?? 100), 0) / c.words.length : 0;
  }
  return { cells: filled, outside };
}

/**
 * No ruling lines? Make cells out of the words themselves: each line is cut where the gap between words is much wider than a letter.
 * Returns the same cell shape as fillCells (one row of cells per text line).
 */
export function gapCells(lines) {
  const cells = [];
  for (const line of lines) {
    if (!line.words || !line.words.length) continue;
    const chars = line.words.reduce((s, w) => s + w.text.length, 0) || 1;
    const letter = (line.words.reduce((s, w) => s + (w.x1 - w.x0), 0)) / chars;     // average letter width
    let group = [line.words[0]];
    const flush = () => {
      const xs0 = group[0].x0; const xs1 = group[group.length - 1].x1;
      cells.push({ x0: xs0, x1: xs1, y0: Math.min(...group.map((w) => w.y0)), y1: Math.max(...group.map((w) => w.y1)), words: group, lines: [], text: group.map((w) => w.text).join(' '),
        conf: group.reduce((s, w) => s + (w.conf ?? 100), 0) / group.length });
    };
    for (let i = 1; i < line.words.length; i++) {
      const gap = line.words[i].x0 - line.words[i - 1].x1;
      if (gap > Math.max(3.2 * letter, 24)) { flush(); group = [line.words[i]]; } else group.push(line.words[i]);
    }
    flush();
  }
  return cells;
}

/**
 * Paint the ruling lines white, so the OCR sees the text without table borders touching it
 * (words that touch a border are often skipped). Returns a new grey picture.
 */
export function eraseGridLines(grey, grid) {
  const { width, height } = grey;
  const out = new Uint8ClampedArray(grey.data);
  for (const l of grid.h) {
    const half = Math.ceil((l.thick || 3) / 2) + 2;
    for (let y = Math.max(0, Math.round(l.pos) - half); y <= Math.min(height - 1, Math.round(l.pos) + half); y++) for (let x = Math.max(0, l.a); x <= Math.min(width - 1, l.b); x++) out[y * width + x] = 255;
  }
  for (const l of grid.v) {
    const half = Math.ceil((l.thick || 3) / 2) + 2;
    for (let x = Math.max(0, Math.round(l.pos) - half); x <= Math.min(width - 1, Math.round(l.pos) + half); x++) for (let y = Math.max(0, l.a); y <= Math.min(height - 1, l.b); y++) out[y * width + x] = 255;
  }
  return { width, height, data: out };
}

/**
 * Thin, faint ruling lines (light grey, one pixel wide in the original photo) disappear when the picture is made black and white.
 * A "ridge" is a pixel clearly darker than the pixels a few steps above and below it (horizontal line) or left and right of it
 * (vertical line). Returns a copy of `bw` where those pixels are ink (0) as well.
 */
export function addFaintLines(grey, bw, { offset = 5, drop = 14 } = {}) {
  const { width: W, height: H, data } = grey;
  const out = { width: W, height: H, data: Uint8Array.from(bw.data) };
  for (let y = offset; y < H - offset; y++) {
    for (let x = offset; x < W - offset; x++) {
      const v = data[y * W + x];
      const horizontal = v < data[(y - offset) * W + x] - drop && v < data[(y + offset) * W + x] - drop;
      const vertical = v < data[y * W + x - offset] - drop && v < data[y * W + x + offset] - drop;
      if (horizontal || vertical) out.data[y * W + x] = 0;
    }
  }
  return out;
}
