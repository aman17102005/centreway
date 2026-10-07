// Step 1: admit card photo or text, then editable fields.
import { h, field, button, note, stepBar } from './dom.js';
import { t } from '../i18n.js';
import { savePlan, getSettings, saveSettings } from '../store.js';
import { extractFieldsBest } from '../logic/extract.js';
import { loadPlaceIndex, findCorrections } from '../logic/places.js';
import { readImage } from '../services/ocr.js';
import { cleanUpText } from '../services/gemini.js';

export function renderStep1(root, plan, go) {
  const f = plan.fields;
  const status = h('div', { 'aria-live': 'polite' });
  const progress = h('progress', { max: '1', value: '0', hidden: true });
  const settings = getSettings();

  const text = field(t('textLabel'), { rows: '6', autocomplete: 'off', spellcheck: 'false' }, 'textarea');
  const fields = {
    centreName: field(t('fCentreName'), { value: f.centreName }),
    address: field(t('fAddress'), { rows: '3' }, 'textarea'),
    pincode: field(t('fPincode'), { value: f.pincode, inputmode: 'numeric', maxlength: '6' }),
    city: field(t('fCity'), { value: f.city }),
    examDate: field(t('fExamDate'), { type: 'date', value: f.examDate }),
    reportTime: field(t('fReportTime'), { type: 'time', value: f.reportTime }),
    gateTime: field(t('fGateTime'), { type: 'time', value: f.gateTime }),
  };
  fields.address.input.value = f.address;

  const fillFields = (found) => {
    for (const [k, v] of Object.entries(found)) if (v) fields[k].input.value = v;
  };
  // "Did you mean ...?" hints from edit distance. Nothing changes until the user taps a hint.
  const hintBox = h('div', { 'aria-live': 'polite' });
  async function showHints() {
    try {
      const index = await loadPlaceIndex();
      const chips = [];
      for (const key of ['address', 'centreName', 'city']) {
        const input = fields[key].input;
        for (const hint of findCorrections(index, input.value)) {
          chips.push(h('button', { type: 'button', class: 'chip', onclick: () => { input.value = input.value.split(hint.from).join(hint.to); showHints(); } },
            `${t('didYouMean')} ${hint.to}? (${hint.from})`));
        }
      }
      hintBox.replaceChildren(h('div', { class: 'chips' }, chips));
    } catch { hintBox.replaceChildren(); } // hints are optional
  }
  const showStatus = (msg, kind) => status.replaceChildren(msg ? note(msg, kind) : '');

  const runExtract = () => {
    fillFields(extractFieldsBest(text.input.value));
    showStatus(t('detailsHelp'), 'info');
    showHints();
  };

  const langSel = h('select', { id: 'ocrlang' },
    h('option', { value: 'eng', selected: settings.lang !== 'hi' }, t('ocrEn')),
    h('option', { value: 'eng+hin', selected: settings.lang === 'hi' }, t('ocrEnHi')));

  async function onPhoto(file) {
    if (!file) return;
    progress.hidden = false;
    progress.value = 0;
    showStatus(t('ocrReading'), 'info');
    try {
      const out = await readImage(file, langSel.value, ({ status: s, progress: p }) => {
        progress.value = p || 0;
        if (/loading (language|tesseract)/i.test(s)) showStatus(t('ocrDownloading'), 'info');
        else if (/recogniz/i.test(s)) showStatus(t('ocrReading'), 'info');
      });
      progress.hidden = true;
      if (!out.trim()) { showStatus(t('ocrNothing'), 'warn'); return; }
      text.input.value = out.trim();
      runExtract();
    } catch {
      progress.hidden = true;
      showStatus(navigator.onLine === false && !window.Tesseract ? t('offline') : t('ocrFail'), 'error');
    }
  }

  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => onPhoto(e.target.files[0]) });
  const pick = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => onPhoto(e.target.files[0]) });

  // Optional AI cleanup, only when the user added their own key.
  const aiBox = h('div');
  const aiBtn = settings.geminiKey ? button(t('aiBtn'), async () => {
    const s = getSettings();
    if (!s.geminiNoticeSeen) {
      if (!confirm(t('aiNotice'))) return;
      saveSettings({ geminiNoticeSeen: true });
    }
    if (!text.input.value.trim()) return;
    aiBox.replaceChildren(note(t('searching'), 'info'));
    try {
      const out = await cleanUpText(text.input.value, s.geminiKey);
      const area = h('textarea', { rows: '6', readonly: true }, out);
      aiBox.replaceChildren(h('div', { class: 'card' }, h('strong', null, t('aiSuggestion')), area,
        h('div', { class: 'row' },
          button(t('aiUse'), () => { text.input.value = out; aiBox.replaceChildren(); runExtract(); }, 'primary'),
          button(t('aiIgnore'), () => aiBox.replaceChildren(), 'ghost'))));
    } catch { aiBox.replaceChildren(note(t('aiFail'), 'warn')); }
  }) : null;

  const next = () => {
    const v = Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, x.input.value.trim()]));
    if (!v.centreName && !v.address && !v.pincode) { showStatus(t('needAddress'), 'error'); return; }
    const changed = v.address !== f.address || v.pincode !== f.pincode || v.centreName !== f.centreName;
    plan.fields = v;
    if (changed) { plan.centre = null; plan.route = null; }
    savePlan(plan);
    go(`#/step/2/${plan.id}`);
  };

  root.append(
    stepBar(1),
    h('h2', null, t('s1Title')),
    h('p', null, t('s1Help')),
    h('div', { class: 'row' }, button(`📷 ${t('takePhoto')}`, () => cam.click(), 'primary'), button(`🖼️ ${t('choosePhoto')}`, () => pick.click())),
    cam, pick,
    h('div', { class: 'field' }, h('label', { for: 'ocrlang' }, t('ocrLang')), langSel),
    progress, status,
    text.wrap,
    h('div', { class: 'row' }, button(t('findDetails'), runExtract), aiBtn),
    aiBox,
    h('h3', null, t('detailsHelp')),
    ...Object.values(fields).map((x) => x.wrap),
    hintBox,
    h('div', { class: 'row end' }, button(t('next'), next, 'primary big')),
  );
}
