// Progress screen: shows what the app is doing while it reads the card and plans the trip.
import { h, button, note } from './dom.js';
import { t } from '../i18n.js';
import { takePendingFile } from '../flow/session.js';
import { runScan } from '../flow/runner.js';

const STEPS = [['reading', 'stepRead'], ['centre', 'stepCentre'], ['location', 'stepLocation'], ['route', 'stepRoute'], ['nearby', 'stepNearby']];

export function renderScan(root, go) {
  const file = takePendingFile();
  if (!file) { go('#/'); return; }
  const progress = h('progress', { max: '1', value: '0' });
  const detail = h('p', { class: 'muted', 'aria-live': 'polite' });
  const list = h('ol', { class: 'steps-list' }, STEPS.map(([key, label]) => h('li', { 'data-step': key, class: 'pending' }, t(label))));
  const message = h('div', { 'aria-live': 'polite' });
  const mark = (active) => {
    let reached = false;
    for (const li of list.children) {
      if (li.dataset.step === active) { li.className = 'active'; reached = true; }
      else li.className = reached ? 'pending' : 'done';
    }
  };

  root.append(h('h2', null, t('scanTitle')), list, progress, detail, message);
  mark('reading');

  runScan(file, {
    onStage: mark,
    onProgress: (fraction, status) => {
      progress.value = Math.max(0, Math.min(1, fraction || 0));
      detail.textContent = /loading|download/i.test(status || '') ? t('scanDownloading') : '';
    },
  }).then(() => go('#/auto')).catch((e) => {
    progress.hidden = true;
    const key = { type: 'scanFailType', big: 'scanFailBig', 'nothing-found': 'scanFailNothing' }[e.code] || 'scanFailOther';
    const picker = h('input', { type: 'file', accept: 'image/*,application/pdf', hidden: true, onchange: (ev) => { const f = ev.target.files[0]; if (f) { import('../flow/session.js').then((m) => { m.setPendingFile(f); go('#/scan', true); }); } } });
    message.replaceChildren(h('h3', null, t('scanFailTitle')), note(t(key), 'error'),
      h('div', { class: 'row' }, button(t('tryAnother'), () => picker.click(), 'primary big'), button(t('enterYourself'), () => go('#/new'), 'ghost')), picker);
  });
}
