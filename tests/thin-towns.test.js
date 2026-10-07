import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thinInfo, THIN_BELOW } from '../src/logic/thinView.js';
import { STRINGS } from '../src/i18n.js';
import { CATEGORIES } from '../src/services/categories.js';
import { googleSearchUrl } from '../src/logic/placeLinks.js';

const kinds = CATEGORIES.map((c) => c.id);
const some = (kind, n, km = 1) => Array.from({ length: n }, (_, i) => ({ id: `${kind}${i}`, category: kind, distanceKm: km + i * 0.1 }));

test('thin = fewer than 3 places within 5 km; places farther away do not count', () => {
  assert.equal(THIN_BELOW, 3);
  const info = thinInfo([...some('food', 3), ...some('lodging', 2), ...some('atm', 5, 6)], kinds);
  assert.equal(info.thin.has('food'), false);
  assert.equal(info.thin.has('lodging'), true);          // 2 places: thin
  assert.equal(info.thin.has('atm'), true);              // 5 places but all beyond 5 km: thin
  assert.equal(info.thin.has('rail'), true);             // none at all: thin ("few mapped", never "no places")
});

test('a kind whose server failed or is still loading is not called thin (we do not know yet)', () => {
  const info = thinInfo([], kinds, { failed: ['food'], pending: ['atm'] });
  assert.equal(info.thin.has('food'), false);
  assert.equal(info.thin.has('atm'), false);
  assert.equal(info.judged, kinds.length - 2);
});

test('small town = almost all kinds thin; a big city (most kinds well covered) is not', () => {
  const town = thinInfo([...some('food', 1), ...some('pharmacy', 4)], kinds);
  assert.equal(town.small, true);
  const city = thinInfo(kinds.flatMap((k) => some(k, 5)), kinds);
  assert.equal(city.small, false);
  assert.equal(thinInfo(kinds.flatMap((k) => some(k, 5)).concat([]), kinds).thin.size, 0);
  // too little is judged to say anything (everything still loading or failed): not a small town
  assert.equal(thinInfo([], kinds, { pending: kinds.slice(0, 8) }).small, false);
});

test('messages: "Few places are mapped" (never "no places here") in English and Hindi, with a "See on Google Maps" button text', () => {
  for (const lang of Object.keys(STRINGS)) {
    const s = STRINGS[lang];
    for (const key of ['fewMapped', 'fewMappedTown', 'noneWithin', 'seeOnGoogleShort']) assert.ok(s[key] && s[key].length > 5, `${lang}.${key}`);
  }
  assert.equal(STRINGS.en.fewMapped, 'Few places are mapped in this area. See them on Google Maps.');
  assert.equal(STRINGS.en.seeOnGoogleShort, 'See on Google Maps');
  for (const key of ['fewMapped', 'fewMappedTown', 'noneWithin']) assert.ok(!/\bno places\b|\bnone\b|nothing/i.test(STRINGS.en[key]), `en.${key} must not say there are no places`);
});

test('the screen: a thin kind shows the message and a big button on top of its list; in a small town the Google Maps block comes first and is marked', () => {
  const src = readFileSync('src/ui/nearbyList.js', 'utf8');
  assert.match(src, /thinInfo\(/);
  // inside a kind: heading, then the thin note + big button, then the places
  const section = src.slice(src.indexOf('const section = (c)'));
  assert.ok(section.indexOf("t('fewMapped')") > section.indexOf('<h4') || section.indexOf("t('fewMapped')") > section.indexOf("h('h4'"));
  assert.ok(section.indexOf("t('fewMapped')") < section.indexOf("h('ul', { class: 'cards' }"), 'the message is above the list of places');
  assert.match(src, /'btn big', `🔎 \$\{t\('seeOnGoogleShort'\)\}`/);
  // the Google Maps block is the first thing in the nearby section (before our list, the chips and the optional Google results)
  assert.match(src, /present\(mapsBlock\(\), googleBlock\(\)/);
  assert.match(src, /thin-town/);
  assert.match(src, /fewMappedTown/);
  // a thin kind never shows the old "none" note when there is a centre
  assert.match(src, /isThin && centre \? null : note\(t\('noneWithin'\)/);
});

test('the button searches near the exam centre (plain https link, no key); the phone map app link stays in the top block', () => {
  const c = { lat: 27.9488, lng: 75.2425 };
  for (const q of ['restaurant', 'hotel', 'medical store', 'ATM', 'photocopy', 'public toilet', 'petrol pump', 'bus stand', 'railway station']) {
    const link = googleSearchUrl(c, q);
    assert.match(link, /^https:\/\/www\.google\.com\/maps\/search\//);
    assert.ok(link.includes('27.948800,75.242500'));
    assert.ok(!/key=|api_key|apikey/i.test(link));
  }
  const src = readFileSync('src/ui/nearbyList.js', 'utf8');
  assert.match(src, /geoCentreUrl\(centre\)/);               // the phone map app link (labelled pin) stays in the top block
});
