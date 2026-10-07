// Step 3: start point and route.
import { h, field, button, note, stepBar, createMap, emojiIcon, offlineBanner } from './dom.js';
import { t } from '../i18n.js';
import { savePlan, getSettings } from '../store.js';
import { searchPlace } from '../services/nominatim.js';
import { getRoute } from '../services/routing.js';
import { haversineKm, formatDistance, formatDuration } from '../logic/geo.js';
import { offlineRoute, warmOfflineData } from '../services/offlineRoute.js';
import { loadPlaceIndex, suggestPlaces } from '../logic/places.js';

export function renderStep3(root, plan, go, onLeave) {
  if (!plan.centre) { go(`#/step/2/${plan.id}`); return; }
  const status = h('div', { 'aria-live': 'polite' });
  const info = h('div', { 'aria-live': 'polite' });
  const results = h('div');
  const mapEl = h('div', { id: 'map', class: 'map' });
  let map; let startMarker; let line; let picking = false;

  const centreIcon = window.L.marker([plan.centre.lat, plan.centre.lng]);

  function drawRoute() {
    if (line) { line.remove(); line = null; }
    if (plan.route?.geometry) {
      line = window.L.polyline(plan.route.geometry, { color: '#0b57d0', weight: 5 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [30, 30] });
    } else if (plan.start) {
      map.fitBounds([[plan.start.lat, plan.start.lng], [plan.centre.lat, plan.centre.lng]], { padding: [30, 30] });
    }
  }

  function showInfo() {
    const r = plan.route;
    if (!r) { info.replaceChildren(); return; }
    const minField = field(t('manualTime'), { type: 'number', min: '1', max: '1440', value: String(Math.round(plan.travelMin ?? r.durationMin ?? 0) || '') });
    minField.input.addEventListener('change', () => { plan.travelMin = Number(minField.input.value) || null; savePlan(plan); });
    info.replaceChildren(h('div', { class: 'card' },
      h('strong', null, r.straightLine ? t('straight') : t('routeInfo')),
      h('p', { class: 'big-text' }, formatDistance(r.distanceKm), r.straightLine ? '' : ` · ${formatDuration(r.durationMin)}`),
      r.source ? h('p', { class: r.offline ? 'note warn' : 'muted' }, r.offline ? `${t('offlineRoute')} · ${t('osmCredit')}` : `Source: ${r.source}`) : null,
      plan.mode === 'bike' ? note(t('bikeNote'), 'info') : null,
      note(t('estimateNote'), 'info'),
      minField.wrap));
  }

  async function route() {
    if (!plan.start) { status.replaceChildren(note(t('needStart'), 'error')); return; }
    status.replaceChildren(note(t('routing'), 'info'));
    try {
      const r = await getRoute(plan.start, plan.centre, plan.mode, getSettings().orsKey);
      plan.route = r;
      plan.travelMin = null;
      status.replaceChildren();
    } catch (e) {
      // OSRM failed, timed out or we are offline: try my own A* router (only inside the bundled map area).
      const own = await offlineRoute(plan.start, plan.centre, plan.mode);
      if (own) {
        plan.route = own;
        plan.travelMin = null;
        status.replaceChildren(note(t('offlineRouteNote'), 'info'));
      } else {
        plan.route = { distanceKm: haversineKm(plan.start, plan.centre), durationMin: null, geometry: null, straightLine: true };
        plan.travelMin = null;
        status.replaceChildren(
          note(e.code === 'offline' ? t('offline') : t('routeFail'), 'error'),
          getSettings().orsKey ? null : note(t('routeFailHint'), 'info'));
      }
    }
    savePlan(plan);
    drawRoute();
    showInfo();
  }

  function setStart(lat, lng, label) {
    plan.start = { lat, lng, label: label || '' };
    plan.route = null;
    if (!startMarker) startMarker = window.L.marker([lat, lng], { icon: emojiIcon('📍', 'start') }).addTo(map);
    else startMarker.setLatLng([lat, lng]);
    savePlan(plan);
    route();
  }

  const place = field(t('typePlace'), { autocomplete: 'off' });
  // Local suggestions from my trie (no request is sent while typing).
  const suggestBox = h('div', { 'aria-live': 'polite' });
  let placeIndex = null;
  loadPlaceIndex().then((index) => { placeIndex = index; });
  place.input.addEventListener('input', () => {
    try {
      const found = suggestPlaces(placeIndex, place.input.value, 6);
      suggestBox.replaceChildren(found.length ? h('ul', { class: 'cards' }, found.map((p) => h('li', null,
        h('button', { type: 'button', class: 'btn link', onclick: () => {
          place.input.value = p.name;
          suggestBox.replaceChildren();
          if (p.lat != null) setStart(p.lat, p.lon, p.name); else searchStart();
        } }, `${p.kind === 'station' ? '🚆' : p.kind === 'bus' ? '🚌' : p.kind === 'hostel' ? '🛏️' : '📍'} ${p.name}`)))) : '');
    } catch { suggestBox.replaceChildren(); } // suggestions are optional
  });
  async function searchStart() {
    const q = place.input.value.trim();
    if (!q) return;
    results.replaceChildren(note(t('searching'), 'info'));
    try {
      const found = await searchPlace(q, { near: plan.centre });
      results.replaceChildren(found.length
        ? h('ul', { class: 'cards' }, found.map((r) => h('li', null, h('button', { type: 'button', class: 'btn link', onclick: () => { results.replaceChildren(); setStart(r.lat, r.lng, r.label.slice(0, 80)); } }, r.label.slice(0, 110)))))
        : note(t('notFound'), 'warn'));
    } catch { results.replaceChildren(note(navigator.onLine === false ? t('offline') : t('searchFail'), 'error')); }
  }

  function useLocation() {
    if (!navigator.geolocation) { status.replaceChildren(note(t('locFail'), 'error')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setStart(pos.coords.latitude, pos.coords.longitude, 'My location'),
      (err) => status.replaceChildren(note(err.code === 1 ? t('locDenied') : t('locFail'), 'error')),
      { enableHighAccuracy: true, timeout: 10000 });
  }

  const modeBtns = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('mode') });
  const renderModes = () => modeBtns.replaceChildren(...[['car', 'mCar', '🚕'], ['bike', 'mBike', '🏍️'], ['foot', 'mFoot', '🚶']].map(([m, k, ic]) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(plan.mode === m), class: `chip ${plan.mode === m ? 'on' : ''}`, onclick: () => { plan.mode = m; plan.route = null; savePlan(plan); renderModes(); if (plan.start) route(); } }, `${ic} ${t(k)}`)));
  renderModes();

  const pickBtn = button(`🗺️ ${t('pickOnMap')}`, () => { picking = !picking; pickBtn.classList.toggle('on', picking); status.replaceChildren(picking ? note(t('pickHint'), 'info') : ''); });

  root.append(
    stepBar(3), h('h2', null, t('s3Title')), offlineBanner(),
    h('div', { class: 'row' }, button(`📍 ${t('useLocation')}`, useLocation, 'primary'), pickBtn),
    h('p', { class: 'muted' }, t('locWhy')),
    h('div', { class: 'row grow' }, place.wrap, button(t('searchBtn'), searchStart)),
    suggestBox, results,
    h('div', { class: 'field' }, h('label', null, t('mode')), modeBtns),
    status, mapEl, info,
    h('div', { class: 'row between' },
      button(t('back'), () => go.back(`#/step/2/${plan.id}`), 'ghost'),
      button(t('next'), () => go(`#/step/4/${plan.id}`), 'primary big')),
  );
  place.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchStart(); } });

  map = createMap(mapEl, { ...plan.centre, zoom: 15 });
  centreIcon.addTo(map);
  warmOfflineData(plan.centre);
  map.on('click', (e) => { if (picking) { picking = false; pickBtn.classList.remove('on'); status.replaceChildren(); setStart(e.latlng.lat, e.latlng.lng, 'Point on map'); } });
  if (plan.start) {
    startMarker = window.L.marker([plan.start.lat, plan.start.lng], { icon: emojiIcon('📍', 'start') }).addTo(map);
    drawRoute();
    showInfo();
  }
  onLeave(() => map.remove());
}
