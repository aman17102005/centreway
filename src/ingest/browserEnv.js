// The browser version of the "environment" the reader needs: decode a picture, draw for OCR, load Tesseract / pdf.js / jsQR from vendor/.
// Nothing is loaded until it is needed (the first scan), so the app starts fast.
import { createOcrEngine } from './ocrEngine.js';
import { greyToRgba } from './pixels.js';

const MAX_SIDE = 3200; // bigger photos are shrunk while decoding, to save memory on weak phones

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(el);
  });
}

let ocr = null;
let ocrProgress = () => {};
let pdfjsPromise = null;
let qrPromise = null;

export const browserEnv = {
  /** Picture bytes -> { width, height, data (RGBA) }. Phone photos are turned upright using their EXIF orientation. */
  async decodeImage(bytes) {
    const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: data.width, height: data.height, data: data.data };
  },

  toEngineImage(grey) {
    const rgba = greyToRgba(grey);
    const canvas = document.createElement('canvas');
    canvas.width = rgba.width;
    canvas.height = rgba.height;
    canvas.getContext('2d').putImageData(new ImageData(rgba.data, rgba.width, rgba.height), 0, 0);
    return canvas;
  },

  async getOcr() {
    if (!ocr) {
      await loadScript('vendor/tesseract/tesseract.min.js');
      ocr = createOcrEngine(window.Tesseract, {
        workerOptions: { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/', workerBlobURL: false },
        onProgress: (status, fraction) => ocrProgress(status, fraction),
      });
    }
    return ocr;
  },

  /** The scan screen listens to OCR progress (loading language data, reading ...). */
  onOcrProgress(fn) { ocrProgress = fn; },

  getPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import('../../vendor/pdfjs/pdf.min.mjs').then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
        return lib;
      });
    }
    return pdfjsPromise;
  },

  createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },

  /** jsQR is loaded lazily; until then (or if it cannot load) QR reading is simply skipped. */
  get jsQR() {
    if (!qrPromise) qrPromise = loadScript('vendor/jsqr/jsQR.js').catch(() => {});
    return window.jsQR;
  },
  async prepareQr() { if (!qrPromise) qrPromise = loadScript('vendor/jsqr/jsQR.js').catch(() => {}); await qrPromise; },
};

/** Download the OCR language files in the background (first app open, online only). */
export async function warmOcr() {
  try {
    if (navigator.onLine === false) return;
    const engine = await browserEnv.getOcr();
    await engine.warm();
  } catch { /* optional */ }
}
