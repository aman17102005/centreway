// Reads an admit card (photo, screenshot or PDF) and returns every detail we need. No typing by the user.
// Everything happens on the phone: the picture and its text are never sent anywhere.
//
// env (the part that differs between the browser and tests):
//   decodeImage(bytes) -> RGBA picture      toEngineImage(grey) -> image for Tesseract
//   getOcr() -> OCR engine                   getPdfjs() -> pdf.js          createCanvas(w, h)       jsQR
import { rotateQuarterTurns, toGrey, resizeGrey } from './pixels.js';
import { preprocessVariants, enlargedVariant } from './preprocess.js';
import { makeField } from './examFields.js';
import { extractBest, tableFromRgba, prepareTable } from './extractBest.js';
import { fillCells } from './grid.js';
import { readCells, readHeader } from './cellOcr.js';
import { readPdfText, renderPdfPage } from './pdfText.js';
import { readQr, parseQrText } from './qr.js';
import { buildLines } from './layout.js';
import { validateResult } from './validate.js';
import { applyAutoFixes } from '../logic/places.js';

const isPdf = (bytes, type) => type === 'application/pdf' || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);

/**
 * How complete is a result? facts = the 4 key facts (date, a time, address/centre, pincode) found with at least medium confidence.
 * extra = other useful fields found. A result is "good" when all 4 facts are there and the OCR is confident.
 */
export function scoreResult(result, ocrConfidence = 100) {
  const day = result.days[0];
  const facts4 = [
    day && day.date,
    day && [day.reportTime, day.gateTime, day.startTime].find((f) => f.value) ,
    result.address.value ? result.address : result.centreName,
    result.pincode,
  ];
  let facts = 0; let partial = 0;
  for (const f of facts4) {
    if (!f || !f.value) continue;
    if (f.level !== 'low') facts++; else partial++;   // a low-confidence value still counts a little
  }
  let extra = 0;
  if (day) for (const f of [day.reportTime, day.gateTime, day.startTime, day.endTime]) if (f.value) extra++;
  for (const f of [result.examName, result.centreName, result.address, result.city]) if (f.value) extra++;
  if (result.notAllowed.length) extra++;
  const score = facts * 20 + partial * 8 + extra * 4 + Math.min(10, ocrConfidence / 10) - result.issues.length * 3;
  const good = facts >= 4 && ocrConfidence >= 80 && extra >= 6;
  return { facts, extra, score, good, excellent: good && result.issues.length === 0 };
}

/** Fill gaps with what the QR code said (only for empty or low-confidence fields). */
function mergeQr(result, qr) {
  if (!qr) return;
  const use = (field, value, source = 'qr') => { if (value && (!field.value || field.level === 'low')) Object.assign(field, makeField(value, { base: 0.95, source })); };
  use(result.examName, qr.examName); use(result.centreName, qr.centreName); use(result.address, qr.address); use(result.pincode, qr.pincode);
  const day = result.days[0];
  if (day) { use(day.date, qr.date); use(day.reportTime, qr.reportTime); use(day.gateTime, qr.gateTime); use(day.startTime, qr.startTime); use(day.shift, qr.shift); }
}

/**
 * The table of a picture: cells with their text. Each cell is read on its own (best); if that gives nothing,
 * the words of the whole-page read are put into the cells instead.
 */
async function tableFrom(prepared, greyWithLines, pageOcr, engine, env) {
  if (!prepared.cells.length) return null;
  const cut = pageOcr.lines.find((l) => l.y0 > greyWithLines.height * 0.3 && /self[\s-]*declaration|undertaking|important\s+instructions/i.test(l.text));
  const cellWords = await readCells(greyWithLines, prepared.cells, engine, env, { maxY: cut ? cut.y0 - 4 : Infinity });
  return { source: 'grid', ...fillCells(prepared.cells, cellWords.length ? cellWords : pageOcr.words) };
}

/**
 * How sure is the reading? With a table, the cells that hold text count (a photo or QR box gives junk that would pull the
 * whole-page number down); otherwise the page number.
 */
function readingConfidence(table, pageOcr) {
  if (!table) return pageOcr.confidence;
  const good = table.cells.filter((c) => c.text && c.text.replace(/[^A-Za-z0-9]/g, '').length >= 4 && c.conf >= 40);
  if (good.length < 4) return pageOcr.confidence;
  return Math.max(pageOcr.confidence, good.reduce((n, c) => n + c.conf, 0) / good.length);
}

/** Where the title area ends: the top of the first table cell (or the top fifth of the picture when there is no table). */
function headerBottom(prepared, grey) {
  if (prepared.cells.length) return Math.min(...prepared.cells.map((c) => c.y0)) - 4;
  return Math.round(grey.height * 0.2);
}

/** One picture -> best result. Tries cleaned versions (and a turned picture if the tries are poor); stops early when the result is complete. */
async function readImagePath(rgba, env, report, now = new Date(), keepAiText = false) {
  const engine = await env.getOcr();
  let best = null;
  let quarterTurns = 0;
  for (let round = 0; round < 2; round++) {
    const variants = preprocessVariants(rgba, { quarterTurns });
    for (let v = 0; v < variants.length; v++) {
      report('Reading your admit card…', (round * 3 + v) / 6);
      const prepared = prepareTable(variants[v].grey);                       // table lines found, and removed before reading
      const ocr = await engine.recognize(env.toEngineImage(prepared.grey));
      const table = await tableFrom(prepared, variants[v].grey, ocr, engine, env);
      const headerLines = await readHeader(variants[v].grey, headerBottom(prepared, variants[v].grey), engine, env);
      const { result, how } = extractBest(ocr.lines, { table, keepAiText, headerLines });
      validateResult(result, { now });
      const conf = readingConfidence(table, ocr);
      const s = scoreResult(result, conf);
      if (!best || s.score > best.score) best = { result, ocr: { ...ocr, confidence: conf }, score: s.score, variant: variants[v].name, quarterTurns, good: s.good, how };
      if (s.excellent || (v >= 1 && best.good)) break;
    }
    if (!best.good) {
      // still poor: try a bigger, sharper copy (blurry photos, small Hindi text)
      const big = enlargedVariant(variants[0].grey);
      report('Reading your admit card…', (round * 3 + 2.5) / 6);
      const preparedBig = prepareTable(big.grey);
      const ocr = await engine.recognize(env.toEngineImage(preparedBig.grey));
      const tableBig = await tableFrom(preparedBig, big.grey, ocr, engine, env);
      const headerLines = await readHeader(big.grey, headerBottom(preparedBig, big.grey), engine, env);
      const { result, how } = extractBest(ocr.lines, { table: tableBig, keepAiText, headerLines });
      validateResult(result, { now });
      const conf = readingConfidence(tableBig, ocr);
      const s = scoreResult(result, conf);
      if (s.score > best.score) best = { result, ocr: { ...ocr, confidence: conf }, score: s.score, variant: big.name, quarterTurns, good: s.good, how };
    }
    if (best.good || round === 1) break;
    // poor result: maybe the picture is sideways or upside down
    const small = resizeGrey(toGrey(rgba), 1000, (1000 * rgba.height) / rgba.width);
    const degrees = await engine.detectOrientation(env.toEngineImage(small));
    if (!degrees) break;
    quarterTurns = degrees / 90;
  }
  return best;
}

/**
 * input: { bytes: Uint8Array, type }. Returns { result, ocrConfidence, source, variant, qr, pages }.
 * Throws an Error with a readable message if nothing could be read.
 */
export async function readAdmitCard(input, env, { onProgress = () => {}, now = new Date(), placeIndex = null, keepAiText = false } = {}) {
  const report = (text, fraction) => onProgress({ stage: 'reading', text, fraction });
  const { bytes, type } = input;
  let result; let ocrConfidence = 100; let source; let variant = ''; let qr = null;

  if (isPdf(bytes, type)) {
    const pdfjs = await env.getPdfjs();
    report('Reading your admit card…', 0.1);
    const pdf = await readPdfText(pdfjs, bytes);
    if (pdf.hasText) {
      // real text inside the PDF: read it directly (exact, no OCR)
      const lines = [];
      pdf.pages.forEach((p, i) => { for (const l of buildLines(p.words.map((w) => ({ ...w, y0: w.y0 + i * 100000, y1: w.y1 + i * 100000 })))) lines.push(l); });
      // the first page as a picture: for the QR code and for the table lines (cells), which pdf.js text does not give
      let table = null;
      try {
        const page = await renderPdfPage(pdf.doc, 1, env.createCanvas, 1400);
        qr = parseQrText(readQr(page, env.jsQR));
        table = tableFromRgba(page, pdf.pages[0].words, page.width / pdf.pages[0].width);
      } catch { /* the picture is optional: the line reader still works */ }
      result = extractBest(lines, { table, sourceConf: 100, keepAiText }).result;
      source = 'pdf-text';
      // Hindi text inside PDFs is often stored in a scrambled order, so cross-check with OCR of the page picture
      const hasHindi = lines.some((l) => /[\u0900-\u097f]/.test(l.text));
      if (hasHindi || scoreResult(result).facts < 4) {
        try {
          const page = await renderPdfPage(pdf.doc, 1, env.createCanvas, 2000);
          const ocrBest = await readImagePath(page, env, report, now, keepAiText);
          if (ocrBest.score > scoreResult(result).score || (hasHindi && ocrBest.score >= scoreResult(result).score)) {
            result = ocrBest.result; source = 'pdf-text+ocr'; ocrConfidence = ocrBest.ocr.confidence; variant = ocrBest.variant;
          }
        } catch { /* keep the text result */ }
      }
    } else {
      // scanned PDF: draw each page and read it like a photo
      source = 'pdf-image';
      const pages = [];
      for (let n = 1; n <= Math.min(pdf.pageCount, 3); n++) {
        const page = await renderPdfPage(pdf.doc, n, env.createCanvas, 2000);
        if (n === 1) qr = parseQrText(readQr(page, env.jsQR));
        pages.push(await readImagePath(page, env, report, now, keepAiText));
      }
      const bestPage = pages.reduce((a, b) => (a.score >= b.score ? a : b));
      result = bestPage.result; ocrConfidence = bestPage.ocr.confidence; variant = bestPage.variant;
    }
  } else {
    source = 'image';
    report('Reading your admit card…', 0.05);
    const rgba = await env.decodeImage(bytes);
    const qrText = readQr(rgba, env.jsQR);
    qr = qrText ? parseQrText(qrText) : null;
    const best = await readImagePath(rgba, env, report, now, keepAiText);
    result = best.result; ocrConfidence = best.ocr.confidence; variant = best.variant;
  }

  mergeQr(result, qr);
  applyAutoFixes(result, placeIndex);
  validateResult(result, { now });
  const found = result.days.some((d) => d.date.value) || result.address.value || result.centreName.value || result.pincode.value;
  if (!found) {
    const error = new Error('Could not read details from this file');
    error.code = 'nothing-found';
    throw error;
  }
  return { result, ocrConfidence, source, variant, qr };
}
