# VIVA.md: CentreWay

Simple English, short answers. File names are real; you can open them in front of the examiner.

---

## a) The 2-minute spoken summary

"My project is **CentreWay**. It is a free web app, a PWA, that installs on a phone. Many exam candidates in India reach the exam centre late, because the centre is in an unknown part of a city and the gate closes on time.

The candidate only uploads the admit card: a photo, a screenshot or a PDF. The card is read **on the phone**. It never goes to a server. The app finds the exam name, date, reporting time, gate closing time and the centre address. It puts the centre on a map, finds a route from where the candidate is, and shows one big number: **Leave by**. That is the reporting time, minus a safety buffer, minus the travel time.

Then I added four morning features. One: **stops on the way**. The candidate can tick a photocopy shop, an ATM and a chemist, and the app chooses which shop of each kind and in which order, so the total time is smallest. That uses **bitmask dynamic programming**. Two: **stay the night before** advice, when the trip is very early or very long. Three: an **hour-by-hour timeline** of the morning, from wake-up to exam start, with reminders kept in a **min-heap** so the next reminder is always found fast. Four: **Can I bring this?**, which answers only from the candidate's own card, using a **trie, a hash map and KMP string search**. If the card does not mention an item, the app never says 'allowed'.

All data structures are hand-written in `src/dsa/`: no built-in Map, Set or sort there, and a test checks that. There are 302 automatic tests. There is no backend, no account, no paid service and no API key. The honest limits: free map data is thin in small towns, so the app then sends the user to Google Maps; and travel times are estimates, not live traffic."

---

## b) Each DSA part

Format: what it does, where the app uses it, time and space, why chosen, exact file and function. (n = items, V = road junctions, E = roads, T = kinds of stops, N = places, K = items kept.)

### Bitmask DP: errand planner (new)
- **What:** chooses ONE shop of each ticked kind (photocopy, ATM, chemist; up to 5 candidates each) and the order, so travel + minutes at stops is smallest. It is a small travelling-salesman problem with a choice of place per kind.
- **Idea:** a mask says which kinds are done (bit g = kind g). `best[mask][place]` = least time to have visited exactly those kinds and stand at `place`. Move to an unvisited kind g through any candidate c: `best[mask | bit g][c] = min(best[mask][place] + travel[place][c] + dwell[g])`. A parent table rebuilds the order.
- **File / function:** `src/dsa/errandPlanner.js`, `planErrands()`. Called by `planMorningErrands()` in `src/logic/errands.js`, from the button in `src/ui/errandsUi.js`. Demo: `dsa.html` section 3 (`runErrands()` in `src/dsaDemo.js`).
- **Time:** O(2^T · N²). With T = 3 and 5 candidates each, N = 17: 8 · 17 · 17, far below a millisecond. **Space:** O(2^T · N).
- **Why:** brute force tries T! orders × 5^T shop choices (750 for T = 3, but huge for 8). The DP re-uses the best answer for "these kinds done, standing here". Tests (`tests/errand-planner.test.js`) run the DP and a brute force on 300 random inputs, including unequal (one-way) travel times, and the totals always agree.
- **Travel times:** OSRM table service through `getMatrix()` in `src/services/routing.js` (rate limiter + saved cache). If it fails: straight-line distance × 1.35 ÷ 30 km/h (`estimateMatrix()` in `errands.js`) and the screen says "times are estimates".

### Min-heap: timeline reminders (new)
- **What:** every switched-on reminder (wake up, leave, each stop...) of every saved plan is put in a heap ordered by time. The app sets ONE timer for the earliest; when it rings, it sets the next.
- **File / function:** `src/dsa/minHeap.js` (`MinHeap`: `push`, `pop`, `peek`). Used by `buildReminderHeap()`, `ringOrder()` and `armTimelineReminders()` in `src/flow/timelineReminders.js`. The steps themselves come from `buildTimeline()` in `src/logic/timeline.js` (worked backwards from the reporting time, sorted with my `mergeSort`).
- **Time:** push/pop O(log r), peek O(1), building O(r log r) for r reminders. **Space:** O(r).
- **Why:** we only ever need "what rings next?", not a fully sorted list; plans can be added or switched off at any time. A heap answers that in O(1) and updates in O(log r). Test: reminders come out in time order (`tests/morning-features.test.js`).

### Trie + hash map + KMP: "Can I bring this?" checker (new)
- **File / functions:** `src/logic/bringChecker.js`: `suggestItems()` (trie), `lookupItem()` (hash map), `checkItem()` (KMP), `findMustBring()`. Structures: `src/dsa/trie.js` (`Trie`), `src/dsa/hashMap.js` (`HashMap`), `src/dsa/kmp.js` (`kmpSearchAll`, `asciiLower`). Screen: `src/ui/checkerUi.js`.
- **How:** the item catalogue (English and Hindi synonyms) goes into a **hash map** synonym → item: the typed word "mobile" or "फोन" gives the item at once. The same words go into a **trie**, so typing "cal" suggests "calculator". Then **KMP** looks for every synonym in each sentence of the card's own instructions (saved from the card when it was read). The nearest rule word ("not allowed", "must bring", "permitted") decides. Priority: not allowed > must bring > allowed. If nothing is found: "Your card doesn't mention this..." and **never** "allowed".
- **Time:** hash map lookup O(1) average; trie prefix O(p + k) for prefix length p and k suggestions; KMP O(n + m) per synonym per sentence (n = sentence length, m = synonym length). **Space:** O(total letters of the synonyms) for trie and map.
- **Why:** a plain list would scan all synonyms for every key press; a trie shares prefixes; KMP never moves back in the text, so it is linear on long instruction sentences.

### Top-K (heap of size K)
- **Where:** `src/dsa/topK.js`, `topK()`. Used for the 5 errand candidates with the least detour (`pickCandidates()` in `errands.js`), the 5 closest stays (`stayAdvice()` in `src/logic/stayAdvice.js`), closest nearby places (`src/logic/nearby.js`), centre candidates (`src/flow/centreFinder.js`).
- **Time:** O(n log K). **Space:** O(K). **Why:** we need only the best few, not a sorted list of hundreds.

### Greedy leave-by
- **Where:** `src/dsa/leaveBy.js`, `computeLeaveBy()`; used by `leaveByFor()` in `src/ui/step4.js`.
- **Time/Space:** O(1) / O(1). **Why:** start at the deadline and subtract buffer, extra time and travel (including stops); later is always better, so a backward greedy step gives the latest safe time.

### Hash map
- `src/dsa/hashMap.js`, class `HashMap` (separate chaining, resize at load 0.75). Used by the LRU cache index, spatial grid, trie children, label tables.
- get/set O(1) average, O(n) worst; space O(n). **Why:** direct jump to the bucket instead of searching.

### LRU cache
- `src/dsa/lruCache.js`, class `LRUCache` (hash map + doubly linked list). Used through `src/services/lruStore.js` for address search, routes, nearby places and the OSRM table.
- get/put O(1); space O(capacity). **Why:** free servers must not be asked the same thing twice; the least recently used answer is dropped.

### Queue + rate limiter
- `src/dsa/queue.js` (`Queue`, circular buffer), `src/dsa/rateLimiter.js` (`RateLimiter`). Used so geocoding sends at most 1 request per second and the OSRM table has a gap (`src/services/routing.js`).
- O(1) per operation. **Why:** the free services' rules; a circular buffer avoids the O(n) cost of `Array.shift`.

### Stack
- `src/dsa/stack.js`, class `Stack`. Used for checklist **Undo** (`src/ui/plan.js`) and the Back button (`src/app.js`).
- push/pop O(1). **Why:** "most recent first".

### Merge sort (stable)
- `src/dsa/mergeSort.js`, `mergeSort()`. Used for nearby places by distance, the timeline steps, table rows in the card reader.
- O(n log n) always; space O(n). **Why:** stable (equal items keep their order), and no O(n²) worst case like quicksort.

### Spatial grid and k-d tree
- `src/dsa/spatialGrid.js` (`SpatialGrid`): nearby places within a radius and snapping a point to the nearest road junction (`src/logic/nearby.js`, `src/dsa/offlineRouter.js`). Insert O(1); a radius query reads only the cells near the point; space O(n).
- `src/dsa/kdTree.js` (`KdTree`): same questions with a tree, compared in `bench/` and the demo. Nearest O(log n) average; space O(n). The app uses the grid (simple, cheap to build for a fixed area).

### Road graph, Dijkstra, A*
- `src/dsa/graph.js` (`RoadGraph`, adjacency list), `src/dsa/dijkstra.js` (`dijkstra()`), `src/dsa/aStar.js` (`aStar()`), glued in `src/dsa/offlineRouter.js` (`OfflineRouter`).
- Time O((V + E) log V) with the min-heap; space O(V + E). A* adds a straight-line guess (haversine ÷ top speed) so it visits fewer nodes and gives the same cost. **Why:** when the online route service fails, the app can still give an "offline route (estimate)" in the bundled Chandigarh–Mohali–Panchkula area. `dsa.html` section 1 shows both side by side.

### Trie (place suggestions) and edit distance
- `src/dsa/trie.js` for start-point suggestions (`suggestPlaces()` in `src/logic/places.js`); `src/dsa/editDistance.js`, `editDistance()` for "Did you mean...?" on OCR mistakes (`findCorrections()`).
- Trie insert O(L), suggest O(L + M); edit distance O(a·b) time, O(min(a,b)) space (two rows, early stop).

### KMP + character scanner
- `src/dsa/kmp.js` finds labels like "Reporting Time"; `src/dsa/fieldScanner.js` (`tokenize`, `scanDates`, `scanTimes`, `scanPincode`, `extractFieldsScanner`) reads dates, times and pincodes without regular expressions. O(n) time, O(n) space.

**Rule check:** `tests/dsa-rules.test.js` fails if any file in `src/dsa/` uses built-in `Map`, `Set` or `.sort`, or lacks a complexity header comment.

---

## c) 25 likely viva questions

1. **Why would anyone use this instead of Google Maps?**
   Google Maps knows the road but not your exam. It cannot read your admit card, does not know the gate closes at 9:30, and does not tell you "leave at 7:19". CentreWay turns the card into a plan: leave-by time, a morning timeline, stops, reminders, a checklist and a "can I bring this?" answer. It is free, needs no account, keeps the card on the phone and works in Hindi. Google Maps is still used for the final navigation and where free data is thin; the app links to it.

2. **What problem does the project solve?** Late arrival at exam centres: unknown place, no clear leave time, gate closes on time.

3. **Does the admit card leave the phone?** No. Reading (OCR) runs in the browser. Name, roll number, photo are ignored and not saved. Only the centre, location and times go into a share link, and only if the user taps Share.

4. **Why a PWA and not a native app?** One code base, installs from a link, no store fee, works offline after the first visit, free to host on GitHub Pages.

5. **How is the leave-by time computed?** Reporting time − buffer (default 60 min) − extra − travel time. With stops, travel time is the whole morning: travel between places plus the minutes at each stop. `computeLeaveBy()` in `leaveBy.js`, greedy backwards.

6. **Explain the bitmask DP in simple words.** A number whose bits say which kinds of stops are done. For each "done set" and "where I stand" I keep the best time so far. I grow the set one kind at a time. At the end I add the trip to the centre. Table size 2^T × N, so tiny.

7. **Why DP and not brute force?** Brute force grows like T! × 5^T. DP grows like 2^T × N². For 3 stops both are tiny, but DP is the right method and is proved correct against brute force on 300 random tests.

8. **Is the DP result always the best?** Yes, for the travel times given. Times can be unequal each way (one-way roads). The times are estimates, so "best" means best by those estimates.

9. **What if OSRM (the route server) fails?** Straight-line distance × 1.35 ÷ 30 km/h estimates are used and the screen says "times are estimates". For single routes the offline A* router works in the bundled area.

10. **Why a min-heap for reminders?** We need "what rings next?" quickly while reminders are added and removed. Heap: peek O(1), push/pop O(log r). A sorted list would cost O(r) to insert.

11. **Do reminders ring when the phone is asleep?** Not reliably. A web page cannot promise that. They ring while the app/browser is alive; the calendar file (.ics) is the backup. This is a stated limit.

12. **How does the checker avoid saying "allowed" wrongly?** It only says allowed when the card has a sentence with the item and a permission word. If the item is not found, the answer is "Your card doesn't mention this... leave it at home to be safe". Negative words ("not allowed", "prohibited") win over positive ones.

13. **Why trie plus hash map plus KMP together?** Trie: suggestions while typing. Hash map: synonym to item in O(1). KMP: search inside the card's sentences in linear time. Each does the one job it is best at.

14. **What is KMP and why not `indexOf`?** Knuth–Morris–Pratt uses a failure table so it never moves back in the text: O(n + m). It is a required DSA part and gives a guaranteed linear time.

15. **Why a hash map and not an array?** Array search is O(n); hash map is O(1) on average.

16. **What is the load factor and what happens at 0.75?** Items ÷ buckets. Above 0.75 my `HashMap` doubles the buckets and re-inserts, to keep chains short.

17. **Dijkstra vs A*?** Same answer; A* adds an admissible guess (straight line ÷ top speed), so it explores fewer nodes. Shown in `dsa.html`.

18. **Why a spatial grid for nearby places?** To avoid checking every place; only nearby cells are read.

19. **What is an LRU cache and where is it used?** Remembers recent answers and drops the least recently used. Used for addresses, routes, nearby places and the OSRM table, so free servers are not asked twice and the app works partly offline.

20. **How do you respect free services' rules?** My `RateLimiter` (built on my `Queue`) spaces requests 1 second apart; results are cached; the map credit is shown; the Google key is never in the app.

21. **How do you know the card reader works on any card?** A generator (`tools/makeHoldout.js`) makes fake cards (12 exam bodies, 57 towns, 9 layouts, photo damage). I tuned on some sets and measured once on a hidden set with a new seed: 92.6% of fields correct. The weak spots are listed below.

22. **Why did you not tune on your own real card?** To avoid overfitting. `tests/no-tuning.test.js` fails if any sample-card value appears in `src/`.

23. **What does "yellow box" mean?** The app is not sure about that field. The user taps it only if wrong. On the hidden set 3.7% of "sure" text fields were wrong.

24. **What if the exam starts very early or the centre is far?** The stay advice appears when leave-by is before 4:30 AM or travel is over 3 hours: it shows the leave-by if staying near the centre, the 5 closest stays (Top-K) and a Google Maps hotel search.

25. **What did you test, and what is not tested?** 302 automatic tests (DSA structures, DP vs brute force, timeline, checker, share links, storage, reader accuracy), plus `TESTING.md` by hand. Not tested automatically: notifications on a real phone, the UI on many Android phones, a deployed Google Places Worker.

Bonus: **What would you do next?** Better small-town data (community mapping), live traffic if a free source exists, more exam-body rules.

---

## d) 5-minute live demo script

Before the viva: open the deployed https address on your phone and `npm start` on the laptop; have a FAKE card photo and `dsa.html` open in a second tab. Do the first load online.

| Time | Click | Say |
|---|---|---|
| 0:00 | Home screen | "CentreWay: upload the admit card, get a plan. Free, no account." |
| 0:20 | Upload the fake card photo | "It is read on the phone. Nothing is uploaded." |
| 0:50 | Summary screen | "Exam, date, times, centre. Yellow means unsure; I tap only if wrong." Tap "Looks right, continue". |
| 1:20 | Plan screen: map and Leave by | "Centre pin, route, and the big number: leave by. Reporting time minus buffer minus travel." Change the buffer once to show it move. |
| 2:00 | "Yes, add stops": tick all three, "Plan my stops" | "Bitmask DP picks one shop of each kind and the best order. Home, ATM, Photocopy, Chemist, Centre, with a time at each stop. Leave-by moved earlier." Point at the numbered map pins. If a stop is before 8:00, read the warning. |
| 2:50 | Timeline | "Worked backwards: wake up, leave, stops, reach, report, gate closes, exam starts. Reminders are kept in a min-heap, the next one is always at the top." Switch one reminder on. |
| 3:20 | "Can I bring...?": type `mobile`, then `photo ID`, then `umbrella` | "Answers come from the card's own lines: not allowed, must bring. Umbrella is not on the card, so it never says allowed." Type `cal` to show trie suggestions. |
| 3:50 | Nearby places and Google Maps buttons | "Free map data is thin in small towns, so the app says so and gives Google Maps buttons." |
| 4:10 | Open `dsa.html` | "Section 3: random shops, bitmask DP against brute force: same total, timings shown. Section 1: Dijkstra vs A*." Click "New random places and solve" once; read "Totals AGREE". |
| 4:40 | Terminal: `npm test` (or show last result) | "302 tests, all passing. Hand-written structures in `src/dsa/`, checked by a rules test." |
| 4:55 | Close | "Limits: estimates, not live traffic; thin maps in small towns; reminders need the app alive." |

If the network fails during the demo: say so, show the saved plan offline (all saved plans open offline) and go straight to `dsa.html`, which runs without a server call except map tiles.

---

## e) Honest limits

- **Nearby places are thin in small towns.** OpenStreetMap has fewer places there and the public servers are sometimes slow. The app says "Few places are mapped in this area" and gives Google Maps buttons. The optional Google Places Worker is off by default and needs a Google account.
- **Travel times are estimates**, not live traffic. Stop times use the OSRM table service or, if it fails, a straight-line estimate (marked).
- **Card reading is not perfect:** 92.6% of fields on a hidden set of fake cards. Weak spots: low-quality photos, bilingual cards, Hindi time wording, some timetable layouts. Yellow boxes show unsure fields; the user must check the card.
- **Centre pin:** most addresses give the right area, not always the exact building. A pin is used as exact only when confidence is high; otherwise the buttons search Google Maps by name and address.
- **Offline road routing** only covers the bundled Chandigarh–Mohali–Panchkula area.
- **Reminders** need the app/browser to be alive; they are not guaranteed on a sleeping phone. The calendar file is the backup.
- **"Can I bring this?"** answers only from the lines the reader found on the card. A misread card gives fewer answers (never a wrong "allowed" for an unmentioned item). General rules are marked "General rule, not from your card".
- **Shops may be closed** early in the morning; the app warns before 8:00 AM but does not know opening hours.
- **Tested on:** automatic tests and a laptop browser. Not tested on many Android phones or with a deployed Google Places Worker.
- **Not advice:** always follow the instructions printed on the admit card and the official exam notice.
