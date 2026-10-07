# CentreWay

A free Progressive Web App (installs on a phone like an app) that helps exam candidates in India reach their exam centre on time.

**The only thing you do is upload your admit card** (a camera photo, a gallery photo, a screenshot or a PDF). The app reads it on your phone and works out everything else by itself: exam name, dates, reporting and gate-closing times, the centre and its address, the centre on the map, your route from your current location, the **Leave by** time (one per exam day), places near the centre, a checklist and reminders. One summary screen shows it all; yellow boxes are the fields the app is not sure about, and you only tap one if it is wrong.

- Free only. No paid service. No API key in the code (Google Maps is used only through plain links the user taps; the optional Google Places Worker is off by default). No backend, no database, no accounts, no tracking.
- Your admit card photo (or PDF) never leaves your phone. The candidate's name, roll number, photo and signature are ignored and never kept.
- Plain HTML, CSS and JavaScript (ES modules). No build step. Works in English and Hindi.

## How it works (the automatic flow)
1. **Upload** (Home screen, one big button). The same tap asks for location permission once.
2. **Read the card** on the phone ([`src/ingest/`](src/ingest/)):
   - a PDF with real text is read directly with pdf.js (exact, no OCR); a PDF that is only a picture is drawn and read like a photo;
   - a photo is cleaned in the browser (rotate upright, straighten tilt, crop to the page, even out shadows, grey, contrast, black-and-white, enlarge), then read with Tesseract.js (English + Hindi) in a Web Worker; several cleaned versions are tried and the best result is kept;
   - labels ("Reporting Time", "Venue", "परीक्षा केंद्र" ...) are found with KMP, and the value is taken from the right of the label or below it, using the word positions; timetables give one plan per exam day;
   - a QR code, if any, is read with jsQR; OCR mistakes are fixed with edit distance only when the match is very close; fields are cross-checked (pincode vs map, reporting before start, date in the future).
3. **Find the centre** on the map: full address first, then shorter searches; candidates are ranked by pincode, city, centre name and distance; if still weak, nearby schools and colleges with a matching name are tried.
4. **Route + leave-by + nearby places + checklist + reminders**, then one summary screen with "Looks right, continue".
5. If reading fails completely there is a "Try another photo" button and a small "Enter details yourself" link (the old manual steps still work).

## New: morning planner, stay advice, timeline, "Can I bring this?"
- **Stops on the way:** on the plan screen choose "Yes, add stops" and tick photocopy shop, ATM and/or chemist (minutes at each can be changed). The app picks one shop of each kind and the order with the least total time (bitmask DP), shows Home -> ATM -> Photocopy -> Centre with the time at each stop (also numbered on the map), and the leave-by includes the stops. No shop of a kind nearby: a message and a Google Maps search button. Stops before 8:00 AM show a "shops may be closed" warning.
- **Stay the night before?** Shown when you would leave before 4:30 AM or travel over 3 hours (limits in `src/config.js`): leave-by if you stay near the centre, the closest stays, and a Google Maps hotel search.
- **Exam-morning timeline:** wake up, leave, each stop, reach, reporting time, gate closes, exam starts, worked backwards. "Time to get ready" is changeable; each step has a reminder switch. The timeline is in the share link and the calendar file.
- **Can I bring...?** Type an item; the answer comes from your own card's instructions ("Not allowed / Must bring / Allowed (your card says: ...)"). If the card does not mention it the app never says "allowed". Must-bring items found on the card are added to the day-before checklist.

## Project documents
- [`TESTING.md`](TESTING.md): step-by-step check list for laptop and Android with a Result column.
- [`VIVA.md`](VIVA.md): 2-minute summary, every DSA part with file and function, 25 viva questions, 5-minute demo script, honest limits.
- [`DSA.md`](DSA.md): the DSA report (tables, complexity, benchmarks). [`RESUME.md`](RESUME.md): where the work stands. [`PRIVACY.md`](PRIVACY.md), [`LICENSES.md`](LICENSES.md).
- Every card in `tests/` and `tools/` is FAKE (names like DEMOSHARMA, random numbers). No real person's data is in the project.

## Run on your laptop
You need Node.js 20 or newer.
```bash
npm install     # only needed for tests tooling and updating vendor files
npm start       # opens at http://localhost:8080
npm test        # runs all tests (old + DSA tests)
npm run bench   # speed comparisons, writes bench/results.md
npm run graph   # (once) downloads OpenStreetMap roads and builds data/graph.json + data/places.json
npm run accuracy              # all 28 sample cards through the whole flow, real servers (cached after the first run); writes tests/ocr-accuracy.md
npm run stamp                  # give the app a new version number after any change (npm start does it too)
npm run debug-card -- card.jpeg  # print how the reader sees one admit card (terminal only)
npm run accuracy -- --fresh   # ask the real Nominatim / OSRM / Overpass servers again
node tools/makeFixtures.js    # (only to change the samples) regenerates tests/fixtures/
node tools/makeHoldout.js --seed 4242 --count 40 --out tests/holdout/hidden-4242   # NEW random fake cards (any exam body, 57 towns, 9 layouts, photo damage) + answer key
node tests/holdout-run.js tests/holdout/hidden-4242 --summary --centre              # score: totals only per field / body / layout / quality / town size, then the real centre search
node tools/buildNearby.js     # (once) downloads the nearby places of the Chandigarh area into data/nearby-tricity.json

```
Reading photos needs the Tesseract English + Hindi language files. The browser downloads them once from the jsDelivr CDN (and the app pre-loads them when first opened online); the Node accuracy run downloads them once into `tests/.tess-cache`.
DSA viva demo page: start the app, then open http://localhost:8080/dsa.html (not linked from the app menu).
The app itself needs no install: any static web server works. `vendor/` contains Leaflet, Tesseract.js, pdf.js and jsQR, copied from `node_modules` by `npm run vendor` (no CDN for code).

## Deploy free
**GitHub Pages** (gives an https address that works on phones; https is needed for location, install and notifications)
1. Make an account at https://github.com. Click **New repository**. Name it `centreway`, choose **Public** (free Pages needs public on a free account), do NOT add a README, then **Create repository**.
2. In the terminal, in this folder (the first commit already exists, see `git log`):
   ```bash
   git remote add origin https://github.com/YOUR-USER-NAME/centreway.git
   git branch -M main
   git push -u origin main
   ```
   (GitHub asks you to sign in. Use a personal access token as the password, or install GitHub Desktop / `gh auth login`.)
3. In the repository: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
4. Open the **Actions** tab. The workflow "Deploy to GitHub Pages" (`.github/workflows/pages.yml`) runs on every push to `main`. When it is green (1 to 3 minutes) the address is `https://YOUR-USER-NAME.github.io/centreway/` (also shown in the workflow run).
5. On the phone: open that address in Chrome, wait for it to load once, then menu > **Install app**. Open `/dsa.html` on the same address for the viva demo page.
6. To update later: change files, run `npm run stamp`, `git add -A`, `git commit -m "message"`, `git push`. The phone gets the new version after two reloads (the footer shows the version).
Notes: the Pages workflow runs `npm test` but the deploy does not wait for the slow card-reading tests to pass (they may need downloads that GitHub's servers can block); run `npm test` on your laptop before every push. Never put a key or a real admit card in the repository (`.gitignore` leaves out `node_modules/`, `tools/.cache/`, keys and card files).

**Cloudflare Pages**
1. Push to GitHub, then Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Build command: *(leave empty)*. Build output directory: `/` (root).
3. Save and deploy. Free plan is enough.

## Optional free keys (Settings screen)
- **OpenRouteService** (backup routing): sign up at https://openrouteservice.org/dev/#/signup → Request a token.
- **Gemini** (suggest values for fields the reader is unsure about): https://aistudio.google.com/apikey → create a key. Only text is sent, never the image, and the lines with the candidate's name, roll number, birth date and ids are removed first. A button appears on the summary screen only if you added a key, and a notice is shown before the first use.
Keys stay in your browser only. The app works fully without any key.

## DSA project (final project mode)
All hand-written data structures and algorithms live in `src/dsa/` and are used by the real app. The full report (complexity tables, tests, benchmarks, honest limits) is in **[DSA.md](DSA.md)**. Benchmarks: [bench/results.md](bench/results.md). Demo page for the viva: `dsa.html`.

## Free services and their rules
| Service | Used for | Limits / policy |
|---|---|---|
| [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) | Map pictures | Light use only; credit shown on every map. For heavy use switch to a free tile provider (edit `src/config.js`). |
| [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | Address search | Max 1 request/second, no search-as-you-type, results cached, no bulk use. |
| [OSRM](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) via routing.openstreetmap.de, backup router.project-osrm.org | Routes | Fair use, no key. The demo servers can be slow. |
| [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances) | Nearby places | One small query, cached 7 days. |
| [Photon (komoot)](https://photon.komoot.io/) | Nearby places: free search on OpenStreetMap data, near the centre and in the whole town | Fair use, no key, a few small requests per plan, cached 7 days. |
| Google Maps links | The "See all places on Google Maps" buttons | Plain links, free, no key, no API. |
| [Google Places API (New)](https://developers.google.com/maps/billing-and-pricing/pricing) | OPTIONAL nearby list, OFF by default, through your own Cloudflare Worker (`worker/README.md`) | Paid after Google's free amount: Nearby Search Pro was USD 32 per 1,000 calls after 5,000 free per month (standard list) or USD 9.60 per 1,000 after 35,000 free per month (India list) when I read it on 2026-10-07. **Check Google's pricing page before switching it on.** The Worker has a hard daily limit (default 1,000 calls). |
| [OpenRouteService](https://openrouteservice.org/terms-of-service/) | Optional routes | Free daily quota with your own key. |
| [Gemini API](https://ai.google.dev/gemini-api/docs/pricing) | Optional text clean-up | Free tier limits with your own key. |
| jsDelivr CDN | OCR language data (English, Hindi, orientation), one-time | Cached by the browser. |

All URLs and limits are in [`src/config.js`](src/config.js). Please double-check each policy before large-scale use.

## Folder map
```
index.html  styles.css  sw.js  manifest.webmanifest
src/config.js          every URL and limit
src/i18n.js            all text (English, Hindi)
src/store.js           saved data (localStorage)
src/dsa/               hand-written data structures and algorithms (hash map, LRU, queue, heap, graph, A*, trie, ...)
src/workers/           Web Worker for the offline route
src/ingest/            reads the admit card: pixels, preprocess, OCR engine, PDF text, QR, layout, labels, fields, timetable, instructions, validation
src/flow/              the automatic flow: centre finder, route, draft, reminders, runner, location
src/logic/             pure logic: field extraction, search fallback, share/ics, geo, nearby places, place names
data/                  graph.json (road graph) and places.json (names for suggestions), made by tools/buildGraph.js
tools/buildGraph.js    one-time download from Overpass and graph builder
bench/run.js           speed comparisons
dsa.html               viva demo page
src/services/          network: nominatim, routing, overpass, gemini, ocr
src/ui/                screens
tests/                 node --test (fixtures/ = 20 sample admit cards + answer key; ocr-accuracy.md = accuracy report)
vendor/                Leaflet, Tesseract.js (local copies)
```

## Nearby places: where they come from
1. **Overpass** (OpenStreetMap, exact tags) and, inside the Chandigarh area, the bundled places.
2. **Photon** and **Nominatim** (also OpenStreetMap data) searched with English, Hindi and local words (restaurant, dhaba, bhojanalaya, mishthan bhandar, sweets, hotel, lodge, dharamshala, guest house, medical store, chemist, clinic, nursing home, hospital, photocopy, xerox ...), near the centre and around the town centre. Places anywhere in the town are shown with their distance from the centre. The same name within 50 m is one place.
3. **"See all places on Google Maps"**: big buttons at the top for every type. They open Google Maps searching near the CENTRE (`https://www.google.com/maps/search/<word>/@<lat>,<lng>,15z`); on a phone a small button opens the phone's own map app (`geo:<lat>,<lng>?q=<word>`). I could not test the geo: link on a real phone from here: please try it once.
4. **Optional "Find more places with Google Maps" button** (only when you added your Worker address in Settings): one tap asks Google Places once, shows the count per kind and every place inside the app, marked "from Google Maps", remembered for the plan while the app is open. See `worker/README.md`.
The app never says "no places" when the server failed: a failed type shows "Couldn't load nearby places right now" with a retry button; "OpenStreetMap lists none of these near here" appears only when the server answered with nothing, and then tells you the map may be incomplete and offers the Google Maps button. OpenStreetMap is thin in small towns, and if the pin is only the pincode area (yellow) the places are searched around that area: drag the pin to the right spot to improve the list.

## Testing with your own cards (any exam, any city)
1. `npm run debug-card -- /path/to/your_card.jpeg` prints what the reader sees: the OCR text, the table cells, which label went with which value, and the final fields. Nothing is saved.
2. Open the app (`npm start`), upload the same card, and compare the summary with the card. Yellow = the app is not sure. A field that is wrong but NOT yellow is a bug: please tell me which card and which field.
3. `node tests/holdout-run.js tests/holdout/<set> --summary` shows how the reader does on fake cards it has never seen (the hidden set is made with a fresh seed; its numbers are the real score).

## Known limits
- OCR makes mistakes. Anything the app is not sure about is yellow, but a wrong value that looks confident can still slip through (for example one wrong letter in an exam name). Always compare the summary with your admit card.
- Hard photos (very blurry, very dark, folded, strong glare, perspective) are read much worse than flat, well-lit ones. Hindi is read less accurately than English.
- Hindi text inside PDFs is often stored in scrambled order, so those PDFs are read by photo reading instead.
- The accuracy numbers in `tests/ocr-accuracy.md` and the hold-out report come from made-up cards I generated, not from real admit cards; real accuracy will be lower. The hold-out generator was written after the reader, with random layouts, wordings and photo damage, so its score is more honest than the first sample set, but it is still not the real world.
- Nearby places: Overpass often fails. Each type then shows "Couldn't load nearby places right now" with a retry button and a "Search in my maps app" button (opens your phone's map app, or OpenStreetMap on a laptop). Inside the Chandigarh–Mohali–Panchkula–Kharar area the places are bundled and load instantly.
- The first scan on a phone downloads about 8 MB of language data and can take a minute on slow internet; a low-end phone needs roughly 10 to 40 seconds per card.
- The centre pin can be wrong when the address is vague or not in OpenStreetMap; low-confidence pins are shown in yellow with "Please check the pin".
- If the location permission is refused the app asks where you start from (type a place, with local suggestions).
- Small towns can have thin map and nearby-place data in OpenStreetMap.
- Free public servers can be slow, busy or rate-limited.
- Web reminders can fail (phone sleeping, app closed). Download the calendar file as backup.
- Motorbike routes use the car road network. Estimates ignore live traffic.
- Offline routes (own A* router) are only estimates and only work inside the Chandigarh–Mohali–Panchkula–Kharar area.
- Things to double-check: the OSM Germany routing servers' current policy, and the Gemini model name in `src/config.js` (models change over time).

## Final checklist
| Feature | Status |
|---|---|
| Upload a photo, screenshot or PDF and nothing else (no typing when the card is read correctly) | Done |
| PDF: real text read directly (pdf.js, in `vendor/`); image-only PDF drawn and read like a photo | Done |
| QR code read when present (jsQR, in `vendor/`) | Done |
| Photo clean-up in the browser: orientation, tilt, crop, shadows, grey, contrast, black-and-white, enlarge; several tries, best kept | Done |
| English + Hindi OCR in a Web Worker; language files pre-loaded on first online open | Done |
| Layout-aware labels (right of / below the label) with KMP and the field scanner; timetables give one plan per day | Done |
| Confidence per field (high / medium / low), cross-checks, yellow boxes with notes | Done |
| Automatic spelling fixes only for very close matches; other mistakes get a "Did you mean" chip | Done |
| Optional Gemini help (own key, redacted text only, button + notice) | Done |
| Centre found by itself: shorter searches, ranking, nearby schools/colleges, yellow "check the pin" | Done |
| Location asked once; refused -> start point from local suggestions | Done |
| Route, leave-by per exam day, nearby places, checklist, reminders + calendar file | Done |
| One summary screen with "Looks right, continue"; "Try another photo" and "Enter details yourself" | Done |
| All data structures and algorithms (see DSA.md) | Done |
| Tests | see DSA.md and `npm test` |
| Accuracy on 20 sample cards, real servers | see `tests/ocr-accuracy.md` |

Verified in a browser at phone width with no typing: text PDF, multi-day PDF, Hindi PDF, image-only PDF, tilted photo, bilingual photo, screenshot. Not verified: a real phone camera, a real Android install, notifications (blocked in the test browser), and the first-run language download on a slow connection.

## Ideas for version 2
1. Download map tiles of the centre area for offline use.
2. Public transport hints (bus/metro stops near the centre from OSM).
3. Reminder the evening before using the checklist.
4. A community-added "gate and landmark" note per centre (opt-in, no accounts, via a shared file).
5. Voice read-out of the leave-by time and route summary, in Hindi.
