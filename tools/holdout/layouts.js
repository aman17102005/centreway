// The card layouts. Each one takes the same facts (the spec) and draws them in a different style: bordered tables, header-row tables,
// tables without lines, plain text, two columns, stacked boxes, sections and timetables. Random choices (wording, field order,
// fonts, sizes, line thickness, colours) come from the seeded random generator.
import { Page, FAMILY_NAMES } from './page.js';
import { fmtDate, fmtTime, fmtRange, pickLabels, printedAddress } from './spec.js';
import { HINDI_STATE } from './data.js';

const pick = (rng, list) => list[rng.int(0, list.length - 1)];
const shuffle = (rng, list) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ROMAN = ['', 'I', 'II', 'III'];
export const LAYOUT_NAMES = ['grid2', 'grid4', 'headrow', 'noline2', 'plain', 'twocol', 'stacked', 'sections', 'timetable'];

/** The facts of one card as printed text. */
function facts(rng, spec, labels, address) {
  const d0 = spec.days[0];
  const dateOf = (iso) => fmtDate(iso, spec.dateStyle);
  const range = (d) => fmtRange(d.start, d.end, spec.timeStyle, spec.rangeSep);
  const shiftForms = [`Shift ${d0.shift}`, `Shift-${ROMAN[Number(d0.shift)] || d0.shift}`, `${d0.shift}`];
  const shiftValue = d0.shift ? (spec.lang === 'hi' ? `पाली ${d0.shift}` : pick(rng, shiftForms)) : '';
  const name = spec.hindi && spec.centre.nameHi ? spec.centre.nameHi : spec.centre.name;
  const fullName = spec.centre.second && !spec.hindi ? `${name}, ${spec.centre.second}` : name;
  const code = spec.centreCode;
  const mode = spec.centreStyle === 'codeNameAddr' ? (rng.next() < 0.8 ? 'combined' : 'split') : (rng.next() < 0.7 ? 'nameFirst' : 'split');
  const centre = { mode, name: fullName, code, address };
  centre.combinedText = mode === 'combined' ? `${code ? `${code} - ` : ''}${fullName}, ${address}` : '';
  const exam = [];
  if (!spec.timetable) {
    exam.push({ key: 'date', label: labels.date, value: dateOf(d0.date) });
    exam.push({ key: 'time', label: labels.time, value: range(d0) });
    if (shiftValue) exam.push({ key: 'shift', label: labels.shift, value: shiftValue });
  }
  if (spec.printReport) exam.push({ key: 'report', label: labels.report, value: fmtTime(d0.report, spec.timeStyle) });
  if (spec.printGate && d0.gate) exam.push({ key: 'gate', label: labels.gate, value: fmtTime(d0.gate, spec.timeStyle) });
  const cand = [
    { key: 'roll', label: labels.roll, value: spec.candidate.roll }, { key: 'name', label: labels.name, value: spec.candidate.name },
    { key: 'father', label: labels.father, value: spec.candidate.father }, { key: 'dob', label: labels.dob, value: spec.candidate.dob },
  ];
  return { exam: shuffle(rng, exam), cand: shuffle(rng, cand).slice(0, rng.int(2, 4)), centre, d0, dateOf, range, labels };
}

/** The centre as rows { label, lines } depending on its mode. `w` = width available for the value. */
function centreRows(P, F, spec, labels, w, size) {
  const c = F.centre;
  if (c.mode === 'none') return [];
  if (c.mode === 'combined') return [{ key: 'centre', label: labels.centre, lines: P.wrap(c.combinedText, w, size) }];
  if (c.mode === 'nameFirst') return [{ key: 'centre', label: labels.centre, lines: [...P.wrap(c.code ? `${c.code} - ${c.name}` : c.name, w, size, true), ...P.wrap(c.address, w, size)] }];
  return [
    { key: 'centreName', label: labels.centreName, lines: P.wrap(c.code ? `${c.code} - ${c.name}` : c.name, w, size) },
    { key: 'centreAddr', label: labels.centreAddr, lines: P.wrap(c.address, w, size) },
  ];
}

// ------------------------------------------------------------------ header, footer and decoys
function header(P, spec, rng, st) {
  const W = P.width; let y = 28;
  const logoColor = pick(rng, ['#1f4e9c', '#a33', '#2a7a3b', '#6a3d9a', '#c26a00']);
  const logoSide = pick(rng, ['l', 'r', 'none']);
  if (logoSide !== 'none') {
    const lx = logoSide === 'l' ? 40 : W - 90;
    if (rng.next() < 0.5) P.circle(lx + 22, y + 20, 22, { stroke: logoColor, fill: logoColor }); else P.rect(lx, y - 2, 44, 44, { stroke: logoColor, fill: logoColor });
    P.text(lx + 22, y + 26, spec.bodyName.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase(), { size: 13, bold: true, color: '#fff', align: 'c' });
  }
  const bodyName = spec.lang === 'hi' && spec.bodyHindi ? spec.bodyHindi : spec.bodyName;
  const cx = W / 2;
  if (spec.bodyHead.length && rng.next() < 0.6) P.text(cx, y + 6, spec.bodyHead.join(' | '), { size: P.base * 0.85, color: '#444', align: 'c' });
  y += 24;
  P.text(cx, y, bodyName, { size: P.base * 1.5, bold: true, color: st.accent, align: 'c' }); y += P.base * 1.9;
  if (spec.stateBoard) { P.text(cx, y, spec.stateBoard, { size: P.base * 1.1, bold: true, align: 'c' }); y += P.base * 1.5; }
  for (const line of spec.titleLines) for (const part of P.wrap(line, W * 0.58, P.base * 1.15, true)) { P.text(cx, y, part, { size: P.base * 1.15, bold: rng.next() < 0.6, align: 'c' }); y += P.base * 1.5; }
  const card = pick(rng, ['Admit Card', 'E-Admit Card', 'Admit Card - Provisional', 'Hall Ticket', 'Call Letter', 'e-Call Letter']);
  P.text(cx, y + 2, spec.lang === 'hi' ? 'प्रवेश पत्र' : card, { size: P.base * 1.2, bold: true, align: 'c', color: '#222' }); y += P.base * 2;
  if (rng.next() < 0.3) P.text(cx, P.height * 0.5, 'ADMIT CARD', { size: P.base * 6, bold: true, color: '#d8d8d8', align: 'c', angle: -30, alpha: 0.5 });
  return y + 6;
}

function side(P, spec, rng, x, y, w) {
  const h = w * 1.2;
  P.photo(x, y, w, h, pick(rng, ['#c9a98a', '#b08968', '#d7b899']));
  P.rect(x, y, w, h, { stroke: '#555' });
  y += h + 8;
  P.rect(x, y, w, w * 0.4, { stroke: '#777' }); P.scribble(x + 6, y + 6, w - 12, w * 0.4 - 12, '#223'); P.text(x + w / 2, y + w * 0.4 + 12, 'Signature', { size: P.base * 0.75, align: 'c' });
  y += w * 0.4 + 20;
  if (rng.next() < 0.6) { P.qr(x, y, w, `${spec.candidate.app}|${spec.candidate.roll}`); y += w + 6; }
  return y;
}

function footer(P, spec, rng, y, st) {
  const W = P.width; const left = st.margin; const inner = W - 2 * left;
  P.text(left, y + 8, `${spec.lang === 'hi' ? 'जारी करने की तिथि' : pick(rng, ['Date of Issue', 'Issued on', 'Downloaded on', 'Generated on'])}: ${spec.issueDate}`, { size: P.base * 0.9 }); y += 26;
  // self declaration with the candidate's HOME address (another pincode): must never be used
  if (rng.next() < 0.7) {
    P.text(left, y + 14, spec.lang === 'hi' ? 'स्व-घोषणा' : pick(rng, ['SELF DECLARATION (UNDERTAKING)', 'Self Declaration', 'Undertaking by the Candidate']), { size: P.base, bold: true, color: '#a22' }); y += 24;
    const home = `I, ${spec.candidate.name}, resident of H.No. ${rng.int(2, 99)}, Demo Colony, ${spec.homeCity}, ${spec.city.state} ${spec.homePin}, do hereby declare that the information given by me is true.`;
    for (const l of P.wrap(home, inner, P.base * 0.85)) { P.text(left, y, l, { size: P.base * 0.85 }); y += P.base * 1.2; }
    y += 8;
  }
  const items = spec.notAllowed.join(', ');
  const hi = spec.lang === 'hi';
  P.text(left, y + 12, hi ? 'महत्वपूर्ण निर्देश' : pick(rng, ['Important Instructions', 'Instructions to the Candidates', 'General Instructions']), { size: P.base, bold: true }); y += 24;
  const lines = hi
    ? ['1. परीक्षा केंद्र पर प्रवेश पत्र और मूल फोटो पहचान पत्र लाना अनिवार्य है।', `2. ${items} परीक्षा केंद्र में लाना मना है।`, '3. रिपोर्टिंग समय से एक घंटा पहले केंद्र पर पहुंचें।']
    : ['1. Candidates must carry a printout of this admit card and a valid photo ID.', `2. Candidates will not be allowed to carry ${items} into the examination hall.`,
      '3. Reach the centre at least one hour before the reporting time. Entry will not be permitted after the gate closes.', '4. Follow all instructions given at the examination centre.'];
  for (const l of lines) for (const w of P.wrap(l, inner, P.base * 0.85)) { P.text(left, y, w, { size: P.base * 0.85 }); y += P.base * 1.25; }
  return y + 10;
}

// ------------------------------------------------------------------ table toolkit
/** Draw rows of cells. rows: [[{lines, bold, span, shade, center}]]; colW: widths. Returns the new y. */
function table(P, x, y, colW, rows, st, { lines = true } = {}) {
  const size = st.size; const lh = size * 1.3; const padX = 6; const padY = 5;
  for (const row of rows) {
    let col = 0; const cells = [];
    for (const cell of row) {
      const span = cell.span || 1; const w = colW.slice(col, col + span).reduce((a, b) => a + b, 0);
      cells.push({ cell, x: x + colW.slice(0, col).reduce((a, b) => a + b, 0), w });
      col += span;
    }
    const h = Math.max(...cells.map((c) => (c.cell.lines || []).length), 1) * lh + 2 * padY;
    for (const { cell, x: cx, w } of cells) {
      if (cell.shade) P.rect(cx, y, w, h, { stroke: lines ? st.lineColor : cell.shade, fill: cell.shade, lw: st.lw });
      else if (lines) P.rect(cx, y, w, h, { stroke: st.lineColor, lw: st.lw });
      const ls = cell.lines || [];
      const total = ls.length * lh; let ty = y + (cell.top ? padY : (h - total) / 2) + size;
      for (const l of ls) {
        if (cell.center) P.text(cx + w / 2, ty - 2, l, { size, bold: cell.bold, align: 'c', color: st.ink }); else P.text(cx + padX, ty - 2, l, { size, bold: cell.bold, color: st.ink });
        ty += lh;
      }
    }
    y += h;
  }
  return y;
}
const L = (st, lines, extra = {}) => ({ lines, bold: true, ...extra });
const V = (lines, extra = {}) => ({ lines, bold: false, ...extra });

// ------------------------------------------------------------------ layouts
function layoutGrid2(P, spec, F, rng, st, y) {
  const inner = P.width - 2 * st.margin; const lw = inner * pick(rng, [0.32, 0.38, 0.42]); const colW = [lw, inner - lw];
  const rows = [];
  for (const c of F.cand) rows.push([L(st, P.wrap(c.label, lw - 12, st.size, true)), V([c.value])]);
  for (const e of F.exam) rows.push([L(st, P.wrap(e.label, lw - 12, st.size, true)), V([e.value])]);
  for (const r of centreRows(P, F, spec, F.labels, inner - lw - 12, st.size)) rows.push([L(st, P.wrap(r.label, lw - 12, st.size, true)), V(r.lines)]);
  return table(P, st.margin, y, colW, rows, st);
}

function layoutGrid4(P, spec, F, rng, st, y) {
  const inner = P.width - 2 * st.margin; const q = inner / 4; const colW = [q * 0.9, q * 1.1, q * 0.9, q * 1.1];
  const rows = [];
  const pairs = [...F.cand, ...F.exam];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i]; const b = pairs[i + 1];
    const row = [L(st, P.wrap(a.label, colW[0] - 12, st.size, true)), V(P.wrap(a.value, colW[1] - 12, st.size))];
    if (b) row.push(L(st, P.wrap(b.label, colW[2] - 12, st.size, true)), V(P.wrap(b.value, colW[3] - 12, st.size))); else row.push(V([], { span: 2 }));
    rows.push(row);
  }
  for (const r of centreRows(P, F, spec, F.labels, colW[1] + colW[2] + colW[3] - 12, st.size)) rows.push([L(st, P.wrap(r.label, colW[0] - 12, st.size, true)), V(r.lines, { span: 3 })]);
  return table(P, st.margin, y, colW, rows, st);
}

function layoutHeadRow(P, spec, F, rng, st, y) {
  const inner = P.width - 2 * st.margin; const rows = [];
  const top = F.exam.filter((e) => ['date', 'time', 'shift'].includes(e.key)); const rest = F.exam.filter((e) => !['date', 'time', 'shift'].includes(e.key));
  const cw = Array(top.length).fill(inner / Math.max(1, top.length));
  const colorHead = rng.next() < 0.5 ? '#eef1f6' : null;
  const half = inner / 4; const colW = [half, half, half, half];
  const cand = F.cand.map((c) => [L(st, P.wrap(c.label, half - 12, st.size, true)), V(P.wrap(c.value, 3 * half - 12, st.size), { span: 3 })]);
  y = table(P, st.margin, y, colW, cand, st);
  if (top.length) {
    y = table(P, st.margin, y, cw, [top.map((e, i) => L(st, P.wrap(e.label, cw[i] - 12, st.size, true), { center: true, shade: colorHead }))], st);
    y = table(P, st.margin, y, cw, [top.map((e, i) => V(P.wrap(e.value, cw[i] - 12, st.size), { center: true }))], st);
  }
  for (let i = 0; i < rest.length; i += 2) {
    const a = rest[i]; const b = rest[i + 1];
    rows.push([L(st, P.wrap(a.label, half - 12, st.size, true)), V(P.wrap(a.value, half - 12, st.size)), ...(b ? [L(st, P.wrap(b.label, half - 12, st.size, true)), V(P.wrap(b.value, half - 12, st.size))] : [V([], { span: 2 })])]);
  }
  for (const r of centreRows(P, F, spec, F.labels, 3 * half - 12, st.size)) rows.push([L(st, P.wrap(r.label, half - 12, st.size, true)), V(r.lines, { span: 3 })]);
  return table(P, st.margin, y, colW, rows, st);
}

function layoutNoLine2(P, spec, F, rng, st, y, { sepStyle = null } = {}) {
  const inner = P.width - 2 * st.margin; const lw = inner * pick(rng, [0.3, 0.36, 0.4]); const x2 = st.margin + lw + 10; const vw = inner - lw - 10;
  const sep = sepStyle ?? pick(rng, ['', ':', ' -']);
  const lh = st.size * 1.45;
  const row = (label, lines) => {
    const ll = P.wrap(label, lw - 8, st.size, true);
    const h = Math.max(ll.length, lines.length);
    ll.forEach((l, i) => P.text(st.margin, y + (i + 1) * lh - 4, `${l}${i === ll.length - 1 ? sep : ''}`, { size: st.size, bold: true, color: st.ink }));
    lines.forEach((l, i) => P.text(x2, y + (i + 1) * lh - 4, l, { size: st.size, color: st.ink }));
    y += h * lh + 5;
  };
  for (const c of F.cand) row(c.label, [c.value]);
  if (F.cand.length) y += 6;
  for (const e of F.exam) row(e.label, [e.value]);
  if (F.exam.length) y += 6;
  for (const r of centreRows(P, F, spec, F.labels, vw, st.size)) row(r.label, r.lines);
  return y;
}

function layoutPlain(P, spec, F, rng, st, y) {
  const inner = P.width - 2 * st.margin; const sep = pick(rng, [': ', ' : ', ' - ', ' :- ']);
  const lh = st.size * 1.5;
  const line = (label, value) => {
    for (const l of P.wrap(`${label}${sep}${value}`, inner, st.size)) { P.text(st.margin, y + lh, l, { size: st.size, color: st.ink }); y += lh; }
  };
  for (const c of F.cand) line(c.label, c.value);
  y += 8;
  for (const e of F.exam) line(e.label, e.value);
  y += 8;
  const c = F.centre;
  if (c.mode === 'combined') line(F.labels.centre, c.combinedText);
  else if (c.mode === 'nameFirst') { line(F.labels.centre, c.code ? `${c.code} - ${c.name}` : c.name); for (const l of P.wrap(c.address, inner, st.size)) { P.text(st.margin, y + lh, l, { size: st.size }); y += lh; } }
  else { line(F.labels.centreName, c.code ? `${c.code} - ${c.name}` : c.name); line(F.labels.centreAddr, c.address); }
  return y + 6;
}

function layoutTwoCol(P, spec, F, rng, st, y) {
  const inner = P.width - 2 * st.margin; const sideW = Math.min(130, inner * 0.2); const mainW = inner - sideW - 20;
  const sideEnd = side(P, spec, rng, st.margin + mainW + 20, y, sideW);
  const lw = mainW * 0.38; const x2 = st.margin + lw + 8; const vw = mainW - lw - 8; const lh = st.size * 1.45;
  const row = (label, lines) => {
    const ll = P.wrap(label, lw - 6, st.size, true);
    ll.forEach((l, i) => P.text(st.margin, y + (i + 1) * lh - 4, l, { size: st.size, bold: true }));
    lines.forEach((l, i) => P.text(x2, y + (i + 1) * lh - 4, l, { size: st.size }));
    y += Math.max(ll.length, lines.length) * lh + 6;
  };
  for (const c of F.cand) row(c.label, P.wrap(c.value, vw, st.size));
  for (const e of F.exam) row(e.label, P.wrap(e.value, vw, st.size));
  for (const r of centreRows(P, F, spec, F.labels, vw, st.size)) row(r.label, r.lines);
  return Math.max(y, sideEnd);
}

function layoutStacked(P, spec, F, rng, st, y) {
  const inner = P.width - 2 * st.margin; const cols = rng.int(2, 3); const gap = 10; const w = (inner - gap * (cols - 1)) / cols;
  const items = [...F.cand, ...F.exam];
  let col = 0; let rowH = 0; let ry = y;
  const small = st.size * 0.82;
  const box = (x, bw, label, lines) => {
    const lab = P.wrap(label, bw - 12, small); const h = (lab.length * small * 1.25) + lines.length * st.size * 1.3 + 14;
    P.rect(x, ry, bw, h, { stroke: st.lineColor, lw: st.lw });
    lab.forEach((l, i) => P.text(x + 6, ry + 6 + small + i * small * 1.25, l, { size: small, color: '#555' }));
    lines.forEach((l, i) => P.text(x + 6, ry + 8 + lab.length * small * 1.25 + st.size + i * st.size * 1.3, l, { size: st.size, bold: true, color: st.ink }));
    return h;
  };
  for (const it of items) {
    const x = st.margin + col * (w + gap);
    rowH = Math.max(rowH, box(x, w, it.label, P.wrap(it.value, w - 12, st.size, true))); col++;
    if (col >= cols) { col = 0; ry += rowH + gap; rowH = 0; }
  }
  if (col) ry += rowH + gap;
  for (const r of centreRows(P, F, spec, F.labels, inner - 16, st.size)) ry += box(st.margin, inner, r.label, r.lines) + gap;
  return ry;
}

function layoutSections(P, spec, F, rng, st, y) {
  const inner = P.width - 2 * st.margin;
  const bar = (title) => { P.rect(st.margin, y, inner, st.size * 1.9, { stroke: st.accent, fill: st.accent }); P.text(st.margin + 8, y + st.size * 1.3, title, { size: st.size, bold: true, color: '#fff' }); y += st.size * 1.9 + 8; };
  const hi = spec.lang === 'hi';
  bar(hi ? 'अभ्यर्थी विवरण' : pick(rng, ['Candidate Details', 'Candidate Information']));
  y = layoutNoLine2(P, spec, { ...F, exam: [], centre: { mode: 'none' } }, rng, st, y, { sepStyle: ':' });
  bar(hi ? 'परीक्षा विवरण' : pick(rng, ['Examination Details', 'Exam Schedule']));
  y = layoutNoLine2(P, spec, { ...F, cand: [], centre: { mode: 'none' } }, rng, st, y, { sepStyle: ':' });
  bar(hi ? 'परीक्षा केंद्र विवरण' : pick(rng, ['Venue Details', 'Exam Centre Details']));
  return layoutNoLine2(P, spec, { ...F, cand: [], exam: [] }, rng, st, y, { sepStyle: ':' });
}

function layoutTimetable(P, spec, F, rng, st, y) {
  const inner = P.width - 2 * st.margin;
  y = layoutGrid2(P, spec, F, rng, st, y) + 14;
  const hi = spec.lang === 'hi';
  const heads = hi ? ['दिनांक', 'दिन', 'विषय', 'समय'] : [pick(rng, ['Date', 'Date of Exam']), pick(rng, ['Day', 'Weekday']), pick(rng, ['Subject', 'Paper', 'Subject / Paper']), pick(rng, ['Time', 'Timing'])];
  const w = [inner * 0.22, inner * 0.18, inner * 0.34, inner * 0.26];
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const rows = [heads.map((h, i) => L(st, [h], { shade: '#e8ecf3', center: i !== 2 }))];
  for (const d of spec.days) {
    const wd = DAY[new Date(`${d.date}T00:00:00Z`).getUTCDay()];
    rows.push([V([fmtDate(d.date, spec.dateStyle)], { center: true }), V([wd], { center: true }), V([d.subject || '-']), V([F.range(d)], { center: true })]);
  }
  return table(P, st.margin, y, w, rows, st);
}

const LAYOUTS = { grid2: layoutGrid2, grid4: layoutGrid4, headrow: layoutHeadRow, noline2: layoutNoLine2, plain: layoutPlain, twocol: layoutTwoCol, stacked: layoutStacked, sections: layoutSections, timetable: layoutTimetable };

/** Build the page. Returns { page, address, layout, style }. */
export function buildCard(rng, spec, layoutName) {
  const portrait = rng.next() < 0.85;
  const [W, H] = portrait ? pick(rng, [[794, 1123], [816, 1056], [700, 1000]]) : [1123, 794];
  const family = pick(rng, FAMILY_NAMES);
  const base = rng.float(10.5, 13.5) * (W / 794);
  const P = new Page(W, H, family, base);
  const st = { size: base, margin: rng.int(30, 54), lw: pick(rng, [0.7, 1, 1.4, 2]), lineColor: pick(rng, ['#333', '#555', '#999', '#c8c8c8', '#1f4e9c']), ink: pick(rng, ['#111', '#222', '#000', '#1a1a1a']), accent: pick(rng, ['#1f3a68', '#7a1f1f', '#1d5a3a', '#333']) };
  if (spec.lang !== 'en') spec.bodyHindi = spec.body === 'police' ? `${HINDI_STATE[spec.city.state] || spec.city.state} पुलिस भर्ती एवं प्रोन्नति बोर्ड` : null;
  const labels = pickLabels(rng, spec);
  const address = printedAddress(rng, spec);
  const F = facts(rng, spec, labels, address);
  let y = header(P, spec, rng, st);
  if (layoutName !== 'twocol' && rng.next() < 0.7) { const w = Math.min(96, P.width * 0.13); P.photo(P.width - st.margin - w, 24, w * 0.7, w * 0.85, '#c9a98a'); }
  y = LAYOUTS[layoutName](P, spec, F, rng, st, y);
  if (layoutName !== 'twocol' && rng.next() < 0.6) { P.qr(P.width - st.margin - 70, y + 10, 70, spec.candidate.app); P.bars(st.margin, y + 14, 200, 34, rng.int(1, 9999)); y += 80; }
  if (rng.next() < 0.4) { P.circle(P.width - 120, y + 30, 36, { stroke: '#a22', lw: 2 }); P.text(P.width - 120, y + 34, pick(rng, ['VERIFIED', 'ORIGINAL', 'E-SIGNED']), { size: P.base * 0.8, bold: true, color: '#a22', align: 'c', angle: -15 }); }
  y = footer(P, spec, rng, y + 14, st);
  P.height = Math.max(H, Math.round(y + 30));
  return { page: P, address, layout: layoutName, style: { family, lw: st.lw, W, H: P.height, size: Math.round(base * 10) / 10 } };
}
