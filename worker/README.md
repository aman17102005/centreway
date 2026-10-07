# Optional: Google Places for the nearby list (OFF by default)

CentreWay works fully without this. OpenStreetMap is thin in small towns, so the nearby list can be short there. If you want Google's
much fuller list of restaurants, hotels, chemists, hospitals, ATMs, petrol pumps, bus stands and stations, you can switch this on later.

**Your Google key never goes into the app.** It lives only inside a small free Cloudflare Worker (this folder). The app talks to the Worker.
The Worker has a **hard daily limit** (default 1,000 Google calls per day) and refuses to call Google after that.

> Always check Google's pricing page before you switch it on: https://developers.google.com/maps/billing-and-pricing/pricing
> Prices and free amounts change. The numbers below are what I read on that page when I wrote this.

## What it costs (read on 2026-10-07: please re-check)
- The Worker asks for name, position and type only. That is billed as **Places API Nearby Search Pro**.
- Standard price list: first **5,000 calls per month free**, then **USD 32 per 1,000 calls**.
- India price list: first **35,000 calls per month free**, then **USD 9.60 per 1,000 calls**. Which list applies to you depends on your Google billing account, so check.
- One plan uses **at most 4 calls** (food, stays, health, services). If the free sources already found 5 places of a kind, that kind is not asked.
- With the default limit of 1,000 calls a day the worst case is about 30,000 calls a month: free on the India list, about USD 800 on the standard list if you hit the limit every day. **Set the Google quota (Step C) so the real limit is much lower**, for example 100 calls a day, which is plenty for a few students.

## What Google's rules changed in the app
(Read from Google's Places API policies page: https://developers.google.com/maps/documentation/places/web-service/policies)
1. **Attribution:** Google results are shown with the text **"Google Maps"** next to them, because they are not shown on a Google map.
2. **No Google data on the OpenStreetMap map:** Google places are shown only in the list, never as markers on our map.
3. **No storing of Google data:** Google's policy forbids caching Places content except the place ID. So Google results are kept **in memory for this visit only**. They are not saved with the plan and not cached on the phone. The next visit asks again.
4. **No pre-fetching:** the app asks Google only when someone opens a plan's nearby list with the switch on.
(I could not read the full "Service Specific Terms" page; if you plan to store coordinates for up to 30 days, read them first. The app does not.)

## Setup, step by step (about 30 minutes)

### A. Google Cloud (the key)
1. Go to https://console.cloud.google.com and sign in. Create a project (for example "centreway").
2. Add a billing account (Google asks for a card; the free amounts above apply first).
3. Open **APIs & Services > Library**, search **Places API (New)** and click **Enable**.
4. Open **APIs & Services > Credentials > Create credentials > API key**. Copy it.
5. Click the key, then **API restrictions > Restrict key > Places API (New)** only. Save. (A server key cannot be restricted by website; the Worker's origin check and the daily limit protect it.)

### B. Google Cloud: the safety limits (do this BEFORE switching on)
1. **Quota (the real hard limit):** **APIs & Services > Places API (New) > Quotas & System Limits**. Find the lines for Nearby Search (per day and per minute). Click the pencil and set a small number, for example **100 per day**. Google then refuses calls above it, whatever the Worker does.
2. **Budget alert:** **Billing > Budgets & alerts > Create budget**. Amount: for example USD 1 per month. Add alerts at 50%, 90% and 100%, with your email. (A budget only warns; it does not stop spending. The quota above is the stop.)

### C. Cloudflare (the Worker)
1. Make a free account at https://dash.cloudflare.com.
2. Install the tool once: `npm install -g wrangler`, then `wrangler login`.
3. In this folder (`worker/`) create the counter: `wrangler kv namespace create COUNTER`. It prints an `id`. Paste it into `wrangler.toml` (replace `PASTE-THE-ID-HERE`).
4. In `wrangler.toml` set `ALLOWED_ORIGIN` to the address where your app is hosted, for example `https://yourname.github.io` (no slash at the end). For testing on your laptop add `,http://localhost:8080`.
5. Add the key as a secret (it is asked for, never written in a file): `wrangler secret put GOOGLE_API_KEY`.
6. Deploy: `wrangler deploy`. It prints the Worker address, like `https://centreway-places.yourname.workers.dev`.

### D. Switch it on in the app
1. Open the app, **Settings > Google Places (optional)**.
2. Paste the Worker address and tick **Use Google Places**.
3. Open a plan: in the nearby section a big button **"Find more places with Google Maps"** appears. Google is asked ONLY when someone taps it (one request to the Worker = at most 4 Google calls). The count per kind (for example "Food: 18 · Stay: 6 · Medical: 9 · ATM: 4") and every place with its distance and an "Open in maps" link are shown inside the app, marked "from Google Maps". The answer is remembered for that plan while the app stays open, so tapping again costs nothing; it is forgotten when the app is closed (Google's policy allows storing only the place ID). Google returns at most 20 places per group of kinds, so the counts stop at 20 per group. If the daily limit is reached or Google is not set up, the button is replaced by "Google Maps search is not available right now"; the free list and the "See all places on Google Maps" buttons keep working. To switch it off again, untick the box.

## How the daily limit works
Each request needs 1 to 4 Google calls. The Worker adds them to a counter for today **before** calling Google. If today's counter plus the new calls is more than `DAILY_LIMIT`, the Worker answers "429 Daily limit reached" and does not call Google. The counter resets each day (UTC).
The counter is a Cloudflare KV value, which is not perfectly exact when many requests arrive at the same moment, so it can overshoot a little. That is why the Google quota in Step B is the real hard stop.

## Files
- `index.js` the Worker (tested by `tests/worker.test.js`)
- `wrangler.toml` settings
