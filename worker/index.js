// CentreWay "Google Places" Worker (OPTIONAL). A tiny Cloudflare Worker that holds your Google API key, so the key is never inside the app.
// The app sends { lat, lng, radius, categories } and gets back the nearby places (name, position, category).
// Safety: a hard daily limit (DAILY_LIMIT, default 1000 Google calls per day). When it is reached the Worker answers 429 and does NOT call Google.
// Cost control: types are grouped (at most 4 Google calls per plan), only the fields that are needed are asked for, and nothing is stored here.
// Setup: see worker/README.md.

const DEFAULT_LIMIT = 1000;
const MAX_RADIUS = 5000;

/** The app's kinds of place -> Google place types, grouped so that one Google call answers several kinds. */
export const GROUPS = {
  food: { types: ['restaurant', 'cafe', 'meal_takeaway', 'bakery'], categories: { restaurant: 'food', cafe: 'food', meal_takeaway: 'food', bakery: 'food' } },
  stay: { types: ['lodging'], categories: { lodging: 'lodging' } },
  health: { types: ['pharmacy', 'drugstore', 'hospital', 'doctor'], categories: { pharmacy: 'pharmacy', drugstore: 'pharmacy', hospital: 'pharmacy', doctor: 'pharmacy' } },
  services: { types: ['atm', 'gas_station', 'bus_station', 'train_station'], categories: { atm: 'atm', gas_station: 'fuel', bus_station: 'bus', train_station: 'rail' } },
};
// the app's category ids that each group can answer (photocopy shops and public toilets have no Google type)
const GROUP_OF = { food: 'food', lodging: 'stay', pharmacy: 'health', atm: 'services', fuel: 'services', bus: 'services', rail: 'services' };

export const FIELD_MASK = 'places.id,places.displayName,places.location,places.types,places.primaryType';   // only what is needed: name, position, type

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const today = (now) => new Date(now).toISOString().slice(0, 10);

/** Which groups (Google calls) are needed for the asked categories. */
export function groupsFor(categories) {
  const out = [];
  for (const c of categories) { const g = GROUP_OF[c]; if (g && !out.includes(g)) out.push(g); }
  return out;
}

/** Take `n` calls from today's allowance. Returns { ok, used, limit }. The counter lives in a KV namespace (env.COUNTER). */
export async function takeCalls(env, n, now = Date.now()) {
  const limit = Number(env.DAILY_LIMIT) > 0 ? Number(env.DAILY_LIMIT) : DEFAULT_LIMIT;
  const key = `day:${today(now)}`;
  const used = Number(await env.COUNTER.get(key)) || 0;
  if (used + n > limit) return { ok: false, used, limit };
  await env.COUNTER.put(key, String(used + n), { expirationTtl: 172800 });      // reserved BEFORE the Google call
  return { ok: true, used: used + n, limit };
}

/** The whole request. deps = { fetch, now } so that tests can run it without Google. */
export async function handle(request, env, deps = {}) {
  const doFetch = deps.fetch || fetch; const now = deps.now ? deps.now() : Date.now();
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const cors = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
  if (!allowed.includes(origin)) return json({ error: 'This origin is not allowed (set ALLOWED_ORIGIN).' }, 403, cors);
  if (!env.GOOGLE_API_KEY || !env.COUNTER) return json({ error: 'The Worker is not set up (GOOGLE_API_KEY or COUNTER missing).' }, 500, cors);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400, cors); }
  const lat = Number(body.lat); const lng = Number(body.lng);
  const radius = Math.min(MAX_RADIUS, Math.max(100, Number(body.radius) || 3000));
  if (!(lat >= 6 && lat <= 38 && lng >= 67 && lng <= 98)) return json({ error: 'Position is outside India.' }, 400, cors);        // this app is for India only
  const groups = groupsFor(Array.isArray(body.categories) ? body.categories : []);
  if (!groups.length) return json({ places: [], calls: 0 }, 200, cors);

  const taken = await takeCalls(env, groups.length, now);
  if (!taken.ok) return json({ error: 'Daily limit reached. Try again tomorrow.', limit: taken.limit, used: taken.used }, 429, cors);

  const places = []; let calls = 0;
  for (const name of groups) {
    const g = GROUPS[name];
    const res = await doFetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_API_KEY, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify({ includedTypes: g.types, maxResultCount: 20, rankPreference: 'DISTANCE', locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } } }),
    });
    calls++;
    if (!res.ok) return json({ error: `Google answered HTTP ${res.status}`, places, calls }, 502, cors);
    const data = await res.json();
    for (const p of data.places || []) {
      const category = (g.categories[p.primaryType]) || (p.types || []).map((t) => g.categories[t]).find(Boolean);
      if (!category || !p.location) continue;
      places.push({ id: p.id, name: (p.displayName && p.displayName.text) || '', lat: p.location.latitude, lng: p.location.longitude, category });
    }
  }
  return json({ places, calls, usedToday: taken.used, limit: taken.limit }, 200, cors);
}

export default { fetch: (request, env) => handle(request, env) };
