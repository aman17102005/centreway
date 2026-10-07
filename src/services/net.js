// One safe way to call the network: time limit, offline check, clear error codes.
import { CONFIG } from '../config.js';

export class NetError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code; // 'offline' | 'timeout' | 'rate' | 'http' | 'network' | 'auth'
  }
}

export async function fetchJson(url, { timeout = CONFIG.timeoutMs, ...opts } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new NetError('offline');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    // Browsers send their own User-Agent; outside a browser (tests, scripts) we identify the app politely.
    if (typeof window === 'undefined') opts = { ...opts, headers: { 'User-Agent': 'CentreWay/1.0 (free exam-day planner; student project)', ...(opts.headers || {}) } };
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    if (res.status === 429) throw new NetError('rate');
    if (res.status === 401 || res.status === 403) throw new NetError('auth', `HTTP ${res.status}`);
    if (!res.ok) throw new NetError('http', `HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e instanceof NetError) throw e;
    if (e.name === 'AbortError') throw new NetError('timeout');
    throw new NetError('network', e.message);
  } finally {
    clearTimeout(timer);
  }
}
