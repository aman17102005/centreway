// Plan screen: one summary with leave-by, route, nearby places, checklist and sharing.
import { h, field, button, note, offlineBanner } from './dom.js';
import { createPlanMap } from './mapView.js';
import { renderNearbyList } from './nearbyList.js';
import { t } from '../i18n.js';
import { savePlan } from '../store.js';
import { leaveByFor, timelineFor } from './step4.js';
import { fetchNearby } from '../services/overpass.js';
import { CATEGORIES } from '../services/categories.js';
import { storeNearby } from '../flow/nearbyJob.js';
import { googleNearby, placesEnabled, googleRemembered } from '../services/googlePlaces.js';
import { GOOGLE_KINDS } from '../logic/googleView.js';
import { areaOf } from '../logic/placeLinks.js';
import { CONFIG } from '../config.js';
import { formatDistance, formatDuration } from '../logic/geo.js';
import { buildShareUrl, buildShareText } from '../logic/share.js';
import { icsForPlans } from '../flow/reminders.js';
import { listPlans } from '../store.js';
import { friendlyTime, friendlyDate } from './summary.js';
import { download, present } from './dom.js';
import { Stack } from '../dsa/stack.js';
import { renderErrands, stopsForPlan } from './errandsUi.js';
import { renderStay } from './stayUi.js';
import { renderTimeline } from './timelineUi.js';
import { renderChecker } from './checkerUi.js';

export function renderPlan(root, plan, go, onLeave) {
  const lb = leaveByFor(plan);
  const centreName = plan.fields.centreName || plan.fields.address.slice(0, 70) || t('untitled');
  const mapEl = h('div', { id: 'map', class: 'map' });
  const nearbyBox = h('div', { 'aria-live': 'polite' });
  let mapApi = null; let items = (plan.nearby && plan.nearby.items) || []; let filter = 'all'; let failed = (plan.nearby && plan.nearby.failedTypes) || []; let pending = []; let googleState = placesEnabled() ? (googleRemembered(`plan:${plan.id}`) ? { status: 'done', places: googleRemembered(`plan:${plan.id}`).places } : { status: 'idle', places: [] }) : null;

  // ---- nearby places ----
  function drawNearby() {
    renderNearbyList(nearbyBox, items, filter, (type) => { filter = type; mapApi?.filter(type); drawNearby(); }, { failed, pending, onRetry: loadNearby, centre: plan.centre && { ...plan.centre, name: plan.fields.centreName, city: plan.fields.city, address: plan.fields.address, pincode: plan.fields.pincode, area: areaOf(plan.fields.address, { name: plan.fields.centreName, city: plan.fields.city }), sure: plan.fields.centreNameSure === true }, google: { enabled: placesEnabled(), state: googleState, onAsk: askGoogle } });
    mapApi?.update({ items });
  }
  /** The "Find more places with Google Maps" button: one search through the Worker (at most 4 Google calls), remembered for this plan while the app is open. */
  async function askGoogle() {
    if (!plan.centre) return;
    googleState = { status: 'loading', places: [] }; drawNearby();
    try {
      const out = await googleNearby(plan.centre, GOOGLE_KINDS, { cacheKey: `plan:${plan.id}` });
      googleState = out.limitReached || out.off ? { status: out.off ? 'unavailable' : 'limit', places: [] } : { status: 'done', places: out.places };
    } catch { googleState = { status: 'unavailable', places: [] }; }
    drawNearby();
  }
  async function loadNearby() {
    pending = CATEGORIES.map((c) => c.id);
    if (!items.length) drawNearby();            // the Google Maps buttons are there from the start; each type says "loading" until it arrives
    try {
      const out = await fetchNearby({ ...plan.centre, city: plan.fields.city, pincode: plan.fields.pincode }, {
        onPartial: (p) => { items = p.items; failed = p.failedTypes; pending = p.pendingTypes; drawNearby(); storeNearby(plan.id, p); },    // each type appears as soon as it arrives
      });
      items = out.items; failed = out.failedTypes || []; pending = []; storeNearby(plan.id, { ...out, final: true }); drawNearby();
    } catch (e) {
      pending = [];
      if (!items.length) nearbyBox.replaceChildren(note(e.code === 'offline' ? t('offline') : t('nearbyFail'), 'warn'), button(t('tapRetry'), loadNearby));
      else drawNearby();
    }
  }

  const centreInfo = () => plan.centre && { ...plan.centre, name: plan.fields.centreName, city: plan.fields.city, address: plan.fields.address, pincode: plan.fields.pincode, area: areaOf(plan.fields.address, { name: plan.fields.centreName, city: plan.fields.city }), sure: plan.fields.centreNameSure === true };
  const sectionCtx = { items: () => items, nearbyLoading: () => pending.length > 0, centreInfo, refresh: () => go(`#/plan/${plan.id}`, true) };

  // ---- checklist ----
  const listEl = h('ul', { class: 'checks' });
  // My stack keeps every checklist change, newest on top, so Undo can reverse them one by one.
  const undoStack = new Stack();
  const undoBtn = button(`↶ ${t('undo')}`, () => undo(), 'ghost');
  undoBtn.disabled = true;
  const record = (change) => { try { undoStack.push(change); undoBtn.disabled = false; } catch { /* undo is optional */ } };
  function undo() {
    const change = undoStack.pop();
    if (!change) return;
    if (change.type === 'toggle') change.item.done = change.before;
    else if (change.type === 'add') plan.checklist = plan.checklist.filter((x) => x !== change.item);
    else if (change.type === 'delete') plan.checklist.splice(Math.min(change.index, plan.checklist.length), 0, change.item);
    undoBtn.disabled = undoStack.isEmpty();
    savePlan(plan); drawChecklist();
  }
  const drawChecklist = () => listEl.replaceChildren(...plan.checklist.map((c) => {
    const id = `c_${c.id}`;
    return h('li', null,
      h('input', { type: 'checkbox', id, checked: c.done, onchange: (e) => { record({ type: 'toggle', item: c, before: c.done }); c.done = e.target.checked; savePlan(plan); } }),
      h('label', { for: id }, c.text, c.fromCard ? h('span', { class: 'muted' }, ` (${t('yourCardSays')})`) : null),
      c.custom ? h('button', { type: 'button', class: 'btn ghost small', 'aria-label': `${t('delete')} ${c.text}`, onclick: () => { record({ type: 'delete', item: c, index: plan.checklist.indexOf(c) }); plan.checklist = plan.checklist.filter((x) => x !== c); savePlan(plan); drawChecklist(); } }, '✕') : null);
  }));
  drawChecklist();
  const addF = field(t('addItem'), { autocomplete: 'off' });
  const addItem = () => {
    const v = addF.input.value.trim();
    if (!v) return;
    const item = { id: `u${Date.now()}`, text: v.slice(0, 120), done: false, custom: true };
    plan.checklist.push(item);
    record({ type: 'add', item });
    addF.input.value = '';
    savePlan(plan); drawChecklist();
  };
  addF.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });

  // ---- after the summary screen: reminders and the calendar file
  function afterNote() {
    let info = null;
    try { info = JSON.parse(sessionStorage.getItem('cw_after_plan') || 'null'); } catch { /* ignore */ }
    if (!info) return null;
    const same = listPlans().filter((p) => p.fields.centreName === plan.fields.centreName && p.fields.examName === plan.fields.examName);
    return h('div', null, info.reminders ? note(t('remindersSet'), 'ok') : null,
      info.ics ? button(`📅 ${t('addCalendar')}`, () => { const f = icsForPlans(same, leaveByFor, timelineFor); if (f) download('centreway-leave-times.ics', f, 'text/calendar'); }) : null);
  }

  // ---- share ----
  const shareMsg = h('div', { 'aria-live': 'polite' });
  async function share() {
    const data = {
      name: [plan.fields.centreName, plan.fields.address].filter(Boolean).join(', ').slice(0, 120),
      lat: plan.centre.lat, lng: plan.centre.lng, leaveBy: lb?.text || '', date: plan.fields.examDate,
      timeline: timelineFor(plan).map((x) => ({ time: x.text, label: x.label })),
    };
    const url = buildShareUrl(location.href, data);
    const text = buildShareText(url, data);
    try {
      if (navigator.share) { await navigator.share({ title: 'CentreWay', text }); return; }
      await navigator.clipboard.writeText(text);
      shareMsg.replaceChildren(note(t('copied'), 'ok'));
    } catch { shareMsg.replaceChildren(h('textarea', { rows: '5', readonly: true }, text)); }
  }

  root.append(...present(
    h('h2', null, t('planTitle')), offlineBanner(),
    plan.fields.examName ? h('p', null, h('strong', null, plan.fields.examName)) : null,
    afterNote(),
    h('section', { class: 'card leave' },
      h('div', { class: 'muted' }, t('leaveBy')),
      h('div', { class: 'huge' }, lb ? lb.text : '--:--'),
      lb && lb.dayOffset < 0 ? h('div', { class: 'warn-text' }, t('dayBefore')) : null,
      h('p', { class: 'muted' }, [plan.fields.examDate && friendlyDate(plan.fields.examDate), lb && `${t(plan.target === 'gate' ? 'gateTime' : 'reportTime')} ${friendlyTime(lb.targetText)}`, plan.fields.startTime && `${t('fExamStart')} ${friendlyTime(plan.fields.startTime)}`, plan.fields.shift && `${t('fShift')} ${plan.fields.shift}`].filter(Boolean).join(' · ')),
      lb && lb.stops > 0 ? h('p', { class: 'muted' }, t('includesStops', { n: lb.stops })) : null,
      lb && lb.fromStay && plan.stay ? h('p', { class: 'muted' }, t('fromStayNote', { name: plan.stay.name || '' })) : null,
      !lb ? note(t('needTimes'), 'warn') : null),
    renderStay(plan, sectionCtx),
    renderErrands(plan, sectionCtx),
    renderTimeline(plan, sectionCtx),
    h('section', null,
      h('h3', null, t('centre')), h('p', null, h('strong', null, centreName), plan.fields.address && plan.fields.centreName ? h('br') : null, plan.fields.centreName ? plan.fields.address : ''),
      plan.route ? h('p', null, `${t('route')}: ${formatDistance(plan.route.distanceKm)}${plan.route.straightLine ? '' : ` · ${formatDuration(plan.travelMin ?? plan.route.durationMin)}`}`, plan.route.offline ? ` (${t('offlineRoute')})` : '') : null,
      note(t('estimateNote'), 'info'), mapEl,
      h('div', { class: 'row' }, button(t('editSteps'), () => go(`#/step/1/${plan.id}`)), button(`↗ ${t('share')}`, share, 'primary')),
      h('p', { class: 'muted' }, t('shareWarn')), shareMsg),
    h('section', null, h('h3', null, t('nearby')), nearbyBox),
    renderChecker(plan),
    h('section', null, h('h3', null, t('checklist')), listEl,
      h('div', { class: 'row grow' }, addF.wrap, button(t('add'), addItem), undoBtn),
      plan.notAllowed?.length ? note(`${t('sumNot')}: ${plan.notAllowed.join(', ')}`, 'warn') : null,
      note(t('checklistNote'), 'warn')),
    h('div', { class: 'row' }, button(t('home'), () => go('#/'), 'ghost')),
  ));

  // the map always shows the centre pin, the start pin, the route and the nearby places, and opens fitted to the centre and the route
  mapApi = createPlanMap(mapEl, { centre: plan.centre, start: plan.start, route: plan.route, items, stops: stopsForPlan(plan) });
  if (plan.centre) {
    // places saved with the plan show at once (also offline); an incomplete list is completed in the background, no extra tap needed
    const saved = plan.nearby && plan.nearby.status === 'done' && items.length;
    if (items.length) drawNearby();
    if (!saved) loadNearby();
  }
  onLeave(() => mapApi.destroy());
}
