// "Stay the night before?" advice: shown for every plan when the trip is very early or very long (limits in config.js).
import { h, button, note } from './dom.js';
import { t } from '../i18n.js';
import { savePlan } from '../store.js';
import { stayAdvice, stayTravelMin } from '../logic/stayAdvice.js';
import { googleNearUrl, googleCentreUrl, distanceText } from '../logic/placeLinks.js';
import { leaveByFor } from './step4.js';
import { friendlyTime } from './summary.js';
import { formatDuration } from '../logic/geo.js';
import { parseHHMM } from '../dsa/leaveBy.js';

/** ctx: { items(), centreInfo(), refresh() }. Returns the section, or null when no advice is needed and no stay was chosen. */
export function renderStay(plan, ctx) {
  const centre = ctx.centreInfo();
  if (plan.stay) {
    return h('section', { class: 'card stay' }, h('h3', null, t('stayTitle')), note(t('stayChosen', { name: plan.stay.name || '' }), 'ok'),
      button(t('stayBack'), () => { plan.stay = null; savePlan(plan); ctx.refresh(); }, 'ghost'));
  }
  const fromHome = leaveByFor(plan);
  if (!fromHome) return null;
  const targetMinutes = parseHHMM(plan.target === 'gate' ? plan.fields.gateTime : plan.fields.reportTime);
  const stays = ctx.items().filter((i) => i.category === 'lodging');
  const advice = stayAdvice({ leave: fromHome, travelMin: fromHome.travel, stays, target: targetMinutes === null ? null : { targetMinutes, bufferMin: plan.buffer, extraMin: plan.extra } });
  if (!advice.advise) return null;
  const message = advice.reasons.includes('early') ? t('stayLongLeave', { time: friendlyTime(fromHome.text) }) : t('stayLongOnly', { dur: formatDuration(fromHome.travel) });
  return h('section', { class: 'card stay' },
    h('h3', null, `🛏️ ${t('stayTitle')}`),
    note(message, 'warn'),
    advice.stayLeave ? note(t('stayIfNear', { time: friendlyTime(advice.stayLeave.text), min: String(advice.stayLeave.travelMin) }), 'ok') : null,
    advice.stays.length ? h('div', null, h('h4', null, t('stayClosest')), h('ul', { class: 'cards' }, advice.stays.map((s) => h('li', { class: 'card near-item' },
      h('div', null, h('strong', null, s.name || t('unnamed')), h('div', { class: 'muted' }, distanceText(s.distanceKm))),
      h('div', { class: 'near-links' }, button(t('stayPlanFrom'), () => { plan.stay = { name: s.name || t('unnamed'), lat: s.lat, lng: s.lng, distanceKm: s.distanceKm, travelMin: stayTravelMin(s.distanceKm) }; savePlan(plan); ctx.refresh(); }, 'small')))))) : null,
    advice.fewStays ? note(t('stayFew'), 'info') : null,
    centre ? h('div', { class: 'kind-buttons' },
      h('a', { href: googleNearUrl(centre, 'hotels'), target: '_blank', rel: 'noopener noreferrer', class: `btn ${advice.fewStays ? 'big primary' : ''}`.trim() }, `🔎 ${t('stayHotelsGoogle')}`),
      h('a', { href: googleCentreUrl(centre), target: '_blank', rel: 'noopener noreferrer', class: 'btn ghost' }, `📍 ${t('showCentre')}`)) : null,
    h('p', { class: 'muted' }, t('stayEvening')));
}
