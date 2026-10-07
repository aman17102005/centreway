// Builds a list of address searches, from most exact to simplest,
// and tries them one by one until something is found.

/** Tidy an address for searching: no line breaks, no odd symbols, no double commas. */
export function cleanQuery(text) {
  return String(text || '')
    .replace(/[|•·"“”]/g, ' ')
    .replace(/\s*\n\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/(,\s*)+/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

/** Returns [{ label, q }] with no empty or repeated searches. */
export function buildQueries({ centreName = '', address = '', pincode = '', city = '' }) {
  const name = cleanQuery(centreName);
  const addr = cleanQuery(address);
  const cty = cleanQuery(city);
  const pin = String(pincode || '').trim();
  const withPin = (s) => (pin && !s.includes(pin) ? `${s}, ${pin}` : s);

  const candidates = [
    { label: 'full address', q: addr && name && !addr.toLowerCase().includes(name.toLowerCase()) ? `${name}, ${addr}` : addr || name },
    { label: 'address only', q: addr },
    { label: 'centre name and pincode', q: name && pin ? `${name}, ${pin}` : '' },
    { label: 'centre name and city', q: name && cty ? `${name}, ${cty}` : '' },
    { label: 'pincode and city', q: pin && cty ? `${cty}, ${pin}` : '' },
    { label: 'pincode only', q: pin ? pin : '' },
  ];
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const q = c.q && c.label !== 'pincode only' && c.label !== 'pincode and city' ? withPin(c.q) : c.q;
    const key = q.toLowerCase();
    if (!q || seen.has(key)) continue;
    seen.add(key);
    out.push({ label: c.label, q });
  }
  return out;
}

/**
 * Try each query in order. searchFn(q) must return an array of results.
 * Stops at the first query with results. Returns { results, used, tried }.
 */
export async function searchWithFallback(queries, searchFn) {
  const tried = [];
  for (const query of queries) {
    tried.push(query.label);
    const results = await searchFn(query.q);
    if (results && results.length) return { results, used: query, tried };
  }
  return { results: [], used: null, tried };
}
