# Flashcard Forge

A single-file flashcard app. Generate cards on any topic with Claude, sort them into
**Unsure / Nearly / Learned** piles, and revise by category.

The same `index.html` runs in two modes and detects which at load:

| | GitHub Pages | Vercel |
|---|---|---|
| URL | https://hcjconquest-hue.github.io/flashcard-forge/ | set after deploy |
| Card bank | this browser only | shared, synced across devices |
| API key | you paste your own | server-side env var |
| Login | none | site password |

On startup the app probes `/api/health`. If it gets the JSON marker back it runs in
**synced mode**; anything else (a 404, an HTML page, no network) and it falls back to
**local mode** — the original browser-only behaviour, unchanged.

## Deploying the synced version

1. **Import the repo** at [vercel.com/new](https://vercel.com/new) — pick
   `hcjconquest-hue/flashcard-forge`. No build settings to change; it's a static
   `index.html` plus `api/*` functions.
2. **Add storage:** project → **Storage** → **Upstash Redis** → create and connect.
   This injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically — don't set
   those by hand.
3. **Add env vars** (Settings → Environment Variables), see `.env.example`:
   - `SITE_PASSWORD` — make it strong; it's the only thing guarding your API credits
   - `SESSION_SECRET` — long random string, signs the session cookie
   - `ANTHROPIC_API_KEY` — your key, never sent to any browser
4. **Redeploy** so the new env vars take effect.

Check `/api/health` afterwards — it returns `{"configured": true}` once all of the
above is in place, and the app will show `☁ synced` in the nav instead of `🔑 no key`.

## How syncing behaves

- **Local-first.** Every change writes to `localStorage` immediately, then pushes to
  the server. Losing the network never loses cards.
- **Coalesced writes.** Quiz grades are debounced (a 20-card session is ~1 upload);
  adding, importing, or deleting cards uploads straight away.
- **Never wipes on load.** Uploads are locked until the first successful download
  completes, so a stale or empty device can't overwrite a good bank. If both sides
  have unsynced work, they're merged by card id and a backup of the local copy is
  kept under an `ff_bank_backup_*` key.
- **Last-write-wins otherwise.** Two devices editing the same card simultaneously:
  the later write survives. Fine for one person; not built for concurrent editors.
- **Offline** shows `⚠ offline` and retries with backoff; you can keep revising.

## Data and keys

- In local mode, cards and your API key live only in that browser's `localStorage`.
  Clearing site data or using a private window wipes them — use **Export bank (JSON)**.
- In synced mode, cards live in Upstash Redis under one key and the API key lives only
  in a Vercel env var. Anyone who knows the site password can spend your credits, so
  treat it like a real password.

## Development

The whole app is `index.html` — no build step, no framework. Open it directly in a
browser and it runs in local mode. `npm install` is only needed for the API functions.
Both hosts redeploy on push to `main`.
