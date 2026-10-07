// A fake copy of the real JEE Main (NTA) admit card, drawn pixel by pixel to look like the real file:
// 768 x 1024 picture, Arial text, light-grey 1 px table lines, the same cell positions, header with ministry / agency logos,
// a QR code and a barcode, JPEG. Only the people and numbers are made up.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import QRCode from 'qrcode';
import './render.js';          // registers the Noto fonts (Hindi text)
import { makeRng } from '../../tests/rng.js';
import { fmtDate } from './layouts.js';

const ARIAL = '/System/Library/Fonts/Supplemental';
const hasArial = GlobalFonts.registerFromPath(`${ARIAL}/Arial.ttf`, 'AR') && GlobalFonts.registerFromPath(`${ARIAL}/Arial Bold.ttf`, 'ARB') && GlobalFonts.registerFromPath(`${ARIAL}/Arial Italic.ttf`, 'ARI');
const REG = hasArial ? 'AR' : 'NS'; const BOLD = hasArial ? 'ARB' : 'NSB'; const ITALIC = hasArial ? 'ARI' : 'NS';

const LINE = '#d4d4d4';
const toIst = (hhmm, noon = false) => {
  const [h, m] = hhmm.split(':').map(Number);
  if (noon && h === 12 && m === 0) return '12.00Noon';
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}.${String(m).padStart(2, '0')}${h >= 12 ? 'PM' : 'AM'}`;
};
const roman = ['', 'I', 'II', 'III'];

/**
 * spec: the same spec objects as the other cards (centre, centreExtra, centreCode, address, pincode, days[0], notAllowed) plus
 * title (shown big in two lines), session. cand: fake candidate { name, roll, dob, appNo }.
 */
export function renderNtaExact(spec, cand) {
  const W = 768; const H = 1024;
  const canvas = createCanvas(W, H); const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const d = spec.days[0];
  const text = (t, x, y, { size = 11, font = REG, color = '#1a1a1a', align = 'left' } = {}) => { g.font = `${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y); };
  const box = (x0, y0, x1, y1) => { g.strokeStyle = LINE; g.lineWidth = 1; g.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0)); };
  const wrap = (t, maxW, size, font = REG) => { g.font = `${size}px ${font}`; const lines = []; let line = ''; for (const w of t.split(' ')) { const next = line ? `${line} ${w}` : w; if (g.measureText(next).width > maxW && line) { lines.push(line); line = w; } else line = next; } if (line) lines.push(line); return lines; };
  const cellText = (t, x0, x1, y0, y1, { bold = false, center = false, size = 11 } = {}) => {
    const lines = wrap(t, x1 - x0 - 10, size, bold ? BOLD : REG);
    const total = lines.length * (size + 3);
    let y = y0 + (y1 - y0 - total) / 2 + size;
    for (const l of lines) { text(l, center ? (x0 + x1) / 2 : x0 + 6, y, { size, font: bold ? BOLD : REG, align: center ? 'center' : 'left' }); y += size + 3; }
  };

  // ---- header: ministry (left), title (middle), agency (right)
  g.fillStyle = '#9a9a9a'; g.beginPath(); g.arc(56, 42, 15, 0, Math.PI * 2); g.fill();
  text('Department of Higher Education', 75, 35, { size: 13.5, font: BOLD });
  text('Ministry of Education', 75, 50, { size: 14.5 });
  text('Government of India', 75, 65, { size: 11.5 });
  text('Joint Entrance Examination (Main) –', 433, 25, { size: 13, align: 'center', color: '#333' });
  text(`${spec.year || '2026'} Session ${spec.session || '1'}`, 433, 38, { size: 13, align: 'center', color: '#333' });
  text('Admit Card-Provisional', 433, 66, { size: 12.5, font: ITALIC, align: 'center', color: '#333' });
  g.fillStyle = '#2ca02c'; g.beginPath(); g.arc(566, 41, 17, 0, Math.PI * 2); g.fill();
  text('राष्ट्रीय परीक्षा एजेंसी', 588, 33, { size: 13, font: 'NDB', color: '#1f4e9c' });
  text('National Testing Agency', 588, 50, { size: 14, font: BOLD, color: '#1f4e9c' });

  // ---- page frame and candidate block
  box(14, 88, 762, 872);
  const colX = [15, 165, 313, 462, 610, 746];
  const rows = [[100, 122], [122, 143], [143, 164], [164, 185], [185, 215]];
  const info = [['Roll Number', cand.roll, 'Application Number', cand.appNo], ["Candidate's Name:", cand.name, "Father's Name:", 'DEMOFATHER KUMAR'], ['Gender:', 'Male', 'Date of Birth:', cand.dob.replace(/\//g, '-')],
    ['Category:', 'General', 'State of Eligibility:', 'UTTAR PRADESH'], ['Person with Disability : (PwD/ PwBD)*', 'No', 'Scribe required:', '--']];
  rows.forEach(([y0, y1], i) => {
    [0, 1, 2, 3].forEach((c) => { box(colX[c], y0, colX[c + 1], y1); });
    const [a, b, c2, d2] = info[i];
    cellText(a, colX[0], colX[1], y0, y1, { bold: true, size: 10 }); cellText(b, colX[1], colX[2], y0, y1, { size: 10 });
    cellText(c2, colX[2], colX[3], y0, y1, { bold: true, size: 10 }); cellText(d2, colX[3], colX[4], y0, y1, { size: 10 });
  });
  box(610, 100, 746, 215); text('Photograph', 678, 128, { size: 10, font: BOLD, align: 'center' });
  g.fillStyle = '#c9a98a'; g.fillRect(650, 133, 56, 70);

  // ---- QR, barcode, signature
  box(15, 224, 165, 352); box(165, 224, 610, 330); box(610, 224, 746, 330); box(165, 330, 746, 353);
  const qr = QRCode.create(JSON.stringify({ app: cand.appNo, c: spec.centreCode }), { errorCorrectionLevel: 'M' }).modules;
  const cs = 118 / (qr.size + 2);
  g.fillStyle = '#000'; for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.get(r, c)) g.fillRect(25 + (c + 1) * cs, 229 + (r + 1) * cs, cs + 0.3, cs + 0.3);
  text('Roll Number Barcode', 338, 247, { size: 10, align: 'center' });
  const rng = makeRng(77); let bx = 244;
  while (bx < 528) { const w = rng.int(1, 3); g.fillStyle = '#111'; g.fillRect(bx, 256, w, 34); bx += w + rng.int(1, 3); }
  text(cand.roll, 338, 303, { size: 14, font: BOLD, align: 'center', color: '#222' });
  g.strokeStyle = '#999'; g.lineWidth = 1; g.beginPath(); g.moveTo(640, 258); g.bezierCurveTo(655, 245, 665, 275, 690, 252); g.bezierCurveTo(700, 262, 715, 258, 722, 262); g.stroke();
  text('Signature of Candidate', 678, 296, { size: 10, align: 'center' });
  text('Test Details', 455, 345, { size: 11, font: BOLD, align: 'center' });

  // ---- test details table
  box(15, 353, 165, 377); box(165, 353, 746, 377);
  cellText('Applied For', 15, 165, 353, 377, { bold: true, size: 10 }); cellText('Paper-1 (B.E./B. Tech.)', 165, 746, 353, 377, { size: 10 });
  const heads = [['Medium of Question Paper', 15, 165], ['Date of Examination', 165, 462], ['Shift', 462, 608], ['Timing of Test (Indian Standard Time)', 608, 746]];
  heads.forEach(([t, x0, x1]) => { box(x0, 377, x1, 407); cellText(t, x0, x1, 377, 407, { bold: true, center: true, size: 10.5 }); });
  const values = [['English', 15, 165], [fmtDate(d.date, 'dot'), 165, 462], [`Shift-${roman[Number(d.shift) || 1]}`, 462, 608], [`${toIst(d.start)} to ${toIst(d.end, true)} (IST)`, 608, 746]];
  values.forEach(([t, x0, x1]) => { box(x0, 407, x1, 433); cellText(t, x0, x1, 407, 433, { center: true, size: 10.5 }); });
  box(15, 433, 165, 467); box(165, 433, 462, 467); box(462, 433, 608, 467); box(608, 433, 746, 467);
  cellText('Reporting Time at Centre', 15, 165, 433, 467, { bold: true, size: 10.5 });
  cellText(`${toIst(d.report)} (IST)`, 165, 462, 433, 467, { center: true, size: 10.5 });
  cellText('Entry Gate Closing Time at Centre', 462, 608, 433, 467, { bold: true, center: true, size: 10.5 });
  cellText(`${toIst(d.gate)} Sharp (IST)`, 608, 746, 433, 467, { center: true, size: 10.5 });
  box(15, 467, 165, 528); box(165, 467, 462, 528); box(462, 467, 608, 528); box(608, 467, 746, 528);
  cellText('Test Centre Code, Name and Address', 15, 165, 467, 528, { bold: true, size: 10.5 });
  const centre = `${spec.centreCode} - ${spec.centre}, ${spec.centreExtra}, ${spec.address.join(', ')}, India, ${spec.pincode}`;
  const cl = wrap(centre, 288, 10);
  cl.forEach((l, i) => { if (i === 0) { const [code, rest] = [l.slice(0, l.indexOf(' - ')), l.slice(l.indexOf(' - '))]; text(code, 171, 482, { size: 10, font: BOLD }); g.font = `10px ${BOLD}`; text(rest, 171 + g.measureText(code).width, 482, { size: 10 }); } else text(l, 171, 482 + i * 13.5, { size: 10 }); });
  cellText('Photo ID uploaded by candidate@', 462, 608, 467, 528, { bold: true, size: 10.5 });
  text('Type', 614, 480, { size: 10, font: BOLD }); text('Aadhaar', 667, 480, { size: 10.5 }); text('Number', 614, 495, { size: 10, font: BOLD }); text('xxxxxxxx2592', 667, 495, { size: 10.5 });
  box(15, 528, 313, 610); box(313, 528, 746, 610);
  text('Date of Issue: 17.01.2026', 21, 571, { size: 10.5 });
  g.strokeStyle = '#222'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(500, 566); g.bezierCurveTo(515, 535, 525, 590, 545, 548); g.bezierCurveTo(552, 565, 560, 556, 572, 553); g.stroke();
  text('DIRECTOR, NTA', 530, 600, { size: 10, font: BOLD, align: 'center' });

  // ---- self declaration with the candidate's HOME address (another pincode): the reader must ignore all of it
  text('SELF DECLARATION (UNDERTAKING)', 382, 631, { size: 10, font: BOLD, color: '#c0392b', align: 'center' });
  text(`I, ${cand.name} resident of H.NO. 12, DEMO COLONY, NEAR DEMO CHOWK, GORAKHPUR, UTTAR PRADESH 273012, do hereby, declare the following:`, 18, 646, { size: 8 });
  const dec = ['1.  I have read the Instructions, Guidelines, Information Bulletin, and Notices related to this examination available on the website https://jeemain.nta.nic.in and www.nta.ac.in',
    '2.  I have read the detailed "IMPORTANT INSTRUCTIONS for CANDIDATES" as given on Page 2, and I undertake to abide by the same.', '3.  I have also read Important Advisory as given on Page 3.',
    '4.  The candidates are advised to bring photo ID proof as uploaded in online application at the time of registration.',
    '5.  The candidates were advised to register through Aadhar / DigiLocker / PAN Card / Passport. Those candidates who did not register through Aadhar need to report early on the day',
    '     of the examination (at least 1 hour earlier from the reporting time) to get their Biometrics recorded at the Exam Centre.'];
  dec.forEach((l, i) => text(l, 30, 663 + i * 15, { size: 7.8 }));
  box(17, 748, 313, 847); box(313, 748, 470, 847); box(470, 748, 746, 847);
  text("Candidate's Photo", 165, 822, { size: 7.5, font: BOLD, align: 'center' }); text('(Same as uploaded on Application Form to be affixed before reaching the Centre)', 165, 831, { size: 7, align: 'center' });
  text("Candidate's left-hand thumb impression", 392, 822, { size: 7.5, font: BOLD, align: 'center' }); text('(To be affixed before reaching the Centre)', 392, 838, { size: 7, align: 'center' });
  text("Candidate's Signature", 608, 822, { size: 7.5, font: BOLD, align: 'center' }); text('(To be signed on the Day of Examination in the presence of the Invigilator only)', 608, 831, { size: 7, align: 'center' });
  text("The above undertaking has to be filled up in advance before reaching the Centre, except for the candidate's signature which has to be affixed in the presence of the Invigilator.", 18, 859, { size: 7.5, font: BOLD });
  return canvas;
}
