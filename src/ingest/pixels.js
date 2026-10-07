// Image clean-up on raw pixels. Pure functions (no browser needed), so they run in the app and in tests.
// Types:  RGBA image = { width, height, data: Uint8ClampedArray (4 bytes per pixel) }
//         grey image = { width, height, data: Uint8ClampedArray (1 byte per pixel, 0 = black, 255 = white) }

/** Colour -> grey (luminance). */
export function toGrey(rgba) {
  const { width, height, data } = rgba;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
  return { width, height, data: out };
}

/** Grey -> RGBA (so it can be drawn on a canvas or saved as PNG). */
export function greyToRgba(grey) {
  const out = new Uint8ClampedArray(grey.width * grey.height * 4);
  for (let i = 0, p = 0; i < grey.data.length; i++, p += 4) { out[p] = out[p + 1] = out[p + 2] = grey.data[i]; out[p + 3] = 255; }
  return { width: grey.width, height: grey.height, data: out };
}

/** Bilinear resize (works for enlarging and shrinking; for big shrinks it averages first). */
export function resizeGrey(grey, newWidth, newHeight) {
  newWidth = Math.max(1, Math.round(newWidth));
  newHeight = Math.max(1, Math.round(newHeight));
  if (newWidth === grey.width && newHeight === grey.height) return grey;
  let src = grey;
  // shrinking by more than 2x: average blocks first, otherwise thin text disappears
  while (src.width >= newWidth * 2 && src.height >= newHeight * 2) src = halve(src);
  const out = new Uint8ClampedArray(newWidth * newHeight);
  const xRatio = src.width / newWidth;
  const yRatio = src.height / newHeight;
  for (let y = 0; y < newHeight; y++) {
    const sy = Math.max(0, (y + 0.5) * yRatio - 0.5);
    const y0 = Math.floor(sy);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < newWidth; x++) {
      const sx = Math.max(0, (x + 0.5) * xRatio - 0.5);
      const x0 = Math.floor(sx);
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = sx - x0;
      const top = src.data[y0 * src.width + x0] * (1 - fx) + src.data[y0 * src.width + x1] * fx;
      const bottom = src.data[y1 * src.width + x0] * (1 - fx) + src.data[y1 * src.width + x1] * fx;
      out[y * newWidth + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return { width: newWidth, height: newHeight, data: out };
}

function halve(g) {
  const w = g.width >> 1;
  const h = g.height >> 1;
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 2 * y * g.width + 2 * x;
    out[y * w + x] = (g.data[i] + g.data[i + 1] + g.data[i + g.width] + g.data[i + g.width + 1]) / 4;
  }
  return { width: w, height: h, data: out };
}

/** Stretch the brightness range so the darkest 1% becomes black and the brightest 1% becomes white. */
export function stretchContrast(grey, lowPercent = 1, highPercent = 99) {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < grey.data.length; i++) histogram[grey.data[i]]++;
  const total = grey.data.length;
  let low = 0; let high = 255; let sum = 0;
  for (let v = 0; v < 256; v++) { sum += histogram[v]; if (sum >= total * lowPercent / 100) { low = v; break; } }
  sum = 0;
  for (let v = 0; v < 256; v++) { sum += histogram[v]; if (sum >= total * highPercent / 100) { high = v; break; } }
  if (high - low < 20) return grey; // nearly flat: nothing sensible to stretch
  const out = new Uint8ClampedArray(grey.data.length);
  const scale = 255 / (high - low);
  for (let i = 0; i < out.length; i++) out[i] = (grey.data[i] - low) * scale;
  return { width: grey.width, height: grey.height, data: out };
}

/** Otsu's method: the brightness that best splits "ink" from "paper". */
export function otsuThreshold(grey) {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < grey.data.length; i++) histogram[grey.data[i]]++;
  const total = grey.data.length;
  let sumAll = 0;
  for (let v = 0; v < 256; v++) sumAll += v * histogram[v];
  let sumBack = 0; let weightBack = 0; let best = 0; let bestVariance = -1;
  for (let v = 0; v < 256; v++) {
    weightBack += histogram[v];
    if (weightBack === 0) continue;
    const weightFront = total - weightBack;
    if (weightFront === 0) break;
    sumBack += v * histogram[v];
    const meanBack = sumBack / weightBack;
    const meanFront = (sumAll - sumBack) / weightFront;
    const variance = weightBack * weightFront * (meanBack - meanFront) ** 2;
    if (variance > bestVariance) { bestVariance = variance; best = v; }
  }
  return best;
}

/**
 * Black-and-white using a local average (Bradley): a pixel is ink if it is clearly darker than the
 * pixels around it. This survives shadows and uneven light, where one global threshold would fail.
 */
export function adaptiveBinarize(grey, windowSize = 0, darker = 0.15) {
  const { width, height, data } = grey;
  const half = Math.max(8, (windowSize || Math.round(Math.min(width, height) / 16)) >> 1);
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += data[y * width + x];
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + rowSum;
    }
  }
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half); const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half); const x1 = Math.min(width - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * (width + 1) + x1 + 1] - integral[y0 * (width + 1) + x1 + 1] - integral[(y1 + 1) * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
      out[y * width + x] = data[y * width + x] * area < sum * (1 - darker) ? 0 : 255;
    }
  }
  return { width, height, data: out };
}

/** Turn the picture by 0, 90, 180 or 270 degrees clockwise. */
export function rotateQuarterTurns(grey, degrees) {
  const turns = ((Math.round(degrees / 90) % 4) + 4) % 4;
  if (turns === 0) return grey;
  const { width, height, data } = grey;
  if (turns === 2) {
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data[data.length - 1 - i];
    return { width, height, data: out };
  }
  const out = new Uint8ClampedArray(data.length);
  const newWidth = height; const newHeight = width;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nx = turns === 1 ? height - 1 - y : y;
    const ny = turns === 1 ? x : width - 1 - x;
    out[ny * newWidth + nx] = data[y * width + x];
  }
  return { width: newWidth, height: newHeight, data: out };
}

/** Rotate by a small angle (degrees, positive = clockwise). The picture grows a little so nothing is cut off. */
export function rotateGrey(grey, degrees, fill = 255) {
  if (Math.abs(degrees) < 0.05) return grey;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad); const sin = Math.sin(rad);
  const { width, height, data } = grey;
  const newWidth = Math.ceil(Math.abs(width * cos) + Math.abs(height * sin));
  const newHeight = Math.ceil(Math.abs(width * sin) + Math.abs(height * cos));
  const out = new Uint8ClampedArray(newWidth * newHeight).fill(fill);
  const cx = width / 2; const cy = height / 2;
  const ncx = newWidth / 2; const ncy = newHeight / 2;
  for (let y = 0; y < newHeight; y++) for (let x = 0; x < newWidth; x++) {
    // find the source pixel that lands on (x, y): rotate backwards
    const dx = x - ncx; const dy = y - ncy;
    const sx = dx * cos + dy * sin + cx;
    const sy = -dx * sin + dy * cos + cy;
    if (sx < 0 || sy < 0 || sx >= width - 1 || sy >= height - 1) continue;
    const x0 = Math.floor(sx); const y0 = Math.floor(sy);
    const fx = sx - x0; const fy = sy - y0;
    const i = y0 * width + x0;
    out[y * newWidth + x] = (data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) + (data[i + width] * (1 - fx) + data[i + width + 1] * fx) * fy;
  }
  return { width: newWidth, height: newHeight, data: out };
}

/**
 * How tilted is the text? Returns degrees (positive = text slopes down to the right, so rotate counter-clockwise... see use).
 * Idea: when the page is straight, ink piles up in a few sharp horizontal lines, so the squared row counts are
 * largest. We try angles from -maxAngle to +maxAngle and keep the angle with the sharpest line pattern.
 */
export function estimateSkew(grey, maxAngle = 10) {
  // work on a small copy
  const scale = Math.min(1, 700 / Math.max(grey.width, grey.height));
  const small = scale < 1 ? resizeGrey(grey, grey.width * scale, grey.height * scale) : grey;
  const bw = adaptiveBinarize(small, 0, 0.18);
  const dark = [];
  for (let y = 0; y < bw.height; y++) for (let x = 0; x < bw.width; x++) if (bw.data[y * bw.width + x] === 0) dark.push(x, y);
  if (dark.length < 200) return 0;
  const score = (angle) => {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    const bins = new Float64Array(bw.height * 2 + bw.width + 10);
    const offset = bw.width;
    for (let i = 0; i < dark.length; i += 2) bins[Math.round(dark[i + 1] * cos - dark[i] * sin) + offset]++;
    let s = 0;
    for (let i = 0; i < bins.length; i++) s += bins[i] * bins[i];
    return s;
  };
  let best = 0; let bestScore = score(0);
  for (let a = -maxAngle; a <= maxAngle; a += 0.5) { const s = score(a); if (s > bestScore) { bestScore = s; best = a; } }
  for (let a = best - 0.45; a <= best + 0.45; a += 0.1) { const s = score(a); if (s > bestScore) { bestScore = s; best = a; } }
  return best;
}

/** Remove a tilt found by estimateSkew. */
export function deskew(grey, maxAngle = 10) {
  const angle = estimateSkew(grey, maxAngle);
  return { grey: rotateGrey(grey, -angle), angle };
}

/**
 * Crop to the page: if the picture has a dark surround (table, hand, wall), keep the bright page area;
 * then remove the empty white margins around the text. Returns the same picture if nothing sensible is found.
 */
export function cropToPage(grey) {
  const scale = Math.min(1, 500 / Math.max(grey.width, grey.height));
  const small = scale < 1 ? resizeGrey(grey, grey.width * scale, grey.height * scale) : grey;
  const t = otsuThreshold(small);
  let box = { x0: 0, y0: 0, x1: small.width - 1, y1: small.height - 1 };

  // 1) bright page area inside a darker surround
  const brightCols = new Array(small.width).fill(0);
  const brightRows = new Array(small.height).fill(0);
  let bright = 0;
  for (let y = 0; y < small.height; y++) for (let x = 0; x < small.width; x++) {
    if (small.data[y * small.width + x] > t) { brightCols[x]++; brightRows[y]++; bright++; }
  }
  const brightShare = bright / small.data.length;
  if (brightShare > 0.25 && brightShare < 0.92) {
    const pick = (counts, size) => {
      let from = 0; let to = counts.length - 1;
      while (from < to && counts[from] < size * 0.4) from++;
      while (to > from && counts[to] < size * 0.4) to--;
      return [from, to];
    };
    const [x0, x1] = pick(brightCols, small.height);
    const [y0, y1] = pick(brightRows, small.width);
    if ((x1 - x0) * (y1 - y0) > 0.3 * small.width * small.height) {
      // A shadow can look like the dark table. Only accept the page box if what it throws away has no text in it:
      // text shows up as dark strokes after local thresholding, a plain table does not.
      const local = adaptiveBinarize(small, 0, 0.2);
      let outside = 0; let ink = 0;
      for (let y = 0; y < small.height; y++) for (let x = 0; x < small.width; x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        outside++;
        if (local.data[y * small.width + x] === 0) ink++;
      }
      if (outside === 0 || ink / outside < 0.012) box = { x0, y0, x1, y1 };
    }
  }

  // 2) tight crop around the ink inside that area
  const inkCols = new Array(small.width).fill(0);
  const inkRows = new Array(small.height).fill(0);
  const bwSmall = adaptiveBinarize(small, 0, 0.2);
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    if (bwSmall.data[y * small.width + x] === 0) { inkCols[x]++; inkRows[y]++; }
  }
  const trim = (counts, from, to, minInk) => {
    while (from < to && counts[from] <= minInk) from++;
    while (to > from && counts[to] <= minInk) to--;
    return [from, to];
  };
  const [ix0, ix1] = trim(inkCols, box.x0, box.x1, 1);
  const [iy0, iy1] = trim(inkRows, box.y0, box.y1, 1);
  const marginX = Math.round(small.width * 0.02) + 2;
  const marginY = Math.round(small.height * 0.02) + 2;
  const cx0 = Math.max(box.x0, ix0 - marginX); const cx1 = Math.min(box.x1, ix1 + marginX);
  const cy0 = Math.max(box.y0, iy0 - marginY); const cy1 = Math.min(box.y1, iy1 + marginY);
  if ((cx1 - cx0) < small.width * 0.25 || (cy1 - cy0) < small.height * 0.15) return grey; // looks wrong: keep everything
  const inv = 1 / scale;
  return crop(grey, Math.floor(cx0 * inv), Math.floor(cy0 * inv), Math.ceil((cx1 + 1) * inv), Math.ceil((cy1 + 1) * inv));
}

export function crop(grey, x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(grey.width, x1); y1 = Math.min(grey.height, y1);
  const w = x1 - x0; const h = y1 - y0;
  if (w <= 0 || h <= 0) return grey;
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) out.set(grey.data.subarray((y0 + y) * grey.width + x0, (y0 + y) * grey.width + x0 + w), y * w);
  return { width: w, height: h, data: out };
}

/** Scale so the page is about `targetWidth` pixels wide (enlarge small photos, shrink huge ones). */
export function scaleToWidth(grey, targetWidth = 2000, maxSide = 3200) {
  let factor = targetWidth / grey.width;
  if (Math.max(grey.width, grey.height) * factor > maxSide) factor = maxSide / Math.max(grey.width, grey.height);
  if (factor > 0.9 && factor < 1.1) return grey;
  return resizeGrey(grey, grey.width * factor, grey.height * factor);
}

/** Light sharpening (unsharp mask) to help blurry photos. */
export function sharpen(grey, amount = 1) {
  const { width, height, data } = grey;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) { out[i] = data[i]; continue; }
    const blur = (data[i - 1] + data[i + 1] + data[i - width] + data[i + width] + data[i]) / 5;
    out[i] = data[i] + amount * (data[i] - blur);
  }
  return { width, height, data: out };
}

/**
 * Remove big dark areas that touch the picture edge (leftover table, hand, shadow or rotated-page corners).
 * Characters are small, so only large connected dark areas (more than `minShare` of the picture) are removed.
 * Returns { bw, mask } where mask[i] = 1 for removed pixels (use whitenMask to clean a grey picture too).
 */
export function removeBorderBlobs(bw, minShare = 0.0008) {
  const { width, height, data } = bw;
  const seen = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  const out = new Uint8ClampedArray(data);
  const minSize = Math.max(1500, Math.round(width * height * minShare));
  const stack = new Int32Array(width * height);
  const visit = (start) => {
    let top = 0; let count = 0;
    const members = [];
    stack[top++] = start; seen[start] = 1;
    while (top > 0) {
      const p = stack[--top];
      members.push(p); count++;
      const x = p % width; const y = (p - x) / width;
      if (x > 0 && !seen[p - 1] && data[p - 1] === 0) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < width - 1 && !seen[p + 1] && data[p + 1] === 0) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && !seen[p - width] && data[p - width] === 0) { seen[p - width] = 1; stack[top++] = p - width; }
      if (y < height - 1 && !seen[p + width] && data[p + width] === 0) { seen[p + width] = 1; stack[top++] = p + width; }
    }
    if (count >= minSize) for (const p of members) { out[p] = 255; mask[p] = 1; }
  };
  // start from every dark pixel that is within a few pixels of the edge
  const edge = 12;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nearEdge = x < edge || y < edge || x >= width - edge || y >= height - edge;
    if (nearEdge && data[y * width + x] === 0 && !seen[y * width + x]) visit(y * width + x);
  }
  return { bw: { width, height, data: out }, mask };
}

/** Paint white wherever mask is 1 (and a 3-pixel ring around it, to remove soft edges). */
export function whitenMask(grey, mask) {
  const { width, height, data } = grey;
  const out = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) out[ny * width + nx] = 255;
    }
  }
  return { width, height, data: out };
}

/**
 * Even out the light: shadows, glare and dim corners make text hard to read.
 * The page background is estimated (small copy, remove thin dark text with a max filter, blur), then every pixel is divided by it.
 */
export function flattenIllumination(grey) {
  const factor = Math.max(1, Math.round(Math.max(grey.width, grey.height) / 300));
  const small = factor > 1 ? resizeGrey(grey, grey.width / factor, grey.height / factor) : grey;
  const bg = boxBlur(maxFilter(small, 3), 8);
  const background = factor > 1 ? resizeGrey(bg, grey.width, grey.height) : bg;
  const out = new Uint8ClampedArray(grey.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, (grey.data[i] / Math.max(25, background.data[i])) * 240);
  return { width: grey.width, height: grey.height, data: out };
}

/** Each pixel becomes the brightest pixel within `radius` (removes thin dark strokes). Two passes: rows, then columns. */
function maxFilter(g, radius) {
  const { width, height, data } = g;
  const tmp = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let m = 0;
    for (let k = Math.max(0, x - radius); k <= Math.min(width - 1, x + radius); k++) if (data[y * width + k] > m) m = data[y * width + k];
    tmp[y * width + x] = m;
  }
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let m = 0;
    for (let k = Math.max(0, y - radius); k <= Math.min(height - 1, y + radius); k++) if (tmp[k * width + x] > m) m = tmp[k * width + x];
    out[y * width + x] = m;
  }
  return { width, height, data: out };
}

/** Average over a (2*radius+1) square, using running sums so it stays fast. */
function boxBlur(g, radius) {
  const { width, height, data } = g;
  const tmp = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    let sum = 0; let count = 0;
    for (let x = 0; x < Math.min(width, radius); x++) { sum += data[y * width + x]; count++; }
    for (let x = 0; x < width; x++) {
      if (x + radius < width) { sum += data[y * width + x + radius]; count++; }
      if (x - radius - 1 >= 0) { sum -= data[y * width + x - radius - 1]; count--; }
      tmp[y * width + x] = sum / count;
    }
  }
  const out = new Uint8ClampedArray(data.length);
  for (let x = 0; x < width; x++) {
    let sum = 0; let count = 0;
    for (let y = 0; y < Math.min(height, radius); y++) { sum += tmp[y * width + x]; count++; }
    for (let y = 0; y < height; y++) {
      if (y + radius < height) { sum += tmp[(y + radius) * width + x]; count++; }
      if (y - radius - 1 >= 0) { sum -= tmp[(y - radius - 1) * width + x]; count--; }
      out[y * width + x] = sum / count;
    }
  }
  return { width, height, data: out };
}
