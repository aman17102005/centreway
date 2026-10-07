// "Can I bring...?" checker. The answer comes from the instructions on the user's OWN admit card first.
//   - A hash map (src/dsa/hashMap.js) turns every synonym into its item ("wrist watch" -> watch).
//   - A trie (src/dsa/trie.js) gives suggestions while the user types ("wa" -> watch, water bottle ...).
//   - KMP (src/dsa/kmp.js) finds the synonyms in the card's instruction sentences.
// If the card does not mention the item the answer is NEVER "allowed": it says the card does not mention it.
import { HashMap } from '../dsa/hashMap.js';
import { Trie } from '../dsa/trie.js';
import { asciiLower, kmpSearchAll } from '../dsa/kmp.js';

/** The items people ask about, with the words a card may use for them. weight = how common the question is (suggestion order). */
export const CATALOG = [
  { id: 'mobile', label: 'Mobile phone', weight: 100, synonyms: ['mobile', 'mobile phone', 'mobile phones', 'cell phone', 'cellphone', 'smartphone', 'smart phone', 'phone', 'phones', 'handset', 'मोबाइल', 'मोबाइल फोन'] },
  { id: 'watch', label: 'Watch', weight: 95, synonyms: ['watch', 'watches', 'wrist watch', 'wristwatch', 'wrist watches', 'smart watch', 'smartwatch', 'smart watches', 'digital watch', 'घड़ी', 'घडी'] },
  { id: 'calculator', label: 'Calculator', weight: 90, synonyms: ['calculator', 'calculators', 'calc', 'कैलकुलेटर', 'केलकुलेटर'] },
  { id: 'pen', label: 'Pen', weight: 85, synonyms: ['pen', 'pens', 'ball point pen', 'ballpoint pen', 'black pen', 'blue pen', 'black ball point pen', 'पेन', 'कलम'] },
  { id: 'bottle', label: 'Water bottle', weight: 80, synonyms: ['water bottle', 'bottle', 'bottles', 'transparent bottle', 'transparent water bottle', 'बोतल', 'पानी की बोतल'] },
  { id: 'id', label: 'Photo ID', weight: 88, synonyms: ['photo id', 'photo identity', 'photo id proof', 'id proof', 'id card', 'identity card', 'identity proof', 'id', 'aadhaar', 'aadhar', 'pan card', 'voter id', 'driving licence', 'driving license', 'passport', 'पहचान पत्र', 'फोटो पहचान पत्र', 'आधार'] },
  { id: 'admit', label: 'Admit card', weight: 87, synonyms: ['admit card', 'e-admit card', 'hall ticket', 'call letter', 'admission card', 'admit-card', 'प्रवेश पत्र', 'एडमिट कार्ड'] },
  { id: 'photo', label: 'Passport-size photo', weight: 70, synonyms: ['passport size photo', 'passport size photograph', 'passport-size photo', 'passport photo', 'photograph', 'photographs', 'photo', 'photos', 'फोटो', 'फोटोग्राफ'] },
  { id: 'bag', label: 'Bag', weight: 60, synonyms: ['bag', 'bags', 'handbag', 'hand bag', 'backpack', 'purse', 'luggage', 'बैग', 'थैला'] },
  { id: 'headphones', label: 'Earphones / headphones', weight: 55, synonyms: ['earphone', 'earphones', 'headphone', 'headphones', 'earbuds', 'bluetooth', 'bluetooth device', 'ear phone'] },
  { id: 'books', label: 'Books / notes / paper', weight: 50, synonyms: ['book', 'books', 'notes', 'note book', 'notebook', 'paper', 'papers', 'chits', 'chit', 'slip', 'slips', 'printed material', 'textual material', 'written material', 'किताब', 'पुस्तक'] },
  { id: 'jewellery', label: 'Jewellery / metal items', weight: 45, synonyms: ['jewellery', 'jewelry', 'ring', 'rings', 'chain', 'earrings', 'bracelet', 'metal items', 'metallic items', 'ornaments', 'आभूषण'] },
  { id: 'wallet', label: 'Wallet / belt', weight: 40, synonyms: ['wallet', 'belt', 'purse', 'cap', 'hat', 'scarf', 'muffler'] },
  { id: 'food', label: 'Food / snacks', weight: 40, synonyms: ['food', 'eatables', 'snacks', 'tiffin', 'lunch', 'edibles', 'खाने का सामान'] },
  { id: 'shoes', label: 'Shoes / footwear', weight: 35, synonyms: ['shoes', 'shoe', 'footwear', 'sandals', 'slippers', 'जूते'] },
  { id: 'glasses', label: 'Spectacles', weight: 30, synonyms: ['spectacles', 'glasses', 'specs', 'sunglasses', 'goggles', 'चश्मा'] },
  { id: 'pencil', label: 'Pencil / eraser', weight: 30, synonyms: ['pencil', 'pencils', 'eraser', 'sharpener', 'geometry box', 'instrument box', 'scale', 'ruler', 'पेंसिल'] },
  { id: 'sanitizer', label: 'Sanitizer / mask', weight: 25, synonyms: ['sanitizer', 'sanitiser', 'mask', 'face mask'] },
];

/** Items that go into the day-before checklist when the card says "must bring". */
export const CHECKLIST_ITEMS = ['id', 'photo', 'admit', 'pen'];

let index = null;
function buildIndex() {
  if (index) return index;
  const bySynonym = new HashMap(64);               // synonym (lower case) -> item id
  const trie = new Trie();                         // every synonym, for prefix suggestions
  const byId = new HashMap(32);
  for (const item of CATALOG) {
    byId.set(item.id, item);
    for (const word of item.synonyms) {
      const key = asciiLower(word);
      if (bySynonym.get(key) === undefined) { bySynonym.set(key, item.id); trie.insert(word, item.weight, item.id); }
    }
  }
  index = { bySynonym, trie, byId };
  return index;
}

/** Suggestions while typing: up to `k` different items whose words start with what was typed (most common first). */
export function suggestItems(prefix, k = 5) {
  const { trie, byId } = buildIndex();
  if (!String(prefix || '').trim()) return [];
  const out = [];
  for (const entry of trie.suggest(prefix, 40)) {
    if (out.some((o) => o.item.id === entry.data)) continue;
    out.push({ item: byId.get(entry.data), word: entry.text });
    if (out.length >= k) break;
  }
  return out;
}

/** The item a typed text means: an exact synonym, else the best prefix suggestion, else a synonym inside the text ("my water bottle"). null if unknown. */
export function lookupItem(text) {
  const { bySynonym, byId } = buildIndex();
  const q = asciiLower(String(text || '').trim());
  if (!q) return null;
  const exact = bySynonym.get(q);
  if (exact !== undefined) return byId.get(exact);
  let best = null;
  for (const item of CATALOG) for (const word of item.synonyms) {
    const w = asciiLower(word);
    if (w.length >= 3 && kmpSearchAll(q, w).some((at) => isWordAt(q, at, w.length)) && (!best || w.length > best.len)) best = { item, len: w.length };
  }
  if (best) return best.item;
  const s = suggestItems(q, 1);
  return s.length ? s[0].item : null;
}

// ---------------------------------------------------------------- reading the card
const NEGATIVE = ['not be allowed', 'will not be permitted', 'not allowed', 'strictly prohibited', 'prohibited', 'banned', 'not permitted', 'do not bring', 'should not bring', 'must not bring', 'not to bring',
  'not carry', "don't bring", 'must not carry', 'should not carry', 'cannot be carried', 'cannot carry', 'forbidden', 'restricted', 'not be carried', 'not to carry', 'no entry with', 'अनुमति नहीं', 'प्रतिबंधित', 'वर्जित', 'लाना मना', 'मना है', 'नहीं ला सकते', 'नहीं लाएं', 'नहीं लायें'];
const MUST = ['must bring', 'must carry', 'should bring', 'should carry', 'have to bring', 'have to carry', 'need to bring', 'required to bring', 'required to carry', 'bring along', 'compulsory', 'mandatory', 'must produce', 'must show', 'must have',
  'to be brought', 'to be carried', 'must be brought', 'must be carried', 'should be brought', 'should be carried', 'has to be brought', 'bring the', 'bring your', 'carry the', 'carry your', 'is required', 'are required', 'अनिवार्य', 'साथ लाना', 'साथ लाएं', 'साथ लायें', 'लाना होगा', 'लेकर आएं'];
// a bare "bring" / "carry" counts as "must bring" only when no "not allowed" phrase sits just before it ("not allowed to carry mobile phones")
const MUST_WEAK = ['bring', 'carry', 'brought', 'carried'];
const ALLOWED = ['are allowed', 'is allowed', 'will be allowed', 'is permitted', 'are permitted', 'may bring', 'can bring', 'may carry', 'can carry', 'allowed to carry', 'allowed to bring', 'allowed', 'permitted', 'अनुमति है', 'ले जा सकते'];

const isAlnum = (ch) => ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9'));
const isWordAt = (text, at, len) => !isAlnum(text[at - 1]) && !isAlnum(text[at + len]);

/** Lines -> sentences (split at . ; and bullets, keeping each short enough to show). */
export function sentencesOf(lines) {
  const out = [];
  for (const line of lines || []) {
    const text = String(line || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    let current = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const nextIsSpace = text[i + 1] === ' ' || i === text.length - 1;
      const digitBefore = text[i - 1] >= '0' && text[i - 1] <= '9';
      if ((ch === ';' || ch === '•') || (ch === '.' && nextIsSpace && !digitBefore && text[i - 2] !== ' ' && !/\b(no|sr|etc|e\.g|i\.e)$/i.test(current))) { if (current.trim()) out.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    if (current.trim()) out.push(current.trim());
  }
  return out;
}

/** Where each phrase of a list occurs in a lower-case sentence: [{ at, end }]. */
function spansOf(lower, phrases) {
  const out = [];
  for (const p of phrases) for (const at of kmpSearchAll(lower, p)) out.push({ at, end: at + p.length });
  return out;
}

/** What one sentence says about the item at `at`: the phrase (not allowed / must bring / allowed) nearest to it. '' when none. */
function sentenceVerdict(lower, at, len) {
  const neg = spansOf(lower, NEGATIVE);
  const allow = spansOf(lower, ALLOWED).filter((a) => !neg.some((n) => a.at < n.end && a.end > n.at));     // "allowed" inside or at the end of "will not be allowed to carry" is not an allowance
  const mustWeak = spansOf(lower, MUST_WEAK).filter((m) => !neg.some((n) => m.at < n.end + 25 && m.end > n.at - 1) && !allow.some((a) => m.at < a.end && m.end > a.at));   // not in "may bring" either
  const must = spansOf(lower, MUST).concat(mustWeak);
  const dist = (s) => (s.end <= at ? at - s.end : s.at >= at + len ? s.at - (at + len) : 0);
  let best = { kind: '', d: Infinity };
  for (const [kind, list] of [['not_allowed', neg], ['must_bring', must], ['allowed', allow]]) for (const s of list) { const d = dist(s); if (d < best.d) best = { kind, d }; }   // a tie goes to "not allowed" (first in the list)
  return best.d <= 120 ? best.kind : '';
}

const RANK = { not_allowed: 3, must_bring: 2, allowed: 1 };

/**
 * item: from CATALOG. lines: the instruction lines of the card. Returns { status: 'not_allowed' | 'must_bring' | 'allowed' | 'not_mentioned', evidence }.
 * "not allowed" wins over "must bring", which wins over "allowed". Nothing found = "not_mentioned" (never "allowed").
 */
export function checkItem(item, lines) {
  let best = { status: 'not_mentioned', evidence: '' };
  for (const sentence of sentencesOf(lines)) {
    const lower = asciiLower(sentence);
    // longer words of OTHER items in this sentence: "photo" inside "photo ID" is the ID, not the photo
    const others = [];
    for (const other of CATALOG) if (other.id !== item.id) for (const word of other.synonyms) { const ow = asciiLower(word); for (const at of kmpSearchAll(lower, ow)) others.push({ at, end: at + ow.length }); }
    for (const word of item.synonyms) {
      const w = asciiLower(word);
      const asciiWord = w.charCodeAt(0) < 128;
      for (const at of kmpSearchAll(lower, w)) {
        if (asciiWord && !isWordAt(lower, at, w.length)) continue;
        if (others.some((o) => o.at <= at && o.end >= at + w.length && o.end - o.at > w.length)) continue;
        const kind = sentenceVerdict(lower, at, w.length);
        if (kind && (best.status === 'not_mentioned' || RANK[kind] > RANK[best.status])) best = { status: kind, evidence: sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence };
      }
    }
  }
  return best;
}

/** Items the card says you must bring and that belong in the checklist (ID, photos, admit card, pen): [{ item, evidence }]. */
export function findMustBring(lines) {
  const out = [];
  for (const id of CHECKLIST_ITEMS) {
    const item = CATALOG.find((c) => c.id === id);
    const r = checkItem(item, lines);
    if (r.status === 'must_bring') out.push({ item, evidence: r.evidence });
  }
  return out;
}

// ---------------------------------------------------------------- general rules (NOT from the card)
const BODY_PATTERNS = [['nta', /jee|neet|cuet|\bnta\b|ugc/i], ['ssc', /\bssc\b/i], ['rrb', /\brrb\b|railway/i], ['bank', /ibps|\bsbi\b|bank/i], ['upsc', /upsc|civil services|\bnda\b|\bcds\b/i]];
const GENERAL = {
  all: { mobile: 'not allowed', id: 'must bring', admit: 'must bring', bag: 'not allowed', headphones: 'not allowed', books: 'not allowed' },
  nta: { watch: 'not allowed', calculator: 'not allowed', jewellery: 'not allowed' },
  ssc: { watch: 'not allowed', calculator: 'not allowed' },
  rrb: { watch: 'not allowed', calculator: 'not allowed' },
  bank: { watch: 'not allowed', calculator: 'not allowed' },
  upsc: { watch: 'not allowed', calculator: 'not allowed' },
};

/** What is usually true for this exam body (clearly NOT from the card): { rule, body } or null. */
export function generalRule(examName, itemId) {
  const body = (BODY_PATTERNS.find(([, re]) => re.test(String(examName || ''))) || [''])[0];
  const rule = (body && GENERAL[body] && GENERAL[body][itemId]) || GENERAL.all[itemId];
  return rule ? { rule, body } : null;
}
