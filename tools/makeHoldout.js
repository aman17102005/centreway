// Makes a set of random fake admit cards with their answer keys, for testing the reader honestly.
//   node tools/makeHoldout.js --seed 101 --count 20 --out tests/holdout/tuning
// Everything is random from the seed: exam body, town, layout, wording, order, fonts, sizes, line thickness, colours, logos, page size, dates, times
// and photo damage. Every name and number is fake. The folder gets card files and truth.json. Use a NEW seed for a fresh hidden set.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { makeRng } from '../tests/rng.js';
import { makeSpec, truthOf } from './holdout/spec.js';
import { buildCard, LAYOUT_NAMES } from './holdout/layouts.js';
import { renderCanvas, renderPdf, damage } from './holdout/render.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const seed = Number(arg('seed', 101)); const count = Number(arg('count', 20)); const out = arg('out', `tests/holdout/seed-${seed}`);
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const rng = makeRng(seed);

// the "quality" of a card: how it reaches the reader
const QUALITIES = [
  { id: 'pdf-text', w: 2 }, { id: 'clean-image', w: 2 }, { id: 'screenshot', w: 2 }, { id: 'photo-mild', w: 4, kinds: [['desk'], ['tilt'], ['desk', 'tilt']] },
  { id: 'photo-hard', w: 4, kinds: [['tilt', 'blur'], ['desk', 'shadow'], ['tilt', 'lowlight'], ['desk', 'lowres'], ['tilt', 'crop'], ['desk', 'glare'], ['tilt', 'shadow', 'lowres']] },
];
const weighted = (list) => { const total = list.reduce((s, x) => s + x.w, 0); let r = rng.float(0, total); for (const x of list) { r -= x.w; if (r <= 0) return x; } return list[0]; };

const truths = [];
for (let i = 0; i < count; i++) {
  const spec = makeSpec(rng, i);
  const layoutName = spec.timetable ? 'timetable' : LAYOUT_NAMES.filter((n) => n !== 'timetable')[rng.int(0, LAYOUT_NAMES.length - 2)];
  const card = buildCard(rng, spec, layoutName);
  const truth = truthOf(spec, card.address);
  const quality = weighted(QUALITIES); const kinds = quality.kinds ? quality.kinds[rng.int(0, quality.kinds.length - 1)] : [];
  let file;
  if (quality.id === 'pdf-text') { file = `${truth.id}.pdf`; writeFileSync(`${out}/${file}`, await renderPdf(card.page)); }
  else if (quality.id === 'clean-image') { file = `${truth.id}.png`; writeFileSync(`${out}/${file}`, renderCanvas(card.page, rng.float(1.2, 2).toFixed(2) * 1).toBuffer('image/png')); }
  else if (quality.id === 'screenshot') { file = `${truth.id}.png`; writeFileSync(`${out}/${file}`, damage(renderCanvas(card.page, 1.4), ['screenshot'], rng).toBuffer('image/png')); }
  else {
    file = `${truth.id}.jpg`; const scale = kinds.includes('lowres') ? rng.float(2, 3) : rng.float(1.4, 2.4);
    writeFileSync(`${out}/${file}`, damage(renderCanvas(card.page, scale), kinds, rng).toBuffer('image/jpeg', rng.int(45, 80)));
  }
  Object.assign(truth, { file, quality: quality.id, damage: kinds, layout: layoutName, fontFamily: card.style.family, lineWidth: card.style.lw, pageSize: `${card.style.W}x${card.style.H}`, fontSize: card.style.size, timetable: spec.timetable, dateStyle: spec.dateStyle, timeStyle: spec.timeStyle, rangeSep: spec.rangeSep });
  truths.push(truth);
}
writeFileSync(`${out}/truth.json`, `${JSON.stringify(truths, null, 1)}\n`);
console.log(`Made ${truths.length} cards in ${out} (seed ${seed})`);
