# TESTING.md: check list for laptop and Android phone

Fill the **Result** column with PASS / FAIL and a short note. Use only a **fake or your own** admit card.
Never share a real card. The app never uploads it, but do not put a real one in this project folder.

**Before you start**
- Laptop: run `npm start`, open the address it prints (for example http://localhost:8080) in Chrome.
- Phone: open the GitHub Pages address (see README, "Put it online"). https is needed for location and notifications.
- First time on a device: open the app once while online so it can save itself for offline use. In Chrome menu choose "Install app" or "Add to Home screen".
- To start clean: Settings > "Clear all my data" (or clear site data in the browser).
- Automatic tests: `npm test` must show 0 failing (302 at the last run).

Legend: L = laptop, P = phone (Android Chrome).

| # | Feature | Steps | Expected | Device | Result |
|---|---|---|---|---|---|
| 1 | Open the app | Open the address | Home screen with one big upload button, footer shows a version like 1.3.0-xxxxxxxx | L, P | |
| 2 | Language | Switch English / Hindi | All texts change; switch back | L, P | |
| 3 | Install | Chrome menu > Install app | Icon on home screen / desktop; opens full screen | P | |
| 4 | Card upload: photo | Tap upload, pick a clear photo of a fake card | Reading progress, then the summary screen | L, P | |
| 5 | Card upload: camera | On phone tap upload, take a photo | Same as 4 | P | |
| 6 | Card upload: PDF | Upload a PDF card | Read directly, summary screen | L, P | |
| 7 | Bad photo | Upload a blurry photo or a non-card picture | A clear message and "Try another photo", no crash | L, P | |
| 8 | Fields | Check exam name, date, reporting time, gate time, centre name, address, pincode | Right values; unsure ones are in yellow boxes | L, P | |
| 9 | Fix a field | Tap a yellow field, correct it | Value changes, plan updates | L, P | |
| 10 | Privacy | Look at the summary | Candidate name, roll number, photo are not shown or saved | L, P | |
| 11 | Missing fields | Use a card without a date | Yellow note "Not found on your card"; rest is still planned | L | |
| 12 | Location | Allow location when asked | Start pin shows near you | L, P | |
| 13 | Location refused | Refuse location | You can still set the start point by hand ("Start point" on the summary or step 2); no crash | L, P | |
| 14 | Map | Open a plan | Map with the centre pin, start pin, route line, nearby icons | L, P | |
| 15 | Centre pin | Check the pin against the real place | Pin is at or near the centre; yellow pin if unsure; drag the pin to fix | L, P | |
| 16 | Route | Look at the route line and the "Route: km, minutes" line | A road route (or a clear "estimate" note) | L, P | |
| 17 | Travel mode | Change car / motorbike / walking | Time and leave-by change | L, P | |
| 18 | Leave-by | Read the big "Leave by" time | = reporting time minus buffer minus travel time | L, P | |
| 19 | Buffer / extra time | Change the buffer or extra time | Leave-by moves by the same amount | L, P | |
| 20 | Many exam days | Use a timetable card | One plan per exam day | L | |
| 21 | Errands: no stops | On a plan keep "No, go straight to the centre" | Leave-by is home to centre only | L, P | |
| 22 | Errands: all three | Choose "Yes, add stops", tick photocopy, ATM, chemist, tap "Plan my stops" | Order like Home > ATM > Photocopy > Chemist > Centre with a time at each stop; leave-by is earlier and says "includes 3 stops" | L, P | |
| 23 | Errands: map | Look at the map | Numbered stop pins and a dashed line | L, P | |
| 24 | Errands: minutes | Change the minutes at a stop and plan again | Leave-by changes | L, P | |
| 25 | Errands: missing shop | Use a place with no photocopy shop nearby | "No photocopy shop found near your route. Try Google Maps" and a button; the rest is planned | L, P | |
| 26 | Errands: early | Plan so a stop is before 8:00 AM | Warning "Shops may be closed this early. Consider going the day before." | L, P | |
| 27 | Errands: offline | Turn internet off, plan stops | Works with "times are estimates" | L, P | |
| 28 | Stay advice | Use a centre far away (leave-by before 4:30 AM or trip over 3 hours) | "Stay the night before?" card with the leave-by from a stay, the closest stays, and a Google Maps hotel button | L, P | |
| 29 | Stay advice absent | Use a near centre | No stay card | L, P | |
| 30 | Choose a stay | Pick one stay | Timeline and leave-by start from the stay | L, P | |
| 31 | Timeline | Open "Exam morning timeline" | Wake up, Leave home, (stops), Reach the centre, Reporting time, Gate closes, Exam starts, in time order | L, P | |
| 32 | Get-ready time | Change "Time to get ready" | Wake-up time moves | L, P | |
| 33 | Reminders | Switch a step's reminder on; allow notifications | Browser asks once; step stays on | P | |
| 34 | Reminder rings | Set a reminder a few minutes ahead (change your phone clock or use a test plan for today) and keep the app open | A notification appears at that time | P | |
| 35 | Can I bring: not allowed | Type "mobile phone" on a card that bans it | "Not allowed (your card says: ...)" | L, P | |
| 36 | Can I bring: must bring | Type "photo ID" | "Must bring (your card says: ...)" | L, P | |
| 37 | Can I bring: not mentioned | Type something the card does not mention (for example "umbrella") | "Your card doesn't mention this..." and never "allowed" | L, P | |
| 38 | Can I bring: suggestions | Type "cal" | Suggestions like calculator appear | L, P | |
| 39 | Must-bring in checklist | Open the checklist | Items the card says to bring are there, marked "(your card says)" | L, P | |
| 40 | Nearby places | Scroll to Nearby places | Food, stay, ATM, chemist, photocopy, toilets, fuel, bus, rail with distances; loads in parts | L, P | |
| 41 | Nearby filter | Tap a type | List and map show only that type | L, P | |
| 42 | Thin town | Use a small-town card | "Few places are mapped in this area. See them on Google Maps." with a button | L, P | |
| 43 | Google Maps buttons | Tap "Show my exam centre", "Get directions to centre", "Search near centre" | Google Maps opens (app on phone, site on laptop) at the right place | L, P | |
| 44 | Google Places (optional) | Only if you set up the Worker: Settings, paste address, tick; tap "Find more places with Google Maps" | Counts and places marked "from Google Maps" | L | |
| 45 | Share | Tap Share plan | Link/text with leave-by and timeline, no name or roll number | L, P | |
| 46 | Open a shared link | Open the link in another browser | Shared view with the timeline and a map | L, P | |
| 47 | Calendar file | After the summary choose Add to calendar | .ics downloads; opens in the calendar with one event per timeline step | L, P | |
| 48 | Checklist | Tick, add, delete an item, press Undo | All work, Undo reverses them one by one | L, P | |
| 49 | Saved plans | Close the app and reopen | Plans are still on Home | L, P | |
| 50 | Offline | Turn internet off, open the app and a saved plan | Plan, checklist and saved nearby places show; offline banner | L, P | |
| 51 | Past exams | Use a plan with a date in the past | It is listed apart as a past exam; "Delete all past exams" asks for confirmation | L, P | |
| 52 | Storage | Home screen storage line | Warns when above 80%; a failed save shows a message and "Open my plans" | L | |
| 53 | Delete a plan | Delete one plan | It is gone after reload | L, P | |
| 54 | Update | After a new version is published, reload twice | Footer shows the new version | L, P | |
| 55 | DSA demo | Open `/dsa.html` | Dijkstra vs A*, trie, edit distance, and the errands demo with "Totals AGREE" | L | |
| 56 | Automatic tests | `npm test` | 0 failing | L | |

**Known things that cannot be fully checked on a laptop:** notifications while the phone sleeps, the `geo:` map link on some phones, a deployed Google Places Worker.

Tester: ____________  Date: ____________  Device / browser: ____________
