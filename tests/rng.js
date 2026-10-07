// Small seeded random numbers, so random tests give the same data every run.
export function makeRng(seed = 12345) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)), // inclusive
    float: (min, max) => min + next() * (max - min),
    word: (len) => Array.from({ length: len }, () => String.fromCharCode(97 + Math.floor(next() * 26))).join(''),
  };
}
