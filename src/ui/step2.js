// Step 2: find the centre on the map. Search runs only when the button is tapped.
import { h, button, note, stepBar, createMap, offlineBanner } from './dom.js';
import { t } from '../i18n.js';
import { savePlan } from '../store.js';
import { CONFIG } from '../config.js';
import { buildQueries, searchWithFallback } from '../logic/geocode-plan.js';
import { searchPlace } from '../services/nominatim.js';

export function renderStep2(root, plan, go, onLeave) {
  const status = h('div', { 'aria-live': 'polite' });
  const others = h('div');
  const mapEl = h('div', { id: 'map', class: 'map', role: 'application', 'aria-label': t('s2Title') });
  let map; let marker;

  const setPin = (lat, lng, zoom = 17) => {
    plan.centre = { lat, lng };
    if (!marker) {
      marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => { const p = marker.getLatLng(); plan.centre = { lat: p.lat, lng: p.lng, confidence: 'high' }; savePlan(plan); });      // dragged by the user: a sure pin
    } else marker.setLatLng([lat, lng]);
    map.setView([lat, lng], zoom);
    savePlan(plan);
  };

  async function find() {
    status.replaceChildren(note(t('searching'), 'info'));
    others.replaceChildren();
    const queries = buildQueries(plan.fields);
    try {
      const { results, used } = await searchWithFallback(queries, (q) => searchPlace(q));
      if (!results.length) { status.replaceChildren(note(t('notFound'), 'warn')); return; }
      setPin(results[0].lat, results[0].lng);
      status.replaceChildren(note(`${t('foundUsing')}: ${used.label} — “${used.q}”`, 'ok'), note(t('dragPin'), 'info'));
      if (results.length > 1) {
        others.replaceChildren(h('h3', null, t('otherResults')), h('ul', { class: 'cards' }, results.slice(1).map((r) =>
          h('li', null, h('button', { type: 'button', class: 'btn link', onclick: () => setPin(r.lat, r.lng) }, r.label.slice(0, 110))))));
      }
    } catch {
      status.replaceChildren(note(navigator.onLine === false ? t('offline') : t('searchFail'), 'error'));
    }
  }

  root.append(
    stepBar(2), h('h2', null, t('s2Title')), offlineBanner(),
    h('p', { class: 'muted' }, [plan.fields.centreName, plan.fields.address, plan.fields.pincode].filter(Boolean).join(', ')),
    button(`🔎 ${t('findCentre')}`, find, 'primary'),
    status, mapEl, others,
    h('div', { class: 'row between' },
      button(t('back'), () => go.back(`#/step/1/${plan.id}`), 'ghost'),
      button(t('next'), () => {
        if (!plan.centre) { status.replaceChildren(note(t('needPin'), 'error')); return; }
        plan.route = null; // centre may have moved
        savePlan(plan);
        go(`#/step/3/${plan.id}`);
      }, 'primary big')),
  );

  map = createMap(mapEl, plan.centre ? { ...plan.centre, zoom: 17 } : CONFIG.defaultView);
  if (plan.centre) setPin(plan.centre.lat, plan.centre.lng);
  map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng, map.getZoom()));
  onLeave(() => map.remove());
}
