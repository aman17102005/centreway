// All external services and limits live here. Change them in one place.
// Always check each service's current usage policy before changing limits.

export const CONFIG = {
  appName: 'CentreWay',

  // Time limit for every network call (milliseconds).
  timeoutMs: 10000,
  overpassTimeoutMs: 15000, // Overpass can be slower on busy servers.

  // Nominatim (OpenStreetMap search). Policy: max 1 request/second,
  // no autocomplete, cache results, no bulk use.
  // https://operations.osmfoundation.org/policies/nominatim/
  nominatim: {
    url: 'https://nominatim.openstreetmap.org/search',
    minGapMs: 1100,
    countryCodes: 'in',
    limit: 5,
  },

  // Photon (komoot): free search on OpenStreetMap data, no key. Used to find places that the Overpass server could not give.
  photon: { url: 'https://photon.komoot.io/api/', limit: 20, concurrency: 3 },

  // Optional Google Places through your own Cloudflare Worker (OFF by default; see worker/README.md). The key is never in the app.
  places: { enabled: false, workerUrl: '' },

  // Public OSRM servers (no key). The OpenStreetMap Germany servers have one
  // server per mode. The main demo server only does car, so it is the car backup.
  // https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
  osrm: {
    car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
    bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
    foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
    carBackup: 'https://router.project-osrm.org/route/v1/driving',
  },

  // Stops on the way (errand planner). Defaults can be changed by the user on the plan screen.
  errands: {
    dwellMin: { copy: 10, atm: 5, pharmacy: 5 },   // minutes spent at a photocopy shop, an ATM, a chemist
    candidatesPerKind: 5,                          // the best 5 shops of each kind (least detour) are compared
    earlyShopMinutes: 480,                         // a stop before 08:00 gets the "shops may be closed" warning
    estimateSpeedKmh: 30,                          // when the travel times cannot be fetched: straight distance x 1.35 / 30 km/h
    estimateDetour: 1.35,
  },

  // "Stay the night before?" advice: shown when the leave-by time is before 04:30 or the trip is longer than 3 hours.
  stay: { leaveBeforeMinutes: 270, travelOverMinutes: 180, getReadyMin: 60 },

  // OpenRouteService (optional, user's own free key).
  // https://openrouteservice.org/dev/#/signup
  ors: {
    url: 'https://api.openrouteservice.org/v2/directions',
    profiles: { car: 'driving-car', bike: 'cycling-regular', foot: 'foot-walking' },
  },

  // Overpass API (nearby places). One small query, cached.
  // https://wiki.openstreetmap.org/wiki/Overpass_API
  overpass: {
    url: 'https://overpass-api.de/api/interpreter',
    // Free public servers: when one is busy (504 / 429 / slow) the next one is tried. Keep them in index.html's connect-src too.
    mirrors: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'],
    radiusM: 1000,
    maxItems: 600,
    radii: [1000, 2000, 5000],   // start small, widen a type on its own when it has fewer than minPerType places
    stayRadiusM: 5000,           // lodges are often near the station or bus stand, so look further
    minPerType: 3,
    perTypeShown: 5,
    townRadiusM: 25000,          // places found by the search sources can be anywhere in the town; their distance from the centre is shown
    dedupeMetres: 50,            // the same name within 50 m is the same place
    cacheDays: 7,
    requestMs: 6000,             // one Overpass question may take this long before the next mirror is tried
    totalBudgetMs: 15000,        // nearby places: everything together must be done in 15 seconds (what is missing gets a retry / maps button)
    optionalBudgetMs: 12000,     // optional extras (institutions, named places, stations)
  },

  // Gemini (optional, user's own free key from Google AI Studio).
  // https://aistudio.google.com/apikey
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  },

  // Map tiles. OSM tiles are for light use only. For heavy use, switch to a
  // free tile provider. https://operations.osmfoundation.org/policies/tiles/
  tiles: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },

  // OCR. Photos are shrunk to this size first. Language data (English, Hindi) is
  // downloaded once from the jsDelivr CDN by Tesseract.js, then cached by the browser.
  ocr: {
    maxImageSide: 1600,
  },

  // Map starts here (centre of India) when nothing is known.
  defaultView: { lat: 22.5, lng: 79, zoom: 4 },

  // Offline route (my own A* on a road graph made from OpenStreetMap data, ODbL).
  // The area must match tools/buildGraph.js: [south, west, north, east].
  offline: {
    area: [30.60, 76.55, 30.82, 76.95],
    graphUrl: 'data/graph.json',
    placesUrl: 'data/places.json',
    timeoutMs: 20000,
  },

  bufferOptions: [15, 30, 60, 90],
  defaultBuffer: 60,
};
