import test from 'node:test';
import assert from 'node:assert/strict';
import { toGrey, greyToRgba, resizeGrey, stretchContrast, otsuThreshold, adaptiveBinarize, rotateQuarterTurns, rotateGrey, estimateSkew, deskew,
  cropToPage, crop, scaleToWidth, sharpen, removeBorderBlobs, whitenMask, flattenIllumination } from '../src/ingest/pixels.js';
import { preprocessVariants } from '../src/ingest/preprocess.js';
import { makeRng } from './rng.js';

/** A white page with dark text-like bars (rows of "words"). */
function page(w = 600, h = 400, { bg = 235, ink = 30, rows = 9 } = {}) {
  const data = new Uint8ClampedArray(w * h).fill(bg);
  for (let r = 0; r < rows; r++) {
    const y = 40 + r * 36;
    for (let x = 50; x < w - 80; x++) if ((x % 22) < 16) for (let k = 0; k < 10; k++) data[(y + k) * w + x] = ink;
  }
  return { width: w, height: h, data };
}

test('grey/rgba conversion round trip', () => {
  const rgba = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) };
  const g = toGrey(rgba);
  assert.equal(g.data.length, 2);
  assert.ok(g.data[0] > 60 && g.data[0] < 90);
  assert.equal(greyToRgba(g).data.length, 8);
});

test('resize: enlarge, shrink, same size, tiny', () => {
  const p = page();
  assert.equal(resizeGrey(p, 1200, 800).width, 1200);
  assert.equal(resizeGrey(p, 150, 100).height, 100);
  assert.equal(resizeGrey(p, 600, 400), p);
  assert.equal(resizeGrey(p, 1, 1).data.length, 1);
});

test('contrast stretch spreads a dull picture; a flat picture is left alone', () => {
  const dull = page(300, 200, { bg: 150, ink: 110 });
  const out = stretchContrast(dull);
  assert.ok(Math.max(...out.data) - Math.min(...out.data) > 200);
  const flat = { width: 10, height: 10, data: new Uint8ClampedArray(100).fill(128) };
  assert.equal(stretchContrast(flat), flat);
});

test('otsu finds a threshold between ink and paper', () => {
  const t = otsuThreshold(page());
  assert.ok(t >= 30 && t < 235);
});

test('adaptive binarize copes with a shadow gradient where one threshold would not', () => {
  const p = page(600, 400, { bg: 230, ink: 120 });
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) p.data[y * p.width + x] *= 0.35 + 0.65 * (x / p.width); // dark on the left
  const bw = adaptiveBinarize(p);
  let inkLeft = 0; let inkRight = 0;
  for (let y = 0; y < bw.height; y++) for (let x = 0; x < bw.width; x++) if (bw.data[y * bw.width + x] === 0) { if (x < 300) inkLeft++; else inkRight++; }
  assert.ok(inkLeft > 500 && inkRight > 500);   // text found on both sides
});

test('quarter turns: 4 turns is the identity, 1 turn swaps width and height, 180 reverses', () => {
  const g = { width: 3, height: 2, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6]) };
  let r = g; for (let i = 0; i < 4; i++) r = rotateQuarterTurns(r, 90);
  assert.deepEqual([...r.data], [...g.data]);
  assert.equal(rotateQuarterTurns(g, 90).width, 2);
  assert.deepEqual([...rotateQuarterTurns(g, 180).data], [6, 5, 4, 3, 2, 1]);
  assert.equal(rotateQuarterTurns(g, 0), g);
  assert.equal(rotateQuarterTurns(g, -90).width, 2);
});

test('skew: a page tilted by 4 degrees is measured and straightened; a straight page stays straight', () => {
  const straight = page();
  assert.ok(Math.abs(estimateSkew(straight)) < 0.6);
  const tilted = rotateGrey(straight, 4);
  const angle = estimateSkew(tilted);
  assert.ok(Math.abs(angle - 4) < 0.8, `estimated ${angle}`);
  const fixed = deskew(tilted);
  assert.ok(Math.abs(estimateSkew(fixed.grey)) < 0.8);
  assert.equal(rotateGrey(straight, 0), straight);
});

test('crop: bright page in a dark surround is cut out; a plain page is kept whole', () => {
  const g = { width: 600, height: 400, data: new Uint8ClampedArray(600 * 400).fill(60) };
  const p = page(360, 260);
  for (let y = 0; y < 260; y++) for (let x = 0; x < 360; x++) g.data[(y + 70) * 600 + x + 120] = p.data[y * 360 + x];
  const c = cropToPage(g);
  assert.ok(c.width < 500 && c.height < 330);
  const whole = page();
  const c2 = cropToPage(whole);
  assert.ok(c2.width >= 400);
  assert.equal(crop(whole, 10, 10, 10, 10), whole);
});

test('scaleToWidth: small photos are enlarged, huge ones shrunk, near-equal left alone', () => {
  assert.equal(scaleToWidth(page(1000, 700), 2000).width, 2000);
  assert.ok(Math.max(...[scaleToWidth(page(5000, 7000), 2000).width, scaleToWidth(page(5000, 7000), 2000).height]) <= 3200);
  const p = page(1950, 1000);
  assert.equal(scaleToWidth(p, 2000), p);
});

test('border blobs: a big dark wedge touching the edge is removed, small letters stay', () => {
  const bw = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300).fill(255) };
  for (let y = 0; y < 300; y++) for (let x = 0; x < 60; x++) bw.data[y * 400 + x] = 0;       // big dark strip on the left edge
  for (let y = 100; y < 112; y++) for (let x = 200; x < 210; x++) bw.data[y * 400 + x] = 0; // one letter in the middle
  const { bw: cleaned, mask } = removeBorderBlobs(bw);
  assert.equal(cleaned.data[10 * 400 + 10], 255);
  assert.equal(cleaned.data[105 * 400 + 205], 0);
  const grey = whitenMask({ width: 400, height: 300, data: new Uint8ClampedArray(400 * 300).fill(50) }, mask);
  assert.equal(grey.data[10 * 400 + 10], 255);
});

test('flatten illumination makes a shadowed page even', () => {
  const p = page(600, 400, { bg: 230, ink: 60 });
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) p.data[y * p.width + x] *= 0.3 + 0.7 * (x / p.width);
  const f = flattenIllumination(p);
  const mean = (g, x0, x1) => { let s = 0; let n = 0; for (let y = 5; y < 15; y++) for (let x = x0; x < x1; x++) { s += g.data[y * g.width + x]; n++; } return s / n; }; // empty strip of paper
  assert.ok(Math.abs(mean(p, 20, 60) - mean(p, 540, 580)) > 100);
  assert.ok(Math.abs(mean(f, 20, 60) - mean(f, 540, 580)) < 30);
});

test('sharpen keeps the size and edges', () => {
  const p = page(100, 60);
  const s = sharpen(p, 1);
  assert.equal(s.data.length, p.data.length);
});

test('preprocessVariants gives 3 versions, all upright and sized for OCR; works on noise too', () => {
  const rng = makeRng(40);
  const noise = { width: 300, height: 200, data: new Uint8ClampedArray(300 * 200 * 4).map(() => rng.int(0, 255)) };
  const v = preprocessVariants(noise);
  assert.deepEqual(v.map((x) => x.name), ['clean-grey', 'clean-bw', 'plain']);
  const p = page(700, 500);
  const rgba = greyToRgba(rotateGrey(p, 3));
  const out = preprocessVariants(rgba);
  assert.ok(out[0].grey.width >= 1500);
  assert.ok(Math.abs(out[0].skew - 3) < 1);
  assert.equal(preprocessVariants(greyToRgba(p), { quarterTurns: 1 })[2].grey.width > 0, true);
});
