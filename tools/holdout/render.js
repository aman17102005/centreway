// Draws a Page (drawing operations) on a canvas or into a PDF, and damages pictures like real phone photos.
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { readFileSync } from 'node:fs';

const NOTO = new URL('../../node_modules/@fontsource', import.meta.url).pathname;

const hex = (c) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c === 'none' ? '#ffffff' : c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0]; };

/** Draw all operations on a canvas (scale = pixels per page unit). */
export function renderCanvas(page, scale = 1) {
  const canvas = createCanvas(Math.round(page.width * scale), Math.round(page.height * scale));
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.scale(scale, scale);
  for (const op of page.ops) {
    if (op.t === 'text') {
      g.save(); g.globalAlpha = op.alpha ?? 1;
      if (op.angle) { g.translate(op.pivot[0], op.pivot[1]); g.rotate((op.angle * Math.PI) / 180); g.translate(-op.pivot[0], -op.pivot[1]); }
      g.fillStyle = op.color; g.textAlign = 'left';
      for (const r of op.runs) { g.font = `${op.size}px ${r.font}`; g.fillText(r.text, r.x, op.y); }
      g.restore();
    } else if (op.t === 'rect') {
      if (op.fill) { g.fillStyle = op.fill; g.fillRect(op.x, op.y, op.w, op.h); }
      if (op.stroke && op.stroke !== 'none') { g.strokeStyle = op.stroke; g.lineWidth = op.lw; g.strokeRect(op.x, op.y, op.w, op.h); }
    } else if (op.t === 'line') { g.strokeStyle = op.color; g.lineWidth = op.lw; g.beginPath(); g.moveTo(op.x1, op.y1); g.lineTo(op.x2, op.y2); g.stroke(); }
    else if (op.t === 'circle') { g.beginPath(); g.arc(op.x, op.y, op.r, 0, Math.PI * 2); if (op.fill) { g.fillStyle = op.fill; g.fill(); } g.strokeStyle = op.stroke; g.lineWidth = op.lw; g.stroke(); }
    else if (op.t === 'qr') {
      const q = QRCode.create(op.data, { errorCorrectionLevel: 'M' }).modules; const cell = op.size / (q.size + 2);
      g.fillStyle = '#fff'; g.fillRect(op.x, op.y, op.size, op.size); g.fillStyle = '#000';
      for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) if (q.get(r, c)) g.fillRect(op.x + (c + 1) * cell, op.y + (r + 1) * cell, cell + 0.2, cell + 0.2);
    } else if (op.t === 'bars') {
      let x = op.x; let s = op.seed * 7919 + 13; g.fillStyle = '#111';
      while (x < op.x + op.w) { s = (s * 1103515245 + 12345) & 0x7fffffff; const w = 1 + (s % 3); g.fillRect(x, op.y, w, op.h); x += w + 1 + ((s >> 4) % 3); }
    } else if (op.t === 'photo') {
      g.fillStyle = '#e8e2da'; g.fillRect(op.x, op.y, op.w, op.h); g.fillStyle = op.tone;
      g.beginPath(); g.ellipse(op.x + op.w / 2, op.y + op.h * 0.4, op.w * 0.22, op.h * 0.2, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(op.x + op.w * 0.2, op.y + op.h * 0.7, op.w * 0.6, op.h * 0.3);
    } else if (op.t === 'scribble') {
      g.strokeStyle = op.color; g.lineWidth = 1.3; g.beginPath(); g.moveTo(op.x, op.y + op.h * 0.7);
      g.bezierCurveTo(op.x + op.w * 0.2, op.y - 4, op.x + op.w * 0.35, op.y + op.h, op.x + op.w * 0.55, op.y + op.h * 0.3); g.bezierCurveTo(op.x + op.w * 0.7, op.y + op.h * 0.8, op.x + op.w * 0.85, op.y, op.x + op.w, op.y + op.h * 0.5); g.stroke();
    }
  }
  return canvas;
}

/** A PDF with real text. Only Noto Sans is embedded (any font name used on the canvas is replaced here). */
export async function renderPdf(page) {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const files = { r: `${NOTO}/noto-sans/files/noto-sans-latin-400-normal.woff`, b: `${NOTO}/noto-sans/files/noto-sans-latin-700-normal.woff`,
    dr: `${NOTO}/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff`, db: `${NOTO}/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff` };
  const fonts = {}; for (const [k, f] of Object.entries(files)) fonts[k] = await pdf.embedFont(readFileSync(f), { subset: true });
  const p = pdf.addPage([page.width, page.height]); const Y = (y) => page.height - y;
  for (const op of page.ops) {
    if (op.t === 'text') {
      const c = hex(op.color);
      for (const r of op.runs) {
        const font = r.deva ? (op.bold ? fonts.db : fonts.dr) : (op.bold ? fonts.b : fonts.r);
        // the PDF uses Noto metrics, so a run is placed by its own start: widths differ a little from the canvas font, which is fine
        const opts = { x: r.x, y: Y(op.y), size: op.size, font, color: rgb(c[0] / 255, c[1] / 255, c[2] / 255), opacity: op.alpha ?? 1 };
        if (op.angle) { opts.rotate = degrees(-op.angle); opts.x = op.pivot[0]; }
        p.drawText(r.text, opts);
      }
    } else if (op.t === 'rect') {
      const s = hex(op.stroke || '#000'); const f = op.fill ? hex(op.fill) : null;
      p.drawRectangle({ x: op.x, y: Y(op.y + op.h), width: op.w, height: op.h, borderColor: op.stroke && op.stroke !== 'none' ? rgb(s[0] / 255, s[1] / 255, s[2] / 255) : undefined, borderWidth: op.stroke && op.stroke !== 'none' ? op.lw : 0, color: f ? rgb(f[0] / 255, f[1] / 255, f[2] / 255) : undefined });
    } else if (op.t === 'line') { const c = hex(op.color); p.drawLine({ start: { x: op.x1, y: Y(op.y1) }, end: { x: op.x2, y: Y(op.y2) }, thickness: op.lw, color: rgb(c[0] / 255, c[1] / 255, c[2] / 255) }); }
    else if (op.t === 'circle') { const s = hex(op.stroke); const f = op.fill ? hex(op.fill) : null; p.drawCircle({ x: op.x, y: Y(op.y), size: op.r, borderColor: rgb(s[0] / 255, s[1] / 255, s[2] / 255), borderWidth: op.lw, color: f ? rgb(f[0] / 255, f[1] / 255, f[2] / 255) : undefined }); }
    else if (op.t === 'qr') {
      const q = QRCode.create(op.data, { errorCorrectionLevel: 'M' }).modules; const cell = op.size / (q.size + 2);
      for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) if (q.get(r, c)) p.drawRectangle({ x: op.x + (c + 1) * cell, y: Y(op.y + (r + 2) * cell), width: cell + 0.1, height: cell + 0.1, color: rgb(0, 0, 0) });
    } else if (op.t === 'bars') {
      let x = op.x; let s = op.seed * 7919 + 13;
      while (x < op.x + op.w) { s = (s * 1103515245 + 12345) & 0x7fffffff; const w = 1 + (s % 3); p.drawRectangle({ x, y: Y(op.y + op.h), width: w, height: op.h, color: rgb(0.07, 0.07, 0.07) }); x += w + 1 + ((s >> 4) % 3); }
    } else if (op.t === 'photo') { const c = hex(op.tone); p.drawRectangle({ x: op.x, y: Y(op.y + op.h), width: op.w, height: op.h, color: rgb(c[0] / 255, c[1] / 255, c[2] / 255), opacity: 0.8 }); }
  }
  return pdf.save();
}

// ------------------------------------------------------------------ damage
function rotated(src, deg, backdrop, margin) {
  const w = src.width + margin * 2; const h = src.height + margin * 2; const out = createCanvas(w, h); const g = out.getContext('2d');
  g.fillStyle = backdrop; g.fillRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.rotate((deg * Math.PI) / 180);
  g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 22; g.shadowOffsetX = 6; g.shadowOffsetY = 8; g.drawImage(src, -src.width / 2, -src.height / 2); g.restore(); return out;
}
function mapPixels(canvas, fn) { const g = canvas.getContext('2d'); const img = g.getImageData(0, 0, canvas.width, canvas.height); fn(img.data, canvas.width, canvas.height); g.putImageData(new ImageData(img.data, canvas.width, canvas.height), 0, 0); return canvas; }
function blurred(canvas, px) { const out = createCanvas(canvas.width, canvas.height); const g = out.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(canvas, 0, 0); return out; }
function scaled(canvas, f) { const out = createCanvas(Math.max(50, Math.round(canvas.width * f)), Math.max(50, Math.round(canvas.height * f))); out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height); return out; }

/**
 * kinds: tilt, blur, shadow, lowlight, lowres, crop, screenshot, jpeg (strong compression), glare, desk (photo on a desk).
 * Returns a canvas. rng = seeded random.
 */
export function damage(page, kinds, rng) {
  let c = page;
  if (kinds.includes('crop')) { const cx = Math.round(c.width * rng.float(0.02, 0.05)); const cy = Math.round(c.height * rng.float(0.015, 0.04)); const out = createCanvas(c.width - 2 * cx, c.height - 2 * cy); out.getContext('2d').drawImage(c, -cx, -cy); c = out; }
  if (kinds.includes('screenshot')) {
    const w = 1080; const hh = Math.round(c.height * (w / c.width)); const out = createCanvas(w, hh + 170); const g = out.getContext('2d');
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, out.height); g.fillStyle = '#222'; g.font = '34px H_ns_r'; g.fillText('10:42', 40, 52); g.fillText('92%', w - 120, 52); g.font = '38px H_ns_b'; g.fillText('admit_card.pdf', 40, 120);
    g.drawImage(c, 0, 170, w, hh); c = out;
  }
  if (kinds.includes('tilt') || kinds.includes('desk')) {
    const angle = (kinds.includes('tilt') ? rng.float(1.5, 4.5) : rng.float(0.4, 1.2)) * (rng.next() < 0.5 ? -1 : 1);
    c = rotated(c, angle, '#4b3f33', kinds.includes('crop') ? 16 : 60);
  }
  if (kinds.includes('desk') || kinds.includes('tilt') || kinds.includes('shadow') || kinds.includes('lowlight')) {
    mapPixels(c, (d, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const k = 0.9 + 0.12 * (x / w) - 0.06 * (y / h); d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } });
  }
  if (kinds.includes('shadow')) mapPixels(c, (d, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = (x / w + y / h) / 2; const k = e < 0.3 ? 0.5 : e < 0.45 ? 0.5 + ((e - 0.3) / 0.15) * 0.5 : 1; const i = (y * w + x) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } });
  if (kinds.includes('glare')) mapPixels(c, (d, w, h) => { const cx = w * rng.float(0.3, 0.7); const cy = h * rng.float(0.2, 0.6); const r = w * 0.18; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dd = Math.hypot(x - cx, y - cy); if (dd < r) { const k = (1 - dd / r) * 120; const i = (y * w + x) * 4; d[i] += k; d[i + 1] += k; d[i + 2] += k; } } });
  if (kinds.includes('lowlight')) mapPixels(c, (d) => { for (let i = 0; i < d.length; i += 4) { const v = (d[i] / 255) ** 1.6 * 255 * 0.45; d[i] = d[i + 1] = d[i + 2] = v; } });
  if (kinds.includes('lowres')) c = scaled(c, rng.float(0.42, 0.58));
  const noise = kinds.includes('lowlight') ? 12 : 4;
  if (kinds.some((k) => ['tilt', 'desk', 'lowlight', 'shadow', 'blur'].includes(k))) mapPixels(c, (d) => { for (let i = 0; i < d.length; i += 4) { const n = (rng.next() - 0.5) * noise * 2; d[i] += n; d[i + 1] += n; d[i + 2] += n; } });
  if (kinds.includes('blur')) c = blurred(c, rng.float(1.3, 2.0)); else if (kinds.some((k) => ['tilt', 'desk'].includes(k))) c = blurred(c, 0.7);
  return c;
}
