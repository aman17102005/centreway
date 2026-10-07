// Web Worker: runs the offline A* router away from the screen, so the page never freezes.
// The road graph (data/graph.json) is loaded here, only when the first request arrives.
import { OfflineRouter } from '../dsa/offlineRouter.js';

let routerPromise = null;

function getRouter(graphUrl) {
  if (!routerPromise) {
    routerPromise = fetch(graphUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error('graph not found')))).then((data) => new OfflineRouter(data));
  }
  return routerPromise;
}

self.onmessage = async (event) => {
  const { id, graphUrl, from, to, mode, algorithm } = event.data;
  try {
    const router = await getRouter(graphUrl);
    self.postMessage({ id, result: router.route(from, to, mode, algorithm) });
  } catch (error) {
    routerPromise = null; // allow a retry later
    self.postMessage({ id, error: String(error && error.message || error) });
  }
};
