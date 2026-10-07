// Reads the card in three ways and keeps the best answer for each group of fields:
//   1. table reader with the real ruling lines of the table (grid)       2. table reader with cells made from word gaps
//   3. the line reader (the original reader)
// A known layout (NTA, SSC, RRB, IBPS, UPSC, state boards) is picked from words on the card and gives exact label names.
import { extractExamFields } from './examFields.js';
import { detectTemplate } from './templates.js';
import { detectGrid, buildCells, fillCells, gapCells, eraseGridLines, addFaintLines } from './grid.js';
import { toGrey, adaptiveBinarize } from './pixels.js';

/** How trustworthy is a group of fields? Sum of confidences. */
const sumConf = (fields) => fields.reduce((s, f) => s + (f && f.value ? f.confidence : 0), 0);
const centreFields = (r) => [r.centreName, r.address, r.city, r.pincode];
/** Trust in a reading's centre group: field confidences, plus a code found, minus signs of a wrongly cut value (label words as the name, a stray "@"). */
function centreScore(r) {
  let score = sumConf(centreFields(r));
  if (r.centreCode && r.centreCode.value) score += 0.5;
  if (/\b(code|name and|address|venue|centre|center)\s*(,|and|$)/i.test(r.centreName.value) && r.centreName.value.split(' ').length <= 4) score -= 2;
  if (/[@]|\b(photo id|aadhaar|date of issue)\b/i.test(r.address.value)) score -= 1;
  return score;
}
const dayFields = (d) => [d.date, d.reportTime, d.gateTime, d.startTime, d.endTime, d.shift];

/** Table made from the picture's ruling lines. bw = black-and-white picture (0 = ink), words in the same coordinates (scaled by `scale`). */
export function tableFromGrid(bw, words, scale = 1) {
  const cells = buildCells(detectGrid(bw));
  if (!cells.length) return null;
  const scaled = cells.map((c) => ({ x0: c.x0 / scale, y0: c.y0 / scale, x1: c.x1 / scale, y1: c.y1 / scale }));
  return { source: 'grid', ...fillCells(scaled, words) };
}

/** Picture (RGBA, e.g. a rendered PDF page) -> table, or null. */
export function tableFromRgba(rgba, words, scale = 1) {
  return tableFromGrid(adaptiveBinarize(toGrey(rgba), 0, 0.15), words, scale);
}

/** Merge several readings of the same card. The first one wins ties. */
export function mergeBest(results) {
  const best = { ...results[0] };
  let top = results[0];
  // exam name
  for (const r of results) if (r.examName.confidence > best.examName.confidence) best.examName = r.examName;
  // the centre group: name, address, city, pincode must come from the same reading
  let centreBest = results[0];
  for (const r of results) if (centreScore(r) > centreScore(centreBest)) centreBest = r;
  best.centreName = centreBest.centreName; best.centreCode = centreBest.centreCode; best.address = centreBest.address; best.city = centreBest.city; best.pincode = centreBest.pincode;
  // the days: take the reading with the most trusted day fields; fill single gaps from the others when the days line up
  let daysBest = results[0];
  const dayScore = (r) => r.days.reduce((s, d) => s + sumConf(dayFields(d)), 0) + 0.01 * r.days.length;
  for (const r of results) if (dayScore(r) > dayScore(daysBest)) daysBest = r;
  best.days = daysBest.days.map((d, i) => {
    const merged = { ...d };
    for (const r of results) {
      if (r === daysBest || r.days.length !== daysBest.days.length || r.days[i].date.value !== d.date.value) continue;
      for (const key of ['reportTime', 'gateTime', 'startTime', 'endTime', 'shift']) if (!merged[key].value && r.days[i][key].value) merged[key] = r.days[i][key];
    }
    return merged;
  });
  best.isTimetable = daysBest.isTimetable;
  best.notAllowed = results.map((r) => r.notAllowed).sort((a, b) => b.length - a.length)[0];
  best.instructions = results.map((r) => r.instructions || []).sort((a, b) => b.length - a.length)[0];
  for (const r of results) if (r.aiText && !best.aiText) best.aiText = r.aiText;
  void top;
  return best;
}

/**
 * lines: layout lines. options: { words (OCR words), bw (black-and-white picture for the grid), scale, sourceConf, keepAiText, table (already made) }.
 * Returns { result, how } where how says which readers were used.
 */
export function extractBest(lines, { words = null, bw = null, scale = 1, sourceConf, keepAiText = false, table = null, headerLines = [] } = {}) {
  const text = lines.map((l) => l.text).join('\n');
  const template = detectTemplate(text);
  const common = { sourceConf, keepAiText, template, headerLines };
  const results = []; const how = [];
  let grid = table;
  if (!grid && bw && words) grid = tableFromGrid(bw, words, scale);
  if (grid) { results.push(extractExamFields(lines, { ...common, table: grid })); how.push('grid'); }
  else {
    const cells = gapCells(lines);
    if (cells.length >= 4) { results.push(extractExamFields(lines, { ...common, table: { source: 'gaps', cells } })); how.push('gaps'); }
  }
  results.push(extractExamFields(lines, common)); how.push('lines');
  return { result: results.length > 1 ? mergeBest(results) : results[0], how: how.join('+'), template: template ? template.id : '' };
}

/**
 * Before OCR: find the table in the picture. Returns { grey, cells, grid } where `grey` is the picture without its ruling lines
 * (better for OCR) and `cells` the table cells; if there is no table, grey is unchanged and cells is [].
 */
export function prepareTable(grey) {
  const bw = addFaintLines(grey, adaptiveBinarize(grey, 0, 0.15));
  const grid = detectGrid(bw);
  const cells = buildCells(grid);
  if (!cells.length) return { grey, cells: [], grid };
  return { grey: eraseGridLines(grey, grid), cells, grid };
}
