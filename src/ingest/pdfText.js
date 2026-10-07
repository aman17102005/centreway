// Reads PDFs. If the PDF has real text inside, we read that text directly (no OCR, so it is exact).
// If it is only a scanned picture, the pages are drawn to a canvas and go down the photo path.
// pdf.js is loaded from vendor/ (no CDN). The library object is passed in so the same code runs in tests.
import { wordsFromPdfItems } from './layout.js';

const MIN_TEXT_CHARS = 80;

/** Open a PDF from bytes. Returns { doc, pageCount }. */
export async function openPdf(pdfjs, bytes) {
  const task = pdfjs.getDocument({ data: bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true });
  const doc = await task.promise;
  return { doc, pageCount: doc.numPages };
}

/** Words of one page with positions (conf 100: the text is exact). */
export async function pageWords(doc, pageNumber) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return { words: wordsFromPdfItems(content.items, viewport.height), width: viewport.width, height: viewport.height };
}

/**
 * Read up to maxPages pages. Returns { pages: [{ words, hasText }], hasText } where hasText = enough real text to trust.
 */
export async function readPdfText(pdfjs, bytes, maxPages = 6) {
  const { doc, pageCount } = await openPdf(pdfjs, bytes);
  const pages = [];
  let chars = 0;
  for (let n = 1; n <= Math.min(pageCount, maxPages); n++) {
    const p = await pageWords(doc, n);
    chars += p.words.reduce((s, w) => s + w.text.length, 0);
    pages.push(p);
  }
  return { doc, pageCount, pages, hasText: chars >= MIN_TEXT_CHARS };
}

/** Draw a page to RGBA pixels (for scanned PDFs). createCanvas(w, h) is provided by the environment. */
export async function renderPdfPage(doc, pageNumber, createCanvas, targetWidth = 2000) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(4, targetWidth / base.width) });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  // pdf.js waits for the browser's animation frames; a hidden tab never gets them, so use plain timers while hidden
  const hidden = typeof document !== 'undefined' && document.hidden && typeof window !== 'undefined';
  const realFrame = hidden ? window.requestAnimationFrame : null;
  if (hidden) window.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
  try { await page.render({ canvasContext: context, viewport, canvas }).promise; }
  finally { if (hidden) window.requestAnimationFrame = realFrame; }
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: image.width, height: image.height, data: image.data };
}
