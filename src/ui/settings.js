// Settings, About and the shared-link view.
import { h, field, button, note, createMap } from './dom.js';
import { t, STRINGS } from '../i18n.js';
import { getSettings, saveSettings, clearAll, newPlan, savePlan } from '../store.js';
import { parseShareParams } from '../logic/share.js';

function keyBox(name, label, helpKey, link) {
  const msg = h('div', { 'aria-live': 'polite' });
  const f = field(label, { type: 'password', autocomplete: 'off', value: getSettings()[name], placeholder: getSettings()[name] ? '••••••••' : '' });
  return h('div', { class: 'card' },
    f.wrap, h('p', { class: 'muted' }, t(helpKey)), link,
    h('div', { class: 'row' },
      button(t('saveKey'), () => { saveSettings({ [name]: f.input.value.trim() }); msg.replaceChildren(note(t('keySaved'), 'ok')); }, 'primary'),
      button(t('removeKey'), () => { saveSettings({ [name]: '' }); f.input.value = ''; msg.replaceChildren(note(t('keyRemoved'), 'ok')); })),
    msg);
}

/** Optional Google Places through your own Cloudflare Worker: OFF by default. */
function placesBox() {
  const s = getSettings();
  const url = h('input', { type: 'url', id: 'placesUrl', value: s.placesWorkerUrl || '', placeholder: 'https://centreway-places.yourname.workers.dev', autocomplete: 'off' });
  const on = h('input', { type: 'checkbox', id: 'placesOn', checked: Boolean(s.placesEnabled) });
  const msg = h('div', { 'aria-live': 'polite' });
  const save = () => { saveSettings({ placesWorkerUrl: url.value.trim(), placesEnabled: on.checked }); msg.replaceChildren(note(t('saved'), 'ok')); };
  return h('section', { class: 'card' },
    h('h3', null, t('placesTitle')), note(t('placesNote'), 'info'),
    h('div', { class: 'field' }, h('label', { for: 'placesUrl' }, t('placesUrl')), url),
    h('label', { class: 'check' }, on, ` ${t('placesUse')}`),
    h('div', { class: 'row' }, button(t('save'), save)), msg);
}

export function renderSettings(root, go) {
  const s = getSettings();
  const msg = h('div', { 'aria-live': 'polite' });
  const lang = h('select', { id: 'lang', onchange: (e) => { saveSettings({ lang: e.target.value }); go('#/settings', true); } },
    Object.keys(STRINGS).map((l) => h('option', { value: l, selected: s.lang === l }, l === 'en' ? 'English' : 'हिन्दी')));
  root.append(
    h('h2', null, t('settings')),
    h('div', { class: 'field' }, h('label', { for: 'lang' }, t('language')), lang),
    h('h3', null, t('keysTitle')),
    note(t('keyNote'), 'info'),
    keyBox('orsKey', t('orsKey'), 'orsHelp'),
    keyBox('geminiKey', t('geminiKey'), 'geminiHelp'),
    placesBox(),
    h('h3', null, t('clearAll')),
    button(t('clearAll'), async () => {
      if (!confirm(t('clearConfirm'))) return;
      await clearAll();
      msg.replaceChildren(note(t('cleared'), 'ok'));
    }, 'danger'),
    msg,
    h('div', { class: 'row' }, button(t('home'), () => go('#/'), 'ghost')),
  );
}

export function renderAbout(root, go) {
  root.append(
    h('h2', null, t('aboutTitle')),
    ...t('aboutText').map((p) => h('p', null, p)),
    h('h3', null, t('knownLimits')),
    h('ul', null, t('limits').map((l) => h('li', null, l))),
    h('p', { class: 'muted' }, 'Map data © OpenStreetMap contributors (ODbL). Leaflet, Tesseract.js. See LICENSES.md.'),
    h('div', { class: 'row' }, button(t('home'), () => go('#/'), 'ghost')),
  );
}

export function renderShared(root, search, go, onLeave) {
  const p = parseShareParams(search);
  if (!p) { root.append(note(t('sharedBad'), 'error'), button(t('home'), () => go('#/'))); return; }
  const mapEl = h('div', { id: 'map', class: 'map' });
  root.append(
    h('h2', null, t('sharedTitle')),
    h('section', { class: 'card leave' },
      h('div', { class: 'muted' }, t('leaveBy')), h('div', { class: 'huge' }, p.leaveBy || '--:--'), h('p', { class: 'muted' }, p.date)),
    h('p', null, h('strong', null, p.name)),
    p.timeline && p.timeline.length ? h('ul', { class: 'timeline-list' }, ...p.timeline.map((x) => h('li', null, h('span', { class: 'tl-time' }, x.time), ' ', h('span', { class: 'tl-label' }, x.label)))) : null,
    mapEl,
    note(t('estimateNote'), 'info'),
    h('div', { class: 'row' },
      button(t('savePlanCopy'), () => {
        const plan = newPlan();
        plan.fields.centreName = p.name.split(',')[0];
        plan.fields.address = p.name;
        plan.fields.examDate = p.date;
        plan.centre = { lat: p.lat, lng: p.lng };
        savePlan(plan);
        go(`#/step/3/${plan.id}`);
      }, 'primary'),
      button(t('home'), () => go('#/'), 'ghost')));
  const map = createMap(mapEl, { lat: p.lat, lng: p.lng, zoom: 16 });
  window.L.marker([p.lat, p.lng]).addTo(map);
  onLeave(() => map.remove());
}
