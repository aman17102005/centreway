// Prints how the reader sees ONE admit card: the OCR text, the table cells (with positions), which label was matched to which
// value, and the final fields.   node tools/debugCard.js /path/to/admit_card.jpeg
// It only prints to the terminal (nothing is saved, nothing leaves the computer). The output contains the card's text,
// so do not paste it anywhere public.
import { readFileSync } from 'node:fs';
import { nodeEnv } from '../tests/nodeEnv.js';
import { readAdmitCard } from '../src/ingest/readAdmitCard.js';
import { preprocessVariants } from '../src/ingest/preprocess.js';
import { prepareTable } from '../src/ingest/extractBest.js';
import { fillCells } from '../src/ingest/grid.js';
import { readCells, readHeader } from '../src/ingest/cellOcr.js';
import { analyseCell, tableValues } from '../src/ingest/tableReader.js';
import { detectTemplate } from '../src/ingest/templates.js';

const file = process.argv[2];
if (!file) { console.log('Usage: node tools/debugCard.js <image file>'); process.exit(1); }
const bytes = new Uint8Array(readFileSync(file));
const rgba = await nodeEnv.decodeImage(bytes);
console.log(`PICTURE ${rgba.width} x ${rgba.height}, ${bytes.length} bytes`);
const engine = await nodeEnv.getOcr();
const variant = preprocessVariants(rgba, { quarterTurns: 0 })[0];
const prepared = prepareTable(variant.grey);
console.log(`\nCLEANED PICTURE ${variant.name} ${variant.grey.width} x ${variant.grey.height}; table cells found: ${prepared.cells.length}`);

const page = await engine.recognize(nodeEnv.toEngineImage(prepared.grey));
console.log('\n=== 1. RAW OCR TEXT of the whole page (line number, y, text)');
page.lines.forEach((l, i) => console.log(String(i).padStart(3), String(Math.round(l.y0)).padStart(5), l.text));
console.log(`template picked from the words: ${(detectTemplate(page.lines.map((l) => l.text).join('\n')) || { id: 'none' }).id}`);

console.log('\n=== 2. TITLE AREA read on its own (used for the exam name)');
const header = await readHeader(variant.grey, prepared.cells.length ? Math.min(...prepared.cells.map((c) => c.y0)) - 4 : variant.grey.height * 0.2, engine, nodeEnv);
header.forEach((l) => console.log('   ', l));

console.log('\n=== 3. TABLE CELLS (x0,y0,x1,y1  text  -> what the label matcher says)');
const words = await readCells(variant.grey, prepared.cells, engine, nodeEnv);
const table = fillCells(prepared.cells, words);
table.cells.forEach((c, i) => {
  const a = analyseCell(c);
  console.log(String(i).padStart(3), [c.x0, c.y0, c.x1, c.y1].map(Math.round).join(',').padEnd(18), JSON.stringify(c.text.slice(0, 90)), a ? `-> ${a.isLabel ? 'LABEL' : 'label+value'} "${a.kind}"` : '');
});

console.log('\n=== 4. LABEL -> VALUE (which cell was matched to which)');
for (const kind of ['examDate', 'shift', 'examTime', 'report', 'gate', 'centreName', 'address', 'examName']) {
  const v = tableValues(table.cells, kind);
  console.log(kind.padEnd(11), v.length ? v.map((x) => `[${x.via}] ${JSON.stringify(x.text.slice(0, 110))}`).join('  ') : '(no cell matched)');
}

console.log('\n=== 5. FINAL FIELDS (the whole reader: templates + table + text, best of each)');
const r = await readAdmitCard({ bytes, type: '' }, nodeEnv, { now: new Date() });
const x = r.result;
for (const n of ['examName', 'centreCode', 'centreName', 'address', 'city', 'pincode']) console.log(n.padEnd(11), `[${x[n].level}]`, JSON.stringify(x[n].value));
x.days.forEach((d, i) => { for (const n of ['date', 'shift', 'reportTime', 'gateTime', 'startTime', 'endTime']) console.log(`day ${i + 1} ${n}`.padEnd(18), `[${d[n].level}]`, JSON.stringify(d[n].value)); });
console.log(`read as: ${r.source}/${r.variant}`);
await nodeEnv.close();
