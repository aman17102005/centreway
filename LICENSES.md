# Credits and licences

- **Map data and tiles:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Tile policy: https://operations.osmfoundation.org/policies/tiles/
- **Photon** (komoot) search on OpenStreetMap data, **Nominatim** search, **Overpass API**: OpenStreetMap-based services. Policies linked in README.
- **OSRM** routing (BSD-2-Clause); public servers run by OpenStreetMap Germany (routing.openstreetmap.de) and Project OSRM.
- **Leaflet** 1.9 — BSD-2-Clause, © Volodymyr Agafonkin and contributors. Files in `vendor/leaflet/`.
- **Tesseract.js** 7 and **tesseract.js-core** — Apache-2.0. Files in `vendor/tesseract/`. Language data (`@tesseract.js-data`, Apache-2.0) is loaded from jsDelivr.
- **OpenRouteService** (optional, user's own key) — heigit.org, data © OpenStreetMap contributors.
- **Google Gemini API** (optional, user's own key) — Google terms apply.

CentreWay's own code is MIT licensed. CentreWay is not an official app of any exam body.

## Offline road graph and place names (DSA project)
`data/graph.json` (road graph) and `data/places.json` (place names for suggestions) are derived from OpenStreetMap data
for the Chandigarh–Mohali–Panchkula–Kharar area: © OpenStreetMap contributors, licensed under the Open Database Licence (ODbL),
https://www.openstreetmap.org/copyright. They were downloaded once from the Overpass API by `tools/buildGraph.js`.
The offline route label in the app and the demo page `dsa.html` show this credit.

## Admit card reading (automatic flow)
- **pdf.js** (`pdfjs-dist`, legacy build in `vendor/pdfjs/`) — Apache-2.0, © Mozilla and contributors.
- **jsQR** (`vendor/jsqr/`) — Apache-2.0, © Cosmo Wolfe.
- **Tesseract.js** and **tesseract.js-core** — Apache-2.0 (see above); language data from `@tesseract.js-data` (English, Hindi, orientation detection), Apache-2.0.

Only used to make the test samples (`npm run` dev tools, not shipped in the app): `@napi-rs/canvas` (MIT), `pdf-lib` and `@pdf-lib/fontkit` (MIT), `qrcode` (MIT), `regenerator-runtime` (MIT), and the Noto Sans and Noto Sans Devanagari fonts via `@fontsource` (SIL Open Font License 1.1). The sample admit cards use fake names and roll numbers; the centres are real public institutions.
