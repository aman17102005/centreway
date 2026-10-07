import test from 'node:test';
import assert from 'node:assert/strict';
import { detectGrid, buildCells, fillCells, gapCells } from '../src/ingest/grid.js';
import { rotateGrey } from '../src/ingest/pixels.js';

/** A white page with a bordered table: rows of cells given as widths. */
function tablePage(width, height, rowsY, colsX, { skipBottom = null } = {}) {
  const data = new Uint8ClampedArray(width * height).fill(255);
  const hline = (y, x0, x1) => { for (let x = x0; x <= x1; x++) for (let t = 0; t < 2; t++) data[(y + t) * width + x] = 0; };
  const vline = (x, y0, y1) => { for (let y = y0; y <= y1; y++) for (let t = 0; t < 2; t++) data[y * width + x + t] = 0; };
  rowsY.forEach((y) => { if (y !== skipBottom) hline(y, colsX[0], colsX[colsX.length - 1]); });
  colsX.forEach((x) => vline(x, rowsY[0], rowsY[rowsY.length - 1]));
  return { width, height, data };
}

test('grid: finds the ruling lines of a table and the cells between them', () => {
  const page = tablePage(800, 500, [50, 120, 200, 300], [40, 240, 520, 760]);
  const grid = detectGrid(page);
  assert.equal(grid.h.length, 4);
  assert.equal(grid.v.length, 4);
  const cells = buildCells(grid);
  assert.equal(cells.length, 9);                       // 3 rows x 3 columns
  assert.ok(cells.every((c) => c.x1 > c.x0 && c.y1 > c.y0));
});

test('grid: a page with only text strokes has no table', () => {
  const data = new Uint8ClampedArray(800 * 500).fill(255);
  for (let y = 40; y < 460; y += 40) for (let x = 40; x < 700; x++) if (x % 20 < 14) for (let t = 0; t < 8; t++) data[(y + t) * 800 + x] = 0;   // dashes like words
  const grid = detectGrid({ width: 800, height: 500, data });
  assert.deepEqual(buildCells(grid), []);
});

test('grid: slightly tilted lines are still found', () => {
  const page = tablePage(900, 600, [60, 140, 240, 340, 440], [50, 300, 600, 850]);
  const tilted = rotateGrey({ width: 900, height: 600, data: page.data }, 0.4);
  const cells = buildCells(detectGrid(tilted));
  assert.ok(cells.length >= 8, `cells ${cells.length}`);
});

test('grid: one frame or a photo box is not a table (fewer than 6 cells)', () => {
  const page = tablePage(800, 500, [50, 200], [40, 400, 760]);        // 2 cells only
  assert.deepEqual(buildCells(detectGrid(page)), []);
});

test('grid: a cell that spans two rows (no line under it) is one tall cell', () => {
  // columns 40..300 | 300..520 | 520..760, rows 50,120,200 ; the line at y=120 is missing in the left column
  const page = tablePage(800, 400, [50, 120, 200], [40, 300, 450, 600, 760]);
  for (let x = 41; x < 299; x++) for (let t = 0; t < 2; t++) page.data[(120 + t) * 800 + x] = 255;
  const cells = buildCells(detectGrid(page));
  const left = cells.filter((c) => c.x1 < 310);
  assert.equal(left.length, 1);
  assert.ok(left[0].y1 - left[0].y0 > 140);
});

test('fillCells: words go into the cell that holds their middle; words outside stay outside; cell text joins its lines', () => {
  const cells = [{ x0: 0, y0: 0, x1: 200, y1: 100 }, { x0: 200, y0: 0, x1: 400, y1: 100 }, { x0: 0, y0: 100, x1: 400, y1: 200 }, { x0: 0, y0: 200, x1: 100, y1: 300 }];
  const w = (text, x0, y0) => ({ text, conf: 90, x0, x1: x0 + 40, y0, y1: y0 + 14 });
  const { cells: filled, outside } = fillCells(cells, [w('Test', 10, 10), w('Centre', 60, 10), w('Name', 10, 30), w('UP0802', 220, 10), w('Below', 10, 120), w('Stray', 500, 500)]);
  assert.equal(filled[0].text, 'Test Centre Name');
  assert.equal(filled[1].text, 'UP0802');
  assert.equal(filled[2].text, 'Below');
  assert.equal(outside.length, 1);
  assert.equal(filled[3].text, '');
});

test('gapCells: a line is cut into cells where the gap is wide', () => {
  const w = (text, x0) => ({ text, conf: 90, x0, x1: x0 + text.length * 10, y0: 0, y1: 20 });
  const line = { words: [w('Reporting', 0), w('Time', 100), w('07:00', 400), w('AM', 460)] };
  const cells = gapCells([line, { words: [] }]);
  assert.deepEqual(cells.map((c) => c.text), ['Reporting Time', '07:00 AM']);
});
