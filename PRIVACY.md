# Privacy

CentreWay has no server, no accounts, no ads, no analytics and no tracking.

## What stays on your phone
- Your admit card photo. It is read in the browser (Tesseract.js) and then dropped. It is never uploaded and never saved.
- The text you edit, your plans, checklists and settings. Saved in this browser only (localStorage). We do not save the raw admit card text, only the fields you confirm (centre name, address, pincode, city, date, times).
- Optional keys (OpenRouteService, Gemini). Saved only in this browser. Sent only to their own service.
- Cached search and nearby-place answers (so we ask the free services less often).

## What is sent over the internet, and only when you tap a button
| Action | Sent to | What is sent |
|---|---|---|
| Find centre / search a start place | Nominatim (OpenStreetMap) | The address text you confirmed |
| Route | OSM Germany OSRM servers, backup: router.project-osrm.org, or OpenRouteService if you added a key | Start and end coordinates |
| Nearby places | Overpass API (and Nominatim search for types it misses) | The centre coordinates and a radius |
| Map pictures | OpenStreetMap tile servers | The map area you are looking at |
| OCR language data (first time only) | cdn.jsdelivr.net | Nothing about you; it only downloads files |
| "Clean up with AI" (only if you add a Gemini key) | Google Gemini API | Only the text in the box, never the photo |

Your IP address is visible to these services, as with any website.

## Sharing
"Share plan" includes only: centre name/address, coordinates, exam date and leave-by time. It never includes the photo, your name, roll number or any ID.

## Deleting
Settings → "Clear all my data" removes everything saved by the app in this browser.

## Admit card upload (automatic flow)
- The photo, screenshot or PDF is read **on your phone** (Tesseract.js and pdf.js run in your browser). It is never uploaded and never saved: it is dropped from memory when reading finishes.
- The candidate's name, roll number, date of birth, parents' names, ids, photo and signature are **ignored**. Only these are kept: exam name, dates, times, centre name and address, pincode, city, and the "not allowed" items. They are saved in this browser (localStorage) as your plan.
- The text of the card is not stored. (Only if you added a Gemini key, a redacted copy of the text is kept in the unfinished draft until you tap "Looks right".)
- **Location** is asked once and is used only to draw the route (sent to the routing server as coordinates, like any route request). The last start point you used is saved in this browser only (cleared by "Clear all my data"). If there is no location and no saved start point, you pick one yourself. The admit card itself, and its numbers (roll, application, ID, barcode, the candidate's own home address and pincode), are never stored or sent.
- **Optional Gemini step:** only if you add your own key, and only when you tap the button. Only redacted text is sent (lines with names, roll numbers, birth dates, parents' names, ids are removed; long digit strings become [number]); never the picture. The removal is based on labels, so a name written on a line without a label like "Name:" would not be caught: check before you use it.
- The first scan downloads the English and Hindi reading files from the jsDelivr CDN; nothing about you is sent.
- Pre-loading: when the app is opened online it quietly downloads those language files so the first scan is faster.
