// The user's location, asked once. The place never leaves the phone: it is only used to draw the route.
let pending = null;

/** Start asking now (call it from a tap, so the browser can show its permission question). Safe to call many times. */
export function requestLocation() {
  if (pending) return pending;
  pending = new Promise((resolve) => {
    if (!navigator.geolocation) { resolve({ ok: false, reason: 'unavailable' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => resolve({ ok: false, reason: err.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
  return pending;
}

/** The answer (waits at most `ms`). Never throws. */
export async function currentLocation(ms = 12000) {
  const answer = await Promise.race([requestLocation(), new Promise((r) => setTimeout(() => r({ ok: false, reason: 'timeout' }), ms))]);
  return answer;
}

export function forgetLocation() { pending = null; }
