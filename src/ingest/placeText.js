// Small helpers that read places out of text: the state named in an address, the centre-code letters of a state.
import { asciiLower } from '../dsa/kmp.js';
import { STATES, STATE_CODES } from './geoLists.js';

const ASCII_STATES = STATES.filter((st) => st.length > 2 && st !== 'india' && st.charCodeAt(0) < 128).sort((a, b) => b.length - a.length);

/** The state named in a text (longest match from the general list), or ''. */
export function stateFromText(text) {
  const lower = asciiLower(String(text || ''));
  return ASCII_STATES.find((st) => new RegExp(`(^|[^a-z])${st}([^a-z]|$)`).test(lower)) || '';
}

/** The two-letter code of the state named in a text ("UP", "BR" ...), or ''. */
export function stateCodeFromText(text) { return STATE_CODES[stateFromText(text)] || ''; }
