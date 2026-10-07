// Draws each admit card as a list of drawing operations (text, boxes, lines, QR). The same list is turned into a PDF or an image.
// Page is A4 in points: 595 x 842. y grows downward.
import { makeRng } from '../../tests/rng.js';

class Page {
  constructor() { this.ops = []; this.width = 595; this.height = 842; }
  text(text, x, y, { size = 10, bold = false } = {}) { this.ops.push({ type: 'text', text, x, y, size, bold }); }
  rect(x, y, w, h, { fill = null, stroke = '#333' } = {}) { this.ops.push({ type: 'rect', x, y, w, h, fill, stroke }); }
  line(x1, y1, x2, y2) { this.ops.push({ type: 'line', x1, y1, x2, y2 }); }
  qr(x, y, size, data) { this.ops.push({ type: 'qr', x, y, size, data }); }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEVA_DIGITS = '०१२३४५६७८९';
const toDeva = (s) => String(s).replace(/\d/g, (d) => DEVA_DIGITS[d]);

export function fmtDate(iso, style) {
  const [y, m, d] = iso.split('-');
  if (style === 'dash') return `${d}-${m}-${y}`;
  if (style === 'dot') return `${d}.${m}.${y}`;
  if (style === 'mon') return `${d}-${MONTHS[m - 1]}-${y}`;
  if (style === 'long') return `${Number(d)} ${FULL_MONTHS[m - 1]} ${y}`;
  return `${d}/${m}/${y}`;
}
export function fmtTime(hhmm, style = '12h') {
  const [h, m] = hhmm.split(':').map(Number);
  if (style === '24h') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} hrs`;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
}
const weekday = (iso) => DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

const ITEM_EN = { mobile: 'mobile phones', calculator: 'calculators', watch: 'smart watches', bag: 'bags', headphone: 'headphones', jewellery: 'jewellery', notes: 'notes or books' };
const ITEM_HI = { 'मोबाइल': 'मोबाइल फोन', 'कैलकुलेटर': 'कैलकुलेटर', 'घड़ी': 'स्मार्ट वॉच' };
function notAllowedLines(spec, form) {
  if (spec.lang === 'hi') return [`${spec.notAllowed.map((k) => ITEM_HI[k] || k).join(', ')} परीक्षा केंद्र में लाना मना है।`];
  const items = spec.notAllowed.map((k) => ITEM_EN[k] || k);
  const joined = items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];
  if (form === 'bring') return [`Do not bring ${items.join(', ')} into the examination hall.`];
  if (form === 'prohibited') return [`Prohibited items: ${items.join(', ')}.`];
  return [`Candidates will not be allowed to carry ${joined} into the examination hall.`];
}

function fakeCandidate(spec) {
  const rng = makeRng([...spec.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const first = ['ANITA', 'RAHUL', 'SIMRAN', 'KARAN', 'POOJA', 'VIKAS', 'NEHA', 'AMIT'][rng.int(0, 7)];
  const last = ['DEMOSHARMA', 'TESTKUMAR', 'SAMPLESINGH', 'FAKEVERMA', 'MOCKGUPTA'][rng.int(0, 4)];
  const roll = String(rng.int(1000000000, 9999999999));
  const dob = `${String(rng.int(1, 28)).padStart(2, '0')}/${String(rng.int(1, 12)).padStart(2, '0')}/${rng.int(1998, 2006)}`;
  return { name: `${first} ${last}`, roll, dob, appNo: String(rng.int(200000000000, 299999999999)) };
}

/** Address as printed lines: "Sector 14, Chandigarh - 160014" (long ones split in two). */
function addressLines(spec, mapDigits = (s) => s) {
  const parts = spec.address.slice();
  const last = `${parts.pop()} - ${mapDigits(spec.pincode)}`;
  const lines = [];
  if (parts.length > 2) { lines.push(`${parts.slice(0, 2).join(', ')},`); lines.push(parts.slice(2).concat(last).join(', ')); }
  else lines.push(parts.concat(last).join(', '));
  return lines;
}

function header(page, spec, cand, { photo = true } = {}) {
  page.text(spec.body, 297, 38, { size: 14, bold: true });
  if (photo) { page.rect(470, 80, 80, 95); page.text('Photo', 495, 130, { size: 9 }); page.rect(470, 185, 80, 28); page.text('Signature', 485, 202, { size: 8 }); }
}

function instructions(page, spec, y, form, extra = []) {
  const hindi = spec.lang === 'hi';
  page.text(hindi ? 'निर्देश' : 'Important Instructions', 50, y, { size: 11, bold: true });
  const lines = hindi
    ? ['1. परीक्षा केंद्र पर प्रवेश पत्र और मूल फोटो पहचान पत्र लाना अनिवार्य है।', `2. ${notAllowedLines(spec)[0]}`, '3. रिपोर्टिंग समय के बाद प्रवेश की अनुमति नहीं दी जाएगी।']
    : ['1. Candidates must carry a printout of this admit card and a valid photo ID.', `2. ${notAllowedLines(spec, form)[0]}`,
      '3. Report at the centre by the reporting time. Entry is not permitted after gate closing time.', ...extra];
  lines.forEach((l, i) => page.text(l, 50, y + 18 + i * 15, { size: 9 }));
}

function qrIfAny(page, spec, cand) {
  if (!spec.qr) return;
  const d = spec.days[0];
  page.qr(470, 235, 80, JSON.stringify({ exam: spec.exam, centreName: spec.centre, date: d.date, reportingTime: d.report, pincode: spec.pincode, rollNo: cand.roll }));
}

const BI = { date: 'परीक्षा की तिथि', report: 'रिपोर्टिंग समय', gate: 'गेट बंद होने का समय', time: 'परीक्षा का समय', shift: 'शिफ्ट', centre: 'परीक्षा केंद्र का नाम' };

// ---------------------------------------------------------------- A: NTA style (label | value table)
function nta(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  header(page, spec, cand);
  page.text(`${spec.exam} - Admit Card`, 50, 66, { size: 12, bold: true });
  const L = (en, hi) => (spec.lang === 'bi' ? `${en} / ${hi}` : en);
  const rows = [
    ['Application No.', cand.appNo], ["Candidate's Name", cand.name], ['Roll No.', cand.roll], ['Date of Birth', cand.dob],
    [L('Date of Examination', BI.date), fmtDate(d.date)], [L('Reporting Time', BI.report), fmtTime(d.report)], [L('Gate Closing Time', BI.gate), fmtTime(d.gate)],
    [L('Test Time', BI.time), `${fmtTime(d.start)} to ${fmtTime(d.end)}`],
  ];
  if (d.shift) rows.push([L('Shift', BI.shift), `Shift ${d.shift}`]);
  let y = 100;
  for (const [label, value] of rows) { page.text(label, 50, y, { size: 10, bold: true }); page.text(value, 300, y, { size: 10 }); y += 20; }
  page.text(L('Test Centre Name & Address', BI.centre), 50, y, { size: 10, bold: true });
  page.text(spec.centre, 300, y, { size: 10 });
  addressLines(spec).forEach((l, i) => page.text(l, 300, y + 16 * (i + 1), { size: 10 }));
  y += 16 * (addressLines(spec).length + 1) + 30;
  instructions(page, spec, y, 'carry', ['4. Follow all instructions given at the examination centre.']);
  qrIfAny(page, spec, cand);
  return page.ops;
}

// ------------------------------------------------------- B: header table, values below, venue block
function ssc(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  header(page, spec, cand);
  page.text(`Admit Card for ${spec.exam}`, 50, 66, { size: 11, bold: true });
  const xs = [50, 150, 270, 320, 430];
  const heads = ['Roll No', 'Date of Exam', 'Shift', 'Reporting Time', 'Gate Closing Time'];
  const vals = [cand.roll, fmtDate(d.date, 'dash'), d.shift || '1', fmtTime(d.report), fmtTime(d.gate)];
  page.rect(45, 100, 505, 46);
  heads.forEach((h, i) => page.text(h, xs[i], 116, { size: 9, bold: true }));
  vals.forEach((v, i) => page.text(v, xs[i], 136, { size: 10 }));
  page.text('Venue of Examination:', 50, 180, { size: 10, bold: true });
  page.text(spec.centre, 50, 197, { size: 10 });
  addressLines(spec).forEach((l, i) => page.text(l, 50, 213 + i * 15, { size: 10 }));
  const y = 213 + addressLines(spec).length * 15 + 12;
  page.text(`Exam Time: ${fmtTime(d.start)} - ${fmtTime(d.end)}`, 50, y, { size: 10 });
  instructions(page, spec, y + 40, 'prohibited');
  return page.ops;
}

// ----------------------------------------------------------- C: several fields on the same line
function rrb(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  header(page, spec, cand);
  page.text(`${spec.exam} - E-Call Letter`, 50, 66, { size: 12, bold: true });
  page.text(`Candidate Name: ${cand.name}`, 50, 100, { size: 10 });
  page.text(`Roll No: ${cand.roll}`, 50, 118, { size: 10 });
  page.text(`Exam Date: ${fmtDate(d.date, 'dot')}`, 50, 150, { size: 10 });
  page.text(`Shift: ${d.shift}`, 230, 150, { size: 10 });
  page.text(`Reporting Time: ${fmtTime(d.report, '24h')}`, 310, 150, { size: 10 });
  page.text(`Gate Closing Time: ${fmtTime(d.gate, '24h')}`, 50, 170, { size: 10 });
  page.text(`Exam Time: ${fmtTime(d.start, '24h')} - ${fmtTime(d.end, '24h')}`, 270, 170, { size: 10 });
  page.text(`Exam Centre: ${spec.centre}`, 50, 205, { size: 10 });
  page.text('Centre Address:', 50, 225, { size: 10 });
  addressLines(spec).forEach((l, i) => page.text(l, 135, 225 + i * 15, { size: 10 }));
  instructions(page, spec, 225 + addressLines(spec).length * 15 + 30, 'bring');
  return page.ops;
}

// ------------------------------------------------------- D: "Label : value" columns
function ibps(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  header(page, spec, cand);
  page.text('CALL LETTER FOR ONLINE EXAMINATION', 50, 66, { size: 12, bold: true });
  const L = (en, hi) => (spec.lang === 'bi' ? `${en} / ${hi}` : en);
  const rows = [['Roll Number', cand.roll], ['Candidate Name', cand.name], ['Exam Name', spec.exam], [L('Exam Date', BI.date), fmtDate(d.date, 'mon')],
    [L('Reporting Time', BI.report), fmtTime(d.report)], [L('Gate Closing Time', BI.gate), fmtTime(d.gate)], ['Exam Time', `${fmtTime(d.start)} - ${fmtTime(d.end)}`]];
  let y = 105;
  for (const [label, value] of rows) { page.text(label, 50, y, { size: 10, bold: true }); page.text(':', 205, y, { size: 10 }); page.text(value, 220, y, { size: 10 }); y += 20; }
  page.text('Venue Name', 50, y, { size: 10, bold: true }); page.text(':', 205, y, { size: 10 }); page.text(spec.centre, 220, y, { size: 10 });
  y += 20;
  page.text('Venue Address', 50, y, { size: 10, bold: true }); page.text(':', 205, y, { size: 10 });
  addressLines(spec).forEach((l, i) => page.text(l, 220, y + i * 15, { size: 10 }));
  y += addressLines(spec).length * 15 + 25;
  instructions(page, spec, y, 'carry');
  return page.ops;
}

// ---------------------------------------------------------- E: Hindi labels
function hindi(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  const dev = spec.id.includes('s11') ? toDeva : (s) => s; // one card uses Hindi digits
  header(page, spec, cand);
  page.text('प्रवेश पत्र', 50, 66, { size: 13, bold: true });
  const rows = [['अनुक्रमांक', dev(cand.roll)], ['अभ्यर्थी का नाम', 'अनिता डेमो'], ['परीक्षा का नाम', spec.exam], ['परीक्षा तिथि', dev(fmtDate(d.date))], ['रिपोर्टिंग समय', dev(fmtTime(d.report))],
    ['प्रवेश बंद होने का समय', dev(fmtTime(d.gate))], ['परीक्षा समय', dev(`${fmtTime(d.start)} - ${fmtTime(d.end)}`)], ['पाली', dev(d.shift)]];
  let y = 105;
  for (const [label, value] of rows) { page.text(label, 50, y, { size: 10, bold: true }); page.text(':', 215, y, { size: 10 }); page.text(value, 230, y, { size: 10 }); y += 21; }
  page.text('परीक्षा केंद्र का नाम', 50, y, { size: 10, bold: true }); page.text(':', 215, y, { size: 10 }); page.text(spec.centre, 230, y, { size: 10 });
  y += 21;
  page.text('परीक्षा केंद्र का पता', 50, y, { size: 10, bold: true }); page.text(':', 215, y, { size: 10 });
  addressLines(spec, dev).forEach((l, i) => page.text(l, 230, y + i * 16, { size: 10 }));
  y += addressLines(spec).length * 16 + 28;
  instructions(page, spec, y, 'carry');
  return page.ops;
}

// ------------------------------------------------------ F: timetable with subject rows (board exam)
function cbse(spec) {
  const page = new Page(); const cand = fakeCandidate(spec);
  header(page, spec, cand);
  page.text(`Admit Card - ${spec.exam}`, 50, 66, { size: 11, bold: true });
  page.text(`Student Name: ${cand.name}`, 50, 100, { size: 10 });
  page.text(`Roll No: ${cand.roll}`, 50, 118, { size: 10 });
  page.text(`Examination Centre: ${spec.centre}`, 50, 145, { size: 10 });
  page.text('Centre Address:', 50, 163, { size: 10 });
  addressLines(spec).forEach((l, i) => page.text(l, 140, 163 + i * 15, { size: 10 }));
  page.text(`Reporting Time: ${fmtTime(spec.report)}`, 50, 163 + addressLines(spec).length * 15 + 10, { size: 10 });
  let y = 163 + addressLines(spec).length * 15 + 45;
  const xs = [50, 150, 235, 400];
  ['Date', 'Day', 'Subject', 'Time'].forEach((h, i) => page.text(h, xs[i], y, { size: 10, bold: true }));
  page.line(45, y + 5, 550, y + 5);
  y += 22;
  for (const d of spec.days) {
    page.text(fmtDate(d.date), xs[0], y, { size: 10 }); page.text(weekday(d.date), xs[1], y, { size: 10 });
    page.text(d.subject, xs[2], y, { size: 10 }); page.text(`${fmtTime(d.start)} - ${fmtTime(d.end)}`, xs[3], y, { size: 10 });
    y += 20;
  }
  instructions(page, spec, y + 25, 'prohibited');
  return page.ops;
}

// ------------------------------------------------------- G: university, partly sentences
function university(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  header(page, spec, cand, { photo: false });
  page.text(`ADMIT CARD - ${spec.exam}`, 50, 66, { size: 12, bold: true });
  page.text(`Name of Student: ${cand.name}`, 50, 100, { size: 10 });
  page.text(`Enrolment No: ${cand.roll}`, 350, 100, { size: 10 });
  page.text('The above candidate is permitted to appear in the examination', 50, 135, { size: 10 });
  page.text('at the centre given below.', 50, 150, { size: 10 });
  page.text(`Examination Centre: ${spec.centre}`, 50, 180, { size: 10 });
  page.text('Centre Address:', 50, 198, { size: 10 });
  addressLines(spec).forEach((l, i) => page.text(l, 140, 198 + i * 15, { size: 10 }));
  let y = 198 + addressLines(spec).length * 15 + 15;
  page.text(`Date of Examination: ${fmtDate(d.date, 'long')}`, 50, y, { size: 10 });
  page.text(`Time of Examination: ${fmtTime(d.start)} to ${fmtTime(d.end)}`, 50, y + 18, { size: 10 });
  page.text(`Reporting Time: ${fmtTime(spec.report)}`, 50, y + 36, { size: 10 });
  instructions(page, spec, y + 70, 'carry');
  return page.ops;
}

// ----------------------------------------------- H: multi-day timetable with report/gate columns
function timetableRrb(spec) {
  const page = new Page(); const cand = fakeCandidate(spec);
  header(page, spec, cand);
  page.text(`${spec.exam} - Admit Card`, 50, 66, { size: 12, bold: true });
  page.text(`Candidate Name: ${cand.name}`, 50, 100, { size: 10 });
  page.text(`Roll No: ${cand.roll}`, 50, 118, { size: 10 });
  page.text(`Exam Centre: ${spec.centre}`, 50, 148, { size: 10 });
  page.text('Centre Address:', 50, 166, { size: 10 });
  addressLines(spec).forEach((l, i) => page.text(l, 135, 166 + i * 15, { size: 10 }));
  let y = 166 + addressLines(spec).length * 15 + 25;
  const xs = [50, 140, 200, 300, 410];
  ['Exam Date', 'Shift', 'Reporting Time', 'Gate Closing Time', 'Exam Time'].forEach((h, i) => page.text(h, xs[i], y, { size: 9, bold: true }));
  page.line(45, y + 5, 550, y + 5);
  y += 22;
  for (const d of spec.days) {
    [fmtDate(d.date), d.shift, fmtTime(d.report), fmtTime(d.gate), `${fmtTime(d.start)} - ${fmtTime(d.end)}`].forEach((v, i) => page.text(v, xs[i], y, { size: 9 }));
    y += 20;
  }
  instructions(page, spec, y + 25, 'bring');
  return page.ops;
}

// ------------------------------------------------------------------ bordered tables (real-card style)
/** A table cell: a box with lines of text inside it (the text is wrapped by hand, like on real cards). */
function cell(page, x, y, w, h, lines, { bold = false, size = 9 } = {}) {
  page.rect(x, y, w, h);
  lines.forEach((l, i) => page.text(l, x + 5, y + size + 4 + i * (size + 3), { size, bold }));
}

/** Fake copy of the JEE Main (NTA) admit card layout: same table, same labels, same centre address and times. Fake person. */
function ntaReal(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  const dmy = fmtDate(d.date, 'dot');
  page.text('Department of Higher Education, Ministry of Education, Government of India', 40, 22, { size: 8, bold: true });
  page.text('National Testing Agency', 297, 38, { size: 14, bold: true });
  page.text('Joint Entrance Examination (Main) \u2013', 190, 50, { size: 10.5 });
  page.text('2026 Session 1', 235, 61, { size: 10.5 });
  page.text('Admit Card-Provisional', 225, 73, { size: 10 });
  // candidate block (left) and photo / signature (right)
  const info = [['Application No.', cand.appNo], ["Candidate's Name", cand.name], ['Roll Number', cand.roll], ['Date of Birth', cand.dob], ["Father's Name", 'DEMOFATHER KUMAR']];
  info.forEach(([k, v], i) => { cell(page, 40, 78 + i * 20, 130, 20, [k], { bold: true }); cell(page, 170, 78 + i * 20, 230, 20, [v]); });
  page.rect(440, 78, 100, 100); page.text('Photo', 475, 130, { size: 8 });
  page.rect(440, 182, 100, 30); page.text('Signature', 465, 200, { size: 8 });
  // the exam table: header row, value row
  const x = [40, 150, 300, 400, 555];
  const heads = [['Medium of', 'Question Paper'], ['Date of Examination'], ['Shift'], ['Timing of Test', '(Indian Standard Time)']];
  const vals = [['English'], [dmy], [`Shift-${['', 'I', 'II', 'III'][Number(d.shift) || 1]}`], [`${fmtTimeIst(d.start)} to ${fmtTimeIst(d.end, true)} (IST)`]];
  let y = 236;
  heads.forEach((h, i) => cell(page, x[i], y, x[i + 1] - x[i], 32, h, { bold: true }));
  y += 32;
  vals.forEach((v, i) => cell(page, x[i], y, x[i + 1] - x[i], 22, v));
  y += 22;
  // reporting / gate closing: labels split over lines, values to the right of each label
  cell(page, 40, y, 110, 32, ['Reporting Time', 'at Centre'], { bold: true });
  cell(page, 150, y, 150, 32, [`${fmtTimeIst(d.report)} (IST)`]);
  cell(page, 300, y, 100, 44, ['Entry Gate', 'Closing Time', 'at Centre'], { bold: true });
  cell(page, 400, y, 155, 44, [`${fmtTimeIst(d.gate)} Sharp (IST)`]);
  y += 44;
  // centre: label cell, wide value cell, and a side cell with the photo-id text that the reader must NOT mix in
  const cellLines = centreCellLines(spec);
  const rowH = 14 + cellLines.length * 12;
  cell(page, 40, y, 110, rowH, ['Test Centre', 'Code, Name', 'and Address'], { bold: true });
  cell(page, 150, y, 250, rowH, cellLines, { size: 8 });
  cell(page, 400, y, 155, rowH, ['Photo ID uploaded by', 'candidate@', `Aadhaar: XXXX XXXX 0000`, `ID No. 9999-8888-7777`], { size: 8 });
  y += rowH;
  page.text('Date of Issue: 17.01.2026', 40, y + 18, { size: 9 });
  // self declaration with the CANDIDATE'S HOME ADDRESS (a different pincode): must be ignored completely
  y += 40;
  page.text('Self Declaration / Undertaking', 40, y, { size: 10, bold: true });
  page.text(`I, ${cand.name}, son of DEMOFATHER KUMAR, resident of H.No. 12, Demo Colony, Gorakhpur, Uttar Pradesh - 273012`, 40, y + 16, { size: 8 });
  page.text('hereby declare that the details given by me are true and I will follow all instructions.', 40, y + 28, { size: 8 });
  y += 52;
  instructions(page, spec, y, 'carry');
  return page.ops;
}

function fmtTimeIst(hhmm, noon = false) {
  const [h, m] = hhmm.split(':').map(Number);
  if (noon && h === 12 && m === 0) return '12.00Noon';
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}.${String(m).padStart(2, '0')}${h >= 12 ? 'PM' : 'AM'}`;
}

/** The centre address inside its cell, wrapped by hand: "UP0802 - Name, College, Place, ..., State, India, 273013". */
function centreCellLines(spec) {
  const text = `${spec.centreCode} - ${spec.centre}, ${spec.centreExtra}, ${spec.address.join(', ')}, India, ${spec.pincode}`;
  const lines = []; let line = '';
  for (const word of text.split(' ')) { if ((line + ' ' + word).length > 62 && line) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word; }
  if (line) lines.push(line);
  return lines;
}

/** SSC style: header row on top (Roll No | Date | Shift | Time), labels on the left split over two lines, venue block below. */
function tableSsc(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  page.text(spec.body, 297, 38, { size: 14, bold: true });
  page.text(`Admit Card - ${spec.exam}`, 50, 62, { size: 11, bold: true });
  page.rect(450, 78, 100, 100); page.text('Photo', 485, 130, { size: 8 });
  const x = [40, 130, 290, 370, 440];
  ['Roll No', 'Date of Examination', 'Shift', 'Time of Exam'].forEach((hd, i) => cell(page, x[i], 90, x[i + 1] - x[i], 22, [hd], { bold: true }));
  [cand.roll, fmtDate(d.date, 'dash'), d.shift, `${fmtTime(d.start)} - ${fmtTime(d.end)}`].forEach((v, i) => cell(page, x[i], 112, x[i + 1] - x[i], 22, [v]));
  cell(page, 40, 134, 90, 34, ['Reporting', 'Time'], { bold: true }); cell(page, 130, 134, 160, 34, [fmtTime(d.report)]);
  cell(page, 290, 134, 80, 34, ['Gate Closing', 'Time'], { bold: true }); cell(page, 370, 134, 70, 34, [fmtTime(d.gate)]);
  const addr = addressLines(spec);
  cell(page, 40, 168, 90, 34 + addr.length * 12, ['Venue of', 'Examination'], { bold: true });
  cell(page, 130, 168, 310, 34 + addr.length * 12, [spec.centre, ...addr]);
  instructions(page, spec, 250 + addr.length * 12, 'prohibited');
  return page.ops;
}

/** RRB style: label | value | label | value rows, labels split over two lines, the address cell has several lines. */
function tableRrb(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  page.text(spec.body, 297, 38, { size: 14, bold: true });
  page.text(`${spec.exam} - E-Call Letter`, 50, 62, { size: 11, bold: true });
  page.rect(450, 78, 100, 100); page.text('Photo', 485, 130, { size: 8 });
  cell(page, 40, 80, 100, 22, ['Roll No'], { bold: true }); cell(page, 140, 80, 120, 22, [cand.roll]);
  cell(page, 40, 102, 100, 34, ['Date of', 'Examination'], { bold: true }); cell(page, 140, 102, 120, 34, [fmtDate(d.date, 'dot')]);
  cell(page, 260, 102, 70, 34, ['Shift'], { bold: true }); cell(page, 330, 102, 100, 34, [d.shift]);
  cell(page, 40, 136, 100, 34, ['Reporting', 'Time'], { bold: true }); cell(page, 140, 136, 120, 34, [fmtTime(d.report, '24h')]);
  cell(page, 260, 136, 70, 34, ['Gate', 'Closing'], { bold: true }); cell(page, 330, 136, 100, 34, [fmtTime(d.gate, '24h')]);
  cell(page, 40, 170, 100, 34, ['Exam', 'Timing'], { bold: true }); cell(page, 140, 170, 290, 34, [`${fmtTime(d.start, '24h')} to ${fmtTime(d.end, '24h')}`]);
  const addr = addressLines(spec);
  cell(page, 40, 204, 100, 46 + addr.length * 12, ['Exam Centre', 'Name and', 'Address'], { bold: true });
  cell(page, 140, 204, 290, 46 + addr.length * 12, [spec.centre, ...addr]);
  instructions(page, spec, 290 + addr.length * 12, 'bring');
  return page.ops;
}

/** IBPS style: column headers on top (Roll Number | Exam Name | Exam Date | Time Slot), values below, venue as a two-line label. */
function tableIbps(spec) {
  const page = new Page(); const cand = fakeCandidate(spec); const d = spec.days[0];
  page.text(spec.body, 297, 38, { size: 14, bold: true });
  page.text('CALL LETTER FOR ONLINE EXAMINATION', 50, 62, { size: 11, bold: true });
  page.rect(450, 78, 100, 100); page.text('Photo', 485, 130, { size: 8 });
  const x = [40, 125, 275, 360, 440];
  ['Roll Number', 'Exam Name', 'Exam Date', 'Time Slot'].forEach((hd, i) => cell(page, x[i], 90, x[i + 1] - x[i], 22, [hd], { bold: true }));
  const examLines = spec.exam.length > 24 ? [spec.exam.slice(0, spec.exam.lastIndexOf(' ', 24)), spec.exam.slice(spec.exam.lastIndexOf(' ', 24) + 1)] : [spec.exam];
  [[cand.roll], examLines, [fmtDate(d.date, 'mon')], [`${fmtTime(d.start)}`, `to ${fmtTime(d.end)}`]].forEach((v, i) => cell(page, x[i], 112, x[i + 1] - x[i], 34, v));
  cell(page, 40, 146, 85, 34, ['Reporting', 'Time'], { bold: true }); cell(page, 125, 146, 150, 34, [fmtTime(d.report)]);
  cell(page, 275, 146, 85, 34, ['Gate Closing', 'Time'], { bold: true }); cell(page, 360, 146, 80, 34, [fmtTime(d.gate)]);
  const addr = addressLines(spec);
  cell(page, 40, 180, 85, 40 + addr.length * 12, ['Venue', 'Name and', 'Address'], { bold: true });
  cell(page, 125, 180, 315, 40 + addr.length * 12, [spec.centre, ...addr]);
  instructions(page, spec, 260 + addr.length * 12, 'carry');
  return page.ops;
}

const LAYOUTS = { nta, ssc, rrb, ibps, hindi, cbse, university, 'timetable-rrb': timetableRrb, 'nta-real': ntaReal, 'table-ssc': tableSsc, 'table-rrb': tableRrb, 'table-ibps': tableIbps };
export function layoutOps(spec) { return LAYOUTS[spec.layout](spec); }
export { fakeCandidate, addressLines };
