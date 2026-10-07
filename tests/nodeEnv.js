// The Node version of the "environment" the reader needs (the browser has its own in src/ingest/browserEnv.js).
// Used by the accuracy run and the tests. Tesseract language data is downloaded once and cached in tests/.tess-cache.
import { createCanvas, loadImage, ImageData } from '@napi-rs/canvas';
import Tesseract from 'tesseract.js';
import jsQR from 'jsqr';
import { createOcrEngine } from '../src/ingest/ocrEngine.js';
import { greyToRgba } from '../src/ingest/pixels.js';

let engine = null;
let pdfjs = null;

export const nodeEnv = {
  async decodeImage(bytes) {
    const img = await loadImage(Buffer.from(bytes));
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height);
    return { width: data.width, height: data.height, data: data.data };
  },
  toEngineImage(grey) {
    const rgba = greyToRgba(grey);
    const canvas = createCanvas(rgba.width, rgba.height);
    canvas.getContext('2d').putImageData(new ImageData(rgba.data, rgba.width, rgba.height), 0, 0);
    return canvas.toBuffer('image/png');
  },
  async getOcr() {
    if (!engine) engine = createOcrEngine(Tesseract, { workerOptions: { cachePath: 'tests/.tess-cache' } });
    return engine;
  },
  async getPdfjs() {
    if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return pdfjs;
  },
  createCanvas,
  jsQR,
  async close() { if (engine) await engine.terminate(); engine = null; },
};
