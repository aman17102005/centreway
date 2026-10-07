// The ONE summary screen: everything the app worked out from the admit card.
// Fields the app is not sure about are yellow with a short note. The user taps a field only if it is wrong.
import { h, button, note, present } from './dom.js';
import { createPlanMap } from './mapView.js';
import { renderNearbyList } from './nearbyList.js';
import { t } from '../i18n.js';
import { loadDraft, saveDraft, clearDraft } from '../flow/draft.js';
import { leaveForDay, finalizeDraft, draftFields } from '../flow/autoPlan.js';
import { findCentre } from '../flow/centreFinder.js';
import { routeFor } from '../flow/routePlan.js';
import { validateResult, needsCheck } from '../ingest/validate.js';
import { askNotificationPermission, scheduleReminders, icsForPlans } from '../flow/reminders.js';
import { leaveByFor, timelineFor } from './step4.js';
import { searchPlace } from '../services/nominatim.js';
import { fetchNearby } from '../services/overpass.js';
import { googleNearby, placesEnabled, googleRemembered } from '../services/googlePlaces.js';
import { GOOGLE_KINDS } from '../logic/googleView.js';
import { areaOf } from '../logic/placeLinks.js';
import { CATEGORIES } from '../services/categories.js';
import { CONFIG } from '../config.js';
import { saveLastStart, nearestHub } from '../flow/startPoint.js';
import { requestLocation, forgetLocation } from '../flow/location.js';
import { loadPlaceIndex, suggestPlaces } from '../logic/places.js';
import { getSettings, saveSettings } from '../store.js';
import { extractFieldsWithAi } from '../services/gemini.js';
import { applyAiFields } from '../ingest/aiFix.js';
import { formatDistance, formatDuration } from '../logic/geo.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function friendlyTime(hhmm) {
  if (!hhmm) return '';
  const [hh, mm] = hhmm.split(':').map(Number);
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}
export function friendlyDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

export function renderSummary(root, go, onLeave) {
  const draft = loadDraft();
  if (!draft) { go('#/'); return; }
  const r = draft.read;
  const save = () => saveDraft(draft);
  const top = h('div');
  const mapBox = h('div');
  const bottom = h('div');
  let mapApi = null; let nearbyFilter = 'all'; let nearbyLoading = false; let nearbyFailed = false; let nearbyPending = []; let nearbyGoogle = placesEnabled() ? (googleRemembered('draft') ? { status: 'done', places: googleRemembered('draft').places } : { status: 'idle', places: [] }) : null;
  const status = h('div', { 'aria-live': 'polite' });

  // ------------------------------------------------------------ one editable field
  /** kind: text | textarea | date | time. optional: empty is fine (not yellow). */
  function fieldRow(label, field, { kind = 'text', display, optional = false, after } = {}) {
    const row = h('div');
    const yellow = () => (field.value ? needsCheck(field) : !optional);
    const show = () => {
      row.className = `frow ${yellow() ? 'uncertain' : ''}`;
      const shown = field.value ? (display ? display(field.value) : field.value) : (optional ? t('notFound2') : t('tapToAdd'));
      row.replaceChildren(...present(
        h('button', { type: 'button', class: 'frow-btn', 'aria-label': `${label}: ${shown}. ${t('tapToEdit')}`, onclick: edit },
          h('span', { class: 'frow-label' }, label), h('span', { class: `frow-value ${field.value ? '' : 'empty'}` }, shown)),
        field.note ? h('div', { class: 'frow-note' }, field.note) : null,
        field.suggestion ? h('button', { type: 'button', class: 'chip', onclick: () => { field.value = field.value.split(field.suggestion.from).join(field.suggestion.to); field.suggestion = null; field.flag = false; field.note = ''; save(); after?.('centre'); show(); } }, `${t('didYouMean')} ${field.suggestion.to}?`) : null));
    };
    const edit = () => {
      const input = kind === 'textarea' ? h('textarea', { rows: '3' }) : h('input', { type: kind === 'date' || kind === 'time' ? kind : 'text' });
      input.value = field.value || '';
      const commit = () => {
        const changed = input.value.trim() !== (field.value || '');
        field.value = input.value.trim(); field.confidence = 1; field.level = 'high'; field.flag = false; field.note = ''; field.suggestion = null;
        save(); show();
        if (changed) after?.(kind);
      };
      row.className = 'frow editing';
      row.replaceChildren(h('label', { class: 'frow-label' }, label), input,
        h('div', { class: 'row' }, button(t('save2'), commit, 'primary'), button(t('cancel'), show, 'ghost')));
      input.focus();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && kind !== 'textarea') { e.preventDefault(); commit(); } });
    };
    show();
    return row;
  }

  // ---------------------------------------------------------- the pieces
  const refreshChecks = () => {
    r.issues.length = 0;
    validateResult({ ...r, issues: r.issues }, { geo: null });
  };

  async function refind() {
    status.replaceChildren(note(t('searching'), 'info'));
    try {
      const found = await findCentre(draftFields({ centreName: r.centreName, address: r.address, pincode: r.pincode, city: r.city }));
      if (found.found) {
        draft.centre = { lat: found.lat, lng: found.lng, label: found.label, confidence: found.confidence, usedQuery: found.usedQuery, tried: found.tried, postcode: found.postcode };
        draft.centreError = null;
        validateResult({ ...r, issues: r.issues }, { geo: found });
      } else { draft.centre = null; draft.centreError = 'notfound'; }
    } catch (e) { draft.centreError = e.code === 'offline' ? 'offline' : 'failed'; }
    save(); await refreshRoute(); renderAll(); drawPin();
    await refreshNearby(); renderAll(); drawPin();
  }

  /** Places near the centre (all types, widening on their own). Runs again whenever the pin moves. */
  async function refreshNearby() {
    if (!draft.centre) { draft.nearby = []; draft.nearbyEmpty = []; draft.nearbyFailed = []; draft.nearbyCount = null; save(); return; }
    nearbyLoading = true; nearbyFailed = false; renderBottom();
    try {
      const out = await fetchNearby({ lat: draft.centre.lat, lng: draft.centre.lng, city: r.city.value, pincode: r.pincode.value }, {
        onPartial: (p) => { draft.nearby = p.items; draft.nearbyFailed = p.failedTypes; nearbyPending = p.pendingTypes; nearbyLoading = false; renderBottom(); drawPin(); },     // each type appears as soon as it arrives
      });
      nearbyPending = [];
      draft.nearby = out.items; draft.nearbyEmpty = out.emptyTypes || []; draft.nearbyFailed = out.failedTypes || []; draft.nearbyCount = out.items.length;
    } catch { draft.nearbyCount = null; nearbyFailed = true; }
    nearbyLoading = false;
    save();
  }

  /** The "Find more places with Google Maps" button: one search through the Worker, remembered while the app is open (never saved in the draft). */
  async function askGoogle() {
    if (!draft.centre) return;
    nearbyGoogle = { status: 'loading', places: [] }; renderBottom();
    try {
      const out = await googleNearby(draft.centre, GOOGLE_KINDS, { cacheKey: 'draft' });
      nearbyGoogle = out.limitReached || out.off ? { status: out.off ? 'unavailable' : 'limit', places: [] } : { status: 'done', places: out.places };
    } catch { nearbyGoogle = { status: 'unavailable', places: [] }; }
    renderBottom();
  }

  async function refreshRoute() {
    if (!draft.start || !draft.centre) { draft.route = null; save(); return; }
    const out = await routeFor(draft.start, draft.centre, draft.mode, getSettings().orsKey);
    draft.route = out.route; draft.routeError = out.error; draft.travelMin = null; save();
  }

  function renderTop() {
    const days = r.days.map((day, i) => {
      const leave = leaveForDay(draft, day);
      return h('section', { class: 'card day' },
        h('h3', null, r.days.length > 1 ? `${t('sumDay')} ${i + 1}` : t('sumDay')),
        fieldRow(t('fExamDate'), day.date, { kind: 'date', display: friendlyDate, after: renderAll }),
        fieldRow(t('fReportTime'), day.reportTime, { kind: 'time', display: friendlyTime, after: renderAll }),
        fieldRow(t('fGateTime'), day.gateTime, { kind: 'time', display: friendlyTime, optional: true, after: renderAll }),
        fieldRow(t('fExamStart'), day.startTime, { kind: 'time', display: friendlyTime, optional: true, after: renderAll }),
        fieldRow(t('fExamEnd'), day.endTime, { kind: 'time', display: friendlyTime, optional: true, after: renderAll }),
        fieldRow(t('fShift'), day.shift, { optional: true, after: renderAll }),
        day.subject ? h('p', { class: 'muted' }, day.subject) : null,
        leave
          ? h('div', { class: 'leave' }, h('div', { class: 'muted' }, t('leaveByDay')), h('div', { class: 'huge' }, friendlyTime(leave.text)), leave.dayOffset < 0 ? h('div', { class: 'warn-text' }, t('dayBefore')) : null)
          : note(t('needStartForLeave'), 'info'));
    });
    // what is needed for the plan but not found on the card: said clearly, in yellow; everything else is planned anyway
    const missing = [];
    if (!r.days.length || !r.days.some((d) => d.date.value)) missing.push(t('fExamDate'));
    if (!r.days.some((d) => d.reportTime.value || d.gateTime.value)) missing.push(t('fReportTime'));
    if (!r.address.value && !r.centreName.value) missing.push(t('fAddress'));
    else if (!r.pincode.value) missing.push(t('fPincode'));
    top.replaceChildren(...present(
      h('h2', null, t('sumTitle')), h('p', { class: 'muted' }, t('sumHelp')),
      missing.length ? note(`${t('missingNote')}: ${missing.join(', ')}. ${t('missingStillPlanned')}`, 'warn') : null,
      h('section', { class: 'card' }, h('h3', null, t('sumExam')), fieldRow(t('fExamName'), r.examName, { optional: true })),
      ...days,
      h('section', { class: 'card' }, h('h3', null, t('sumCentre')),
        fieldRow(t('fCentreName'), r.centreName, { after: refind }),
        fieldRow(t('fAddress'), r.address, { kind: 'textarea', after: refind }),
        fieldRow(t('fCity'), r.city, { optional: true, after: refind }),
        fieldRow(t('fPincode'), r.pincode, { after: refind }),
        r.fixes.length ? h('p', { class: 'muted' }, `${t('spellingFixed')}: ${r.fixes.map((f) => `${f.from} → ${f.to}`).join(', ')}`) : null)));
  }

  function renderStatus() {
    const c = draft.centre;
    if (!c) { status.replaceChildren(note(draft.centreError === 'offline' ? t('centreOffline') : t('centreNotFound'), 'warn'), button(t('searchAgain'), refind)); return; }
    const sure = c.confidence === 'high';
    status.replaceChildren(...present(
      note(sure ? t('pinOk') : t('pinCheck'), sure ? 'ok' : 'warn'),
      c.usedQuery ? h('p', { class: 'muted' }, `${t('pinWhy')}: ${c.usedQuery}`) : null,
      button(t('searchAgain'), refind, 'ghost')));
    mapBox.firstChild?.classList.toggle('uncertain', !sure);
  }

  /** Redraw the map (centre pin, start pin, route line, nearby places) and the pin note. */
  function drawPin() {
    if (!mapApi) return;
    mapApi.update({ centre: draft.centre, start: draft.start, route: draft.route, items: draft.nearby || [], sure: draft.centre ? draft.centre.confidence === 'high' : true });
    renderStatus();
  }

  // the start point: from location, or (if location was refused) typed with local suggestions
  function startPicker() {
    const input = h('input', { type: 'text', autocomplete: 'off', 'aria-label': t('startFrom'), placeholder: t('typePlace') });
    const list = h('div');
    let index = null;
    loadPlaceIndex().then((i) => { index = i; });
    const choose = async (lat, lng, label) => { await setStart({ lat, lng, label, source: 'typed' }); };
    const search = async () => {
      const q = input.value.trim(); if (!q) return;
      list.replaceChildren(note(t('searching'), 'info'));
      try {
        const found = await searchPlace(q, { near: draft.centre || undefined });
        list.replaceChildren(found.length ? h('ul', { class: 'cards' }, found.map((x) => h('li', null, h('button', { type: 'button', class: 'btn link', onclick: () => choose(x.lat, x.lng, x.label.slice(0, 80)) }, x.label.slice(0, 110))))) : note(t('notFound'), 'warn'));
      } catch { list.replaceChildren(note(t('searchFail'), 'error')); }
    };
    input.addEventListener('input', () => {
      const found = suggestPlaces(index, input.value, 6);
      list.replaceChildren(found.length ? h('ul', { class: 'cards' }, found.map((p) => h('li', null, h('button', { type: 'button', class: 'btn link', onclick: () => { input.value = p.name; if (p.lat != null) choose(p.lat, p.lon, p.name); else search(); } }, `📍 ${p.name}`)))) : '');
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    return h('div', null, note(t('locDeniedStart'), 'warn'), h('div', { class: 'row grow' }, h('div', { class: 'field' }, input), button(t('searchBtn'), search)), list);
  }

  /** Use this start point, remember it for next time, and plan the route. */
  async function setStart(start) {
    draft.start = start;
    saveLastStart(start);
    await refreshRoute(); save(); renderAll(); drawPin();
  }
  async function useHub(kind) {
    if (!draft.centre) return;
    hubBox.replaceChildren(note(t('searching'), 'info'));
    try {
      const hub = await nearestHub({ lat: draft.centre.lat, lng: draft.centre.lng }, kind);
      if (hub) { hubBox.replaceChildren(); await setStart({ ...hub, source: 'hub' }); } else hubBox.replaceChildren(note(t('notFound'), 'warn'));
    } catch { hubBox.replaceChildren(note(t('searchFail'), 'warn')); }
  }
  async function useMyLocation() {
    forgetLocation();
    const here = await requestLocation();
    if (here.ok) await setStart({ lat: here.lat, lng: here.lng, label: 'My location', source: 'gps' });
    else hubBox.replaceChildren(note(t('locDenied'), 'warn'));
  }
  const hubBox = h('div', { 'aria-live': 'polite' });

  function renderBottom() {
    const modeChips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('routeBy') },
      [['car', 'mCar', '🚕'], ['bike', 'mBike', '🏍️'], ['foot', 'mFoot', '🚶']].map(([m, k, ic]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(draft.mode === m), class: `chip ${draft.mode === m ? 'on' : ''}`,
        onclick: async () => { draft.mode = m; await refreshRoute(); renderAll(); drawPin(); } }, `${ic} ${t(k)}`)));
    // for students who come from another city: start from the nearest railway station or bus stand
    const quick = h('div', { class: 'chips' },
      h('button', { type: 'button', class: 'chip', onclick: useMyLocation }, `📍 ${t('useMyLocation')}`),
      h('button', { type: 'button', class: 'chip', onclick: () => useHub('rail') }, `🚆 ${t('nearestRail')}`),
      h('button', { type: 'button', class: 'chip', onclick: () => useHub('bus') }, `🚌 ${t('nearestBus')}`));
    const rt = draft.route;
    const startLabel = draft.start ? `${draft.start.source === 'saved' ? `${t('savedStart')}: ` : ''}${draft.start.label}` : '';
    const startBox = draft.start
      ? h('div', null, ...present(h('p', null, `🧍 ${startLabel}`),
        rt ? h('p', { class: 'big-text' }, formatDistance(rt.distanceKm), rt.straightLine ? '' : ` · ${formatDuration(draft.travelMin ?? rt.durationMin)}`) : null,
        rt?.offline ? note(`${t('offlineRoute')} · ${t('osmCredit')}`, 'warn') : null,
        rt?.straightLine ? note(t('straight'), 'warn') : null, modeChips, quick, hubBox))
      : h('div', null, startPicker(), quick, hubBox);        // only now (no location, nothing saved) the start-point box is shown
    // the "See all places on Google Maps" buttons are inside nearbyBox and always there (also while loading or after a failure)
    const nearbyCard = h('section', { class: 'card' }, h('h3', null, t('sumNearby')),
      !draft.centre ? note(t('centreNotFound'), 'warn')
        : h('div', null, nearbyLoading ? note(t('nearbyLoading'), 'info') : null,
          nearbyFailed ? h('div', null, note(t('nearbyFail'), 'warn'), button(t('tapRetry'), () => refreshNearby().then(() => { renderAll(); drawPin(); }), 'ghost')) : null, nearbyBox));
    renderNearbyList(nearbyBox, draft.nearby || [], nearbyFilter, (type) => { nearbyFilter = type; mapApi?.filter(type); renderBottom(); },
      { failed: draft.nearbyFailed || [], pending: nearbyPending, centre: draft.centre && { ...draft.centre, name: r.centreName.value, city: r.city.value, address: r.address.value, pincode: r.pincode.value, confidence: draft.centre.confidence, area: areaOf(r.address.value, { name: r.centreName.value, city: r.city.value }), sure: !needsCheck(r.centreName) }, google: { enabled: placesEnabled(), state: nearbyGoogle, onAsk: askGoogle }, onRetry: () => refreshNearby().then(() => { renderAll(); drawPin(); }) });
    bottom.replaceChildren(...present(
      h('section', { class: 'card' }, h('h3', null, t('sumStart')), startBox),
      nearbyCard,
      r.notAllowed.length ? h('section', { class: 'card' }, h('h3', null, t('sumNot')), h('ul', null, r.notAllowed.map((x) => h('li', null, x)))) : null,
      note(t('sumFooterNote'), 'info'),
      h('div', { class: 'row end' }, button(t('looksRight'), cont, 'primary big')),
      h('p', { class: 'center-link' }, h('a', { href: '#/new' }, t('enterYourself')))));
  }
  const nearbyBox = h('div', { 'aria-live': 'polite' });

  // Optional: help from Gemini with the user's own key. Only redacted text is sent (never the picture, name or roll number).
  const aiBox = h('div', { 'aria-live': 'polite' });
  async function askAi() {
    const settings = getSettings();
    if (!settings.geminiNoticeSeen) {
      if (!confirm(t('aiNotice'))) return;
      saveSettings({ geminiNoticeSeen: true });
    }
    aiBox.replaceChildren(note(t('searching'), 'info'));
    try {
      const answer = await extractFieldsWithAi(draft.aiText, settings.geminiKey);
      const changed = applyAiFields(r, answer);
      save(); renderAll(); aiBox.replaceChildren(note(`${changed} ${t('aiChanged')}`, changed ? 'ok' : 'info'));
    } catch { aiBox.replaceChildren(note(t('aiFail'), 'warn')); }
  }
  const anyYellow = () => draft.aiText && getSettings().geminiKey && [r.examName, r.centreName, r.address, r.pincode, ...r.days.flatMap((d) => [d.date, d.reportTime])].some((f) => needsCheck(f));

  const renderAll = () => { renderTop(); renderBottom(); aiBox.replaceChildren(...(anyYellow() ? [button(`✨ ${t('aiHelp')}`, askAi, 'ghost')] : [])); };

  async function cont() {
    const plans = finalizeDraft(draft);
    const allowed = await askNotificationPermission();       // this tap is the user's go-ahead
    if (allowed) scheduleReminders(plans, leaveByFor, t('leaveBy'));
    const ics = icsForPlans(plans, leaveByFor, timelineFor);
    clearDraft();
    sessionStorage.setItem('cw_after_plan', JSON.stringify({ reminders: allowed, ics: Boolean(ics) }));
    go(plans.length === 1 ? `#/plan/${plans[0].id}` : '#/');
  }

  root.append(top, aiBox, mapBox, status, bottom);
  renderAll();
  const mapEl = h('div', { id: 'map', class: 'map', role: 'application', 'aria-label': t('sumCentre') });
  mapBox.append(mapEl);
  mapApi = createPlanMap(mapEl, { centre: draft.centre, start: draft.start, route: draft.route, items: draft.nearby || [], sure: draft.centre ? draft.centre.confidence === 'high' : true }, {
    onCentreDrag: async (lat, lng) => {
      draft.centre = { ...draft.centre, lat, lng, confidence: 'high', usedQuery: null };
      save(); await refreshRoute(); renderAll(); drawPin(); await refreshNearby(); renderAll(); drawPin();
    },
    onMapClick: async (lat, lng) => {
      draft.centre = { lat, lng, label: 'Pin placed by you', confidence: 'high', usedQuery: null };
      save(); await refreshRoute(); renderAll(); drawPin(); await refreshNearby(); renderAll(); drawPin();
    },
  });
  renderStatus();
  // the places may still be loading (the flow only waits a few seconds): ask again, it shares the running request
  if (draft.centre && !(draft.nearby || []).length) refreshNearby().then(() => { renderAll(); drawPin(); });
  onLeave(() => mapApi.destroy());
  void refreshChecks;
}
