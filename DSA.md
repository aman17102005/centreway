# CentreWay: DSA project report

CentreWay helps exam candidates reach their exam centre on time. For this final project I did **not** change what the app does. I added hand-written data structures and algorithms in `src/dsa/` and used them inside the real app. Rules I followed inside `src/dsa/`: no libraries, no built-in `Map`, `Set` or `Array.prototype.sort` (a test, `tests/dsa-rules.test.js`, checks this), and every file starts with a comment block (what it is, where the app uses it, time, space, why this choice).

If a DSA part fails, the app catches the error and uses the old behaviour (old extractor, plain sort, no cache, straight-line distance).

## 1. Summary table

| Structure / algorithm | File | Where the app uses it | Time | Space |
|---|---|---|---|---|
| Hash map (separate chaining, resize at load 0.75) | `src/dsa/hashMap.js` | LRU cache index, spatial grid cells, trie children, graph speed table, suggestions de-duplication | get/set/delete O(1) average, O(n) worst | O(n) |
| LRU cache (hash map + doubly linked list) | `src/dsa/lruCache.js` | Caches address search, routes, nearby places (saved in localStorage) | get/put O(1) | O(capacity) |
| Queue (circular buffer) | `src/dsa/queue.js` | Waiting line in the rate limiter | enqueue/dequeue O(1) | O(n) |
| Rate limiter | `src/dsa/rateLimiter.js` | 1 Nominatim request per second | schedule O(1) | O(waiting) |
| Stack | `src/dsa/stack.js` | Checklist Undo; Back button through the steps; trie traversal | push/pop O(1) | O(n) |
| Binary min-heap | `src/dsa/minHeap.js` | Dijkstra, A*, top-K | push/pop O(log n), peek O(1) | O(n) |
| Merge sort (stable) | `src/dsa/mergeSort.js` | Nearby places by distance, k-d tree build, suggestion order | O(n log n) | O(n) |
| Top-K (heap of size K) | `src/dsa/topK.js` | K closest places per type, best trie suggestions | O(n log K) | O(K) |
| Haversine distance | `src/dsa/haversine.js` | A* guess, grid distance, snapping | O(1) | O(1) |
| Spatial grid | `src/dsa/spatialGrid.js` | Nearby places within radius; snapping points to road nodes | insert O(1); within(R) O(cells + points in them); nearest: a few cells | O(n) |
| k-d tree (2-D) | `src/dsa/kdTree.js` | Compared with grid in benchmarks and demo page (nearest + range search) | build O(n log² n); nearest O(log n) average; range O(√n + k) | O(n) |
| Road graph (adjacency list) | `src/dsa/graph.js` | Offline route | build O(V+E) | O(V+E) |
| Dijkstra | `src/dsa/dijkstra.js` | Compared with A*; demo page | O((V+E) log V) | O(V) |
| A* | `src/dsa/aStar.js` | "Offline route (estimate)" when OSRM fails/offline | O((V+E) log V) worst, usually far less work | O(V) |
| Offline router (glue) | `src/dsa/offlineRouter.js` | Snaps with the grid, runs A*, returns distance/time/line | as above | O(V) |
| Trie | `src/dsa/trie.js` | Start-point suggestions while typing (local, no network) | insert O(L); suggest O(L + M + M log K) | O(total letters) |
| Edit distance (2-row DP, early stop) | `src/dsa/editDistance.js` | "Did you mean Chandigarh?" for OCR mistakes | O(a·b) | O(min(a,b)) |
| KMP string search | `src/dsa/kmp.js` | Finds labels (Reporting Time, Gate Closing Time, Venue, Address, Hindi labels) | O(n + m) | O(m) |
| Character scanner (state machine) | `src/dsa/fieldScanner.js` | Main extraction of dates, times, pincodes, centre name/address | O(n) | O(n) |
| Greedy leave-by | `src/dsa/leaveBy.js` | Leave-by time, reminders, calendar file | O(1) | O(1) |

## 2. One by one: problem, choice, simple explanation

**Hash map.** *Problem:* many parts need "find the value for this key" quickly. *Why this choice:* an array would need a search through every item (O(n)); a hash map turns the key into a bucket number, so it jumps straight there. *How it works:* the string hash (djb2 style) gives a number; `number % buckets` picks the bucket; each bucket is a small linked chain, so two keys in the same bucket still work (separate chaining). When items / buckets goes above 0.75 the table doubles and every entry is moved (resize), which keeps chains short.

**LRU cache.** *Problem:* the same address, route or nearby search should not be sent to a free server twice. *Why:* we need a small memory that forgets the least recently used answer. A hash map finds an entry in O(1); a doubly linked list keeps the order (newest at front) so moving an entry or dropping the oldest is O(1). Together get and put are both O(1). The cache is saved to localStorage (the app's existing storage) so it survives a reload.

**Queue + rate limiter.** *Problem:* Nominatim's policy allows at most 1 request per second. *Why:* requests must be served in the order asked. A circular buffer queue has O(1) add/remove (Array.shift is O(n)). The limiter remembers when the last task started; the next one waits until the gap (1.1 s) has passed. It replaced the old "sleep" code in `nominatim.js`. Tests use a fake clock.

**Stack.** *Problem:* (1) Undo in the checklist; (2) Back should return to the screen the user really came from. *Why:* both need "the most recent thing first" = last in, first out. Every checklist change (tick, add, delete) is pushed; Undo pops and reverses it. Every visited screen is pushed; Back pops.

**Min-heap.** *Problem:* Dijkstra and A* must repeatedly take "the node with the smallest time"; top-K must know "the worst of the K kept". *Why:* a sorted array costs O(n) per insert; a heap gives the smallest in O(1) and push/pop in O(log n).

**Merge sort.** *Problem:* sort places by distance, keep equal distances in their old order. *Why:* always O(n log n) and stable (quicksort is not stable and has an O(n²) worst case).

**Top-K.** *Problem:* we only want the 10 closest food places, not a sorted list of 500. *Why:* a heap of size K costs O(n log K) and O(K) memory; a full sort costs O(n log n). The benchmark shows the difference.

**Spatial grid.** *Problem:* "which places are within 1 km?" and "which road node is nearest to this point?" without checking every point. *Why:* cut the map into 300 m cells (cell name → bucket in my hash map). Only cells near the point are read. Nearest search expands in rings of cells and stops when no unseen cell can be closer.

**k-d tree.** *Problem:* the same nearest/range questions, answered by a tree. *Why:* it splits the points alternately by x and y at the median, so a nearest search can skip whole halves (pruning). I compare it with the grid in the benchmark; the app itself uses the grid because it is simple, cheap to build and fast for a fixed area.

**Road graph.** *Problem:* the offline route needs the road network in memory. *Why an adjacency list:* roads are sparse (about 3 per junction); a matrix would need nodes² cells. Edge weight is travel time = length / speed, with a simple speed per road type and per mode (walk, motorbike, car). Data comes from OpenStreetMap (ODbL) via `tools/buildGraph.js`; only junctions and road ends are kept, straight pieces are merged into one edge.

**Dijkstra and A\*.** *Problem:* fastest path between two nodes. Dijkstra is correct for non-negative weights but explores in every direction. A* adds a guess (straight-line distance ÷ top speed, which never over-guesses), so it walks mostly towards the goal and visits fewer nodes while returning the same cost. Both return path, time, distance and nodes visited. If the OSRM call fails, times out or the phone is offline, and both points are inside the data area, the app runs A* in a Web Worker and labels the result "Offline route (estimate)".

**Trie.** *Problem:* suggestions for the start point while typing, without sending a request on every key press. *Why:* all words with the same beginning share one path, so a prefix search only touches words that start with it. Each word stores a weight (cities 100, stations 90, ... ), the best few come out through top-K. Names are also reachable from later words (type "rail" to find "Chandigarh Railway Station").

**Edit distance.** *Problem:* OCR turns "Chandigarh" into "Chandigrah". *Why DP:* the answer for two words is built from the answers for shorter prefixes; only the previous row is needed (two rows of memory) and the search stops early once the distance is above the limit. The fields screen shows "Did you mean …?" and changes nothing until the user taps.

**KMP + scanner.** *Problem:* find labels and values in messy OCR text. KMP finds a label in O(n + m) without moving back in the text. A hand-written scanner (a small state machine in three states: none, in number, in word) makes tokens; token patterns recognise dates, times (with am/pm), 6-digit pincodes. This is now the main extraction path. The older regex extractor stays as a fallback and in the tests; `extractFieldsBest` uses the scanner first and fills empty fields from the old extractor, so it is never worse.

**Greedy leave-by.** *Problem:* when must the candidate leave? Start from the deadline and subtract the buffer, the extra time and the travel time. Each block must be kept in full, and later is always better, so this greedy backward step gives the latest safe time; no search is needed.

## 3. Tests

All tests run with `npm test` (Node's built-in test runner, no network needed). **Result: see `npm test` (all passing).** The count grew with the table reader, the NTA card, the exam-title rules, the hold-out fixes, nearby places, centre finding, the service worker and the anti-tuning test.

| File | Tests | What it checks |
|---|---|---|
| `centre-finder.test.js` | 7 | centre search: fallbacks, ranking, wrong-place rejection, nearby institutions |
| `dsa-basic.test.js` | 18 | hash map, queue, stack, min-heap, merge sort (edge cases + random vs brute force) |
| `dsa-graph.test.js` | 7 | graph, Dijkstra, A* vs Bellman-Ford, unreachable nodes, outside-area points |
| `dsa-leaveby.test.js` | 6 | greedy leave-by (500 random checks) |
| `dsa-lru-rate.test.js` | 8 | LRU vs slow list version; rate limiter with fake clock |
| `dsa-real-data.test.js` | 4 | real tricity graph: A* = Dijkstra, real trips, real place list |
| `dsa-rules.test.js` | 3 | rules: no libraries, no Map/Set/sort in src/dsa, header comments |
| `dsa-spatial.test.js` | 12 | haversine, spatial grid and k-d tree vs brute force |
| `dsa-text.test.js` | 18 | edit distance, KMP, top-K, trie, field scanner |
| `extract.test.js` | 9 | older: regex extractor on 8 made-up cards |
| `flow.test.js` | 11 | automatic flow: draft, leave-by, reminders, calendar, plans per day, sorting, AI text |
| `geocode-plan.test.js` | 6 | older: address search fallback |
| `ingest-fields.test.js` | 13 | exam field reader: labels right/below, same-line fields, bilingual, timetables, privacy, confidence |
| `ingest-layout.test.js` | 9 | lines from words, label hits, timetable rows, "not allowed" items |
| `ingest-pdf.test.js` | 6 | real sample PDFs: >= 95% fields, QR in a PDF, errors |
| `ingest-pixels.test.js` | 13 | image clean-up: resize, contrast, binarise, rotate, deskew, crop, shadows, border blobs |
| `ingest-support.test.js` | 8 | redaction, QR text, cross-checks (validate), AM/PM repair, optional AI fields |
| `leaveby.test.js` | 5 | older: leave-by |
| `nearby-places.test.js` | 5 | nearby top-K pipeline, place suggestions, did-you-mean, extractFieldsBest |
| `share.test.js` | 5 | older: share link, calendar file, geo helpers |

Every structure is also compared with a simple brute-force version on hundreds of random inputs (fixed seed): heap vs sorting, grid and k-d tree vs checking every point, Dijkstra and A* vs Bellman-Ford and vs each other, trie vs filtering a list, LRU vs a list-based version, KMP vs a slow search, edit distance vs the full table. Edge cases covered: empty input, one item, duplicates, ties, very large input (100,000 items / 10,000-node graph), unreachable nodes, points outside the map area.

Real-data checks (`tests/dsa-real-data.test.js`): `data/graph.json` is under 3 MB, A* and Dijkstra return the same cost on 45 random real routes, a Chandigarh Sector 17 → Mohali Phase 7 trip gives a sensible distance and time, and Delhi is correctly rejected as outside the area.

**Not part of `npm test` (needs the network and the photo-reading language files):** `npm run accuracy` runs all 20 sample admit cards through the whole flow on the real Nominatim / OSRM / Overpass servers and writes `tests/ocr-accuracy.md` (27 made-up cards; numbers and honest notes are in that file).

Also checked by hand in a browser at phone width with no typing: text PDF, multi-day timetable PDF, Hindi PDF, image-only PDF, tilted photo, bilingual photo, screenshot, location refused, and a file with no exam details.

## 4. Benchmarks

Run `npm run bench`; the raw output is in [bench/results.md](bench/results.md).

### 1. Top-K (heap of size K) vs full sort — find the 10 smallest numbers

| n | top-K heap (ms) | my merge sort, full (ms) | built-in sort, full (ms) | heap speed-up vs my sort |
|---|---|---|---|---|
| 1,000 | 0.0507 | 0.0928 | 0.0680 | 1.8x |
| 10,000 | 0.0736 | 0.97 | 1.07 | 13.2x |
| 100,000 | 0.17 | 13.5 | 14.1 | 79.1x |

### 2. Nearest point: spatial grid vs k-d tree vs brute force (200 queries each)

| n points | grid build (ms) | k-d build (ms) | grid per query (ms) | k-d per query (ms) | brute force per query (ms) | speed-up grid / k-d |
|---|---|---|---|---|---|---|
| 1,000 | 0.37 | 1.57 | 0.0035 | 0.0003 | 0.0157 | 4x / 54x |
| 10,000 | 3.28 | 22.7 | 0.0011 | 0.0004 | 0.13 | 120x / 362x |
| 100,000 | 19.6 | 373 | 0.0034 | 0.0004 | 1.31 | 389x / 3330x |

### 3. Prefix search: trie vs filtering a list (top 5 by weight, 300 queries each)

| n words | trie build (ms) | trie per query (ms) | filter list per query (ms) | speed-up |
|---|---|---|---|---|
| 1,000 | 0.78 | 0.0006 | 0.0070 | 10.7x |
| 10,000 | 8.05 | 0.0023 | 0.0619 | 26.5x |
| 100,000 | 120 | 0.0250 | 0.61 | 24.5x |

### 4. Dijkstra vs A* on the real tricity road graph (20 random routes per mode)

Graph: 55,588 nodes, 140,006 directed roads.

| mode | routes | Dijkstra avg (ms) | A* avg (ms) | Dijkstra nodes visited | A* nodes visited | fewer nodes with A* | avg route length | same cost |
|---|---|---|---|---|---|---|---|---|
| car | 20 | 6.33 | 4.96 | 31,350 | 20,307 | 1.5x | 18.6 km | 20/20 |
| bike | 20 | 6.56 | 4.94 | 31,324 | 19,628 | 1.6x | 18.5 km | 20/20 |
| foot | 20 | 5.64 | 2.32 | 30,173 | 9,112 | 3.3x | 16.3 km | 20/20 |

"same cost" = how many of the routes had exactly the same total time with both algorithms (must be all of them).

Snapping a point to the nearest road node (55,588 nodes): grid 0.0027 ms vs brute force 0.75 ms per point (276x faster).



How to read them: the grid and k-d tree answer nearest-point questions hundreds of times faster than checking every point, the heap beats a full sort when K is small, the trie beats filtering a list, and A* visits fewer nodes than Dijkstra for the same cost. With very few points the grid can be slower than brute force (many empty cells to look at), which is expected.

## 4b. Where the DSA parts help the automatic flow

The app no longer asks the user to type anything. These are the steps and which data structure or algorithm does the work:

| Step of the automatic flow | DSA part | What it does there |
|---|---|---|
| Find "Reporting Time", "Gate Closing Time", "Venue", "Address", Hindi labels in the card | **KMP** (`kmp.js`) | finds every label in every line in linear time; `fieldScanner.js` (state machine) reads the dates, times and pincodes |
| Put the OCR words into lines, join table cells, sort timetable rows by date | **Merge sort** (`mergeSort.js`, stable) | words left to right, lines top to bottom, rows by date and time without disturbing equal ones |
| Remember the labels, months, speeds, place words | **Hash map** (`hashMap.js`) | month names, road speeds, known place words, "already seen" checks |
| Fix OCR spelling ("Chandigrah" → "Chandigarh") | **Edit distance** + **trie** (`editDistance.js`, `trie.js`) | the trie holds the place words; only a unique match one letter away, for an important place, is fixed on its own; other mistakes become a "Did you mean" chip |
| Rank the map candidates for the centre | **Top-K** + **min-heap** (`topK.js`, `minHeap.js`) | keeps only the best candidates by score; centre-name matching uses edit distance |
| Every Nominatim request | **Queue + rate limiter** (`queue.js`, `rateLimiter.js`) | at most one request per second, in order |
| Repeated searches, routes, nearby places | **LRU cache** (`lruCache.js`) | the same address is never sent twice; saved in the phone's storage |
| Run the steps one after the other (centre, route, nearby) | **Queue** | the steps wait in a queue and run in order |
| Route when the server fails or the phone is offline | **Graph, Dijkstra, A\*, spatial grid, haversine** | snaps your location and the centre to road nodes and finds the fastest path in a Web Worker ("Offline route (estimate)") |
| Nearby places | **Spatial grid + top-K + merge sort** | within 1 km, the closest ten per type, nearest first |
| Start point when location is refused | **Trie** | suggestions while typing, with no request until the user taps Search |
| Leave-by for every exam day | **Greedy backward calculation** (`leaveBy.js`) | deadline − buffer − extra − travel, once per day of the timetable |
| Undo in the checklist, Back through the screens | **Stack** (`stack.js`) | last change first |
| Saved plans list | **Merge sort** | soonest exam first |

## 4c. Table reading, templates and nearby places (real NTA card fix)

| Part | Where | DSA used |
|---|---|---|
| Table grid (ruling lines, cells, gap cells) | `src/ingest/grid.js`, `tableReader.js` | arrays, sorting by position (merge sort) |
| Card templates (NTA, SSC, RRB, IBPS, UPSC, state) and best-of-readings merge | `templates.js`, `extractBest.js` | KMP label search, confidence groups |
| Centre code / name / address / city / pincode rules | `centreParse.js` | scanner tokens, trie of states and cities |
| Nearby places: tags per type, 1 -> 2 -> 5 km widening, merge of same-name places within 50 m, top 5 per type | `src/services/overpass.js` | spatial grid (50 m dedupe), merge sort, top-K heap, LRU, rate-limiter queue |
| Faint table lines, per-cell reading with voting, title area, exam short names | `grid.js` (`addFaintLines`), `cellOcr.js`, `examTitle.js` | arrays, KMP-style label matching, edit distance |
| Start point chain (location, saved start, then trie suggestions), nearest railway station / bus stand | `src/flow/startPoint.js` | trie, spatial grid |

## 4d. Any card, any city (hold-out round)

| Part | Where | DSA used |
|---|---|---|
| Labels matched even with OCR mistakes ("Reportlng Tlme"): exact search first, then my edit distance on word windows | `src/ingest/labelHits.js` | KMP, edit distance, merge sort |
| Digit repair inside numbers (`10:O0`, `1O.3O`), month names in English and Hindi, "HHMM-HHMM hrs" ranges | `src/dsa/fieldScanner.js` | scanner (state machine) |
| Exam name from the title area with rules for the exam bodies (JEE, NEET, CUET, GATE, CAT, CLAT, TET, SSC, RRB, IBPS, SBI, UPSC, state PSC, state police, CBSE, state boards) | `src/ingest/examTitle.js` | KMP, hash-free rule tables |
| Centre finding: full address -> name + city -> name + pincode -> street + city -> pincode; wrong state / other postal district rejected | `src/flow/centreFinder.js` | rate limiter, LRU, top-K, edit distance |
| Nearby: four small questions at a time, 15 s limit, shown as they arrive; bundled places for the Chandigarh area | `src/services/overpass.js`, `bundledNearby.js` | spatial grid, top-K, merge sort, queue, LRU |
| Background nearby job with one hour of quiet retries | `src/flow/nearbyJob.js` | queue of timers |
| Free search sources merged (Overpass + Photon + Nominatim + bundled), same name within 50 m = one place, town-wide distances | `src/services/overpass.js`, `photon.js` | spatial grid, top-K, merge sort, rate limiter, LRU |
| Optional Google Places Worker with a daily limit (KV counter) | `worker/index.js` | - |
| Anti-tuning test (no value of a sample card in `src/`) | `tests/no-tuning.test.js` | - |

## 4e. Morning errands, stay advice, timeline and "Can I bring this?"

**Bitmask dynamic programming** (`src/dsa/errandPlanner.js`, tests `tests/errand-planner.test.js`).
- Where used: the "Do you need to stop anywhere on the way?" planner on the plan screen (`src/logic/errands.js`) and section 3 of `dsa.html`.
- Problem: visit one shop of each ticked kind (photocopy, ATM, chemist; up to 5 candidates each), in the best order, then reach the centre, with the least total time (travel + minutes at each stop). This is a small travelling-salesman problem with a choice of place per kind.
- How: bit g of the mask says "kind g is done". `best[mask][place]` = least time to have visited exactly those kinds and stand at `place`; a parent table rebuilds the shops and the order.
- Time O(2^T * N * N), space O(2^T * N) with T kinds (3 in the app) and N places (home + candidates + centre). Brute force is T! * 5^T tries.
- Why: the DP re-uses sub-results; the tests run DP and brute force on 300 random inputs (also with one-way, unequal travel times) and check the totals agree.
- Candidates are the 5 shops of each kind with the least detour, chosen with the existing Top-K min-heap (`src/dsa/topK.js`). Travel times come from the OSRM table service (rate limiter + persistent LRU cache); if it fails, haversine x 1.35 / 30 km/h and the screen says "times are estimates".

**Stay the night before** (`src/logic/stayAdvice.js`): advice when leave-by is before 04:30 or the trip is over 3 hours (limits in `config.js`). The 5 closest stays use the Top-K heap by distance: O(n log 5), space O(5).

**Priority-queue timeline** (`src/logic/timeline.js`, `src/flow/timelineReminders.js`). The timeline is worked backwards from the reporting time and sorted by the stable hand-written merge sort, O(s log s). Every switched-on reminder of every plan goes into the existing `src/dsa/minHeap.js` ordered by time; the app arms ONE timer for the earliest, and arms the next when it rings. Push/pop O(log r), peek O(1), space O(r) for r reminders. Why a heap: only "what rings next?" is needed, not a sorted list, and plans can be added or switched off at any time.

**"Can I bring this?" checker** (`src/logic/bringChecker.js`). A hash map (`src/dsa/hashMap.js`) maps every synonym (English and Hindi) to its item: O(1) average. A trie (`src/dsa/trie.js`) gives prefix suggestions while typing: O(p + k). KMP (`src/dsa/kmp.js`) finds the synonyms inside each sentence of the card's own instructions: O(n + m) per search. The nearest rule word decides the answer (not allowed > must bring > allowed). An item the card does not mention is NEVER "allowed". Space O(total synonym letters) for the trie and map.

Where to read more: `VIVA.md` repeats every part with the exact file and function, likely viva questions and a demo script.

## 5. Honest limits

- **Offline routes are estimates** from simple speeds per road type, with no live traffic, no turn costs and no traffic lights. They only work inside the Chandigarh–Mohali–Panchkula–Kharar area (`CONFIG.offline.area`).
- The graph keeps main roads and residential streets (motorway to living street, pedestrian streets). Service roads, footpaths, steps and alleys are left out to keep the file small, so walking routes can be longer than real life.
- The offline graph is loaded only when needed. For it to work with no internet, the phone must have loaded it once before (the app fetches it quietly when the centre is inside the area and the phone is online).
- One-way and turn restrictions are only partly modelled (one-way is, turn restrictions are not).
- Data is a snapshot of OpenStreetMap from the day `npm run graph` was run; roads change.
- The scanner is tested on made-up admit cards. Real cards will differ; the user can always edit every field.
- "Did you mean" only knows tricity places plus major exam cities, so it will not fix names elsewhere.
- **Automatic reading is not perfect.** On my 20 made-up cards the reader got about 97% of all fields right, but real admit cards are messier; very blurry, dark or folded photos and Hindi text are the weak spots, and a wrong value can look confident (the report shows how often each colour was right).
- The sample cards were made by me together with the reader, so the numbers are optimistic (see `tests/ocr-accuracy.md`).
- Photos are not corrected for perspective (a card photographed at an angle).
- Timing numbers depend on the machine; they were measured on the machine named in the benchmark table.

## 6. Data credit

Road and place data: © OpenStreetMap contributors, Open Database Licence (ODbL), https://www.openstreetmap.org/copyright. See also `LICENSES.md`.
