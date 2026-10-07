// Links that open a place in the phone's own map app. No Google Maps API: a "geo:" link (Android and most map apps)
// and an OpenStreetMap link as the back-up that works in any browser.

import { STATES } from '../ingest/geoLists.js';

/** geo:lat,lng?q=lat,lng(Name) opens the default map app with a marker. */
export function geoUrl(place) {
  const lat = Number(place.lat).toFixed(6); const lng = Number(place.lng).toFixed(6);
  const label = encodeURIComponent(String(place.name || '').replace(/[()]/g, ' ').trim());
  return `geo:${lat},${lng}?q=${lat},${lng}${label ? `(${label})` : ''}`;
}

export function osmUrl(place) {
  const lat = Number(place.lat).toFixed(6); const lng = Number(place.lng).toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

/** "190 m" or "1.4 km". */
export function distanceText(km) {
  return km < 1 ? `${Math.max(10, Math.round(km * 1000 / 10) * 10)} m` : `${km.toFixed(1)} km`;
}

/** "Search for hotels near the centre" in the phone's own map app: geo:LAT,LON?q=hotel (Android and most map apps). */
export function searchGeoUrl(centre, query) {
  // geo:<centre>?q=<words>: Android opens the default map app (Google Maps) and searches around the centre point
  return `geo:${Number(centre.lat).toFixed(6)},${Number(centre.lng).toFixed(6)}?q=${encodeURIComponent(query)}`;
}

/** The same search on OpenStreetMap (works in any browser, e.g. on a laptop). The map is opened at the centre. */
export function searchOsmUrl(centre, query) {
  const lat = Number(centre.lat).toFixed(5); const lng = Number(centre.lng).toFixed(5);
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}&lat=${lat}&lon=${lng}#map=15/${lat}/${lng}`;
}

/**
 * A normal Google Maps link: it opens the Google Maps app on a phone and the website on a laptop, searching near the CENTRE (not near the user).
 * Format: https://www.google.com/maps/search/<words>/@<lat>,<lng>,<zoom>z (free, no key).
 */
export function googleSearchUrl(centre, query, zoom = 15) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${Number(centre.lat).toFixed(6)},${Number(centre.lng).toFixed(6)},${zoom}z`;
}

/** A phone or tablet (a geo: link opens the map app there); on a laptop the OpenStreetMap link is used instead. */
export function isPhone(nav = typeof navigator === 'undefined' ? null : navigator) {
  if (!nav) return false;
  if (nav.userAgentData && typeof nav.userAgentData.mobile === 'boolean') return nav.userAgentData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
}

/** The link for a "search near the centre" button on this device. */
export function mapsSearchUrl(centre, query, nav) { return isPhone(nav) ? searchGeoUrl(centre, query) : searchOsmUrl(centre, query); }

// ---------------------------------------------------------------------------------------------------------------------------------
// Google Maps links that show the EXAM CENTRE. Plain links: free, no key. A free link cannot show our own pin AND search results at once:
//   - "centre pin" link  = Google Maps with a pin exactly on the centre coordinates (no search results);
//   - "search near" link = Google Maps search results for "<kind> near <centre name, area, city>" (Google finds the college itself and
//     searches around it; our pin is not drawn). With an unsure or missing name the search is "<kind> near <lat>,<lng>" instead.
// In Google Maps, tap "Nearby" on the pinned centre to see places around it.

/** The words used in the links for each kind of place: simple and common. */
export const LINK_WORDS = { food: ['restaurants'], lodging: ['hotels'], pharmacy: ['medical stores', 'hospitals'], atm: ['ATMs'], fuel: ['petrol pumps'], bus: ['bus stand'], rail: ['railway station'], copy: ['photocopy shop'], toilet: ['public toilets'] };

const coords = (c) => `${Number(c.lat).toFixed(6)},${Number(c.lng).toFixed(6)}`;

/**
 * The area of an address: the first part that is not the centre name, the city, the state, "India" or the pincode
 * ("Model Industrial Area, Townname, Some State 123456" -> "Model Industrial Area"). '' when there is none.
 */
export function areaOf(address, { name = '', city = '' } = {}) {
  const low = (x) => String(x || '').toLowerCase();
  for (const raw of String(address || '').split(',')) {
    const part = raw.replace(/\b\d{6}\b/g, '').replace(/^[\s-]+|[\s-]+$/g, '').trim();
    const l = low(part);
    if (part.length < 3 || /^\d+$/.test(part)) continue;
    if (name && (l.includes(low(name)) || low(name).includes(l))) continue;
    if (city && (l === low(city) || l.includes(low(city)))) continue;
    if (l === 'india' || STATES.includes(l)) continue;                                  // the state (from the general list)
    if (/^(near|opp|opposite|behind|beside|pin)\b/.test(l)) continue;
    return part;
  }
  return '';
}

/** Is the centre name good enough to put in a link? (found, not yellow). centre = { lat, lng, name, area, city, sure }. */
const nameUsable = (c) => Boolean(c.name && c.name.trim().length >= 3 && c.sure);

/** The text that is searched: "restaurants near <centre name>, <area>, <city>", or "restaurants near <lat>,<lng>". */
export function nearQueryText(c, word) {
  if (!nameUsable(c)) return `${word} near ${Number(c.lat).toFixed(5)},${Number(c.lng).toFixed(5)}`;
  return `${word} near ${[c.name.trim(), c.area, c.city].filter((x) => x && String(x).trim()).join(', ')}`;
}

/** Google Maps search results near the centre (official URL format; free). */
export function googleNearUrl(c, word) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nearQueryText(c, word))}`;
}

/** Is our pin trustworthy? Only a HIGH confidence pin is used as coordinates; otherwise Google is asked by NAME and ADDRESS. */
export const pinIsSure = (c) => c.confidence === 'high';

/**
 * The text that lets Google find the college itself: "<centre name>, <full address from the card> <pincode>".
 * The name is left out when it is unsure (yellow); the pincode is added once. Returns '' when there is nothing to search for.
 * centre = { name, address, area, city, pincode, sure }.
 */
export function placeText(c) {
  const name = nameUsable(c) ? c.name.trim() : '';
  let pin = String(c.pincode || '').trim();
  let address = String(c.address || '').replace(/\s+/g, ' ').trim();
  if (name && address.toLowerCase().startsWith(name.toLowerCase())) address = address.slice(name.length).replace(/^[\s,.-]+/, '');     // the address starts with the name: not twice
  const inAddress = /\b(\d{6})\b[\s,.-]*$/.exec(address);
  if (!pin && inAddress) pin = inAddress[1];                                                                                                          // no pincode field: the one in the address
  address = address.replace(/[\s,.-]*\b\d{6}\b[\s,.-]*$/, '').replace(/[\s,.-]+$/, '');                                                   // the pincode is added once at the end
  const body = address ? [name, address] : [name, c.area, c.city];
  const text = body.filter((x) => x && String(x).trim()).join(', ');
  if (!text) return '';
  return pin && !text.includes(pin) ? `${text} ${pin}` : text;
}

/** Google Maps with a pin on the centre: exact coordinates when our pin is HIGH confidence, otherwise a search by name and address (Google pins the real college). */
export function googleCentreUrl(c) {
  const text = placeText(c);
  if (pinIsSure(c) || !text) return `https://www.google.com/maps/search/?api=1&query=${coords(c)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

/** True when the centre links search by name (our pin is not sure): the screen then says "Google Maps will find your centre by its name." */
export const centreByName = (c) => !pinIsSure(c) && Boolean(placeText(c));

/** The phone's own map app (Android): a labelled pin on our coordinates when the pin is sure, otherwise a search by name and address. */
export function geoCentreUrl(c) {
  const text = placeText(c);
  if (!pinIsSure(c) && text) return `geo:0,0?q=${encodeURIComponent(text)}`;
  const label = nameUsable(c) ? `(${encodeURIComponent(c.name.trim().replace(/[()]/g, ' '))})` : '';
  return `geo:0,0?q=${coords(c)}${label}`;
}

/** Google's own route to the college: destination = the same name-and-address text, or the coordinates when our pin is sure. */
export function directionsUrl(c) {
  const text = placeText(c);
  const destination = pinIsSure(c) || !text ? coords(c) : encodeURIComponent(text);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
