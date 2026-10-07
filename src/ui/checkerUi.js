// "Can I bring...?" box on the plan screen. The answer comes from the instructions on the user's own card.
import { h, button, note } from './dom.js';
import { t } from '../i18n.js';
import { suggestItems, lookupItem, checkItem, generalRule } from '../logic/bringChecker.js';

const BODY_NAME = { nta: 'NTA', ssc: 'SSC', rrb: 'RRB', bank: 'bank', upsc: 'UPSC' };

/** The answer as a note, from the card's line. Returns a DOM node. */
export function answerNode(plan, query) {
  const item = lookupItem(query);
  if (!item) return note(t('ansUnknown'), 'warn');
  const lines = plan.instructions || [];
  const r = checkItem(item, lines);
  const rule = generalRule(plan.fields.examName, item.id);
  const general = rule ? h('p', { class: 'muted' }, t('generalRule', { rule: rule.rule, body: rule.body ? BODY_NAME[rule.body] : '' }).replace(' in  exams', ' in most exams')) : null;
  const head = h('strong', null, item.label);
  if (r.status === 'not_allowed') return h('div', null, head, note(t('ansNot', { line: r.evidence }), 'error'), general);
  if (r.status === 'must_bring') return h('div', null, head, note(t('ansMust', { line: r.evidence }), 'ok'), general);
  if (r.status === 'allowed') return h('div', null, head, note(t('ansAllowed', { line: r.evidence }), 'ok'), general);
  // not mentioned on the card: NEVER "allowed"
  return h('div', null, head, note(t('ansNone'), 'warn'), lines.length ? null : note(t('noInstructions'), 'info'), general);
}

export function renderChecker(plan) {
  const input = h('input', { type: 'text', id: 'bringBox', placeholder: t('checkerPlaceholder'), autocomplete: 'off', 'aria-label': t('checkerTitle') });
  const suggestions = h('div', { class: 'chips' });
  const answer = h('div', { 'aria-live': 'polite' });
  const ask = (q) => { answer.replaceChildren(answerNode(plan, q)); suggestions.replaceChildren(); };
  input.addEventListener('input', () => {
    suggestions.replaceChildren(...suggestItems(input.value, 5).map((s) => h('button', { type: 'button', class: 'chip', onclick: () => { input.value = s.word; ask(s.word); } }, s.word)));
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim()) ask(input.value); } });
  return h('section', { class: 'card checker' },
    h('h3', null, `❓ ${t('checkerTitle')}`),
    h('div', { class: 'row grow' }, h('div', { class: 'field' }, input), button(t('checkerCheck'), () => { if (input.value.trim()) ask(input.value); })),
    suggestions, answer);
}
