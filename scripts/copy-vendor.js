// Copies the third-party browser files from node_modules into vendor/ (so the app needs no CDN for code).
// Run: npm run vendor   (after npm install). The result is committed.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const nm = (p) => join(root, 'node_modules', p);
const out = (p) => join(root, 'vendor', p);

const jobs = [
  // [from, to]
  ['leaflet/dist/leaflet.js', 'leaflet/leaflet.js'],
  ['leaflet/dist/leaflet.css', 'leaflet/leaflet.css'],
  ['leaflet/dist/images', 'leaflet/images'],
  ['tesseract.js/dist/tesseract.min.js', 'tesseract/tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract/tesseract-core-relaxedsimd-lstm.wasm.js'],
  // legacy (non-LSTM) cores are only needed for orientation detection (osd)
  ['tesseract.js-core/tesseract-core-simd.wasm.js', 'tesseract/tesseract-core-simd.wasm.js'],
  ['tesseract.js-core/tesseract-core.wasm.js', 'tesseract/tesseract-core.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd.wasm.js', 'tesseract/tesseract-core-relaxedsimd.wasm.js'],
  ['pdfjs-dist/legacy/build/pdf.min.mjs', 'pdfjs/pdf.min.mjs'],
  ['pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs'],
  ['jsqr/dist/jsQR.js', 'jsqr/jsQR.js'],
];
for (const [from, to] of jobs) {
  mkdirSync(join(out(to), '..'), { recursive: true });
  cpSync(nm(from), out(to), { recursive: true });
  console.log('copied', to);
}
