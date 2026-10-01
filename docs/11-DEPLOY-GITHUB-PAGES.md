# 11. The public site on GitHub Pages (static export)

Audience: the owner. Goal: the **Tarique Rahman showcase site** served as plain files from `https://mdfrhd101.github.io/jonoprotinidhi/`, while the data, the complaint box and the admin keep running on Render ([docs/10](10-DEPLOY-RENDER.md)).

| Piece | Where | URL |
|---|---|---|
| Public site (static files, rebuilt from the CMS every hour) | GitHub Pages, built by `.github/workflows/pages.yml` | `https://mdfrhd101.github.io/jonoprotinidhi/` |
| API, complaints, OTP, tracking | Render `jonoprotinidhi-api` | `https://jonoprotinidhi-api.onrender.com` |
| Admin panel | Render `jonoprotinidhi-admin` | `https://jonoprotinidhi-admin.onrender.com` |

The Render public service `jonoprotinidhi-demo` is unchanged and still works. Nothing generated is committed: `apps/web-public/out/` is git-ignored and exists only as a workflow artifact (the repo is public).

## 1. One-time setup

1. **Push** the code (workflow, site changes, API CORS, `render.yaml`). If GitHub refuses the push of `.github/workflows/pages.yml` ("without `workflow` scope"), run `gh auth refresh -h github.com -s workflow` once and push again.
2. **Turn on Pages with source "GitHub Actions"** (once):
   ```bash
   gh api -X POST repos/mdfrhd101/jonoprotinidhi/pages -f build_type=workflow
   ```
   If the site already exists (HTTP 409) use `gh api -X PUT repos/mdfrhd101/jonoprotinidhi/pages -f build_type=workflow` instead. By hand: repo > Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. **Let the API accept the Pages origin.** `render.yaml` now sets `PUBLIC_SITE_ORIGINS=https://mdfrhd101.github.io` on `jonoprotinidhi-api` (a plain value, so the push redeploys the API with it). If the variable is missing on the service's Environment page, add it by hand (origin only: no `/jonoprotinidhi`). Without it the site works but sending or tracking a complaint fails with "check your internet connection".
4. **First deployment:** Actions > "Public site on GitHub Pages" > Run workflow (a push to `main` touching `apps/web-public/**`, `packages/shared/**` or the workflow starts it too).

## 2. How it updates

- on every push that changes the web-public app, the shared package or the workflow,
- **every hour** (`cron` at minute 17): a CMS edit made in the admin reaches the site within about an hour,
- on demand: Actions > Run workflow (use it right after an important edit).

A run wakes the sleeping API (up to 3 minutes), builds, checks the result and only then deploys. If the API is down or a page cannot be built the run **fails and the previous deployment stays online** (an error never publishes a site with sections missing).

## 3. How static mode works

`STATIC_EXPORT=1` (set only by `npm run build:static -w @jonoprotinidhi/web-public`; the normal build and the Render site do not change):

- `next.config.mjs`: `output: 'export'`, `basePath: '/jonoprotinidhi'`, `trailingSlash: true`, unoptimized images. `pageExtensions` loses `ts`, which leaves out exactly the server-only files (`middleware.ts`, `app/api/public/[...path]/route.ts`, `app/healthz/route.ts`); every page and layout is `.tsx`. **Do not add a `page.ts`.**
- Data is read at build time from `API_URL` with the pinned `TENANT_HOST` (no request, no cookies). Reads go through `src/lib/buildFetch.ts`: 2 at a time, each URL once, retry with backoff on 429/5xx/network errors (honours `Retry-After`). A read that still fails fails the build (`soft()` does not swallow it in this mode). Public GETs only: no secret is needed.
- `activities/[slug]` pages come from `generateStaticParams` (the API's post list).
- `<meta name="robots" content="noindex, nofollow">` is in every page (GitHub Pages cannot send `X-Robots-Tag`). `scripts/build-static.mjs` fails the build if a page lacks it, if a main page is missing, or if the CMS footer disclaimer (`copyright` / `footerNote`) is not on the home page.
- The complaint box, OTP and tracking call the API directly: `NEXT_PUBLIC_API_ORIGIN` + `/api/v1/public/...` (`src/lib/publicApi.ts`). The API answers CORS for `PUBLIC_SITE_ORIGINS` on exactly four calls (POST `otp/send`, `otp/verify`, `complaints`, GET `complaints/:id`), without credentials; admin CORS is untouched (`apps/api/src/app.ts`).
- The Turnstile key is Cloudflare's public always-pass test key (`1x00000000000000000000AA`), like on the Render demo.

## 4. Try it on your machine

```bash
export PATH=~/.local/node24/bin:$PATH
API_URL=https://jonoprotinidhi-api.onrender.com TENANT_HOST=jonoprotinidhi-api.onrender.com \
TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build:static -w @jonoprotinidhi/web-public
# serve it under the same prefix Pages uses
mkdir -p /tmp/pages-preview && ln -sfn "$PWD/apps/web-public/out" /tmp/pages-preview/jonoprotinidhi
python3 -m http.server 8081 --bind 127.0.0.1 --directory /tmp/pages-preview     # http://127.0.0.1:8081/jonoprotinidhi/
```
Against a local API use `API_URL=http://127.0.0.1:4000 TENANT_HOST=<tenant host> NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:4000` (and `PUBLIC_SITE_ORIGINS=http://127.0.0.1:8081` on that API).

## 5. What does not work on GitHub Pages

- **Edits are not instant.** Anything from the CMS (including the complaint statistics and whether OTP is required) is a snapshot of the last build, up to an hour old. A deleted or unpublished post disappears at the next build. Use "Run workflow" for an immediate refresh.
- **Activities:** one list of all posts; no category / upazila filter, no pagination (they need a query string on the server). `?v=` for a video and the complaint `#track` tab work in the browser.
- **No response headers.** Pages cannot send a Content-Security-Policy, `X-Frame-Options` or `X-Robots-Tag`; the Render site does (`middleware.ts`). Only the noindex meta tag remains.
- **No Basic-auth gate and no demo password:** the site is world-readable. noindex asks search engines to stay away; it is not access control. A real politician's site needs the written consent of his office first (CLAUDE.md).
- **The complaint box needs the Render API awake.** After a quiet period the first send or tracking call can take about a minute or fail once; trying again works. The hourly build wakes the API each time, which uses Render free instance hours (shared by all free services, 750 per month).
- **Captcha is a test key** (accepts anything). Same as the Render demo; replace both before a pilot.
- **Scheduled workflows stop after 60 days without repository activity** in a public repo. If the hourly refresh goes quiet, push anything or re-enable the workflow under Actions.
- Uploaded files (not used by the Tarique content, which uses Wikimedia and YouTube) would still vanish on Render restarts ([docs/10](10-DEPLOY-RENDER.md) section 9).

## 6. Rollback and stop

- Roll back: revert the change and push (or Run workflow once the CMS is fixed). Re-running the deploy job of an earlier run also works, but only while its artifact exists (1 day).
- Stop publishing: disable the workflow (Actions > the workflow > ... > Disable) and unpublish with `gh api -X DELETE repos/mdfrhd101/jonoprotinidhi/pages`.
