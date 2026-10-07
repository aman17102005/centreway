// Known layouts of common exam bodies. A template is picked by words on the card. It lists the exact label names
// and where the value sits (right of the label, or below it in a header row). The general table reader and the
// line reader still run, and the best answer for each field is kept.
//   NTA is built from the JEE Main card described by a real candidate. The others are my best knowledge of those cards, not checked against real ones.
import { asciiLower, kmpFirst } from '../dsa/kmp.js';

export const TEMPLATES = [
  {
    id: 'nta', name: 'NTA (JEE Main, NEET, CUET)', detect: ['national testing agency', 'jee (main)', 'joint entrance examination', 'nta '],
    labels: {
      examDate: ['date of examination'], shift: ['shift'], examTime: ['timing of test (indian standard time)', 'timing of test'],
      report: ['reporting time at centre', 'reporting time at the centre'], gate: ['entry gate closing time at centre', 'entry gate closing time'],
      centreName: ['test centre code, name and address', 'test center code, name and address'],
    },
    where: { examDate: 'below', shift: 'below', examTime: 'below', report: 'right', gate: 'right', centreName: 'right' },
  },
  {
    id: 'ssc', name: 'SSC', detect: ['staff selection commission', 'ssc '],
    labels: { examDate: ['date of exam', 'date of examination'], shift: ['shift', 'slot'], examTime: ['time of exam', 'exam time'], report: ['reporting time'], gate: ['gate closing time'], centreName: ['venue of examination', 'venue'] },
    where: { examDate: 'below', shift: 'below', examTime: 'below', report: 'right', gate: 'right', centreName: 'right' },
  },
  {
    id: 'rrb', name: 'RRB / Railways', detect: ['railway recruitment board', 'rrb ', 'indian railways'],
    labels: { examDate: ['date of examination', 'exam date'], shift: ['shift'], examTime: ['exam timing', 'exam time'], report: ['reporting time'], gate: ['gate closing', 'gate closing time'], centreName: ['exam centre name and address', 'exam centre', 'centre name'] },
    where: { examDate: 'right', shift: 'right', examTime: 'right', report: 'right', gate: 'right', centreName: 'right' },
  },
  {
    id: 'ibps', name: 'IBPS', detect: ['institute of banking personnel selection', 'ibps'],
    labels: { examDate: ['exam date', 'date of exam'], examTime: ['time slot', 'exam time'], report: ['reporting time'], gate: ['gate closing time', 'gate closes'], centreName: ['venue name and address', 'venue name'], address: ['venue address'] },
    where: { examDate: 'below', examTime: 'below', report: 'right', gate: 'right', centreName: 'right', address: 'right' },
  },
  {
    id: 'upsc', name: 'UPSC', detect: ['union public service commission', 'upsc'],
    labels: { examDate: ['date and time of examination', 'date of examination'], report: ['reporting time', 'report at'], centreName: ['centre', 'venue'] },
    where: { examDate: 'right', report: 'right', centreName: 'right' },
  },
  {
    id: 'state', name: 'State police / board', detect: ['police', 'public service commission', 'board of', 'पुलिस', 'बोर्ड', 'आयोग'],
    labels: { examDate: ['परीक्षा तिथि', 'परीक्षा की तिथि'], report: ['रिपोर्टिंग समय'], gate: ['प्रवेश बंद', 'गेट बंद'], centreName: ['परीक्षा केंद्र का नाम', 'परीक्षा केन्द्र का नाम'], address: ['परीक्षा केंद्र का पता'] },
    where: { examDate: 'right', report: 'right', gate: 'right', centreName: 'right', address: 'right' },
  },
];

/** Pick the template whose words appear on the card (first match wins), or null. text = all text of the card. */
export function detectTemplate(text) {
  const lower = `${asciiLower(text)} `;
  for (const template of TEMPLATES) if (template.detect.some((w) => kmpFirst(lower, w) >= 0)) return template;
  return null;
}
