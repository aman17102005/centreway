// Turns drawing operations into a canvas (image) or a PDF, and makes "bad photos" on purpose.
import 'regenerator-runtime/runtime.js';
import { createCanvas, GlobalFonts, ImageData } from '@napi-rs/canvas';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import QRCode from 'qrcode';

const FONT_DIR = 'node_modules/@fontsource';
const FILES = {
  latin: `${FONT_DIR}/noto-sans/files/noto-sans-latin-400-normal.woff`, latinBold: `${FONT_DIR}/noto-sans/files/noto-sans-latin-700-normal.woff`,
  deva: `${FONT_DIR}/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff`, devaBold: `${FONT_DIR}/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff`,
};
GlobalFonts.registerFromPath(FILES.latin, 'NS'); GlobalFonts.registerFromPath(FILES.latinBold, 'NSB');
GlobalFonts.registerFromPath(FILES.deva, 'ND'); GlobalFonts.registerFromPath(FILES.devaBold, 'NDB');

const isDeva = (ch) => ch.charCodeAt(0) >= 0x0900 && ch.charCodeAt(0) <= 0x097f;
/** Split text into runs of the same script (Hindi letters use the Devanagari font). Spaces go with the neighbouring run. */
function runsOf(text) {
  const runs = [];
  for (const ch of text) {
    const script = isDeva(ch) ? 'deva' : ch === ' ' && runs.length ? runs[runs.length - 1].script : 'latin';
    if (runs.length && runs[runs.length - 1].script === script) runs[runs.length - 1].text += ch; else runs.push({ script, text: ch });
  }
  return runs;
}

/** Draw the page on a white canvas. scale = pixels per point (2.083 = 1240 px wide). */
export function renderCanvas(ops, scale = 2.083) {
  const canvas = createCanvas(Math.round(595 * scale), Math.round(842 * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  for (const op of ops) {
    if (op.type === 'text') {
      let x = op.text.length && op.x === 297 && op.size === 14 ? 0 : op.x;
      const runs = runsOf(op.text);
      const widthOf = (r) => { ctx.font = `${op.size}px ${r.script === 'deva' ? (op.bold ? 'NDB' : 'ND') : (op.bold ? 'NSB' : 'NS')}`; return ctx.measureText(r.text).width; };
      if (op.x === 297 && op.size === 14) x = 297 - runs.reduce((s, r) => s + widthOf(r), 0) / 2; // centred title
      ctx.fillStyle = '#111';
      for (const r of runs) { ctx.font = `${op.size}px ${r.script === 'deva' ? (op.bold ? 'NDB' : 'ND') : (op.bold ? 'NSB' : 'NS')}`; ctx.fillText(r.text, x, op.y); x += ctx.measureText(r.text).width; }
    } else if (op.type === 'rect') {
      if (op.fill) { ctx.fillStyle = op.fill; ctx.fillRect(op.x, op.y, op.w, op.h); }
      ctx.strokeStyle = op.stroke; ctx.lineWidth = 0.8; ctx.strokeRect(op.x, op.y, op.w, op.h);
    } else if (op.type === 'line') {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
    } else if (op.type === 'qr') {
      const q = QRCode.create(op.data, { errorCorrectionLevel: 'M' }).modules;
      const cell = op.size / (q.size + 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(op.x, op.y, op.size, op.size); ctx.fillStyle = '#000';
      for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) if (q.get(r, c)) ctx.fillRect(op.x + (c + 1) * cell, op.y + (r + 1) * cell, cell + 0.2, cell + 0.2);
    }
  }
  return canvas;
}

/** A PDF with real, selectable text (fonts embedded, so Hindi text can be read back). */
export async function renderPdfText(ops) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = {
    latin: await pdf.embedFont(readFileSync(FILES.latin), { subset: true }), latinBold: await pdf.embedFont(readFileSync(FILES.latinBold), { subset: true }),
    deva: await pdf.embedFont(readFileSync(FILES.deva), { subset: true }), devaBold: await pdf.embedFont(readFileSync(FILES.devaBold), { subset: true }),
  };
  const page = pdf.addPage([595, 842]);
  const fontOf = (script, bold) => fonts[(script === 'deva' ? 'deva' : 'latin') + (bold ? 'Bold' : '')];
  for (const op of ops) {
    if (op.type === 'text') {
      const runs = runsOf(op.text);
      let x = op.x;
      if (op.x === 297 && op.size === 14) x = 297 - runs.reduce((s, r) => s + fontOf(r.script, op.bold).widthOfTextAtSize(r.text, op.size), 0) / 2;
      for (const r of runs) { const f = fontOf(r.script, op.bold); page.drawText(r.text, { x, y: 842 - op.y, size: op.size, font: f, color: rgb(0.07, 0.07, 0.07) }); x += f.widthOfTextAtSize(r.text, op.size); }
    } else if (op.type === 'rect') {
      page.drawRectangle({ x: op.x, y: 842 - op.y - op.h, width: op.w, height: op.h, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.8 });
    } else if (op.type === 'line') {
      page.drawLine({ start: { x: op.x1, y: 842 - op.y1 }, end: { x: op.x2, y: 842 - op.y2 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
    } else if (op.type === 'qr') {
      const q = QRCode.create(op.data, { errorCorrectionLevel: 'M' }).modules;
      const cell = op.size / (q.size + 2);
      for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) if (q.get(r, c)) page.drawRectangle({ x: op.x + (c + 1) * cell, y: 842 - op.y - (r + 2) * cell, width: cell + 0.1, height: cell + 0.1, color: rgb(0, 0, 0) });
    }
  }
  return pdf.save();
}

/** A PDF that holds only a picture (like a scanned page): no text inside. */
export async function renderPdfImage(canvas) {
  const pdf = await PDFDocument.create();
  const jpg = await pdf.embedJpg(canvas.toBuffer('image/jpeg', 80));
  const page = pdf.addPage([595, 842]);
  page.drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 });
  return pdf.save();
}

// ------------------------------------------------------------------ making bad photos
function rotateOnto(src, degrees, backdrop, margin) {
  const w = src.width + margin * 2; const h = src.height + margin * 2;
  const out = createCanvas(w, h); const ctx = out.getContext('2d');
  ctx.fillStyle = backdrop; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate((degrees * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 25; ctx.shadowOffsetX = 8; ctx.shadowOffsetY = 10;
  ctx.drawImage(src, -src.width / 2, -src.height / 2); ctx.restore();
  return out;
}
function mapPixels(canvas, fn) {
  const ctx = canvas.getContext('2d'); const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  fn(img.data, canvas.width, canvas.height); ctx.putImageData(new ImageData(img.data, canvas.width, canvas.height), 0, 0); return canvas;
}
function blurred(canvas, px) {
  const out = createCanvas(canvas.width, canvas.height); const ctx = out.getContext('2d'); ctx.filter = `blur(${px}px)`; ctx.drawImage(canvas, 0, 0); return out;
}

/** kinds: 'photo' (desk + light + noise), 'tilt', 'blur', 'lowlight', 'shadow', 'crop', 'screenshot'. */
export function degrade(page, kinds, rng) {
  let c = page;
  if (kinds.includes('screenshot')) return screenshot(page);
  if (kinds.includes('crop')) { // tight crop: a few percent of every edge missing
    const cx = Math.round(page.width * 0.035); const cy = Math.round(page.height * 0.03);
    const out = createCanvas(page.width - 2 * cx, page.height - 2 * cy); out.getContext('2d').drawImage(page, -cx, -cy); c = out;
  }
  const angle = kinds.includes('tilt3') ? rng.float(2.8, 3.4) : kinds.includes('tilt') ? rng.float(4.5, 5.5) : rng.float(0.6, 1.4) * (rng.next() < 0.5 ? -1 : 1);
  if (kinds.includes('crop')) { c = rotateOnto(c, angle, '#4b3f33', 20); } else c = rotateOnto(c, angle, '#4b3f33', 70);
  // uneven light across the picture
  mapPixels(c, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; const light = 0.9 + 0.12 * (x / w) - 0.06 * (y / h);
      d[i] *= light; d[i + 1] *= light; d[i + 2] *= light;
    }
  });
  if (kinds.includes('shadow')) {
    mapPixels(c, (d, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const edge = (x / w + y / h) / 2; // diagonal soft shadow over one corner
        const k = edge < 0.35 ? 0.45 : edge < 0.5 ? 0.45 + ((edge - 0.35) / 0.15) * 0.55 : 1;
        const i = (y * w + x) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
      }
    });
  }
  if (kinds.includes('lowlight')) mapPixels(c, (d) => { for (let i = 0; i < d.length; i += 4) { const v = (d[i] / 255) ** 1.6 * 255 * 0.42; d[i] = d[i + 1] = d[i + 2] = v; } });
  const noise = kinds.includes('lowlight') ? 14 : 5;
  mapPixels(c, (d) => { for (let i = 0; i < d.length; i += 4) { const n = (rng.next() - 0.5) * noise * 2; d[i] += n; d[i + 1] += n; d[i + 2] += n; } });
  c = blurred(c, kinds.includes('blur') ? 1.9 : kinds.includes('softblur') ? 1.3 : 0.8);
  return c;
}

/** A phone screenshot: the page scaled to ~1080 px wide with a status bar on top. */
function screenshot(page) {
  const w = 1080; const scaled = Math.round(page.height * (w / page.width));
  const out = createCanvas(w, scaled + 150); const ctx = out.getContext('2d');
  ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, 0, w, out.height);
  ctx.fillStyle = '#222'; ctx.font = '34px NS'; ctx.fillText('10:42', 40, 52); ctx.fillText('92%', w - 120, 52);
  ctx.font = '38px NSB'; ctx.fillText('admit_card.pdf', 40, 118);
  ctx.drawImage(page, 0, 150, w, scaled);
  return out;
}
