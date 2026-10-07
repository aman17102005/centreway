// Offline route fallback: my own A* on the bundled road graph (Chandigarh–Mohali–Panchkula–Kharar).
// Used only when OSRM fails, times out, or the phone is offline, and both points are inside the data area.
// Runs in a Web Worker; if a worker cannot start, it runs on the main thread. Any failure -> null,
// and the app falls back to its old behaviour (straight-line distance).
import { CONFIG } from '../config.js';

let worker = null;
let nextId = 1;

export function insideOfflineArea(point) {
  const [south, west, north, east] = CONFIG.offline.area;
  return point.lat >= south && point.lat <= north && point.lng >= west && point.lng <= east;
}

function askWorker(payload) {
  return new Promise((resolve, reject) => {
    if (!worker) worker = new Worker(new URL('../workers/routeWorker.js', import.meta.url), { type: 'module' });
    const id = nextId++;
    const timer = setTimeout(() => { cleanup(); reject(new Error('offline route timeout')); }, CONFIG.offline.timeoutMs);
    const onMessage = (e) => {
      if (e.data.id !== id) return;
      cleanup();
      if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.result);
    };
    const onError = () => { cleanup(); worker = null; reject(new Error('worker failed')); };
    function cleanup() { clearTimeout(timer); worker?.removeEventListener('message', onMessage); worker?.removeEventListener('error', onError); }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ id, ...payload });
  });
}

async function runOnMainThread(payload) {
  const { OfflineRouter } = await import('../dsa/offlineRouter.js');
  const data = await (await fetch(payload.graphUrl)).json();
  return new OfflineRouter(data).route(payload.from, payload.to, payload.mode, payload.algorithm);
}

/** Returns { distanceKm, durationMin, geometry, source, offline: true } or null. */
export async function offlineRoute(from, to, mode) {
  try {
    if (!insideOfflineArea(from) || !insideOfflineArea(to)) return null;
    const payload = { graphUrl: CONFIG.offline.graphUrl, from, to, mode, algorithm: 'astar' };
    let result;
    try { result = await askWorker(payload); } catch { result = await runOnMainThread(payload); }
    if (!result) return null;
    return { distanceKm: result.distanceKm, durationMin: result.durationMin, geometry: result.geometry, source: 'Offline route (estimate)', offline: true };
  } catch {
    return null;
  }
}

/** Download the road graph quietly (so the service worker saves it) when the centre is inside the area. */
export function warmOfflineData(point) {
  try {
    if (navigator.onLine === false || !insideOfflineArea(point)) return;
    const go = () => fetch(CONFIG.offline.graphUrl).catch(() => {});
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 8000 }); else setTimeout(go, 3000);
  } catch { /* optional */ }
}
