// Reads text from a photo inside the browser. The photo never leaves the phone.
// Tesseract is loaded only when needed, and it runs in a web worker (no freezing).
import { CONFIG } from '../config.js';

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load OCR files'));
    document.head.appendChild(s);
  });
}

/** Shrink big photos so weak phones do not run out of memory. Returns a canvas. */
export async function shrinkImage(file, maxSide = CONFIG.ocr.maxImageSide) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas;
}

/** languages: 'eng' or 'eng+hin'. onProgress gets { status, progress 0..1 }. */
export async function readImage(file, languages, onProgress) {
  onProgress({ status: 'preparing', progress: 0 });
  const canvas = await shrinkImage(file);
  if (!loading) loading = loadScript('vendor/tesseract/tesseract.min.js');
  await loading;
  const worker = await window.Tesseract.createWorker(languages.split('+'), 1, {
    workerPath: 'vendor/tesseract/worker.min.js',
    corePath: 'vendor/tesseract/',
    workerBlobURL: false,
    logger: (m) => onProgress({ status: m.status, progress: m.progress || 0 }),
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}
