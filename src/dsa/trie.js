/*
 * TRIE (prefix tree)
 * What:  a tree where each step down is one letter. All words that start with the
 *        same letters share the same path from the root. A word's last node is
 *        marked and stores the word's weight (how important/common it is) and
 *        any extra data (for example the place's coordinates).
 *        prefix search = walk down the typed letters, then collect every word
 *        below that node and keep the best few by weight (using my top-K).
 * Used by: the "start point" box (station / bus stand / city suggestions while
 *          the user types). It is all local, so no search-as-you-type request goes
 *          to Nominatim. Also gives the word list for "Did you mean ...?" hints.
 * Time:  insert = O(L) for word length L.
 *        suggest = O(L + M) to find and visit the M words under the prefix,
 *        plus O(M log K) to keep the best K.
 * Space: O(total letters) in the worst case; shared prefixes are stored once.
 * Why not filter a list? Filtering checks EVERY word on EVERY key press: O(N * L).
 *        The trie only touches words that really start with the prefix.
 */
import { HashMap } from './hashMap.js';
import { Stack } from './stack.js';
import { topK } from './topK.js';
import { mergeSort } from './mergeSort.js';
import { asciiLower } from './kmp.js';

function newNode() {
  return { children: new HashMap(2), entries: null }; // entries: list of {text, weight, data} for words ending here
}

export class Trie {
  constructor() {
    this.root = newNode();
    this.wordCount = 0;
  }

  /** Add a word. `text` is what we show; the key is the lower-case version. */
  insert(text, weight = 1, data = null) {
    const letters = Array.from(asciiLower(String(text).trim()));
    if (letters.length === 0) return;
    let node = this.root;
    for (let i = 0; i < letters.length; i++) {
      let next = node.children.get(letters[i]);
      if (next === undefined) {
        next = newNode();
        node.children.set(letters[i], next);
      }
      node = next;
    }
    if (node.entries === null) node.entries = [];
    node.entries.push({ text: String(text).trim(), weight, data });
    this.wordCount++;
  }

  /** The node for a prefix, or null if no word starts with it. */
  findNode(prefix) {
    const letters = Array.from(asciiLower(String(prefix).trim()));
    let node = this.root;
    for (let i = 0; i < letters.length; i++) {
      node = node.children.get(letters[i]);
      if (node === undefined) return null;
    }
    return node;
  }

  /** Every entry stored at or below a node. Uses my stack instead of recursion. */
  collect(startNode) {
    const found = [];
    const toVisit = new Stack();
    toVisit.push(startNode);
    while (!toVisit.isEmpty()) {
      const node = toVisit.pop();
      if (node.entries !== null) for (let i = 0; i < node.entries.length; i++) found.push(node.entries[i]);
      const kids = node.children.values();
      for (let i = 0; i < kids.length; i++) toVisit.push(kids[i]);
    }
    return found;
  }

  /** Best `limit` entries for a prefix: heaviest first; ties in alphabetical order. */
  suggest(prefix, limit = 5) {
    const node = this.findNode(prefix);
    if (node === null) return [];
    const all = this.collect(node);
    const best = topK(all, limit, byWeightThenName);
    return mergeSort(best, byWeightThenName); // same order, written out explicitly
  }

  /** All stored words (display text, without duplicates in the same spot). */
  allWords() {
    return this.collect(this.root).map((entry) => entry.text);
  }
}

function byWeightThenName(a, b) {
  if (a.weight !== b.weight) return b.weight - a.weight; // bigger weight first
  if (a.text < b.text) return -1;
  if (a.text > b.text) return 1;
  return 0;
}
