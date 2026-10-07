// The "Nearby places" list: one chip per type (with how many were found), places of the chosen type with their distance and
// "Open in maps" links, and a clear note for a type that is still empty after 5 km.
import { h, note, present } from './dom.js';
import { t } from '../i18n.js';
import { CATEGORIES } from '../services/overpass.js';
import { googlePlaceUrl } from '../services/googlePlaces.js';
import { googleView } from '../logic/googleView.js';
import { thinInfo } from '../logic/thinView.js';
import { geoUrl, osmUrl, distanceText, googleNearUrl, googleCentreUrl, geoCentreUrl, directionsUrl, centreByName, isPhone, LINK_WORDS } from '../logic/placeLinks.js';
import { CONFIG } from '../config.js';

/**
 * container: element to fill. items: places (closest first). filter: 'all' or a type id. onFilter(typeId): called when a chip is tapped.
 */
export function renderNearbyList(container, items, filter, onFilter, { failed = [], pending = [], onRetry = null, centre = null, google = null } = {}) {   // google = { enabled, state, onAsk }: the optional Google Places button
  const info = thinInfo(items, CATEGORIES.map((c) => c.id), { failed, pending });      // kinds with fewer than 3 places within 5 km (small towns)
  const perType = {};
  for (const c of CATEGORIES) perType[c.id] = items.filter((i) => i.category === c.id).slice(0, CONFIG.overpass.perTypeShown);
  const chip = (id, label, count) => h('button', { type: 'button', class: `chip ${filter === id ? 'on' : ''}`, 'aria-pressed': String(filter === id), onclick: () => onFilter(id) }, count == null ? label : `${label} (${count})`);
  const chips = h('div', { class: 'chips' }, [chip('all', t('all'), null), ...CATEGORIES.map((c) => chip(c.id, `${c.icon} ${t(`cat_${c.id}`)}`, perType[c.id].length))]);

  // "See all places on Google Maps": always at the top, a big button for every type. It opens Google Maps (app or website) searching near the CENTRE.
  // On a phone a second small button opens the phone's own map app (geo: link); on a laptop OpenStreetMap is offered as well.
  const link = (href, cls, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls }, text);
  // the two small buttons of a kind: the search near the centre (by the centre's name) and the pin on the centre
  const kindButtons = (c) => h('div', { class: 'kind-buttons' },
    link(googleNearUrl(centre, LINK_WORDS[c.id][0]), 'btn', t('searchNearCentre')),
    link(googleCentreUrl(centre), 'btn ghost', `📍 ${t('centreShort')}`),
    ...LINK_WORDS[c.id].slice(1).map((w) => link(googleNearUrl(centre, w), 'btn ghost', w.charAt(0).toUpperCase() + w.slice(1))));
  // The top of the nearby section: first "Show my exam centre" (a pin exactly on the centre), then a pair of buttons for every kind.
  const mapsBlock = () => {
    if (!centre) return null;
    return h('section', { class: `maps-block${info.small ? ' thin-town' : ''}` },
      h('h4', null, t('seeOnGoogle')),
      info.small ? note(t('fewMappedTown'), 'warn') : null,
      h('div', { class: 'centre-pin' },
        link(googleCentreUrl(centre), 'btn big primary', `📍 ${t('showCentre')}`),
        isPhone() ? link(geoCentreUrl(centre), 'btn small ghost', t('phoneMapApp')) : null,       // Android: the phone's map app with the centre's name on the pin
        h('p', { class: 'muted' }, centreByName(centre) ? t('showCentreByName') : t('showCentreHelp')),
        link(directionsUrl(centre), 'btn big', `🧭 ${t('directionsToCentre')}`)),
      h('p', { class: 'muted' }, t('seeOnGoogleHelp')),
      h('div', { class: 'maps-grid' }, CATEGORIES.map((c) => h('div', { class: 'maps-cell' }, h('strong', null, `${c.icon} ${t(`cat_${c.id}`)}`), kindButtons(c)))));
  };
  const mapsButton = (c, primary) => (centre ? h('div', { class: 'kind-buttons' }, link(googleNearUrl(centre, LINK_WORDS[c.id][0]), `btn${primary ? '' : ' ghost'}`, t('searchNearCentre')), link(googleCentreUrl(centre), 'btn ghost', `📍 ${t('centreShort')}`)) : null);

  // The optional "Find more places with Google Maps" part: only when Google is set up in Settings. A button asks the Worker once;
  // the answer (count per kind, then every place) is shown in the app, marked "from Google Maps" (Google's attribution), and never put on our map.
  const googleBlock = () => {
    if (!google) return null;
    const labels = Object.fromEntries(CATEGORIES.map((c) => [c.id, t(`cat_${c.id}`)]));
    const v = googleView({ enabled: google.enabled, state: google.state, labels, messages: { unavailable: t('googleUnavailable'), none: t('googleNone') } });
    if (!v.visible) return null;
    return h('section', { class: 'google-block' },
      h('h4', null, t('googleFind')),
      v.showButton ? h('button', { type: 'button', class: 'btn big', onclick: google.onAsk }, `🔎 ${t('googleFind')}`) : null,
      v.loading ? note(t('searching'), 'info') : null,
      v.message ? note(v.message, 'info') : null,
      v.summary ? h('div', null, h('p', { class: 'big-text' }, v.summary), h('p', { class: 'muted google-attrib' }, `${t('googleFrom')} · Google Maps`)) : null,   // Google's required attribution: the text "Google Maps"
      ...v.kinds.map(({ kind, places }) => {
        const c = CATEGORIES.find((x) => x.id === kind);
        return h('div', { class: 'google-list' },
          h('h5', null, `${c.icon} ${t(`cat_${kind}`)} (${places.length}) · ${t('googleFrom')}`),
          h('ul', { class: 'cards' }, places.map((p) => h('li', { class: 'card near-item' },
            h('div', null, h('strong', null, p.name || t('unnamed')), h('div', { class: 'muted' }, `${t(`cat_${kind}`)} · ${distanceText(p.distanceKm)}`, p.distanceKm > 5 ? ` · ${t('inTown')}` : '')),
            h('div', { class: 'near-links' }, h('a', { href: googlePlaceUrl(p), target: '_blank', rel: 'noopener noreferrer', class: 'btn small' }, t('openInMaps')))))));
      }));
  };
  const section = (c) => {
    const list = perType[c.id];
    const isFailed = !list.length && failed.includes(c.id);
    const isPending = !list.length && pending.includes(c.id);
    const isThin = info.thin.has(c.id);
    return h('div', { class: `near-type${isThin ? ' thin' : ''}` },
      h('h4', null, `${c.icon} ${t(`cat_${c.id}`)}`),
      isThin && centre ? h('div', { class: 'thin-note' }, note(t('fewMapped'), 'warn'), link(googleNearUrl(centre, LINK_WORDS[c.id][0]), 'btn big', `🔎 ${t('seeOnGoogleShort')}`), link(googleCentreUrl(centre), 'btn ghost', `📍 ${t('centreShort')}`)) : null,
      list.length
        ? h('ul', { class: 'cards' }, list.map((p) => h('li', { class: 'card near-item' },
          h('div', null, h('strong', null, p.name || t('unnamed')), h('div', { class: 'muted' }, distanceText(p.distanceKm), p.distanceKm > 5 ? ` · ${t('inTown')}` : '')),
          h('div', { class: 'near-links' }, h('a', { href: geoUrl(p), class: 'btn small' }, t('openInMaps')), h('a', { href: osmUrl(p), target: '_blank', rel: 'noopener noreferrer', class: 'btn small ghost' }, 'OSM')))))
        : isPending ? note(t('typeLoading'), 'info')
        : isFailed ? h('div', null, note(t('nearbyFail'), 'warn'), onRetry ? h('button', { type: 'button', class: 'btn small ghost', onclick: onRetry }, t('tapRetry')) : null)       // asked, but the server did not answer: NOT the same as "none here"
        : (isThin && centre ? null : note(t('noneWithin'), 'info')),
      isThin && centre ? null : mapsButton(c, isFailed || !list.length));
  };
  const shown = filter === 'all' ? CATEGORIES : CATEGORIES.filter((c) => c.id === filter);
  const banner = failed.length && onRetry ? h('div', { class: 'near-retry' }, note(t('nearbyFail'), 'warn'), h('button', { type: 'button', class: 'btn', onclick: onRetry }, t('tapRetry'))) : null;
  container.replaceChildren(...present(mapsBlock(), googleBlock(), banner, chips, ...shown.map(section)));
}
