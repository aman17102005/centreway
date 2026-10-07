// QR code on the card: read it (jsQR, a free library copied into vendor/) and use any exam details inside.
// Most cards only hold an ID in the QR, so this often finds nothing. That is fine.
import { asciiLower, kmpFirst } from '../dsa/kmp.js';
import { tokenize, scanDates, scanTimes, scanPincode, normalizeText } from '../dsa/fieldScanner.js';

/** Try to read a QR code from an RGBA picture. Tries the full picture and a half-size copy. Returns the text or null. */
export function readQr(rgba, jsQR) {
  if (!jsQR) return null;
  try {
    let image = rgba;
    for (let attempt = 0; attempt < 3; attempt++) {
      const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
      if (found && found.data) return found.data;
      image = shrinkRgba(image);
      if (image.width < 150) break;
    }
  } catch { /* QR is optional */ }
  return null;
}

/** Half-size copy (average 2x2 blocks). */
function shrinkRgba(img) {
  const w = img.width >> 1; const h = img.height >> 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      const i = (2 * y * img.width + 2 * x) * 4 + c;
      out[(y * w + x) * 4 + c] = (img.data[i] + img.data[i + 4] + img.data[i + img.width * 4] + img.data[i + img.width * 4 + 4]) / 4;
    }
  }
  return { width: w, height: h, data: out };
}

/** Flatten JSON, a URL query or "key: value" lines into [key, value] pairs. */
function pairsFrom(text) {
  const pairs = [];
  const trimmed = text.trim();
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    try {
      const walk = (obj, prefix) => {
        if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) walk(obj[k], k);
        else pairs.push([prefix, String(obj)]);
      };
      walk(JSON.parse(trimmed), '');
      return pairs;
    } catch { /* not JSON: fall through */ }
  }
  const queryStart = trimmed.indexOf('?');
  const query = queryStart >= 0 ? trimmed.slice(queryStart + 1) : trimmed;
  for (const part of query.split(/[&;\n|]/)) {
    const eq = part.search(/[=:]/);
    if (eq > 0) pairs.push([part.slice(0, eq).trim(), decodeSafe(part.slice(eq + 1).trim())]);
  }
  return pairs;
}
const decodeSafe = (v) => { try { return decodeURIComponent(v.replace(/\+/g, ' ')); } catch { return v; } };

const has = (lowerKey, words) => words.some((w) => kmpFirst(lowerKey, w) >= 0);

/**
 * Details from a QR text. Returns a partial result like { examName, centreName, address, pincode, date, reportTime, gateTime, startTime, shift }
 * (plain strings; empty object when nothing useful). Candidate identity keys (name, roll, dob, id) are ignored on purpose.
 */
export function parseQrText(text) {
  const out = {};
  for (const [rawKey, rawValue] of pairsFrom(String(text || ''))) {
    const key = asciiLower(rawKey);
    const value = normalizeText(rawValue).trim();
    if (!value) continue;
    if (has(key, ['roll', 'name_of_candidate', 'candidate', 'dob', 'birth', 'father', 'mother', 'appl', 'regn', 'id', 'photo']) && !has(key, ['centre', 'center', 'venue', 'exam'])) continue;
    if (has(key, ['centre', 'center', 'venue']) && has(key, ['name'])) out.centreName = value;
    else if (has(key, ['address', 'addr'])) out.address = value;
    else if (has(key, ['centre', 'center', 'venue'])) out.centreName = out.centreName || value;
    else if (has(key, ['exam']) && has(key, ['name', 'title'])) out.examName = value;
    else if (has(key, ['pin'])) { const p = scanPincode(`pin ${value}`); if (p) out.pincode = p; }
    else if (has(key, ['date', 'dt'])) { const d = scanDates(tokenize(value)); if (d.length) out.date = d[0].iso; }
    else if (has(key, ['report'])) { const t = scanTimes(tokenize(value)); if (t.length) out.reportTime = t[0].hhmm; }
    else if (has(key, ['gate', 'closing'])) { const t = scanTimes(tokenize(value)); if (t.length) out.gateTime = t[0].hhmm; }
    else if (has(key, ['start', 'time', 'slot'])) { const t = scanTimes(tokenize(value)); if (t.length) out.startTime = t[0].hhmm; }
    else if (has(key, ['shift', 'session'])) out.shift = value.slice(0, 20);
  }
  return out;
}
