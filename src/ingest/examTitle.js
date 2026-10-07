// The exam name, taken from the title area at the top of the card (never from the ministry / department header)
// and turned into the name people use, with the year and session:
//   "Joint Entrance Examination (Main) - 2026 Session 1"  ->  "JEE Main 2026 Session 1"
//   "Staff Selection Commission / Combined Graduate Level Examination, 2026 (Tier-I)"  ->  "SSC CGL 2026 Tier-I"
// Rules know the exam BODIES and the usual names of their exams (general knowledge, written once); anything else falls back to the
// title line itself. Nothing here comes from a sample card.
import { asciiLower } from '../dsa/kmp.js';
import { STATES, STATE_CODES, STATE_PSC } from './geoLists.js';

/** Header text that is NOT the exam name (who issued the card, what kind of paper it is). */
const NOT_THE_NAME = [
  'department of higher education', 'ministry of education', 'government of india', 'govt. of india', 'govt of india', 'national testing agency', 'department of personnel and training',
  'excellence in assessment', 'admit card - provisional', 'admit card-provisional', 'provisional admit card', 'e-admit card', 'e-call letter', 'admit card', 'admission card', 'hall ticket', 'call letter', 'provisional',
  'राष्ट्रीय परीक्षा एजेंसी', 'शिक्षा मंत्रालय', 'उच्च शिक्षा विभाग', 'भारत सरकार', 'प्रवेश पत्र', 'एडमिट कार्ड',
];

const YEAR = /\b(20[2-3]\d)\b/;
const SESSION = /\bsession\s*[-:–]?\s*(\d|iv|iii|ii|i)\b/i;
const TIER = /\b(tier|phase|stage)\s*[-:–]?\s*(iv|iii|ii|i|\d)\b/i;
const ROMAN = { i: '1', ii: '2', iii: '3', iv: '4' };

/** Remove the ministry / department / card-type words (and OCR rubbish around them) from one header line. */
export function withoutHeaderWords(text) {
  let out = ` ${text} `;
  for (const phrase of NOT_THE_NAME) {
    let at = asciiLower(out).indexOf(phrase);
    while (at >= 0 && /[a-z]/.test(phrase)) { out = out.slice(0, at) + ' ' + out.slice(at + phrase.length); at = asciiLower(out).indexOf(phrase); }
    if (!/[a-z]/.test(phrase)) out = out.split(phrase).join(' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** True when the text is only ministry / card-type words (so it is not an exam name). */
export function isHeaderOnly(text) {
  return withoutHeaderWords(text).replace(/[^A-Za-z0-9ऀ-ॿ]+/g, ' ').trim().length < 3;
}

/** A rule test: the long form in any case, or a short form (an abbreviation) only in capital letters ("so", "po", "je" are ordinary words). */
const rule = (long, ...abbr) => ({ test: (text) => long.test(text) || (abbr.length > 0 && new RegExp(`\\b(?:${abbr.join('|')})\\b`).test(text)) });
// ------------------------------------------------------------------ rules per exam body
/** [pattern, short name]: the first pattern that matches the title text decides. */
const SSC = [[rule(/combined\s+graduate\s+level/i, 'CGL'), 'CGL'], [rule(/combined\s+higher\s+secondary/i, 'CHSL'), 'CHSL'], [rule(/constable\s*\(?\s*gd\b|general\s+duty/i, 'GD'), 'GD'], [rule(/multi[\s-]*tasking/i, 'MTS'), 'MTS'],
  [rule(/junior\s+engineer/i, 'JE'), 'JE'], [/stenographer/i, 'Stenographer'], [rule(/sub[\s-]*inspector/i, 'CPO'), 'CPO'], [/selection\s+post/i, 'Selection Post']];
const RRB = [[/ntpc|non[\s-]*technical\s+popular/i, 'NTPC'], [/group[\s-]*d|level[\s-]*1\b/i, 'Group D'], [rule(/assistant\s+loco\s+pilot/i, 'ALP'), 'ALP'], [rule(/junior\s+engineer/i, 'JE'), 'JE'],
  [/section\s+controller/i, 'Section Controller'], [/paramedical/i, 'Paramedical'], [/technician/i, 'Technician']];
const IBPS = [[rule(/probationary\s+officer|\(po\//i, 'PO'), 'PO'], [/clerk/i, 'Clerk'], [rule(/regional\s+rural|office\s+assistant|officer\s+scale/i, 'RRBs?'), 'RRB'], [rule(/specialist\s+officer/i, 'SO'), 'SO']];
const SBI = [[rule(/probationary\s+officer/i, 'PO'), 'PO'], [/junior\s+associate|clerk|customer\s+support/i, 'Clerk'], [rule(/specialist\s+cadre/i, 'SO'), 'SO'], [rule(/circle\s+based\s+officer/i, 'CBO'), 'CBO']];
const UPSC = [[/civil\s+services/i, 'Civil Services'], [rule(/national\s+defence\s+academy/i, 'NDA'), 'NDA'], [rule(/combined\s+defence\s+services/i, 'CDS'), 'CDS'], [/engineering\s+services/i, 'ESE'],
  [rule(/central\s+armed\s+police/i, 'CAPF'), 'CAPF'], [/forest\s+service/i, 'Forest Service'], [/combined\s+medical/i, 'CMS'], [/geo[\s-]*scientist/i, 'Geoscientist']];
const NTA = [[/joint\s+entrance\s+exam(?:ination)?\s*[(\[]?\s*main|\bjee\s*[(\[]?\s*main/i, 'JEE Main'], [/joint\s+entrance\s+exam(?:ination)?\s*[(\[]?\s*advanced|\bjee\s*[(\[]?\s*advanced/i, 'JEE Advanced'],
  [/national\s+eligibility\s*(?:cum|-|&|and)?\s*entrance\s+test|\bneet\b/i, 'NEET'], [/common\s+university\s+entrance\s+test|\bcuet\b/i, 'CUET'], [/\bugc[\s-]*net\b|national\s+eligibility\s+test/i, 'UGC NET'],
  [/csir[\s-]*(ugc[\s-]*)?net/i, 'CSIR NET'], [rule(/graduate\s+aptitude\s+test/i, 'GATE'), 'GATE'], [rule(/common\s+admission\s+test/i, 'CAT'), 'CAT'], [rule(/common\s+law\s+admission/i, 'CLAT'), 'CLAT']];

const stageOf = (text) => { const m = /\b(prelim\w*|mains?)\b/i.exec(text); return m ? (/^prelim/i.test(m[1]) ? 'Prelims' : 'Mains') : ''; };
const pickRule = (rules, text) => { for (const [re, name] of rules) if (re.test(text)) return name; return ''; };
const stateIn = (lower) => STATES.filter((s) => s.length > 2 && s !== 'india').sort((a, b) => b.length - a.length).find((s) => lower.includes(s)) || '';

function yearAndSession(texts) {
  let year = ''; let session = ''; let tier = '';
  for (const t of texts) {
    if (!year) { const y = YEAR.exec(t); if (y) year = y[1]; }
    if (!session) { const s = SESSION.exec(t); if (s) session = ROMAN[s[1].toLowerCase()] || s[1]; }
    if (!tier) { const m = TIER.exec(t); if (m) tier = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}-${m[2].toUpperCase()}`; }
  }
  return { year, session, tier };
}

const compose = (parts, { year, session, tier }, withTier = false) => [...parts.filter(Boolean), withTier ? tier : '', year, session ? `Session ${session}` : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
const CLASS_NO = { x: '10', xi: '11', xii: '12', 10: '10', 11: '11', 12: '12', '10th': '10', '12th': '12' };

/**
 * Turn the text of a title area (several lines joined) into the common short name, or '' when no rule knows the exam.
 * `ctx` = { year, session, tier } read from the lines near the title.
 */
function nameFromBlob(blob, ctx) {
  const lower = asciiLower(blob);
  const L = ` ${lower} `;
  // 1) bodies that run one family of exams
  if (/institute\s+of\s+banking\s+personnel|\bibps\b/.test(L)) { const e = pickRule(IBPS, blob); return compose(['IBPS', e, stageOf(blob)], ctx); }
  if (/state\s+bank\s+of\s+india|\bsbi\b|junior\s+associates/.test(L)) { const e = pickRule(SBI, blob); return compose(['SBI', e, stageOf(blob)], ctx); }
  if (/staff\s+selection\s+commission|\bssc\b/.test(L)) { const e = pickRule(SSC, blob); if (e) return compose(['SSC', e], ctx, true); }
  if (/railway\s+recruitment|\brrb\b|\bcen\s+\d|indian\s+railways/.test(L)) { const e = pickRule(RRB, blob); const cbt = /\bcbt[\s-]*(\d|iv|iii|ii|i)\b/i.exec(blob); if (e) return compose(['RRB', e, cbt ? `CBT-${ROMAN[cbt[1].toLowerCase()] || cbt[1]}` : ''], ctx); }
  if (/union\s+public\s+service\s+commission|\bupsc\b/.test(L) || UPSC.slice(1).some(([re]) => re.test(blob))) { const e = pickRule(UPSC, blob); if (e) return compose(['UPSC', e], ctx); }
  // 2) well-known single exams
  const nta = pickRule(NTA, blob);
  if (nta) {
    const level = /\b(ug|pg)\b/i.exec(blob);
    return compose([nta, level && /^(NEET|CUET)$/.test(nta) ? level[1].toUpperCase() : ''], ctx);
  }
  // 3) State Public Service Commission and state police boards: the state's own short name
  const state = stateIn(lower);
  if (/public\s+service\s+commission|\bpsc\b/.test(L) && state) {
    // the exam name is the title-like line next to the commission's name (never a status bar, a file name or a table row)
    const lines = blob.split('\n').map((l) => l.trim());
    const titleLine = lines.find((l) => /exam|recruitment|services|engineer|officer|assistant|inspector/i.test(l) && !/public\s+service\s+commission/i.test(l) && looksLikeTitle(l)) || '';
    const rest = titleLine.replace(/\b(examination|exam|recruitment)\b/gi, ' ').replace(/\([^)]*\)/g, ' ').replace(YEAR, ' ').replace(/[-:,]+/g, ' ').replace(/\s+/g, ' ').trim();
    return compose([STATE_PSC[state] || 'PSC', rest.slice(0, 60)], ctx);
  }
  if (/\bpolice\b/.test(L) && state && STATE_CODES[state]) {
    const role = /head\s+constable/.test(L) ? 'Head Constable' : /constable/.test(L) ? 'Constable' : /sub[\s-]*inspector|\bsi\b/.test(L) ? 'Sub Inspector' : /\bsepoy|fireman|driver|jail\s+warder/.test(L) ? '' : '';
    if (role) return compose([STATE_CODES[state], 'Police', role], ctx);
  }
  // 4) school boards: "CBSE Class 12 2026", "UP Board Class 10 2026"
  const cls = /\bclass[\s-]*(xii|xi|x|12|11|10)\b|\b(10th|12th)\b/i.exec(blob);
  if (cls && /board|cbse|icse|cisce|certificate\s+examination|school\s+examination/.test(L)) {
    const no = CLASS_NO[(cls[1] || cls[2]).toLowerCase()];
    if (/central\s+board\s+of\s+secondary|\bcbse\b/.test(L)) return compose(['CBSE', `Class ${no}`], ctx);
    if (/\bicse\b|\bcisce\b|indian\s+certificate/.test(L)) return compose(['ICSE', `Class ${no}`], ctx);
    const st = state ? STATE_CODES[state] : '';
    return compose([st, 'Board', `Class ${no}`], ctx);
  }
  // 5) an abbreviation printed in brackets: "Teacher Eligibility Test (XYZTET) 2026"
  const abbr = [...blob.matchAll(/\(\s*([A-Z][A-Z0-9&.-]{2,9})\s*\)/g)].map((m) => m[1]).find((a) => !['PWD', 'IST', 'CBT', 'MAIN', 'OBC', 'GEN', 'SC', 'ST', 'EWS'].includes(a.replace(/[-\d]+$/, '')));
  if (abbr) return compose([abbr.replace(/[.]/g, '')], ctx);
  const cap = /\b([A-Z]{2,6}TET|[A-Z]{3,6}\s?NET)\b/.exec(blob);
  if (cap) return compose([cap[1]], ctx);
  return '';
}

/**
 * Shorten a name that is already known (for example one read from an "Exam Name:" label). Unknown names are returned as they are.
 */
export function shortenExamName(name) {
  const text = String(name || '').replace(/\s+/g, ' ').trim();
  if (!text) return text;
  const short = nameFromBlob(text, yearAndSession([text]));
  return short || text;
}

/** Looks like a title and not like a table row, a file name or OCR rubbish. */
function looksLikeTitle(text) {
  const t = text.trim();
  if (t.length < 6 || t.length > 110 || t.split(/\s+/).length > 16) return false;
  if (/\d{5,}|[:@_|]|\.pdf|\.jpe?g|\.png/i.test(t)) return false;
  const letters = t.replace(/[^A-Za-zऀ-ॿ]/g, '').length;
  return letters / t.replace(/\s/g, '').length >= 0.55;
}
const TITLE_WORDS = /exam|test|recruitment|entrance|eligibility|selection|admission|certificate|semester|annual|supplementary|\bpaper\b|counselling|परीक्षा|भर्ती/i;
// a line that is clearly a form field or a candidate detail is never part of the title
const FIELD_LINE = /roll\s*(no|number)|application\s*(no|number)|candidate|father|date\s*of\s*birth|\bdob\b|centre|center|venue|reporting|gate|\bshift\b|photograph|signature/i;

/**
 * Find the exam name in the top part of the card. `lines` = text lines from the top (several readings may be given together).
 * Returns { value, source } or null.
 */
export function findExamTitle(lines) {
  const cleaned = lines.map((l) => withoutHeaderWords(l)).filter((l) => l.length >= 3);
  // the title area ends where the form fields start
  let end = cleaned.findIndex((l, i) => i > 0 && FIELD_LINE.test(l) && !YEAR.test(l));
  if (end < 0) end = Math.min(cleaned.length, 16);
  const area = cleaned.slice(0, Math.min(Math.max(end, 3), 16));
  const ctx = yearAndSession(area);
  // a rule that knows the exam (looked at over the whole title area, so a title broken over several lines still matches)
  const blob = area.join('\n');
  const known = nameFromBlob(blob, ctx);
  if (known && known.replace(/[^A-Za-z]/g, '').length >= 3) return { value: known, source: 'title' };
  // otherwise the best title-like line: it names an exam (exam words, a year) and is not the body's own name ("... Board", "... Commission")
  let best = null;
  for (let i = 0; i < area.length; i++) {
    const line = area[i];
    if (!looksLikeTitle(line) || !TITLE_WORDS.test(line) || FIELD_LINE.test(line)) continue;
    let score = 1;
    if (/exam|test|\u092a\u0930\u0940\u0915\u094d\u0937\u093e/i.test(line)) score += 2;
    if (YEAR.test(line)) score += 1;
    if (/\b(board|commission|agency|authority|department|ministry|council|university)\b|\u092c\u094b\u0930\u094d\u0921|\u0906\u092f\u094b\u0917|\u090f\u091c\u0947\u0902\u0938\u0940/i.test(line) && !/exam|\u092a\u0930\u0940\u0915\u094d\u0937\u093e/i.test(line)) score -= 2;
    if (!best || score > best.score) best = { score, i, line };
  }
  if (best) {
    let name = best.line;
    const next = area[best.i + 1];
    if (next && next.length <= 40 && !FIELD_LINE.test(next) && /^[(\[]|^(tier|phase|session|stage|class|paper|cbt)\b/i.test(next)) name = `${name} ${next}`;
    return { value: name.replace(/\s+/g, ' ').replace(/[\s,;:-]+$/, ''), source: 'title' };
  }
  return null;
}
