// Connects my LRU cache to the phone's storage (the app's existing localStorage helpers),
// so cached answers survive a reload. If anything fails, it quietly behaves as "no cache".
import { LRUCache } from '../dsa/lruCache.js';
import { cacheGet, cacheSet } from '../store.js';

/**
 * name: storage name, capacity: max entries, ttlMs: how long an answer stays valid.
 * Returns { get(key), put(key, value) }. get returns null when nothing valid is cached.
 */
export function persistentLru(name, capacity, ttlMs) {
  let cache = null;
  try {
    cache = new LRUCache(capacity);
    const saved = cacheGet(`lru_${name}`, Infinity);
    if (Array.isArray(saved)) cache.load(saved);
  } catch { /* cache is optional: carry on without it */ }

  return {
    get(key) {
      try {
        const entry = cache && cache.get(key);
        if (!entry || Date.now() - entry.savedAt > ttlMs) return null;
        return entry.value;
      } catch { return null; }
    },
    put(key, value) {
      try {
        if (!cache) return;
        cache.put(key, { savedAt: Date.now(), value });
        cacheSet(`lru_${name}`, cache.entries());
      } catch { /* ignore storage problems */ }
    },
  };
}
