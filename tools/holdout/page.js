// A small drawing toolkit: a page collects drawing operations (text, lines, boxes, QR, bars). The same operations are drawn on a canvas
// (images) or into a PDF (text PDFs). Text is measured with the real fonts, so wrapping and centring are exact.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

const SYS = '/System/Library/Fonts/Supplemental';
const FAMILIES = {
  ar: ['Arial.ttf', 'Arial Bold.ttf', 'Arial Italic.ttf'], tnr: ['Times New Roman.ttf', 'Times New Roman Bold.ttf', 'Times New Roman Italic.ttf'], ver: ['Verdana.ttf', 'Verdana Bold.ttf', 'Verdana Italic.ttf'],
  tah: ['Tahoma.ttf', 'Tahoma Bold.ttf', 'Tahoma.ttf'], geo: ['Georgia.ttf', 'Georgia Bold.ttf', 'Georgia Italic.ttf'], tre: ['Trebuchet MS.ttf', 'Trebuchet MS Bold.ttf', 'Trebuchet MS Italic.ttf'],
  cou: ['Courier New.ttf', 'Courier New Bold.ttf', 'Courier New Italic.ttf'],
};
export const FAMILY_NAMES = [];
for (const [key, files] of Object.entries(FAMILIES)) {
  const ok = files.every((f, i) => GlobalFonts.registerFromPath(`${SYS}/${f}`, `H_${key}_${'rbi'[i]}`));
  if (ok) FAMILY_NAMES.push(key);
}
const NOTO = new URL('../../node_modules/@fontsource', import.meta.url).pathname;
GlobalFonts.registerFromPath(`${NOTO}/noto-sans/files/noto-sans-latin-400-normal.woff`, 'H_ns_r'); GlobalFonts.registerFromPath(`${NOTO}/noto-sans/files/noto-sans-latin-700-normal.woff`, 'H_ns_b');
GlobalFonts.registerFromPath(`${NOTO}/noto-sans/files/noto-sans-latin-400-normal.woff`, 'H_ns_i');
GlobalFonts.registerFromPath(`${NOTO}/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff`, 'H_deva_r');
GlobalFonts.registerFromPath(`${NOTO}/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff`, 'H_deva_b');
FAMILY_NAMES.push('ns');

const isDeva = (ch) => ch.charCodeAt(0) >= 0x0900 && ch.charCodeAt(0) <= 0x097f;
const measureCtx = createCanvas(10, 10).getContext('2d');

export function fontName(family, bold, italic, deva) {
  if (deva) return bold ? 'H_deva_b' : 'H_deva_r';
  return `H_${family}_${bold ? 'b' : italic ? 'i' : 'r'}`;
}

/** Text -> runs of one script each (Hindi letters use the Devanagari font). */
function splitRuns(text) {
  const runs = [];
  for (const ch of text) {
    const deva = isDeva(ch) || (ch === ' ' && runs.length && runs[runs.length - 1].deva);
    if (runs.length && runs[runs.length - 1].deva === deva) runs[runs.length - 1].text += ch; else runs.push({ deva, text: ch });
  }
  return runs;
}

export class Page {
  constructor(width, height, family, base) {
    this.width = width; this.height = height; this.family = family; this.base = base; this.ops = [];
  }

  width_(text, size, bold = false, italic = false) {
    let w = 0;
    for (const r of splitRuns(String(text))) { measureCtx.font = `${size}px ${fontName(this.family, bold, italic, r.deva)}`; w += measureCtx.measureText(r.text).width; }
    return w;
  }

  /** Draw a line of text. align: 'l' (x = left), 'c' (x = middle), 'r' (x = right). y = baseline. */
  text(x, y, text, { size = this.base, bold = false, italic = false, color = '#111', align = 'l', alpha = 1, angle = 0 } = {}) {
    const total = this.width_(text, size, bold, italic);
    let cx = align === 'c' ? x - total / 2 : align === 'r' ? x - total : x;
    const runs = [];
    for (const r of splitRuns(String(text))) {
      const font = fontName(this.family, bold, italic, r.deva);
      measureCtx.font = `${size}px ${font}`;
      runs.push({ x: cx, text: r.text, font, deva: r.deva }); cx += measureCtx.measureText(r.text).width;
    }
    this.ops.push({ t: 'text', runs, y, size, color, alpha, angle, pivot: [x, y], bold, italic });
    return total;
  }

  /** Split text into lines no wider than maxW. */
  wrap(text, maxW, size = this.base, bold = false) {
    const lines = []; let line = '';
    for (const word of String(text).split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (this.width_(next, size, bold) > maxW && line) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  rect(x, y, w, h, { stroke = '#333', fill = null, lw = 1, dash = false } = {}) { this.ops.push({ t: 'rect', x, y, w, h, stroke, fill, lw, dash }); }
  line(x1, y1, x2, y2, { color = '#333', lw = 1 } = {}) { this.ops.push({ t: 'line', x1, y1, x2, y2, color, lw }); }
  circle(x, y, r, { stroke = '#333', fill = null, lw = 1 } = {}) { this.ops.push({ t: 'circle', x, y, r, stroke, fill, lw }); }
  qr(x, y, size, data) { this.ops.push({ t: 'qr', x, y, size, data }); }
  bars(x, y, w, h, seed) { this.ops.push({ t: 'bars', x, y, w, h, seed }); }
  photo(x, y, w, h, tone) { this.ops.push({ t: 'photo', x, y, w, h, tone }); }
  scribble(x, y, w, h, color) { this.ops.push({ t: 'scribble', x, y, w, h, color }); }
}
