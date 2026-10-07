import { h, button, note } from './dom.js';
import { setPendingFile } from '../flow/session.js';
import { requestLocation, forgetLocation } from '../flow/location.js';
import { t } from '../i18n.js';
import { listPlans, deletePlan, deletePlans, isStorageAlmostFull } from '../store.js';
import { mergeSort } from '../dsa/mergeSort.js';

/** Soonest exam first; plans without a date go last. Equal dates keep their order (merge sort is stable). */
export function sortPlans(plans) {
  const key = (p) => `${p.fields.examDate || '9999-99-99'} ${p.fields.reportTime || p.fields.gateTime || '99:99'}`;
  try { return mergeSort(plans, (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)); } catch { return plans; }
}

/** Today as YYYY-MM-DD in the phone's own time. */
export function todayIso(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }

/** { upcoming, past }: a plan is past when its exam date is before today (a plan without a date is never past). Upcoming: soonest first; past: most recent first. */
export function splitPlans(plans, today = todayIso()) {
  const isPast = (p) => Boolean(p.fields && p.fields.examDate) && p.fields.examDate < today;
  return { upcoming: sortPlans(plans.filter((p) => !isPast(p))), past: sortPlans(plans.filter(isPast)).reverse() };
}

export function renderHome(root, go) {
  const { upcoming: plans, past } = splitPlans(listPlans());
  const planCard = (p) => h('li', { class: 'card' },
    h('div', null,
      h('strong', null, p.fields.centreName || p.fields.address.slice(0, 60) || t('untitled')),
      h('div', { class: 'muted' }, [p.fields.examDate, p.fields.reportTime].filter(Boolean).join(' · ')),
    ),
    h('div', { class: 'row' },
      button(t('open'), () => go(`#/plan/${p.id}`)),
      button(t('delete'), () => { if (confirm(t('confirmDelete'))) { deletePlan(p.id); go('#/'); } }, 'ghost'),
    ),
  );
  root.append(
    h('section', { class: 'hero' },
      h('h1', null, t('appName')),
      h('p', null, t('tagline')),
      // One tap starts everything: the label opens the file chooser, and (in the same tap) the location question is shown.
      h('label', { class: 'btn primary big upload', for: 'admitFile', onclick: () => { forgetLocation(); requestLocation(); } }, `📄 ${t('uploadBtn')}`),
      h('input', { id: 'admitFile', type: 'file', accept: 'image/*,application/pdf,.pdf', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (f) { setPendingFile(f); go('#/scan'); } } }),
      h('p', { class: 'muted' }, t('uploadHelp')),
    ),
    isStorageAlmostFull() ? note(t('storageAlmostFull'), 'warn') : null,
    h('section', null,
      h('h2', null, t('savedPlans')),
      plans.length ? h('ul', { class: 'cards' }, plans.map(planCard)) : h('p', { class: 'muted' }, t('noPlans')),
    ),
    // exams that are over are kept apart; nothing is deleted unless the user taps the button
    past.length ? h('section', { class: 'past-exams' },
      h('h2', null, t('pastExams')),
      h('ul', { class: 'cards' }, past.map(planCard)),
      button(t('deleteAllPast'), () => { if (confirm(t('confirmDeleteAllPast'))) { deletePlans(past.map((p) => p.id)); go('#/'); } }, 'ghost danger'),
    ) : null,
    h('p', { class: 'center-link' }, h('a', { href: '#/new' }, t('enterYourself'))),
  );
}
