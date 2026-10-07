// The exam-morning timeline with a reminder switch for every step.
import { h, field, note } from './dom.js';
import { t } from '../i18n.js';
import { CONFIG } from '../config.js';
import { savePlan, listPlans } from '../store.js';
import { timelineFor } from './step4.js';
import { friendlyTime } from './summary.js';
import { armTimelineReminders, showTimelineNotification } from '../flow/timelineReminders.js';
import { askNotificationPermission } from '../flow/reminders.js';

const LABEL = { wake: () => t('tlWake'), leaveHome: () => t('tlLeaveHome'), reach: () => t('tlReach'), report: () => t('tlReport'), gate: () => t('tlGate'), start: () => t('tlStart') };

/** The text of one step in the current language. */
export function stepLabel(step, plan) {
  if (step.kind === 'leaveStay') return t('tlLeaveStay', { name: (plan.stay && plan.stay.name) || '' });
  if (step.kind === 'stop') return `${step.stop.kind === 'atm' ? t('kindAtm') : step.stop.kind === 'copy' ? t('kindCopy') : t('kindPharmacy')}: ${step.label}`;
  return (LABEL[step.kind] || (() => step.label))();
}

/** ctx: { refresh() }. */
export function renderTimeline(plan, ctx) {
  const steps = timelineFor(plan);
  if (!steps.length) return null;
  plan.timelineReminders = plan.timelineReminders || {};
  const ready = field(t('getReadyLabel'), { type: 'number', min: '0', max: '240', value: String(plan.getReadyMin ?? CONFIG.stay.getReadyMin) });
  ready.input.addEventListener('change', () => { plan.getReadyMin = Math.max(0, Math.min(240, Number(ready.input.value) || 0)); savePlan(plan); ctx.refresh(); });
  const toggle = async (step, on) => {
    plan.timelineReminders[step.id] = on; savePlan(plan);
    if (on) await askNotificationPermission();
    armTimelineReminders(listPlans(), timelineFor, { show: showTimelineNotification });
  };
  return h('section', { class: 'card timeline' },
    h('h3', null, `⏰ ${t('timelineTitle')}`),
    ready.wrap,
    h('ol', { class: 'timeline-list' }, steps.map((s) => h('li', { class: `tl-${s.kind}` },
      h('span', { class: 'tl-time' }, friendlyTime(s.text), s.dayOffset < 0 ? ` (${t('eveningBefore')})` : ''),
      h('span', { class: 'tl-label' }, stepLabel(s, plan)),
      s.stop && s.stop.early ? h('span', { class: 'warn-text' }, ` ⚠ ${t('stopEarly')}`) : null,
      h('label', { class: 'tl-remind' }, h('input', { type: 'checkbox', checked: s.remind, 'aria-label': `${t('remindMe')}: ${stepLabel(s, plan)}`, onchange: (e) => toggle(s, e.target.checked) }), ` ${t('remindMe')}`)))),
    note(t('remindHelp'), 'info'));
}
