import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { googleNearUrl, googleCentreUrl, geoCentreUrl, directionsUrl, centreByName, placeText, pinIsSure, nearQueryText, areaOf, LINK_WORDS } from '../src/logic/placeLinks.js';
import { CATEGORIES } from '../src/services/categories.js';
import { STRINGS } from '../src/i18n.js';

// the test centres of the brief (approximate positions; the names and the sure flag are what the links are built from)
const CENTRES = [
  { name: 'Bhartiya Institute of Engineering and Technology', area: '', city: 'Sikar', lat: 27.6624, lng: 75.028, sure: true },
  { name: 'Poornima College of Engineering', area: 'Sitapura', city: 'Jaipur', lat: 26.7723, lng: 75.8738, sure: true },
  { name: 'JECRC', area: 'Sitapura', city: 'Jaipur', lat: 26.7717, lng: 75.8668, sure: true },
  { name: 'MNIT', area: 'Malviya Nagar', city: 'Jaipur', lat: 26.8636, lng: 75.8107, sure: true },
  { name: 'Morarka Govt. P.G. College', area: '', city: 'Jhunjhunu', lat: 28.1288, lng: 75.4013, sure: true },
  { name: 'Seth Motilal P.G. College', area: '', city: 'Jhunjhunu', lat: 28.1273, lng: 75.3954, sure: true },
];

test('search link: "<kind> near <centre name>, <area>, <city>" in the official Google Maps URL format', () => {
  const c = CENTRES[1];
  assert.equal(nearQueryText(c, 'restaurants'), 'restaurants near Poornima College of Engineering, Sitapura, Jaipur');
  assert.equal(googleNearUrl(c, 'restaurants'), 'https://www.google.com/maps/search/?api=1&query=restaurants%20near%20Poornima%20College%20of%20Engineering%2C%20Sitapura%2C%20Jaipur');
  // no area on the card: just name and city (no empty commas)
  assert.equal(nearQueryText(CENTRES[0], 'hotels'), 'hotels near Bhartiya Institute of Engineering and Technology, Sikar');
  for (const c2 of CENTRES) for (const k of Object.values(LINK_WORDS).flat()) {
    const link = googleNearUrl(c2, k);
    assert.match(link, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    assert.ok(!/key=|api_key|apikey/i.test(link.replace('?api=1', '')));              // "api=1" is the URL version, not a key
    assert.ok(decodeURIComponent(link).includes(c2.name) && decodeURIComponent(link).includes(c2.city));
  }
});

test('the words are simple and common, every kind has them (medical also has hospitals)', () => {
  assert.deepEqual(LINK_WORDS.food, ['restaurants']);
  assert.deepEqual(LINK_WORDS.lodging, ['hotels']);
  assert.deepEqual(LINK_WORDS.pharmacy, ['medical stores', 'hospitals']);
  assert.deepEqual([LINK_WORDS.atm[0], LINK_WORDS.fuel[0], LINK_WORDS.bus[0], LINK_WORDS.rail[0], LINK_WORDS.copy[0]], ['ATMs', 'petrol pumps', 'bus stand', 'railway station', 'photocopy shop']);
  for (const c of CATEGORIES) assert.ok(LINK_WORDS[c.id] && LINK_WORDS[c.id].length, c.id);
});

test('name missing or unsure (yellow): the kind search falls back to "<kind> near <lat>,<lng>"', () => {
  const unsure = { ...CENTRES[1], sure: false };
  assert.equal(nearQueryText(unsure, 'hotels'), 'hotels near 26.77230,75.87380');
  assert.equal(googleNearUrl(unsure, 'hotels'), 'https://www.google.com/maps/search/?api=1&query=hotels%20near%2026.77230%2C75.87380');
  assert.equal(nearQueryText({ lat: 26.7723, lng: 75.8738, name: '', city: 'Jaipur', sure: true }, 'ATMs'), 'ATMs near 26.77230,75.87380');
  assert.equal(nearQueryText({ lat: 1, lng: 2 }, 'ATMs'), 'ATMs near 1.00000,2.00000');
});

// ---- the pin buttons: coordinates only for a HIGH confidence pin, otherwise Google is asked by name and address
const FULL = { name: 'Poornima College of Engineering', address: 'Poornima College of Engineering, ISI-2, RIICO Institutional Area, Sitapura, Jaipur, Rajasthan - 302022', pincode: '302022', area: 'Sitapura', city: 'Jaipur', lat: 26.7723, lng: 75.8738, sure: true };

test('HIGH confidence pin: the coordinates link (a pin exactly on the centre), the labelled Android pin, directions to the coordinates', () => {
  const c = { ...FULL, confidence: 'high' };
  assert.equal(pinIsSure(c), true);
  assert.equal(centreByName(c), false);
  assert.equal(googleCentreUrl(c), 'https://www.google.com/maps/search/?api=1&query=26.772300,75.873800');
  assert.equal(geoCentreUrl(c), 'geo:0,0?q=26.772300,75.873800(Poornima%20College%20of%20Engineering)');
  assert.equal(directionsUrl(c), 'https://www.google.com/maps/dir/?api=1&destination=26.772300,75.873800');
  assert.equal(geoCentreUrl({ ...c, name: 'A (B) College' }), 'geo:0,0?q=26.772300,75.873800(A%20%20B%20%20College)');
});

test('NOT high confidence (medium, low, yellow, unknown): the pin, the Android link and the directions all search by NAME and ADDRESS, not by our coordinates', () => {
  for (const confidence of ['medium', 'low', undefined]) {
    const c = { ...FULL, confidence };
    assert.equal(pinIsSure(c), false);
    assert.equal(centreByName(c), true);
    const text = 'Poornima College of Engineering, ISI-2, RIICO Institutional Area, Sitapura, Jaipur, Rajasthan 302022';
    assert.equal(placeText(c), text);
    assert.equal(googleCentreUrl(c), `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`);
    assert.equal(geoCentreUrl(c), `geo:0,0?q=${encodeURIComponent(text)}`);
    assert.equal(directionsUrl(c), `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}`);
    for (const link of [googleCentreUrl(c), geoCentreUrl(c), directionsUrl(c)]) assert.ok(!link.includes('26.7723'), 'our guessed coordinates are not used');
  }
});

test('name-search text: "<centre name>, <full address> <pincode>" (name not repeated, pincode once, no pincode twice, short form without an address)', () => {
  assert.equal(placeText({ ...FULL, address: 'ISI-2, RIICO Institutional Area, Sitapura, Jaipur 302022' }), 'Poornima College of Engineering, ISI-2, RIICO Institutional Area, Sitapura, Jaipur 302022');
  assert.equal(placeText({ ...FULL, address: '' }), 'Poornima College of Engineering, Sitapura, Jaipur 302022');                      // no address: name, area, city, pincode
  assert.equal(placeText({ ...FULL, address: 'Plot 5, Some Road, Jaipur 302022', pincode: '' }), 'Poornima College of Engineering, Plot 5, Some Road, Jaipur 302022');
  // the name is yellow: the name field is left out, only the address as printed is searched (here it happens to start with the name)
  assert.equal(placeText({ ...FULL, sure: false }), 'Poornima College of Engineering, ISI-2, RIICO Institutional Area, Sitapura, Jaipur, Rajasthan 302022');
  assert.equal(placeText({ ...FULL, sure: false, address: 'ISI-2, RIICO Institutional Area, Sitapura, Jaipur 302022' }), 'ISI-2, RIICO Institutional Area, Sitapura, Jaipur 302022');
  // nothing to search for: the coordinates are used (never an empty link)
  assert.equal(googleCentreUrl({ lat: 1, lng: 2 }), 'https://www.google.com/maps/search/?api=1&query=1.000000,2.000000');
  assert.equal(directionsUrl({ lat: 1, lng: 2 }), 'https://www.google.com/maps/dir/?api=1&destination=1.000000,2.000000');
  assert.equal(centreByName({ lat: 1, lng: 2 }), false);
});

test('directions link: the official format, destination is the same text (or the coordinates), no key', () => {
  for (const c of [{ ...FULL, confidence: 'high' }, { ...FULL, confidence: 'low' }]) {
    const link = directionsUrl(c);
    assert.match(link, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
    assert.ok(!/key=|api_key|apikey/i.test(link.replace('?api=1', '')));
  }
});

test('area of an address: the first part that is not the name, the city, the state or the pincode', () => {
  assert.equal(areaOf('Sitapura Industrial Area, Jaipur, Rajasthan 302022', { name: 'JECRC', city: 'Jaipur' }), 'Sitapura Industrial Area');
  assert.equal(areaOf('Poornima College of Engineering, ISI-2, RIICO Institutional Area, Sitapura, Jaipur, Rajasthan - 302022', { name: 'Poornima College of Engineering', city: 'Jaipur' }), 'ISI-2');
  assert.equal(areaOf('Jaipur, Rajasthan 302022', { name: 'X College', city: 'Jaipur' }), '');
  assert.equal(areaOf('Near Bus Stand, Sikar, Rajasthan, 332021', { name: 'X', city: 'Sikar' }), '');
  assert.equal(areaOf('', {}), '');
});

test('buttons: "Show my exam centre" comes first, above every kind; each kind has "Search near centre" then "📍 Centre" side by side', () => {
  const src = readFileSync('src/ui/nearbyList.js', 'utf8');
  const block = src.slice(src.indexOf('const mapsBlock = () =>'), src.indexOf('const mapsButton'));
  assert.ok(block.indexOf("'centre-pin'") > 0 && block.indexOf("'centre-pin'") < block.indexOf("'maps-grid'"), 'the centre pin button is above the kind buttons');
  assert.match(block, /googleCentreUrl\(centre\), 'btn big primary', `📍 \$\{t\('showCentre'\)\}`/);
  assert.match(block, /centreByName\(centre\) \? t\('showCentreByName'\) : t\('showCentreHelp'\)/);       // "Google Maps will find your centre by its name."
  assert.match(block, /directionsUrl\(centre\), 'btn big', `🧭 \$\{t\('directionsToCentre'\)\}`/);        // "Get directions to centre"
  assert.ok(block.indexOf('showCentre') < block.indexOf('directionsToCentre') && block.indexOf('directionsToCentre') < block.indexOf("'maps-grid'"), 'centre pin, then directions, then the kinds');
  assert.match(block, /geoCentreUrl\(centre\)/);
  assert.match(block, /t\('showCentreHelp'\)/);
  const pair = src.slice(src.indexOf('const kindButtons'), src.indexOf('// The top of the nearby section'));
  assert.ok(pair.indexOf("t('searchNearCentre')") > 0 && pair.indexOf("t('searchNearCentre')") < pair.indexOf("t('centreShort')"), 'search first, then the centre pin');
  assert.match(src, /present\(mapsBlock\(\), googleBlock\(\)/);                 // the whole block is the first thing in the nearby section
  assert.equal(STRINGS.en.showCentre, 'Show my exam centre');
  assert.equal(STRINGS.en.showCentreByName, 'Google Maps will find your centre by its name.');
  assert.equal(STRINGS.en.directionsToCentre, 'Get directions to centre');
  assert.ok(STRINGS.hi.showCentreByName && STRINGS.hi.directionsToCentre);
  assert.equal(STRINGS.en.showCentreHelp, "Opens Google Maps with a pin on your exam centre. Then tap 'Nearby' in Google Maps to see places around it.");
  assert.equal(STRINGS.en.searchNearCentre, 'Search near centre');
  assert.ok(STRINGS.hi.showCentre && STRINGS.hi.searchNearCentre && STRINGS.hi.centreShort);
});

test('the screens give the links the centre name, the area, the city and whether the name is sure', () => {
  for (const [file, needle] of [['src/ui/summary.js', 'sure: !needsCheck(r.centreName)'], ['src/ui/summary.js', 'confidence: draft.centre.confidence'], ['src/ui/summary.js', 'address: r.address.value, pincode: r.pincode.value'], ['src/ui/plan.js', 'sure: plan.fields.centreNameSure === true'], ['src/ui/plan.js', 'address: plan.fields.address, pincode: plan.fields.pincode']]) assert.ok(readFileSync(file, 'utf8').includes(needle), `${file}: ${needle}`);
  assert.ok(readFileSync('src/flow/autoPlan.js', 'utf8').includes('confidence: draft.centre.confidence'));      // the plan remembers how sure the pin was
  assert.ok(readFileSync('src/ui/step2.js', 'utf8').includes("confidence: 'high'"));                           // a pin dragged by the user is a sure pin
  assert.ok(readFileSync('src/flow/autoPlan.js', 'utf8').includes('centreNameSure'));
});
