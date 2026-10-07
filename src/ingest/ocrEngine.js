// Text recognition (Tesseract.js, English + Hindi). It runs inside a Web Worker (Tesseract does that itself),
// so the screen never freezes. The Tesseract object is passed in, so the same code runs in the browser and in tests.
import { linesFromWordLines } from './layout.js';

/** Flatten Tesseract's blocks -> paragraphs -> lines -> words into one list of { text, conf, x0, y0, x1, y1 }. */
export function wordsFromBlocks(blocks) {
  const words = [];
  for (const block of blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []) for (const w of line.words || []) {
    words.push({ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
  }
  return words;
}

/** One list of words per Tesseract line. */
export function wordLinesFromBlocks(blocks) {
  const lines = [];
  for (const block of blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []) {
    lines.push((line.words || []).map((w) => ({ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 })));
  }
  return lines;
}

/**
 * options: { workerOptions } passed to createWorker (paths for the browser), { onProgress(status, 0..1) }.
 * Returns { recognize(image), detectOrientation(image), terminate() }.
 */
export function createOcrEngine(Tesseract, { workerOptions = {}, onProgress = () => {}, langs = ['eng', 'hin'] } = {}) {
  let main = null;
  let osd = null;
  const logger = (m) => onProgress(m.status, m.progress || 0);

  async function getMain() {
    if (!main) main = Tesseract.createWorker(langs, 1, { ...workerOptions, logger });
    return main;
  }

  return {
    /** image: whatever the environment gives (canvas in the browser, PNG bytes in Node). */
    async recognize(image) {
      const worker = await getMain();
      const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
      const words = wordsFromBlocks(data.blocks);
      const lines = linesFromWordLines(wordLinesFromBlocks(data.blocks));
      const confidence = words.length ? words.reduce((s, w) => s + w.conf * w.text.length, 0) / words.reduce((s, w) => s + w.text.length, 0) : 0;
      return { words, lines, text: lines.map((l) => l.text).join('\n'), confidence };
    },
    /** Download the English + Hindi language files now (they are kept by the browser), then free the memory again. */
    async warm() {
      await getMain();
      await this.terminate();
    },
    /** How many degrees clockwise must the picture be turned to be upright? 0, 90, 180 or 270 (null if unsure). */
    async detectOrientation(image) {
      try {
        if (!osd) osd = Tesseract.createWorker('osd', 0, { ...workerOptions, logger });
        const worker = await osd;
        const { data } = await worker.detect(image);
        if (!data || data.orientation_confidence < 2) return null;
        return data.orientation_degrees;
      } catch { return null; }
    },
    async terminate() {
      for (const w of [main, osd]) if (w) { try { await (await w).terminate(); } catch { /* ignore */ } }
      main = null; osd = null;
    },
  };
}
