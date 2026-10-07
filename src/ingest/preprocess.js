// Photo clean-up before OCR, all inside the browser.
// Gives several versions of the picture (best first). The caller tries them in order and keeps the best result.
import { resizeGrey, toGrey, cropToPage, flattenIllumination, deskew, stretchContrast, scaleToWidth, adaptiveBinarize, sharpen, rotateQuarterTurns, removeBorderBlobs, whitenMask } from './pixels.js';

/**
 * rgba: decoded picture. Options: { quarterTurns } to turn the picture first (from orientation detection).
 * Returns [{ name, grey }] ordered: cleaned grey, cleaned black-and-white, plain grey.
 */
export function preprocessVariants(rgba, { quarterTurns = 0 } = {}) {
  let grey = toGrey(rgba);
  if (quarterTurns) grey = rotateQuarterTurns(grey, quarterTurns * 90);
  const plain = scaleToWidth(grey, 2000);

  let page = flattenIllumination(cropToPage(grey));
  const straightened = deskew(page);
  page = straightened.grey;
  // the corners that appear when we rotate are white; crop again so margins stay small
  page = cropToPage(page);
  const clean = scaleToWidth(stretchContrast(page), 2000);
  // black-and-white version, with big dark leftovers at the edges removed (from both versions)
  const { bw, mask } = removeBorderBlobs(adaptiveBinarize(sharpen(clean, 0.6)));
  const cleanGrey = whitenMask(clean, mask);

  return [
    { name: 'clean-grey', grey: cleanGrey, skew: straightened.angle },
    { name: 'clean-bw', grey: bw, skew: straightened.angle },
    { name: 'plain', grey: plain, skew: 0 },
  ];
}

/** A bigger, slightly sharpened copy: helps blurry photos and small Hindi text. Used only when the normal tries gave a poor result. */
export function enlargedVariant(grey) {
  return { name: 'enlarged', grey: sharpen(resizeGrey(grey, grey.width * 1.4, grey.height * 1.4), 1.2), skew: 0 };
}
