// "Do you need to stop anywhere on the way?" on the plan screen: tick photocopy shop / ATM / chemist, see the best order and the time at each stop.
import { h, button, note, present } from './dom.js';
import { t } from '../i18n.js';
import { CONFIG } from '../config.js';
import { savePlan } from '../store.js';
import { getMatrix } from '../services/routing.js';
import { planMorningErrands, stopClockTimes, ERRAND_KINDS } from '../logic/errands.js';
import { googleNearUrl, LINK_WORDS } from '../logic/placeLinks.js';
import { leaveByFor } from './step4.js';
import { friendlyTime } from './summary.js';
import { formatHHMM } from '../dsa/leaveBy.js';

const KIND_KEY = { copy: 'kindCopy', atm: 'kindAtm', pharmacy: 'kindPharmacy' };
const kindName = (k) => t(KIND_KEY[k]);

/** The stops of the plan with their clock times, ready for the screen and the map. [] without stops. */
export function stopsForPlan(plan) {
  const result = plan.errands && plan.errands.result;
  const leave = leaveByFor(plan);
  if (!result || !result.order.length || !leave || plan.stay) return [];
  return stopClockTimes(result, leave);
}

/**
 * ctx: { items() -> the nearby places, nearbyLoading() -> bool, centreInfo() -> the link info of the centre, refresh() -> redraw the whole plan }.
 */
export function renderErrands(plan, ctx) {
  const e = plan.errands || (plan.errands = { enabled: false, kinds: [], dwell: { ...CONFIG.errands.dwellMin }, result: null });
  e.dwell = { ...CONFIG.errands.dwellMin, ...(e.dwell || {}) };
  const box = h('div', { 'aria-live': 'polite' });

  const save = () => savePlan(plan);
  const setEnabled = (on) => { e.enabled = on; if (!on) { e.result = null; } save(); ctx.refresh(); };

  async function plan_() {
    box.replaceChildren(note(t('searching'), 'info'));
    if (!plan.start) { box.replaceChildren(note(t('errandsNeedStart'), 'warn')); return; }
    if (ctx.nearbyLoading() && !ctx.items().length) { box.replaceChildren(note(t('errandsNeedNearby'), 'info')); return; }
    e.result = await planMorningErrands({ start: plan.start, centre: plan.centre, items: ctx.items(), kinds: e.kinds, dwell: e.dwell, mode: plan.mode, deps: { getMatrix } });
    save(); ctx.refresh();
  }

  const kindBox = (k) => {
    const on = e.kinds.includes(k);
    const minutes = h('input', { type: 'number', min: '0', max: '120', value: String(e.dwell[k]), 'aria-label': `${kindName(k)}: ${t('minutesThere')}`, class: 'mini-number',
      onchange: (ev) => { e.dwell[k] = Math.max(0, Math.min(120, Number(ev.target.value) || 0)); save(); } });
    return h('div', { class: 'errand-kind' },
      h('label', null, h('input', { type: 'checkbox', checked: on, onchange: (ev) => { e.kinds = ev.target.checked ? ERRAND_KINDS.filter((x) => e.kinds.includes(x) || x === k) : e.kinds.filter((x) => x !== k); save(); } }), ` ${kindName(k)}`),
      h('span', { class: 'muted' }, ' · '), minutes, h('span', { class: 'muted' }, ` ${t('minutesThere')}`));
  };

  const result = e.enabled ? e.result : null;
  const stops = stopsForPlan(plan);
  const centre = ctx.centreInfo();
  const resultBox = () => {
    if (!result) return null;
    const leave = leaveByFor(plan);
    const route = [t('errandsHome'), ...result.order.map((s) => kindName(s.kind)), t('errandsCentre')].join(' → ');
    return h('div', { class: 'errand-result' },
      result.order.length ? h('div', null, h('h4', null, t('errandsOrderTitle')), h('p', { class: 'big-text' }, route)) : null,
      result.order.length ? h('ol', { class: 'cards' }, stops.map((s) => h('li', { class: 'card' },
        h('strong', null, `${kindName(s.kind)}: ${s.name || t('unnamed')}`),
        h('div', { class: 'muted' }, `${t('atTime')} ${friendlyTime(formatHHMM(s.arriveClock))} · ${Math.round(s.dwellMin)} ${t('minutesThere')}`),
        s.early ? note(t('stopEarly'), 'warn') : null))) : null,
      result.order.length && leave ? note(`${t('leaveBy')}: ${friendlyTime(leave.text)} (${t('includesStops', { n: result.order.length })})`, 'ok') : null,
      result.order.length ? note(result.estimated ? t('errandsEstimates') : t('errandsOsrm'), result.estimated ? 'warn' : 'info') : null,
      ...result.missing.map((k) => h('div', null, note(t('noShopFound', { kind: kindName(k).toLowerCase() }), 'warn'),
        centre ? h('a', { href: googleNearUrl(centre, LINK_WORDS[k][0]), target: '_blank', rel: 'noopener noreferrer', class: 'btn big' }, `🔎 ${t('noShopButton')}`) : null)));
  };

  box.replaceChildren(...present(resultBox()));
  return h('section', { class: 'card errands' },
    h('h3', null, t('errandsTitle')),
    h('p', null, t('errandsQuestion')),
    h('div', { class: 'row', role: 'radiogroup', 'aria-label': t('errandsQuestion') },
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'errands', checked: !e.enabled, onchange: () => setEnabled(false) }), ` ${t('errandsNo')}`),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'errands', checked: e.enabled, onchange: () => setEnabled(true) }), ` ${t('errandsYes')}`)),
    e.enabled ? h('div', null, h('p', { class: 'muted' }, t('errandsPick')), ...ERRAND_KINDS.map(kindBox), h('div', { class: 'row' }, button(t('planStops'), plan_, 'primary'))) : null,
    box);
}
