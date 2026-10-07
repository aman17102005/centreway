// Starts the app: reads the address bar (#/...), shows the right screen.
import { h } from './ui/dom.js';
import { Stack } from './dsa/stack.js';
import { t } from './i18n.js';
import { APP_VERSION } from './version.js';
import { getSettings, getPlan, newPlan, savePlan, onSaveFailed } from './store.js';
import { renderHome } from './ui/home.js';
import { renderStep1 } from './ui/step1.js';
import { renderStep2 } from './ui/step2.js';
import { renderStep3 } from './ui/step3.js';
import { renderStep4 } from './ui/step4.js';
import { renderPlan } from './ui/plan.js';
import { renderSettings, renderAbout, renderShared } from './ui/settings.js';
import { renderScan } from './ui/scan.js';
import { renderSummary } from './ui/summary.js';
import { warmOcr } from './ingest/browserEnv.js';
import { listPlans } from './store.js';
import { leaveByFor, timelineFor } from './ui/step4.js';
import { armTimelineReminders, showTimelineNotification } from './flow/timelineReminders.js';
import { scheduleReminders } from './flow/reminders.js';
import { resumeNearbyJobs } from './flow/nearbyJob.js';

const root = document.getElementById('app');
let cleanups = [];

// My stack remembers the screens the user has visited, so Back returns to the
// screen they really came from. If anything goes wrong, Back uses the fixed fallback screen.
const visited = new Stack();

function go(hash, force) {
  if (location.hash === hash && force) render();
  else location.hash = hash;
}

/** Back button: pop the current screen, go to the one before it (or to the fallback). */
go.back = (fallbackHash) => {
  try {
    visited.pop(); // the screen we are leaving
    const previous = visited.pop(); // render() will push it again
    if (previous && previous !== location.hash) { location.hash = previous; return; }
  } catch { /* use fallback below */ }
  location.hash = fallbackHash;
};

function rememberScreen() {
  try { if (visited.peek() !== location.hash) visited.push(location.hash || '#/'); } catch { /* history is optional */ }
}

function header() {
  return h('header', { class: 'top' },
    h('a', { href: '#/', class: 'brand' }, '📍 CentreWay'),
    h('nav', null, h('a', { href: '#/settings' }, t('settings')), h('a', { href: '#/about' }, t('about'))));
}

function render() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  const lang = getSettings().lang;
  document.documentElement.lang = lang;
  root.replaceChildren(header());
  const main = h('main', { id: 'main' });
  root.append(main, h('footer', null, `${t('osmCredit')} · ${t('estimateNote')}`, h('div', { class: 'version', id: 'app-version' }, `${t('version')} ${APP_VERSION}`)));
  const onLeave = (fn) => cleanups.push(fn);

  rememberScreen();
  const [path, query = ''] = location.hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'new') {
    const plan = newPlan();
    savePlan(plan);
    location.replace(`#/step/1/${plan.id}`);
    return;
  }
  if (parts[0] === 'step' || parts[0] === 'plan') {
    const id = parts[0] === 'step' ? parts[2] : parts[1];
    const plan = getPlan(id);
    if (!plan) { location.replace('#/'); return; }
    const screens = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4 };
    if (parts[0] === 'plan') renderPlan(main, plan, go, onLeave);
    else (screens[parts[1]] || renderStep1)(main, plan, go, onLeave);
  } else if (parts[0] === 'scan') renderScan(main, go);
  else if (parts[0] === 'auto') renderSummary(main, go, onLeave);
  else if (parts[0] === 'settings') renderSettings(main, go);
  else if (parts[0] === 'about') renderAbout(main, go);
  else if (parts[0] === 'shared') renderShared(main, query, go, onLeave);
  else renderHome(main, go);
  window.scrollTo(0, 0);
  main.focus?.();
}

// A plan that could not be saved (the phone's storage for this app is full) is never silent: a clear message with a button to the plans list.
onSaveFailed(() => {
  if (document.getElementById('save-failed')) return;
  const bar = h('div', { id: 'save-failed', class: 'notice error save-failed', role: 'alert' },
    h('p', null, t('saveFailed')),
    h('button', { type: 'button', class: 'btn primary', onclick: () => { bar.remove(); location.hash = '#/'; render(); } }, t('openPlansList')));
  document.body.prepend(bar);
});

window.addEventListener('hashchange', render);
render();

// Quietly download the English + Hindi reading files when the phone is idle and online, so the first scan is not slow.
// Also bring back reminders that were set earlier and are still ahead.
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 4000));
idle(() => { warmOcr(); scheduleReminders(listPlans(), leaveByFor, t('leaveBy')); resumeNearbyJobs(); try { armTimelineReminders(listPlans(), timelineFor, { show: showTimelineNotification }); } catch { /* reminders are optional */ } }, { timeout: 15000 });

// Always run the newest version: the service worker updates itself, and the page reloads once when a new worker takes over.
if ('serviceWorker' in navigator) {
  const hadWorker = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker && !reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    check();
  }).catch(() => {});
}
// Without a service worker (private window, old browser) compare the running version with the one on the server and reload once.
fetch('version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((v) => {
  if (!v || v.version === APP_VERSION) return;
  try { if (sessionStorage.getItem('cw-reloaded') === v.version) return; sessionStorage.setItem('cw-reloaded', v.version); } catch { /* storage blocked */ }
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) location.reload();
}).catch(() => {});
