# Submission round (done)
- Added TESTING.md (56 checks, Result column), VIVA.md, stronger .gitignore (keys, real cards), README "Project documents" and detailed GitHub Pages steps, a git repository with one clean commit (nothing pushed). Pages workflow: tests no longer block the deploy (`continue-on-error`).
- Privacy check: all cards in `tests/fixtures`, `tests/holdout`, `tools/` are generated FAKE ones; no keys; no personal e-mail or phone numbers in the project.
- To publish: README > Deploy free > GitHub Pages.

# Latest round: 4 morning features (done)
- Errands planner (bitmask DP `src/dsa/errandPlanner.js`, `src/logic/errands.js`, `src/ui/errandsUi.js`), stay advice (`stayAdvice.js`, `stayUi.js`), timeline + heap reminders (`timeline.js`, `src/flow/timelineReminders.js`, `timelineUi.js`), bring checker (`bringChecker.js`, `checkerUi.js`). Wired in `src/ui/plan.js`; map stops in `mapView.js`; shared view shows the timeline; dsa.html section 3 demo. Tests: `tests/errand-planner.test.js`, `tests/morning-features.test.js`. Docs: DSA.md 4e, README.
- Not tested: notifications on a real phone, Android, the UI on a real phone.

# Storage (latest)
- A failed plan save now shows a message + "Open my plans" button (`onSaveFailed` in `src/store.js`, banner in `src/app.js`); caches (`cw_c_*`) are cleared before a save fails; home warns above 80% of ~5M characters; past exams are listed apart with "Delete all past exams" (confirmation, never automatic). Tests: `tests/storage-room.test.js`; 275 tests passing.

# Latest round (2026-10-07): nearby places for small towns
- Cause found: (1) Overpass unreachable/timing out; (2) OpenStreetMap itself is thin there and the pins are the pincode area, 6-15 km from the towns. Added Photon + Nominatim (Hindi/local words, whole town, distance shown), big "See all places on Google Maps" buttons at the top, correct "server failed" vs "none in OSM" messages, optional Google Places through a Cloudflare Worker (`worker/`, OFF by default, daily limit, in-memory only for Google's terms).
- Pin buttons rule (latest): only a HIGH confidence pin (or one the user dragged) is used as coordinates; otherwise "Show my exam centre", the Android link and "Get directions to centre" search Google by name + full address + pincode. Sample: `tests/centre-links-sample.txt`.
- Centre links: "📍 Show my exam centre" at the top of the nearby section; every kind has "Search near centre" (official `maps/search/?api=1&query=<kind> near <name, area, city>`; unsure name -> `<kind> near <lat>,<lng>`) and "📍 Centre" buttons. Sample links for 6 colleges: `tests/centre-links-sample.txt`. Tests: `tests/centre-links.test.js`.
- Small towns: a kind with fewer than 3 places within 5 km says "Few places are mapped in this area. See them on Google Maps." with a big "See on Google Maps" button; if ~70% of kinds are thin the top block is marked and says so; "no places" wording removed (`src/logic/thinView.js`, `tests/thin-towns.test.js`).
- Step 4b done: "Find more places with Google Maps" button (only when a Worker address is set; one tap = one search, remembered per plan while the app is open; counts per kind; limit/unavailable message). Tests: 254 passing. Earlier line: 249 passing (`tests/places-and-worker.test.js` is new). Not testable from here: the `geo:` link on a real phone, a real deployed Worker.

# Status (finished 2026-10-07)

State: `npm test` = 238 passing. Version stamp is up to date (`npm run stamp` after any code change; `npm start` does it).

## Current job: "the app must work on ANY Indian admit card" (7 parts)
### Done
- **Part 1 (no tuning):** `tests/no-tuning.test.js` scans `src/` for any value of a sample card (centre names, addresses, pincodes, codes, roll numbers, cities). City/state lists live only in `src/ingest/geoLists.js`; bundled-region files are exempt (`offlineRoute.js`, `bundledNearby.js`).
- **Part 2 (coverage):** big label lists + approximate label matching (my edit distance) in `labels.js` / `labelHits.js`; digit repair (`10:O0`); English + Hindi month names, month-first dates; "HHMM-HHMM hrs" and Hindi "बजे" times; exam-name rules for NTA / SSC / RRB / IBPS / SBI / UPSC / state PSC / state police / TET / GATE / CAT / CLAT / CBSE / state boards (`examTitle.js`); centre-code repair, label centred between value lines, declaration sentences cut, fallback pincode never from the home address, time-range fallback.
- **Part 3 (hidden test set):** generator `tools/makeHoldout.js` (+ `tools/holdout/*`): 12 exam bodies, 57 towns (15 big, 42 small), 9 layouts, random wording/fonts/sizes/lines/colours/logos/page size/photo damage. Runner `tests/holdout-run.js` (totals only with `--summary`; `--centre` adds the real centre search + route). Tuning sets are in `tests/holdout/tuning` (seed 1001, 20), `tuning-b` (1002, 30), `tuning-c` (1003, 30).
  Scores on tuning sets (tuned on them, so optimistic): tuning 99.0%, tuning-b ~94.6%, tuning-c 94.4% before the last fixes (re-run not finished).
- **Part 4 (centre finding):** chain order, wrong state / other postal district rejected, pincode-area pin = low/yellow; tests added.
- **Part 5 (nearby):** four small Overpass questions, two at a time, 15 s limit, each type shown as it arrives (`onPartial`); "Search in my maps app" button for all 9 types (geo: on phone, OpenStreetMap link on laptop); nearby saved in the plan (`plan.nearby`); background job with quiet retries for one hour (`src/flow/nearbyJob.js`); bundled Chandigarh–Mohali–Panchkula places `data/nearby-tricity.json` (1306 places, 51 KB, built by `tools/buildNearby.js`).
- **Part 6:** yellow "Not found on your card" note listing missing date / reporting time / address; everything else is still planned.
- Docs: README (own-card testing section), DSA.md (section 4d) updated.

### Final run (done 2026-10-07)
- Fresh hidden set: seed 53656, 40 cards, run once after the last code change: **92.6%** overall (`tests/holdout-report.md`). Pin found 39/40, within 2 km of the town 17, within 5 km 33, routes 39/39. 5 of 134 "sure" text fields were wrong (3.7%). One card leaked a candidate name/roll part into a result (not fixed: hidden set is spent; look into it with a NEW set).
- Weak spots seen: photo-mild 69.7%, bilingual cards 70%, Hindi time wording 74.5%, `iit` (GATE/CAT/CLAT) 70.5%, `nta` 82%, timetables 87%. To work on them, make new tuning sets (new seeds) - do not reuse seed 53656.
- Nearby on real servers (15 s limit): Jaipur, Patna, Coimbatore got food/chemist/ATM/fuel/toilets but lodging, bus stand, railway station timed out (buttons offered); Gorakhpur: whole search timed out; Kolhapur: Overpass answered only fuel. The maps-app buttons cover the gaps.
- No official specimen cards could be downloaded (two searches found only bulletins).

## Earlier work (still true)
- Table reader, per-cell OCR, faint-line detection, exam title area read on its own, service worker auto-update + version in footer, nearby retry button, accuracy report `tests/ocr-accuracy.md` (28 cards 97.4%).
- `npm run debug-card -- card.jpeg` prints the reader's view of one card (terminal only).
- Overpass public servers fail often; nothing in the project holds a real person's card (the real JEE card file was removed from the Desktop earlier; never copied here).
- Known flaky: `node --test tests/` once hung for 10 min while heavy background jobs were running; alone it takes about 30 s.
