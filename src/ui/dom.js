// Tiny helpers to build the page safely. Text is always added as text (never as HTML),
// so anything from OCR or the network cannot inject code.
import { CONFIG } from '../config.js';
import { t } from '../i18n.js';

/** h('div', { class: 'x', onclick: fn }, 'text', childNode) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Drop empty items (null, false) so they are not drawn as the text "null": use with replaceChildren / append. */
export const present = (...items) => items.flat().filter((x) => x != null && x !== false);

/** Labelled input. Returns { wrap, input }. */
export function field(label, attrs = {}, tag = 'input') {
  const id = `f${Math.random().toString(36).slice(2, 8)}`;
  const input = h(tag, { id, ...attrs });
  return { wrap: h('div', { class: 'field' }, h('label', { for: id }, label), input), input };
}

export function button(text, onclick, cls = '') {
  return h('button', { type: 'button', class: `btn ${cls}`.trim(), onclick }, text);
}

/** A message box. kind: 'info' | 'warn' | 'error' | 'ok' */
export function note(text, kind = 'info') {
  return h('p', { class: `note ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text);
}

export function offlineBanner() {
  return navigator.onLine === false ? note(t('offline'), 'warn') : document.createDocumentFragment();
}

/** Leaflet map with OSM tiles and the required credit. */
export function createMap(container, { lat, lng, zoom } = CONFIG.defaultView) {
  const map = window.L.map(container, { zoomControl: true }).setView([lat, lng], zoom);
  window.L.tileLayer(CONFIG.tiles.url, { maxZoom: CONFIG.tiles.maxZoom, attribution: CONFIG.tiles.attribution }).addTo(map);
  return map;
}

export function emojiIcon(emoji, cls = '') {
  return window.L.divIcon({ className: `emoji-pin ${cls}`.trim(), html: emoji, iconSize: [30, 30], iconAnchor: [15, 15] });
}

export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function stepBar(n) {
  const names = ['s1', 's2', 's3', 's4'];
  return h('nav', { class: 'steps', 'aria-label': `${t('step')} ${n} ${t('of')} 4` },
    names.map((k, i) => h('span', { class: `dot ${i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''}`, 'aria-current': i + 1 === n ? 'step' : false }, `${i + 1}. ${t(k)}`)));
}
