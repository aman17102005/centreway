// Step 4: leave-by time and reminder.
import { h, field, button, note, stepBar, download } from './dom.js';
import { t } from '../i18n.js';
import { CONFIG } from '../config.js';
import { savePlan } from '../store.js';
import { computeLeaveBy, parseHHMM } from '../logic/leaveby.js';
import { buildIcs } from '../logic/share.js';
import { formatDuration } from '../logic/geo.js';
import { buildTimeline } from '../logic/timeline.js';
import { stopClockTimes } from '../logic/errands.js';

/** Calculate from a plan. Used here and on the plan screen. */
export function leaveByFor(plan) {
  const time = plan.target === 'gate' ? plan.fields.gateTime : plan.fields.reportTime;
  // with stops on the way the trip is the whole morning: travel between the places + the minutes at each stop (plan.errands.result)
  const withStops = plan.errands && plan.errands.result && plan.errands.result.order && plan.errands.result.order.length ? plan.errands.result : null;
  // sleeping near the centre the night before (plan.stay): the trip starts at the stay and has no stops
  const travel = plan.stay ? plan.stay.travelMin : withStops ? withStops.totalMin : (plan.travelMin ?? plan.route?.durationMin);
  const targetMinutes = parseHHMM(time);
  if (targetMinutes === null || travel == null) return null;
  const r = computeLeaveBy({ targetMinutes, travelMin: withStops && !plan.stay ? Math.ceil(travel) : Math.round(travel), bufferMin: plan.buffer, extraMin: plan.extra });
  return r && { ...r, targetText: time, travel: Math.round(travel), stops: withStops && !plan.stay ? withStops.order.length : 0, fromStay: Boolean(plan.stay) };
}

/** The exam-morning timeline of a plan (see src/logic/timeline.js): [] when the leave-by time is not known. */
export function timelineFor(plan) {
  const leave = leaveByFor(plan);
  if (!leave) return [];
  const result = !plan.stay && plan.errands && plan.errands.result && plan.errands.result.order.length ? plan.errands.result : null;
  return buildTimeline({
    fields: plan.fields, leave, stops: result ? stopClockTimes(result, leave) : [], tripMin: leave.travel, getReadyMin: plan.getReadyMin ?? CONFIG.stay.getReadyMin,
    fromStay: plan.stay || null, reminders: plan.timelineReminders || {},
  });
}

let reminderTimer = null;

export function renderStep4(root, plan, go) {
  const out = h('div', { 'aria-live': 'polite' });
  const status = h('div', { 'aria-live': 'polite' });
  const targets = h('div', { class: 'chips' });
  const buffers = h('div', { class: 'chips' });
  const timeF = field(t('reachBy'), { type: 'time' });
  const travelF = field(t('manualTime'), { type: 'number', min: '1', max: '1440' });
  const extraF = field(t('extra'), { type: 'number', min: '0', max: '240', value: String(plan.extra) });
  const dateF = field(t('fExamDate'), { type: 'date', value: plan.fields.examDate });

  const curTime = () => (plan.target === 'gate' ? plan.fields.gateTime : plan.fields.reportTime);
  const initialTravel = plan.travelMin ?? (plan.route?.durationMin != null ? Math.round(plan.route.durationMin) : '');
  travelF.input.value = String(initialTravel);

  function recalc() {
    plan.fields.examDate = dateF.input.value;
    if (plan.target === 'gate') plan.fields.gateTime = timeF.input.value; else plan.fields.reportTime = timeF.input.value;
    plan.travelMin = Number(travelF.input.value) || null;
    plan.extra = Math.max(0, Number(extraF.input.value) || 0);
    savePlan(plan);
    const r = leaveByFor(plan);
    if (!r) { out.replaceChildren(note(t('needTimes'), 'warn')); return; }
    out.replaceChildren(h('div', { class: 'card leave' },
      h('div', { class: 'muted' }, t('leaveBy')),
      h('div', { class: 'huge' }, r.text),
      r.dayOffset < 0 ? h('div', { class: 'warn-text' }, t('dayBefore')) : null,
      h('p', { class: 'muted' }, t('explain', { target: r.targetText, travel: formatDuration(r.travel), buffer: `${plan.buffer} min`, extra: `${plan.extra} min` })),
      note(t('estimateNote'), 'info')));
  }

  const renderChips = () => {
    targets.replaceChildren(...[['report', 'reportTime'], ['gate', 'gateTime']].map(([k, label]) =>
      h('button', { type: 'button', class: `chip ${plan.target === k ? 'on' : ''}`, 'aria-pressed': String(plan.target === k), onclick: () => { plan.target = k; timeF.input.value = curTime(); renderChips(); recalc(); } }, t(label))));
    buffers.replaceChildren(...CONFIG.bufferOptions.map((m) =>
      h('button', { type: 'button', class: `chip ${plan.buffer === m ? 'on' : ''}`, 'aria-pressed': String(plan.buffer === m), onclick: () => { plan.buffer = m; renderChips(); recalc(); } }, `${m} min`)));
  };
  timeF.input.value = curTime();
  renderChips();
  [timeF, travelF, extraF, dateF].forEach((f) => f.input.addEventListener('input', recalc));

  async function remind() {
    const r = leaveByFor(plan);
    if (!r || !plan.fields.examDate) { status.replaceChildren(note(t('reminderNeedDate'), 'warn')); return; }
    if (!('Notification' in window)) { status.replaceChildren(note(t('reminderDenied'), 'warn')); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { status.replaceChildren(note(t('reminderDenied'), 'warn')); return; }
    const [y, mo, d] = plan.fields.examDate.split('-').map(Number);
    const when = new Date(y, mo - 1, d, 0, r.leaveMinutes).getTime() + r.dayOffset * 86400000 - 10 * 60000;
    const delay = when - Date.now();
    clearTimeout(reminderTimer);
    // setTimeout only runs while the app is open, so the UI says reminders are not guaranteed.
    if (delay > 0 && delay < 2 ** 31 - 1) {
      reminderTimer = setTimeout(async () => {
        const reg = await navigator.serviceWorker?.getRegistration();
        const title = `${t('leaveBy')} ${r.text}`;
        if (reg) reg.showNotification(title, { body: plan.fields.centreName || '', icon: 'icons/icon-192.png' });
        else new Notification(title);
      }, delay);
    }
    status.replaceChildren(note(t('reminderOk'), 'info'));
  }

  function ics() {
    const r = leaveByFor(plan);
    if (!r || !plan.fields.examDate) { status.replaceChildren(note(t('reminderNeedDate'), 'warn')); return; }
    let date = plan.fields.examDate;
    if (r.dayOffset < 0) {
      const dt = new Date(`${date}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() + r.dayOffset); date = dt.toISOString().slice(0, 10);
    }
    const file = buildIcs({
      title: `${t('leaveBy')} ${r.text} – ${plan.fields.centreName || t('untitled')}`, date, leaveBy: r.text,
      location: plan.fields.address || plan.fields.centreName, uid: plan.id,
      description: 'Always follow the instructions on your admit card.',
    });
    if (file) download('centreway-leave-time.ics', file, 'text/calendar');
  }

  root.append(
    stepBar(4), h('h2', null, t('s4Title')),
    dateF.wrap,
    h('div', { class: 'field' }, h('label', null, t('reachBy')), targets), timeF.wrap,
    travelF.wrap,
    h('div', { class: 'field' }, h('label', null, t('buffer')), buffers),
    extraF.wrap,
    out,
    h('div', { class: 'row' }, button(`🔔 ${t('remind')}`, remind), button(`📅 ${t('downloadIcs')}`, ics)),
    h('p', { class: 'muted' }, t('reminderNote')),
    status,
    h('div', { class: 'row between' },
      button(t('back'), () => go.back(`#/step/3/${plan.id}`), 'ghost'),
      button(t('finish'), () => { recalc(); go(`#/plan/${plan.id}`); }, 'primary big')),
  );
  recalc();
}
