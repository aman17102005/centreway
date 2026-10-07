/*
 * KMP STRING SEARCH (Knuth-Morris-Pratt)
 * What:  finds a pattern inside a text without ever moving backwards in the text.
 *        First we build a "failure table": for each position in the pattern, the
 *        length of the longest part that is both a prefix and a suffix. After a
 *        mismatch the table tells us how much of the pattern we can keep.
 * Used by: finding labels such as "Reporting Time", "Gate Closing Time",
 *          "Date of Exam", "Venue", "Address" (and Hindi labels) in OCR text.
 * Time:  O(n + m) for text length n and pattern length m (table build O(m)).
 * Space: O(m).
 * Why not text.indexOf / a simple double loop? The simple loop can take O(n * m)
 *        when the text has many partial matches. KMP is always linear.
 * Case-insensitive search: callers pass text through asciiLower() first.
 */

/** Lower-case A-Z only. Other letters (Hindi has no case) stay the same, and the length never changes. */
export function asciiLower(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : text[i];
  }
  return out;
}

/** failure[i] = length of the longest proper prefix of pattern[0..i] that is also its suffix. */
export function buildFailureTable(pattern) {
  const failure = new Array(pattern.length).fill(0);
  let matched = 0;
  for (let i = 1; i < pattern.length; i++) {
    while (matched > 0 && pattern[i] !== pattern[matched]) matched = failure[matched - 1];
    if (pattern[i] === pattern[matched]) matched++;
    failure[i] = matched;
  }
  return failure;
}

/** Start positions of every match (overlapping matches included). Empty pattern -> []. */
export function kmpSearchAll(text, pattern) {
  const found = [];
  if (pattern.length === 0 || pattern.length > text.length) return found;
  const failure = buildFailureTable(pattern);
  let matched = 0;
  for (let i = 0; i < text.length; i++) {
    while (matched > 0 && text[i] !== pattern[matched]) matched = failure[matched - 1];
    if (text[i] === pattern[matched]) matched++;
    if (matched === pattern.length) {
      found.push(i - pattern.length + 1);
      matched = failure[matched - 1];
    }
  }
  return found;
}

/** First match at or after `from`, or -1. */
export function kmpFirst(text, pattern, from = 0) {
  if (pattern.length === 0 || pattern.length > text.length - from) return -1;
  const failure = buildFailureTable(pattern);
  let matched = 0;
  for (let i = from; i < text.length; i++) {
    while (matched > 0 && text[i] !== pattern[matched]) matched = failure[matched - 1];
    if (text[i] === pattern[matched]) matched++;
    if (matched === pattern.length) return i - pattern.length + 1;
  }
  return -1;
}

/**
 * Look for any of several labels in an already lower-cased text.
 * Returns the earliest one (the longest if two start together) as { index, end, label }, or null.
 */
export function findFirstLabel(lowerText, labels, from = 0) {
  let best = null;
  for (let i = 0; i < labels.length; i++) {
    const index = kmpFirst(lowerText, labels[i], from);
    if (index < 0) continue;
    if (best === null || index < best.index || (index === best.index && labels[i].length > best.label.length)) {
      best = { index, end: index + labels[i].length, label: labels[i] };
    }
  }
  return best;
}
