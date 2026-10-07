// Makes the 20 sample admit cards in tests/fixtures/samples/ and the answer key tests/fixtures/truth.json.
//   node tools/makeFixtures.js
// The files are committed, so the tests do not need fonts or this script. Re-run only to change the samples.
import { writeFileSync, mkdirSync } from 'node:fs';
import { SPECS } from './fixtures/specs.js';
import { layoutOps, fakeCandidate, addressLines } from './fixtures/layouts.js';
import { renderNtaExact } from './fixtures/ntaExact.js';
import { renderCanvas, renderPdfText, renderPdfImage, degrade } from './fixtures/render.js';
import { makeRng } from '../tests/rng.js';

const OUT = 'tests/fixtures/samples';
mkdirSync(OUT, { recursive: true });
const truth = [];
for (let i = 0; i < SPECS.length; i++) {
  const spec = SPECS[i];
  const rng = makeRng(1000 + i);
  const ops = layoutOps(spec);
  let file;
  if (spec.format === 'pdf-text') { file = `${spec.id}.pdf`; writeFileSync(`${OUT}/${file}`, await renderPdfText(ops)); }
  else if (spec.format === 'pdf-image') { file = `${spec.id}.pdf`; writeFileSync(`${OUT}/${file}`, await renderPdfImage(renderCanvas(ops, 2.083))); }
  else if (spec.format === 'nta-exact') { file = `${spec.id}.jpg`; writeFileSync(`${OUT}/${file}`, renderNtaExact(spec, fakeCandidate(spec)).toBuffer('image/jpeg', 80)); }
  else if (spec.format === 'image') { file = `${spec.id}.png`; writeFileSync(`${OUT}/${file}`, renderCanvas(ops, 2.083).toBuffer('image/png')); }
  else if (spec.format === 'screenshot') { file = `${spec.id}.png`; writeFileSync(`${OUT}/${file}`, degrade(renderCanvas(ops, 2.083), spec.degrade, rng).toBuffer('image/png')); }
  else { file = `${spec.id}.jpg`; writeFileSync(`${OUT}/${file}`, degrade(renderCanvas(ops, spec.scale || 2.083), spec.degrade || ['photo'], rng).toBuffer('image/jpeg', 72)); }
  const cand = fakeCandidate(spec);
  truth.push({
    id: spec.id, file, format: spec.format, degrade: spec.degrade || [], layout: spec.layout, lang: spec.lang, exam: spec.exam,
    centre: spec.centre, centreCode: spec.centreCode || '', homePincode: spec.centreCode ? '273012' : '', address: addressLines(spec).join(' '), city: spec.city, pincode: spec.pincode, near: spec.near, nearRadiusKm: spec.near.radiusKm || 5,
    days: spec.days.map((d) => ({ date: d.date, reportTime: d.report || spec.report || '', gateTime: d.gate || '', startTime: d.start || '', endTime: d.end || '', shift: ['nta', 'ssc', 'rrb', 'hindi', 'timetable-rrb'].includes(spec.layout) ? (d.shift || '') : '', subject: d.subject || '' })),
    notAllowed: spec.notAllowed, hasQr: Boolean(spec.qr), candidate: { name: cand.name, roll: cand.roll },
  });
  console.log(file);
}
writeFileSync('tests/fixtures/truth.json', `${JSON.stringify(truth, null, 1)}\n`);
