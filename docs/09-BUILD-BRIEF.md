# 09 · Build brief for the CMS redesign, content pages, gallery/video and public site

Read this first if you are a sub-agent. It is the shared context for everyone working in parallel.

## 0. Ground rules

- Product: **Jonoprotinidhi (জনপ্রতিনিধি)**, multi-tenant portfolio + CMS + complaint platform for Bangladeshi MPs. Repo root `D:\AI\Jonoprotinidhi`,
  npm workspaces: `apps/api` (Express 4 + Mongoose 8 + zod), `apps/web-admin` (React 18 + Vite + react-query + react-router),
  `packages/shared` (zod schemas, permissions, Bangla helpers), `client-demo/` (static visual spec), later `apps/web-public` (Next.js).
- Machine: **Windows 11 on ARM64**, Git Bash. Use `MSYS_NO_PATHCONV=1` when a bash argument starts with `/`. Keep files under `D:\`.
- **UI copy is Bangla** (Bangla digits via `toBn`, dates via `bnDate`). Code, comments, commit-style docs are English.
- **Never** invent content under a real politician's name. All demo content belongs to the fictional MP **ড. তাহমিনা নূর, নদীপুর-৩**.
- **Never print or write credentials in chat/docs.** Local seed logins are in the git-ignored `apps/api/.seed-credentials.local`; read them from
  there in scripts. Local `.env` has `MFA_REQUIRED=false` (password-only login) – leave it as you found it.
- Security rules that always apply: every tenant query is scoped (fail-closed `tenantId` plugin; use `runInTenant` in scripts/tests and await
  inside it), no PII in logs, every admin write is audited (`audit()`), permission checks in the API (UI hiding is only a hint), sanitise
  everything that becomes HTML, strict zod schemas (`.strict()`) on every write body.
- Bug tracking: any real defect you find goes into `bugs/register.json` via `node scripts/bugs.mjs add …` (see `bugs/README.md`), fixed
  ones get a regression test that mentions the bug id.
- Quality gate for anything you finish: `npm run typecheck`, the relevant vitest suite(s) green, and – for UI – you have looked at it in a real
  browser (Playwright + Edge, see §5) at 1440 px and 390 px wide.
- Do not run `git`. Do not touch files owned by another agent (see §6). Do not edit `.env`.
- If something in this brief is impossible or contradicts the code, decide sensibly, note it in your final report, and continue.

## 1. Content model (already in code – `packages/shared/src/content.ts`)

Singleton pages, one document per key, `draft` + `live` copy (model `PageContent`), zod schema per key in `PAGE_SCHEMAS`:

| key | what it edits |
|---|---|
| `layout` | announcement bar, tagline, footer texts, photo credit, copyright, social links |
| `home` | hero note, stats strip (n / unit / label), section titles+intros, complaint call-to-action |
| `profile` | headline, intro, role line, story paragraphs, milestones, committees, personal facts, education, profession, politics, awards, priorities |
| `heroes` | kicker/title/intro of every inner page (about, biography, activities, promises, area, gallery, videos, complaint, contact) |
| `area` | intro, totals, voters, extra facts, upazilas (with unions), note |
| `contact` | intro, offices (name + label/value rows), channels (label, note, url), hotline |
| `complaint` | intro, "how it works" steps, privacy note, FAQ |

Existing editable things that stay: **posts** (activities, rich text body + up to 6 photos), **promises** (+ progress updates), **site-config**
(slogan, accent colour, hero banners, home section order/visibility), **complaint settings** (categories, OTP, SLA), **team**.

Collections (each item has `status: 'draft' | 'published'`, soft delete, `createdBy`):

- `EventItem` – upcoming programmes: title, date, time text, place, note.
- `GalleryItem` – photos: url (own upload or allow-listed host), caption, credit, album, takenAt, order, featured.
- `VideoItem` – `kind: 'youtube' | 'upload'`; youtube stores the 11-char id (`parseYouTubeId` accepts any URL form); upload references a video in the
  media library (`mediaId`); optional poster image; duration text; order; featured.

Publishing rule (ADR-0005): editors (`content.edit`) only ever produce drafts; the owner (`content.publish`, `posts.publish`) publishes. The owner's
own save offers "save and publish". The public API returns only `live` page copies and `published` items.

Media: `MediaAsset` has `kind: 'image' | 'video'`. Images are re-encoded to WebP by `sharp` (EXIF stripped). Videos (mp4/webm, size-limited, magic-byte
checked, not transcoded) are streamed with HTTP Range support from `/api/v1/public/media/:tenantId/:id.(webp|mp4|webm)`.

## 2. API surface (tenant admin, all under `/api/v1/admin/tenants/:tenantId`)

Existing: `/me /dashboard /posts… /promises… /site-config /settings /profile /complaints… /team… /audit /media (POST image, GET list, DELETE)`.

New (DONE and tested – `apps/api/src/services/{pages,collections,media}.ts`, tests `test/integration/{pages,collections,media}.test.ts`):

- `GET /pages` → `[{ key, label, status: 'empty'|'draft'|'published', hasUnpublishedChanges, updatedAt, publishedAt }]`
- `GET /pages/:key` → `{ key, draft, live, status, updatedAt, publishedAt, version }` (`draft` is fully defaulted by the schema)
- `PUT /pages/:key` body = page data (+ optional `version` for optimistic locking) → saves the **draft**
- `POST /pages/:key/publish` (owner) → copies draft to live; `POST /pages/:key/discard` → draft := live
- `/profile` GET/PUT/publish keep working (aliases of key `profile`)
- `/events`, `/gallery`, `/videos`: `GET ?status=&q=&page=&limit=`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`,
  `POST /:id/publish`, `POST /:id/unpublish`; gallery also `POST /reorder {ids:[…]}`; videos also `POST /reorder`.
- `POST /media/video?name=&credit=` raw body `video/mp4|video/webm` → `{ id, url, kind:'video', bytes, name }`; `GET /media?kind=image|video`;
  `DELETE /media/:id` (refuses when in use).
- Public (Host-resolved tenant, `GET /api/v1/public/…`): `/site`, `/profile`, `/pages/:key`, `/posts`, `/posts/:slug`, `/promises`,
  `/events`, `/gallery` (+`/gallery/albums`), `/videos`, `/complaint-stats`, `/complaint-form`, plus the existing complaint POST/track endpoints.

Dashboard (`GET /dashboard`) response contract (role-filtered: send a section only if the role may see it – never send complaint data to editors):

```ts
{
  generatedAt: string,
  posts?:       { total, byStatus: Record<status, number>, last30d: number, recent: {id,title,status,eventDate,updatedAt}[] },
  promises?:    { total, byStatus: Record<status, number>, avgPct: number, late: {id,name,pct}[] },
  approvals?:   { total: number, items: {id,title,authorName,submittedAt}[] },            // needs posts.publish
  complaints?:  { total, open, byStatus: Record<status, number>, slaPct, resolvedLast30d, overdue, avgResolutionDays,
                  series: {date:'YYYY-MM-DD', received:number, solved:number}[],           // last 30 days, zero-filled
                  byCategory: {name,count}[], byUpazila: {name,count,open}[],
                  latest: {id,trackingId,category,upazila,status,createdAt}[] },            // never PII
  events?:      { upcoming: {id,title,date,place}[] },
  content?:     { gallery: number, videos: number, events: number, readinessPct: number,
                  pages: {key,label,ready:boolean}[] },                                     // "site readiness" checklist
  activity?:    { items: {action,label,actorName,at}[] },                                   // needs audit.view
}
```

## 3. Design language (admin panels)

Goal: a premium, calm, modern control room – think Linear/Stripe dashboards, but Bangla-first and in the Jonoprotinidhi brand.

- Brand tokens (keep): ink `#0C1117`, brass `#C7A35A` / deep brass `#9C7A2E`, paper `#F5F1EA`. Add a modern neutral scale, one info-blue, green, amber, red.
- Surfaces: warm light background, white cards, 14 px radius, 1 px border + soft layered shadow, 24 px gaps, generous padding.
- Typography: Noto Sans Bengali for UI (16 px base, comfortable line-height for Bangla), Noto Serif Bengali only for big page titles and KPI numbers.
- Sidebar: ink, grouped, **icons** (`lucide-react`), active item = brass tint pill + left bar, badges for counts, collapses to a drawer on mobile.
  Top bar: page breadcrumb/title, quick "site দেখুন ↗", notifications (pending approvals / new complaints), user menu.
- Dashboard: greeting + date, KPI cards (icon chip, big number, delta/sparkline), area chart (30 days received vs solved), donut (status),
  bar lists (category, upazila), lists (pending approvals, latest complaints without PII, upcoming events, recent activity), quick actions,
  "site readiness" progress. Empty states are helpful and actionable, loading uses skeletons, errors have retry.
- Charts are small hand-written SVG components (no chart dependency), accessible (`role="img"`, aria-label, visually-hidden data table).
- Forms: tall inputs (≥ 48 px), clear labels, inline hints/errors, sticky save bar, unsaved-changes guard where cheap.
- Responsive from 390 px; keyboard accessible; visible focus; `prefers-reduced-motion` respected.

## 4. Commands

```bash
npm run typecheck                       # all workspaces
npm test                                # all vitest suites
cd apps/api && npx vitest run <file>    # single API test file (mongodb-memory-server, no external DB)
cd apps/web-admin && npx vitest run     # admin component tests (jsdom)
npm run dev:api  /  npm run dev:admin   # already running: API :4000, admin http://localhost:5173, static demo :8765
cd apps/api && SEED_RESET=1 npm run seed --silent   # reseed the fictional tenant (wipes it first)
node scripts/bugs.mjs check
```

## 5. Looking at the UI

Playwright (Python, Edge) is installed. `e2e/smoke.py` shows how to log in (read `apps/api/.seed-credentials.local`, never print it) and
`e2e/run.sh` how the full suite runs. Screenshots go to a scratch folder, not into the repo. Login is password-only while `MFA_REQUIRED=false`;
`e2e/smoke.py` needs `MFA_REQUIRED=true` (temporarily change `.env`, restart the API, run, then restore) – only do this if you own the e2e step.

## 6. Ownership (parallel work – stay in your lane)

| Agent | Owns | Does not touch |
|---|---|---|
| Foundation (lead) | `packages/shared/src/content.ts`, API models/services/routes for pages, events, gallery, videos, video upload, public API, seed, API tests | – |
| Admin design | `apps/web-admin/src/{base.css,extra.css,components/**,api.ts…}` design system, shell, dashboard, restyle of existing tenant pages, `services/dashboard.ts` | new content editors, Super Admin pages |
| Content editors | `apps/web-admin/src/pages/tenant/content/**`, gallery/videos/events/media pages, route + nav additions | design-system files (only add `content.css`) |
| Super Admin | `apps/web-admin/src/pages/super/**`, `apps/api/src/routes/super.ts`, `services/tenants.ts` stats | tenant pages |
| Public site | `apps/web-public/**` | everything else |

## 7. API facts for UI builders (implemented)

- Create/update of events/gallery/videos accept `?publish=1`: honoured only when the caller has `content.publish` (owner); an editor's
  change to a published item flips it back to `draft`. Deleting a published item needs `content.publish` (editor gets 403).
- List responses: `{ items, total, page, totalPages, counts: { draft?: n, published?: n } }`, query `status`, `q`, `page`, `limit` (≤100).
- Event item: `{ id, title, date, time, place, note, status, updatedAt }`.
- Gallery item: `{ id, url, caption, credit, album, takenAt, order, featured, status, updatedAt }`; `POST /gallery/reorder {ids}` → 204.
- Video item: `{ id, title, description, date, kind: 'youtube'|'upload', youtubeId, mediaId, fileUrl, posterUrl, embedUrl, duration, order, featured, status }`.
  Create youtube: `{ title, kind:'youtube', youtube:'<any YouTube URL>' , ...}`; create upload: first `POST /media/video?name=` with the raw
  file (Content-Type video/mp4|video/webm, ≤150 MB default), then `{ title, kind:'upload', mediaId }`. `parseYouTubeId` is exported from
  `@jonoprotinidhi/shared` for instant client-side preview (thumbnail `https://i.ytimg.com/vi/<id>/hqdefault.jpg`, embed `https://www.youtube-nocookie.com/embed/<id>`).
- Pages: `GET /pages/:key` → `{ key, label, draft, live, status: 'empty'|'draft'|'published', hasUnpublishedChanges, version, updatedAt, publishedAt }`.
  `PUT /pages/:key` with the full page object (+ `version`) → same shape; 409 `VERSION_CONFLICT` on stale version; 400 with zod `details.fieldErrors`
  (paths are flattened to the top-level key only – show a general error plus field-level ones where the key matches).
  Page schemas and defaults: `PAGE_SCHEMAS` / `parsePage()` in `packages/shared/src/content.ts` – use them in forms for client-side validation.
  `profile` has `portrait: { url, credit }` (own upload or allow-listed host).
- Site config (`GET/PUT /site-config`, owner only): `{ slogan, accent: 'brass'|'river'|'maroon', banners: [{ url, caption, title?, subtitle?, ctaLabel?, ctaHref? }] (≤6),
  sections: [{ key, on }] }` with keys `stats, about, activities, office, promises, area, gallery, videos, events, cta` (order = display order).
- Public API (Host header selects the tenant; dev host `ndp3.jonoprotinidhi.localhost`): `/site`, `/pages/:key` → `{ key, published, data }` (data always fully
  defaulted), `/profile`, `/posts?category=&upazila=&page=&limit=`, `/posts/:slug`, `/promises`, `/events?limit=`, `/gallery?album=&featured=1&page=&limit=`,
  `/gallery/albums`, `/videos?featured=1`, `/complaint-stats`, `/complaint-form`, `POST /complaints`, complaint tracking (see `routes/public.ts`).
  Media files: `/api/v1/public/media/<tenantId>/<id>.<webp|mp4|webm>` (Range supported).
