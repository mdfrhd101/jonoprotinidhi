# Jonoprotinidhi (জনপ্রতিনিধি) — Portfolio and public-engagement platform for MPs and ministers
### Handoff document · last updated: 30 September 2026 (new admin design, full CMS, public website, GitHub)

> To continue this work on another PC or with another Claude, read this whole file first.
> Tell Claude: **"Read HANDOFF.md and continue from the 'Next steps' section. Talk to me in Bangla."**
> The name "Jonoprotinidhi" (জনপ্রতিনিধি) was chosen on 30 Sep 2026 (previously "Jonoshetu").

---

## 1. The project at a glance

A **portfolio website + CMS + citizen complaint box** for Bangladeshi Members of Parliament (MPs) and ministers. It is one
platform that we (the owner: the user's company) will offer to many MPs as a service.

- **Goal:** raise the MP's public image — through real work, transparency and accountability, never exaggeration.
- **Every MP site has:** profile (personal, education, profession, political life), responsibilities, regular activities,
  an account of election promises, constituency information, gallery, videos, complaint box, contact.
- **The home page has:** banners/posters, photos and videos of activities. The home page is full of content.

## 2. Business structure (the user's decision)

```
Super Admin (our company)
   │  creates / assigns MP accounts
   ▼
An admin panel is created automatically for every MP
   │
   ├─► The MP's public site: on our subdomain, or later on the MP's own custom domain
   └─► Super Admin can enter any MP's site and fix any content or problem
```

- MPs will not understand anything technical. Backend, hosting and domains stay with us.
- **One multi-tenant platform** (not one server per MP). Each MP's data is strictly separated (tenant isolation) so one
  MP's data never reaches another. MPs of rival parties may be on the same platform.
- Custom domains are added from the Super Admin panel (host → tenant routing).
- When Super Admin changes anything on an MP's site, it goes into the **audit log**: who, when, what.

### Roles
| Role | What they can do |
|---|---|
| Super Admin (us) | All MPs, all sites, domains, backups, fix any content |
| MP / minister (owner) | Own dashboard, approve and publish content |
| PR / content editor | Write posts and page content, upload photos/videos, send for approval |
| Complaint officer | See and resolve only the complaints of their own area |

## 3. Public website structure (final: separate pages)

> The user's explicit instruction: **no single-page site.** Every topic gets its own page. Content is detailed, not "very
> short". All of the MP's information is in one place. **The complaint box is not on the home page but on its own page.**

| Page | Route | Content |
|---|---|---|
| **Home** | `/` | Banner slideshow (MP photos, auto-advance every 3 s), name/title/slogan, work in numbers, recent activities, promise summary, constituency overview, gallery and video sliders, upcoming events, complaint call-to-action |
| **About** | `/about` | Personal facts, education, profession, political life, parliamentary role and numbers, priorities, awards, publications, portrait |
| **Biography** | `/biography` | Full timeline of education, profession and politics (the About page shows only a summary and a link) |
| **Activities** | `/activities` | All activities, filters by topic / upazila, pagination |
| **Activity detail** | `/activities/[slug]` | Full story (rich text), date, place, quote, photo album, related activities |
| **Election promises** | `/promises` | Promises by sector with budget, deadline, progress and updates; delays shown with their reason |
| **Constituency** | `/area` | Per-upazila population, voters (male/female/third gender), area, literacy, institutions, unions, offices |
| **Gallery** | `/gallery` | Photo slider with thumbnails, album chips, photo wall and lightbox |
| **Videos** | `/videos` | Video slider (video + title), grid; YouTube links and uploaded videos |
| **Complaint box** | `/complaint` | Submit, track, monthly statistics, process, FAQ |
| **Contact** | `/contact` | Offices (address, hours, phone), upcoming events, social links |

Every page has the header menu (home, about, activities, promises, constituency, gallery, videos, contact + a "complaint
box" button) and the footer (site links in two columns; photo credits folded behind one line "ছবির কৃতজ্ঞতা ও লাইসেন্স").

## 4. Complaint box: specification

```
Citizen fills in the form → (optional OTP) → tracking ID (e.g. NDP3-2026-01241), sent by SMS
  → admin inbox → assigned to a specific officer
  → new → in progress → solved → closed  (the citizen gets an SMS at every step)
  → after resolution the citizen can give feedback / a rating
```
- **Form fields:** topic (editable in the CMS), upazila → union/municipality (cascading; wards for urban seats),
  village/area, description (at least 20 characters), name (optional), mobile (`01[3-9]` + 8 digits, Bangla digits allowed).
  Photo attachments are specified but not built yet.
- **Anonymous option:** can be submitted without name and number; then no SMS is sent.
- **Privacy:**
  - Name and number are seen only by the assigned officer, who must state a purpose; every view is logged. They are
    encrypted in the database. Neither the MP nor Super Admin (not even acting as the site) can see them.
  - They may **not be used** for campaigning without separate consent.
  - A citizen's IP address and browser details are not stored in the audit log at all (BUG-2026-018/019).
- **Only statistics are public:** received, resolved, average time, by topic. No complaint is ever published verbatim.
- **Against spam:** Cloudflare Turnstile, rate limits (per visitor, also behind our site server), OTP.
- Government-service complaints mention GRS / 333.

## 5. CMS / admin panel features
- **Draft → review → publish:** nothing goes live without the MP's approval (posts, site pages, gallery, videos, events).
- Scheduled posts, version history, audit log.
- **Every text and image on every page of the public site is editable** (page keys `layout, home, profile, heroes, area,
  contact, complaint`), plus banners (image upload, title, subtitle, button), section order and on/off, colour, slogan.
- Gallery (multi-upload, albums, order, featured), videos (YouTube link or MP4/WebM upload up to 150 MB), events, media library.
- Promise tracker: project, budget, progress %, updates, reason for delay.
- **Complaint inbox:** assign, change status, internal notes, SMS to the citizen, CSV export without identity.
- **Dashboard:** KPIs, 30-day complaint chart, status donut, pending approvals, latest complaints (no identity), upcoming
  events, activity feed, site-readiness checklist. Visitor statistics are not built yet.
- The PR team must be able to post **from a phone in 2 minutes**. Without regular updates a site harms the MP's image.

## 6. Tech stack (✅ final, 30 Sep 2026: MERN)
The user chose MERN because their team knows it. Reasons and alternatives: `adr/0002-mern-stack.md`.

| Part | Decision |
|---|---|
| API | Node + Express + TypeScript + Mongoose, MongoDB (planned: Redis, BullMQ worker) |
| Admin panel (Super Admin + MP admin) | React 18 + Vite SPA, own design system (`apps/web-admin/DESIGN.md`) |
| Public site | **Next.js 14** (React 18) — server rendering for SEO and Facebook/WhatsApp link previews |
| Tenant separation | One database, `tenantId` on every document, fail-closed Mongoose plugin (`adr/0003`) |
| Complainant data | Name and number field-level encrypted, only the assigned officer sees them (`adr/0004`) |
| Photos / videos | Uploads re-encoded by `sharp` (WebP, EXIF removed); MP4/WebM streamed with Range support; YouTube via youtube-nocookie |
| Security | Planned: Cloudflare WAF/DDoS, Turnstile, custom hostnames; admin 2FA (TOTP); daily encrypted backups |
| SMS | Bangladeshi SMS gateway (OTP, complaint status); provider is swappable |
| Hosting | Planned: VPS + Docker Compose |

## 7. Design direction (from the user's feedback)

**v1 was rejected** because:
- Drawn / cartoon illustrations looked cheap.
- It was not grand or premium enough.
- The user disliked the green-red colours and the fonts.
- Everything was crowded onto one page.

**Direction agreed: "cinematic premium"**
- **Real photos:** full-bleed real photos, dark overlay, the name in a huge serif font. Hero photos of the MP sit in a
  frame beside the headline on wide screens (never covered by text) and as a bright band on phones.
- **Motion:** parallax, count-up numbers, sections fading in, slow Ken Burns zoom on banners.
- **Colours:**
  - Ink: `#0C1117` / `#111820` / `#18212B`
  - Ivory paper: `#F6F2EA` / `#EDE6DA`
  - The only accent is brass: `#C7A35A` / `#E2C88E` / `#8A6A28`
  - Dark and ivory sections alternate.
- **Fonts:**
  - Name and headings: **Noto Serif Bengali** (700–900)
  - Body: **Noto Sans Bengali**
  - Labels and numbers: Noto Sans Bengali condensed (`font-stretch:75%`)
- **Corners:** almost square on the public site (2 px radius), no round cards. The admin panel uses its own calmer system.
- **"Simple" means tidy, not plain.** All numbers in Bangla digits.

**Bugs found in the demos and their fixes** (keep in mind for new code):
1. `.stat span` also hit the span inside the number, so the number looked small and "বছর" big on its own line. Fix: `.stat>span`.
2. In the timeline, big years overlapped the text. Fix: the `ol` itself is the grid (`max-content | 1fr`) and each `li` uses `grid-template-columns: subgrid`.
3. No "scroll down" text in the hero.
4. No logo or monogram in the header (user feedback, 29 Sep): only the name (23 px) and below it the seat and title
   (15.5 px, brass). The line above the hero name, "সংসদ সদস্য · seat", is larger (21 px) and full-width.
5. The hero has no pause button and advances every 3 s (user request, 30 Sep).

## 8. Content and legal rules (must be followed)
- **Never put invented activities, news, statistics or quotes under a real MP's name** — not even labelled "sample".
  A screenshot that spreads becomes fake news.
- **A real MP's site:** only verifiable real facts and content from their office. It may not go online without the office's written consent.
- **Full-content demos:** always with a **fictional MP**, labelled "fictional".
- **Photos:** only licensed photos (Wikimedia Commons CC0 / CC BY / CC BY-SA, or the MP office's own photos). CC BY / BY-SA
  credits must stay available on the site (they sit behind the footer line "ছবির কৃতজ্ঞতা ও লাইসেন্স"). AI-generated photos
  of the fictional MP carry the visible label "AI-নির্মিত কাল্পনিক ছবি".
- **Party symbols or logos:** not without the MP office's permission.

## 9. What has been built so far

| Item | Where | Status |
|---|---|---|
| Demo v1 (single page, fictional MP, drawn images) | https://claude.ai/artifact/2W8jTzUv4ENSrh9Li8GuUq (private) | **Rejected** (design); the content structure was liked |
| Demo v2, Mirza Abbas (Dhaka-8) | `client-demo/mirza-abbas/index.html` | Cinematic design with only real Wikipedia facts. **Must not go online** and is **kept out of GitHub**. Can be extended when his office sends real activities and photos |
| Demo v3, single page, fictional MP | `client-demo/_archive/demo-mp-v3-single-page.html` | **Rejected** (single-page); archived for reference |
| **Demo v4, multi-page, fictional MP** | `client-demo/demo-mp/` | **Done** (29 Sep 2026), see below |
| **Admin panel demo (Super Admin + MP admin)** | `client-demo/admin/` | **Done** (30 Sep 2026), see below |
| **Real product: API + admin panel (CMS) + public website** | `apps/api`, `apps/web-admin`, `apps/web-public`, `packages/shared` | **Working** (30 Sep 2026), see "State of the real product" |
| **Bug register (FMEA/RPN)** | `bugs/` + `scripts/bugs.mjs` | 25 bugs; 24 fixed/verified, 1 triaged (P2, e2e flake); release gate passes |
| MP information form | `client-demo/MP_INFO.md` | Template for collecting a real client MP's information |
| Photos | `client-demo/photos/`, `apps/api/seed-assets/` | The fictional MP's three AI-generated photos (waving at parliament, community food-centre inauguration, food-aid distribution) + two demo video clips |

### Demo v4 (multi-page): details — ✅ done
Fictional MP: **Dr. Tahmina Noor (ড. তাহমিনা নূর), Nadipur-3 (নদীপুর-৩)** (upazilas Charkandi, Shalbagan, Notunhat; tracking IDs `NDP3-2026-`).

**Structure** (like a CMS: content separate from templates):
- `assets/data.js`: all content in `window.SITE` (this is what the real platform takes from the CMS).
  - 12 activities, 24 promises (9 done, 11 ongoing, 2 late, 2 not started), constituency statistics, videos, events, offices
  - `about.headline/milestones/story`, `complaintFaq`, `social`; `rev` (bumped when default banners change so older
    banner edits saved by the admin demo in localStorage are ignored)
- `assets/style.css`: v3 CSS + multi-page parts (page hero, breadcrumb, filters, article, lightbox, promise sectors, tables,
  gallery, FAQ) + framed hero slides (`.hs-framed`) + per-photo focal points (`img.pos` / `img.posM`).
- `assets/app.js`: renders header and footer; `body[data-page]` selects the page. Includes lightbox (keyboard, swipe),
  parallax, reveal, count-up, map, complaint form and tracking.
- 10 thin HTML pages: `index.html`, `about.html` (biography summary only), `biography.html` (full timeline; separate page
  at the user's request; "About" stays active in the menu; `#edu`, `#work`, `#politics` anchors), `activities.html`
  (topic, upazila and month filters; `?cat=`), `activity.html?id=a1..a12` (unknown id → "not found" page), `promises.html`,
  `area.html` (`?upz=`; comparison table), `gallery.html` (albums and videos; `#videos`), `complaint.html` (`#track` opens
  tracking; FAQ), `contact.html`. Asset links carry a cache-busting `?v=` query.

**Photos:**
- The hero shows the fictional MP's three AI-generated photos (labelled). The other 14 keys come from Wikimedia Commons
  (CC BY, CC BY-SA or public domain); credits are in the footer line and the lightbox.
- Party banners, known politicians and close-up faces were avoided.
- Some photos show real place names (Birampur health complex, Bahadurpur high school, Panam bridge); the footer says they are symbolic.
- The AI photos contain some text that does not fit the fictional MP ("ঢাকা লোকনাথ" on a banner, a government seal and a
  garbled name on the plaque) — regenerate them before showing a client.
- A broken image link falls back to the original file, then to a grey placeholder.

**Verification (29–30 Sep):** Playwright + Edge screenshots of every page at 1366/1440 px and 390 px; no JS errors; no
horizontal scroll on mobile. Tested: lightbox, filters, form validation, tracking ID on submit, tracking page, XSS escaping
of the tracking input, mobile menu, hero autoplay timing, stale-localStorage banners.

### Admin panel demo: details — ✅ done (30 Sep)
URL: `http://localhost:8765/admin/`. Either panel can be entered without login (demo).

**Files:**
- `admin/index.html`: panel picker, with a "reset all demo changes" button.
- `admin/super.html` + `assets/super.js`: Super Admin panel.
- `admin/mp.html` + `assets/mp.js`: MP admin panel; reads content from `../demo-mp/assets/data.js`.
- `assets/core.js`: shared parts (sidebar, hash router, dialog, toast, audit, single-colour column chart and heat ramp).
- `assets/platform.js`: fictional data (6 MPs, domains, backups, team, 24 sample complaints, visitors).
- `assets/admin.css`: same brand as the public demo.

**Super Admin demo:** dashboard (site health, "needs attention"), MP list, add MP (written office consent checkbox is
mandatory), MP detail (live/suspended with a reason), domains (CNAME/TXT, verification, SSL), audit log, backups (typing
"RESTORE"), 2FA/WAF status, platform team, "enter the site's admin" (`mp.html?as=super`, banner + audit as Super Admin).

**MP admin demo:** role switcher (MP, PR editor, complaint officer); dashboard with charts and a union heat map; mobile
post composer (PR sends for approval, MP publishes; rejection needs a reason; scheduling; versions); complaint inbox (split
view, assign, status, notes, SMS templates, CSV without identity; identity only for the assigned officer and logged);
promises (reason mandatory when late); banners and home page; settings; team and roles; audit log.

**Link to the public demo:** panels and public demo share localStorage (`jonoprotinidhi-demo-cms`, `-audit`, `-platform`,
`-cmp-admin`, `-tickets`, `-role`); `applyOverlay` at the top of `demo-mp/assets/app.js` merges it into the site (escaped).

### State of the real product (30 September 2026)

**Run** (MongoDB must be running: `net start MongoDB`):
```bash
npm install
cp apps/api/.env.example apps/api/.env   # then change the secrets
npm run seed                              # fictional tenant ndp3 with full demo content; logins in apps/api/.seed-credentials.local (git-ignored)
npm run dev:api                           # http://127.0.0.1:4000
npm run dev:admin                         # http://localhost:5173
npm run dev:public                        # http://localhost:3000
```
`SITE_SERVER_TOKEN` must have the same value in `apps/api/.env` and `apps/web-public/.env.local` (lets rate limits count
each visitor separately behind the site server; BUG-2026-020).

**Two-step login:** the local `.env` currently has `MFA_REQUIRED=false` (the user's instruction), so login is password-only.
The code is there, only switched off; the API refuses to start with `false` in production. Set it to `true` before any real
client; `e2e/run.sh` also needs `true`.

**Tests:** `npm test` (API 317, web-admin 133, web-public 26, shared 20), `npm run typecheck`, `bash e2e/run.sh` (real
browser), `python e2e/cms_smoke.py` (CMS, 40 steps), `python apps/web-public/e2e/public_smoke.py` (public site, 124
checks), `npm run bugs:check -- --gate`.

**What is built:**
- Multi-tenant API: fail-closed `tenantId` plugin, RBAC (owner / editor / officer / super_admin / support), login =
  password (argon2id) + TOTP (switchable) + recovery codes, rotating refresh tokens, CSRF, lockout, session list.
- Posts: draft → review → publish (owner approval), separate live copy, versions, scheduled publishing, audit with before/after.
  Body is rich text (Tiptap editor), sanitised on the server (`sanitize-html`) and again on display.
- Complaints: PII encrypted (AES-256-GCM envelope), only the assigned officer can reveal it with a purpose (logged); not even
  Super Admin acting as the site; CSV without PII.
- Site pages (`layout, home, profile, heroes, area, contact, complaint`) with draft/live copies, optimistic locking, publish
  and discard; events, gallery and videos as draft/published collections; media library (images → WebP with EXIF removed;
  MP4/WebM streamed with Range support; files in use cannot be deleted).
- Public API (tenant by Host; custom domain only after verification), OTP, Turnstile interface, SMS adapter with daily cap.
- Admin SPA: design system and `/_kit` catalogue, icon sidebar, dashboard, posts, complaints, promises, site pages editors,
  banners, gallery, videos, events, media library, settings, team, audit; Super Admin (dashboard, tenants, 5-step onboarding
  wizard, tenant detail, domains, audit with diff viewer, act-as).
- Public website (Next.js): every text and image from the CMS; hero, gallery and video sliders; complaint form through a
  same-origin proxy; strict CSP with nonce.
- Isolation crawler test: every admin route × 3 roles → 404 on another tenant's ids; coverage guard fails when a new route is missing.

**Not built yet:** WebAuthn, Redis/BullMQ (in-memory for now), backup/restore, staff management, visitor statistics, real
SMS gateway, photo attachments on complaints, focal-point field for banner/hero images, a map on the constituency page,
CI, production hosting. `docs/07-TASKS.md` starts with a status summary; `docs/09-BUILD-BRIEF.md` describes the content
model and API for the CMS.

**Bug tracking:** `bugs/README.md` (formula RPN = severity × occurrence × detectability), `node scripts/bugs.mjs
add|status|check --gate`. Release gate: no release while any P0/P1 is open.

**GitHub:** https://github.com/mdfrhd101/jonoprotinidhi (branch `main`), made **public** on 30 Sep at the user's request.
`.env` files, the credentials file, uploads, `.claude/` and `client-demo/mirza-abbas/` (a real politician's name) are kept
out on purpose. Commit messages must not contain any Claude/AI co-author line (user request).

### How to view the static demo
No build needed; plain static files. Photos load from Wikimedia, so internet is needed.
```bash
python -m http.server 8765 --bind 127.0.0.1 --directory "D:/AI/Jonoprotinidhi/client-demo"
```
Then open `http://localhost:8765/demo-mp/` (public demo) and `http://localhost:8765/admin/` (admin demo).

## 10. Next steps (in this order)
1. ~~Finish demo v4~~ ✅ (29 Sep 2026).
2. ~~Super Admin panel demo~~ ✅ (30 Sep).
3. ~~MP admin panel demo~~ ✅ (30 Sep). The fictional MP's photos arrived as AI-generated images (in use, labelled).
4. ~~Handoff kit for other developers~~ ✅ (30 Sep 2026): `CLAUDE.md`, `KICKOFF_PROMPT.md`, `docs/00-START-HERE.md` to
   `docs/09-BUILD-BRIEF.md`, `adr/0001..0008`, and `HANDOFF_BUNDLE.md` (everything in one file for a claude.ai Project;
   rebuild after doc changes with `python scripts/build-bundle.py`).
5. ~~Real product: API + admin panel~~ ✅ (30 Sep 2026).
6. ~~Media, public site, CMS for every page, gallery/videos/events, GitHub~~ ✅ (30 Sep 2026). User feedback pending.
7. **Next:** (a) CI (GitHub Actions: typecheck + test + `bugs:check --gate`), (b) focal-point field for banners/photos,
   (c) Redis/BullMQ, (d) backup/restore and staff management, (e) real SMS gateway and hosting (ask the user),
   (f) regenerate the AI photos without the wrong text ("ঢাকা লোকনাথ", the plaque seal), (g) BUG-2026-014 (e2e flake),
   (h) remove the two test tenants left in the dev database (`sa-e2e-*`) with a fresh `SEED_RESET=1 npm run seed`.

## 11. Decisions
**Made** (30 Sep 2026, see `adr/`):
- Project name: **Jonoprotinidhi (জনপ্রতিনিধি)** — renamed from "Jonoshetu (জনসেতু)" on 30 Sep 2026 at the user's request (code, UI, docs, packages `@jonoprotinidhi/*`, dev domain `*.jonoprotinidhi.localhost`, database `jonoprotinidhi_dev`, GitHub repo). The local folder is still `D:\AI\Jonoshetu`.
- Tech stack: **MERN** (public site Next.js)
- OTP for complaints: **optional**; an MP can make it mandatory in their settings. Anonymous complaints always work.
- Other developers: **both Claude Code and claude.ai**, hence `CLAUDE.md` in the repo and `HANDOFF_BUNDLE.md` for claude.ai.
- Two-step login switched off locally for now (user request); must be on for real clients.
- Repository public on GitHub (user request).

**Still open** (ask the user, do not assume):
- Policy on party colours or symbols
- Who the first real client is, and their office's written consent and content
- Hosting and pricing
- Which Bangladeshi SMS gateway
- Final production domain
- A lawyer's check of the current Bangladeshi data-protection and cyber laws (`docs/08-SECURITY.md` §9, task T6.7)
- Whether to add a licence file to the public repository

## 12. Working together with a partner or other developers
- Two different Claude accounts cannot join one live session.
- **Approach:**
  1. The project lives in the GitHub repo above.
  2. Everyone clones it and works with their own Claude. Reading `CLAUDE.md` and `HANDOFF.md` gives every Claude the same context.
  3. Everyone works on their own branch, then opens a pull request for review and merge.
  4. Who is doing what is written down in `HANDOFF.md`.
- With claude.ai chat, upload this file (or `HANDOFF_BUNDLE.md`) to a Project.

## 13. Working style (the user's preferences)
- Talk to the user **in Bangla**; technical terms may stay in English. This document is in English (user request, 30 Sep).
- The user wants complete, rich content and a premium look; short or cartoonish work is not appreciated.
- Show results with pictures or screenshots after the work; if something was not verified, say so clearly.
- The user may give short deadlines ("finish in 5 minutes"): then do the essentials, commit, and state exactly what was skipped.
- On this device (Surface, ARM64) work happens in `D:\AI\`. Another project (Vocabulary Academy) is in a separate repo and must not be mixed with this one.
