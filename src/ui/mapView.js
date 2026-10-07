// The map used on the summary and the plan screen. Always shows: the centre pin, the start pin, the route line and the nearby places
// (a different icon for each type). The view always fits the centre and the route; tapping a type fits the map to that type's places.
import { createMap, emojiIcon, h } from './dom.js';
import { CATEGORIES } from '../services/overpass.js';
import { geoUrl, osmUrl, distanceText } from '../logic/placeLinks.js';
import { t } from '../i18n.js';
import { CONFIG } from '../config.js';

const ok = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

function popupFor(place) {
  const box = h('div', { class: 'map-popup' },
    h('strong', null, place.name || t('unnamed')), h('div', { class: 'muted' }, `${distanceText(place.distanceKm)} · ${place.icon}`),
    h('div', null, h('a', { href: geoUrl(place) }, t('openInMaps')), ' · ', h('a', { href: osmUrl(place), target: '_blank', rel: 'noopener noreferrer' }, 'OpenStreetMap')));
  return box;
}

/**
 * el: the map container. state: { centre, start, route, items, sure } (all optional but centre).
 * options: { onCentreDrag(lat, lng), onMapClick(lat, lng) }.
 * Returns { map, update(state), filter(typeId | 'all'), fit(), destroy() }.
 */
export function createPlanMap(el, state, options = {}) {
  const L = window.L;
  const first = ok(state.centre) ? { ...state.centre, zoom: 15 } : CONFIG.defaultView;
  const map = createMap(el, first);
  const layer = L.layerGroup().addTo(map);
  let current = { ...state };
  let typeFilter = 'all';
  let centreMarker = null;

  function visibleItems() {
    return (current.items || []).filter((i) => ok(i) && (typeFilter === 'all' || i.category === typeFilter));
  }

  function fit() {
    map.invalidateSize();
    const points = [];
    if (ok(current.centre)) points.push([current.centre.lat, current.centre.lng]);
    if (ok(current.start)) points.push([current.start.lat, current.start.lng]);
    if (current.route && current.route.geometry) for (const p of current.route.geometry) if (Array.isArray(p) && Number.isFinite(p[0])) points.push(p);
    if (typeFilter !== 'all') for (const i of visibleItems()) points.push([i.lat, i.lng]);
    else if (points.length <= 1) for (const i of visibleItems().slice(0, 15)) points.push([i.lat, i.lng]);   // no route: show the places around the centre
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 16); return; }                                          // never open on empty space
    map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 17 });
  }

  function draw() {
    layer.clearLayers();
    centreMarker = null;
    if (ok(current.route && { lat: 0, lng: 0 }) && current.route.geometry) L.polyline(current.route.geometry, { color: '#0b57d0', weight: 5 }).addTo(layer);
    const stops = (current.stops || []).filter(ok);
    if (stops.length && ok(current.start) && ok(current.centre)) L.polyline([[current.start.lat, current.start.lng], ...stops.map((x) => [x.lat, x.lng]), [current.centre.lat, current.centre.lng]], { color: '#b45309', weight: 3, dashArray: '6 8' }).addTo(layer);
    stops.forEach((x, n) => L.marker([x.lat, x.lng], { icon: emojiIcon(String(n + 1), 'stop'), zIndexOffset: 500 }).addTo(layer).bindPopup(`${t('stopN', { n: n + 1 })}: ${x.name || ''} ${x.arriveClock ? '— ' + x.arriveClock : ''}`));
    for (const i of visibleItems()) L.marker([i.lat, i.lng], { icon: emojiIcon(i.icon) }).addTo(layer).bindPopup(popupFor(i));
    if (ok(current.start)) L.marker([current.start.lat, current.start.lng], { icon: emojiIcon('🧍', 'start') }).addTo(layer).bindPopup(current.start.label || 'Start');
    if (ok(current.centre)) {
      const opts = { draggable: Boolean(options.onCentreDrag), zIndexOffset: 1000 };
      if (current.sure === false) opts.icon = emojiIcon('📍', 'warnpin');            // yellow pin: "please check"
      centreMarker = L.marker([current.centre.lat, current.centre.lng], opts).addTo(layer);
      if (options.onCentreDrag) centreMarker.on('dragend', () => { const p = centreMarker.getLatLng(); options.onCentreDrag(p.lat, p.lng); });
    }
  }

  if (options.onMapClick) map.on('click', (e) => options.onMapClick(e.latlng.lat, e.latlng.lng));
  draw();
  fit();
  return {
    map,
    update(next) { current = { ...current, ...next }; draw(); fit(); },
    filter(type) { typeFilter = type; draw(); fit(); },
    fit,
    types: CATEGORIES,
    destroy() { map.remove(); },
  };
}
