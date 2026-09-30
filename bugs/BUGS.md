# Bug register (generated, do not edit)

Source of truth: `bugs/register.json`. Formula, lifecycle and rules: `bugs/README.md`. Regenerate with `node scripts/bugs.mjs report`.

## Summary

| Metric | Value |
|---|---|
| Total bugs | 25 |
| Open | 2 (P0: 0, P1: 1, P2: 1, P3: 0) |
| Sum of open RPN (risk load) | 60 |
| Mean days report → fix | 0.0 |
| Defect escape rate (found in staging/production) | 0% |
| Found by phase | unit-test: 6, integration-test: 4, dev: 3, e2e-test: 8, review: 4 |

## Open

| ID | Prio | RPN (S×O×D) | Status | Category | Title | Module | Found in |
|---|---|---|---|---|---|---|---|
| BUG-2026-020 | P1 | 48 (4×4×3) | new | reliability | API: public per-IP rate limit (120/min) throttles the whole server-rendered public site; media files share the same bucket | api/routes/public | e2e-test |
| BUG-2026-014 | P2 | 12 (2×2×3) | triaged | reliability | E2E: officer login stuck once after fresh dev-server start (not reproduced in 3 later runs) | e2e/smoke | e2e-test |

## Fixed / closed / other

| ID | Prio | RPN (S×O×D) | Status | Category | Title | Module | Found in |
|---|---|---|---|---|---|---|---|
| BUG-2026-018 | P0 | 80 (4×4×5) | verified | privacy | Super Admin audit API returned the citizen's IP address and browser user agent for public complaint submissions (and officers' free-text reasons for identity views) | api/routes/super | review |
| BUG-2026-019 | P0 | 80 (4×4×5) | verified | privacy | Tenant audit API returns the complainant's IP address and user agent to the owner (complaint.create rows) | api/routes/admin | review |
| BUG-2026-003 | P0 | 60 (4×3×5) | verified | data-integrity | Soft-delete aggregate filter appended after $group, deleted rows still counted | api/plugins/softDelete | unit-test |
| BUG-2026-007 | P0 | 60 (4×3×5) | verified | security | RATE_LIMIT_DISABLED=false still disabled rate limiting | api/config | dev |
| BUG-2026-021 | P0 | 60 (5×3×4) | verified | data-integrity | Saving the profile from the old Site page wiped portrait, milestones, education and every other profile field (PUT /profile replaced the whole draft with 3 fields) | web-admin/pages/tenant/Site.tsx + api/routes/admin.ts PUT /profile | review |
| BUG-2026-005 | P1 | 48 (4×3×4) | verified | security | Tenant SMS cap overrode the platform cap, so the SMS cost limit did nothing | api/lib/sms | integration-test |
| BUG-2026-010 | P1 | 40 (4×5×2) | verified | functional | Opening a second complaint navigated to a nested broken URL and bounced to the home page | web-admin/pages/Complaints | e2e-test |
| BUG-2026-023 | P1 | 40 (4×5×2) | fixed | functional | Public site: server-side API calls lost the tenant Host header (Node fetch overrides Host), production tenant resolution would fail | web-public/lib/api | dev |
| BUG-2026-002 | P1 | 36 (3×4×3) | verified | tenant-isolation | Tenant context lost when a lazy Mongoose Query is returned from the tenant runner | api/context | unit-test |
| BUG-2026-009 | P1 | 36 (3×4×3) | verified | reliability | Auth rate limit was per IP (10 per 15 min): offices and mobile-carrier users get locked out | api/routes/auth | e2e-test |
| BUG-2026-006 | P1 | 32 (4×2×4) | verified | security | Unverified custom domain served the MP's site | api/services/tenants | integration-test |
| BUG-2026-004 | P1 | 30 (3×5×2) | verified | functional | PATCH /posts/:id demanded a title on every partial update | api/services/posts | integration-test |
| BUG-2026-013 | P1 | 30 (3×5×2) | verified | functional | Save draft with only a title failed: empty form fields were sent as empty strings | web-admin/pages/Posts | unit-test |
| BUG-2026-025 | P2 | 27 (3×3×3) | verified | functional | Photo picker's 'earlier uploads' library also listed uploaded videos (a .webm could be chosen as an image) | web-admin/components/ImagePicker.tsx | review |
| BUG-2026-011 | P2 | 24 (2×4×3) | verified | privacy | Dashboard API sent complaint statistics to editors (and content data to officers) | api/routes/admin | e2e-test |
| BUG-2026-016 | P2 | 20 (2×5×2) | verified | ui | Public site API showed the seat number with an English digit (নদীপুর-3) | api/services/site | integration-test |
| BUG-2026-008 | P2 | 18 (3×3×2) | verified | validation | Valid Wikimedia image URLs with Bangla file names were rejected (500 char limit) | shared/schemas | dev |
| BUG-2026-024 | P2 | 18 (3×2×3) | verified | functional | Banners page lost edits typed in quick succession (state updates built from a stale copy of the form) | web-admin/pages/tenant/Site.tsx | e2e-test |
| BUG-2026-017 | P2 | 16 (2×2×4) | fixed | security | Public site: sanitiser produced mismatched </span> closing tags after an unsafe link in a post body | web-public/lib/sanitize | unit-test |
| BUG-2026-022 | P2 | 16 (2×4×2) | verified | ui | Tabs variant=pill draws a stray status-pill dot before the tab list (class 'tabs pill' also matches .pill::before) | web-admin/components/navigation.tsx Tabs + base.css .pill | e2e-test |
| BUG-2026-001 | P2 | 15 (3×5×1) | verified | reliability | SiteConfig/Profile tenantId index defined twice, model init fails | api/plugins/tenantScoped | unit-test |
| BUG-2026-015 | P3 | 10 (2×5×1) | verified | ui | Form inputs without a type attribute were unstyled (about 21 px high, no padding): the CSS only matched typed inputs | web-admin/extra.css | e2e-test |
| BUG-2026-012 | P3 | 6 (1×3×2) | verified | ui | Time of day: 3:30 pm was shown as দুপুর instead of বিকেল | web-admin/format | unit-test |

## Details

### BUG-2026-018: Super Admin audit API returned the citizen's IP address and browser user agent for public complaint submissions (and officers' free-text reasons for identity views)
- **Priority P0**, RPN 80 (severity 4, occurrence 4, detectability 5), status **verified**, category privacy, found in review on 2026-09-30
- Module: api/routes/super
- **What:** GET /api/v1/super/audit returned raw AuditLog rows. audit() stores the request IP and user agent from the request context; for complaint.create written by the public complaint endpoint that is the complainant's IP and UA, and complaint.pii_view rows carry the officer's free-text purpose. Super admin and support must never see complainant identity (ADR-0004, docs/08).
- **How to reproduce:** Submit a complaint on the public site, then GET /api/v1/super/audit as super admin or support: the complaint.create row has ip and userAgent.
- **Root cause:** The route returned raw AuditLog documents (.lean()) and audit() records the request IP/UA even for unauthenticated public submissions.
- **Fix:** GET /super/audit now maps rows through auditForStaff(): user agent never sent; complaint.* rows lose ip and reason; ip only for authenticated admin actions and only to super_admin (support never); tenant names joined. Regression test in apps/api/test/integration/super-dashboard.test.ts. (2026-09-30)
- **Regression tests:** apps/api/test/integration/super-dashboard.test.ts

### BUG-2026-019: Tenant audit API returns the complainant's IP address and user agent to the owner (complaint.create rows)
- **Priority P0**, RPN 80 (severity 4, occurrence 4, detectability 5), status **verified**, category privacy, found in review on 2026-09-30
- Module: api/routes/admin
- **What:** GET /api/v1/admin/tenants/:id/audit (audit.view: owner, act-as super admin, support) returns raw AuditLog rows including ip and userAgent. complaint.create rows are written by the public complaint endpoint, so ip/userAgent are the citizen's. Owners and platform staff never have complaints.pii_view. Root-cause options: audit() should not store ip/UA when there is no authenticated actor, and/or the tenant route should project them out like auditForStaff() in routes/super.ts. Not fixed by the Super Admin agent (admin.ts / lib/audit.ts are outside its lane).
- **How to reproduce:** Submit a complaint on the public site; GET /admin/tenants/:id/audit as the owner: the complaint.create row carries ip and userAgent.
- **Root cause:** audit() copied request IP/UA for every action including public submissions, and the tenant audit route returned raw rows
- **Fix:** lib/audit.ts no longer stores IP/user agent for unauthenticated (citizen) actions; tenant GET /audit selects out ip/userAgent and drops reasons on complaint.* rows; regression test in complaints.test.ts (mutation-checked) (2026-09-30)
- **Regression tests:** apps/api/test/integration/complaints.test.ts

### BUG-2026-003: Soft-delete aggregate filter appended after $group, deleted rows still counted
- **Priority P0**, RPN 60 (severity 4, occurrence 3, detectability 5), status **verified**, category data-integrity, found in unit-test on 2026-09-30 by dev (Claude)
- Module: api/plugins/softDelete
- **What:** Aggregations (dashboard counts, statistics) included soft-deleted documents. Wrong numbers with no error message, so nobody would notice.
- **How to reproduce:** Soft-delete one of two posts, then aggregate with a $group count: returns 2 instead of 1.
- **Root cause:** The aggregate hook used pipeline.push, so the isDeleted filter ran after earlier stages such as $group instead of before them.
- **Fix:** aggregate hook now unshifts the $match so it runs first (2026-09-30)
- **Regression tests:** apps/api/test/unit/plugins.test.ts

### BUG-2026-007: RATE_LIMIT_DISABLED=false still disabled rate limiting
- **Priority P0**, RPN 60 (severity 4, occurrence 3, detectability 5), status **verified**, category security, found in dev on 2026-09-30 by dev (Claude)
- Module: api/config
- **What:** An operator who writes RATE_LIMIT_DISABLED=false (to be explicit) would silently switch OFF all rate limits, leaving login, OTP and complaint endpoints open to brute force and SMS-cost abuse, with no error or log line.
- **How to reproduce:** loadConfig({ ...valid, RATE_LIMIT_DISABLED: 'false' }).RATE_LIMIT_DISABLED === true
- **Root cause:** z.coerce.boolean() converts any non-empty string, including 'false', to true.
- **Fix:** flag parsed with an explicit enum (true/false/1/0) and unknown values are rejected at boot (2026-09-30)
- **Regression tests:** apps/api/test/unit/lib.test.ts

### BUG-2026-021: Saving the profile from the old Site page wiped portrait, milestones, education and every other profile field (PUT /profile replaced the whole draft with 3 fields)
- **Priority P0**, RPN 60 (severity 5, occurrence 3, detectability 4), status **verified**, category data-integrity, found in review on 2026-09-30
- Module: web-admin/pages/tenant/Site.tsx + api/routes/admin.ts PUT /profile
- **What:** The legacy ProfileCard on the Site page sent only {headline, intro, story} to PUT /profile. The alias forwards to PageService.put, which parses with defaults and replaces the draft, so portrait, milestones, committees, education, profession, politics, awards, works, parliament and priorities were silently emptied; the owner's next publish would put a gutted biography of the MP on the public site.
- **How to reproduce:** Open Site page as owner, edit the profile headline, save: GET /pages/profile shows empty milestones/portrait.
- **Root cause:** The legacy alias forwarded a partial body to a replace-the-whole-draft service, and the old card only sent three fields.
- **Fix:** PUT /profile now merges the partial body onto the current draft; the Site page no longer has a profile card (profile has its own full editor at site-pages/profile). Regression: apps/api/test/integration/pages.test.ts + web-admin content.test.tsx (BUG-2026-021). (2026-09-30)
- **Regression tests:** apps/api/test/integration/pages.test.ts, apps/web-admin/src/pages/tenant/content/content.test.tsx

### BUG-2026-005: Tenant SMS cap overrode the platform cap, so the SMS cost limit did nothing
- **Priority P1**, RPN 48 (severity 4, occurrence 3, detectability 4), status **verified**, category security, found in integration-test on 2026-09-30 by dev (Claude)
- Module: api/lib/sms · Requirement: MIS-03
- **What:** A bot flooding the complaint form could send up to the tenant limit (500/day) regardless of the platform cap, so an SMS cost-exhaustion attack (MIS-03) was not contained by the platform-level control.
- **How to reproduce:** Set DAILY_SMS_CAP=3, submit 6 complaints: all 6 acknowledgement SMS were sent.
- **Root cause:** SmsService used p.cap ?? defaultCap; the caller always passed the tenant setting (default 500), so the platform-wide DAILY_SMS_CAP was never applied.
- **Fix:** effective cap = min(tenant cap, platform cap) (2026-09-30)
- **Regression tests:** apps/api/test/integration/complaints.test.ts

### BUG-2026-020: API: public per-IP rate limit (120/min) throttles the whole server-rendered public site; media files share the same bucket
- **Priority P1**, RPN 48 (severity 4, occurrence 4, detectability 3), status **new**, category reliability, found in e2e-test on 2026-09-30
- Module: api/routes/public
- **What:** routes/public.ts applies limit('public', byIp) to every public read and to /media files. The Next.js public site renders on the server, so every visitor's page view becomes ~6-10 API calls from the site server. Unless every hop forwards X-Forwarded-For correctly (trust proxy = 1 hop only), all visitors share one 120/min bucket; even per visitor, ~12 page views/min (plus every uploaded image/video file request) trips it and pages turn into 500s. Seen in the public-site smoke test: pages failed with RATE_LIMITED after ~15 page loads. The site now caches reads for 5 s and forwards the visitor IP, which reduces but does not remove the risk.
- **How to reproduce:** Load 15 pages of the public site within a minute from one IP (python apps/web-public/e2e/public_smoke.py) -> GET /api/v1/public/* returns 429, site shows the error page. Suggested fix: separate (much higher) limit or a signed server-to-server key for the site renderer, and a separate limiter for /media files.

### BUG-2026-010: Opening a second complaint navigated to a nested broken URL and bounced to the home page
- **Priority P1**, RPN 40 (severity 4, occurrence 5, detectability 2), status **verified**, category functional, found in e2e-test on 2026-09-30 by dev (Claude)
- Module: web-admin/pages/Complaints
- **What:** In the officer/owner inbox the first click worked but every following click on another complaint left the inbox, so complaints could effectively be handled one per page load.
- **How to reproduce:** Open the inbox, click a complaint, then click a different one.
- **Root cause:** nav(c.id) is route-relative; from complaints/:cid it appended the new id to the current path (/complaints/<id1>/<id2>), which matches no route and fell through to the catch-all redirect.
- **Fix:** single splat route complaints/* and absolute navigation to /t/<tenant>/complaints/<id> (2026-09-30)
- **Regression tests:** apps/web-admin/src/pages/pages.test.tsx

### BUG-2026-023: Public site: server-side API calls lost the tenant Host header (Node fetch overrides Host), production tenant resolution would fail
- **Priority P1**, RPN 40 (severity 4, occurrence 5, detectability 2), status **fixed**, category functional, found in dev on 2026-09-30
- Module: web-public/lib/api
- **What:** Node's global fetch (undici) replaces a custom Host header with the URL host. The API resolves the tenant by Host in production (X-Forwarded-Host is honoured only outside production), so every public page would 404 in production while working in development.
- **How to reproduce:** fetch('http://127.0.0.1:4000/...', {headers:{host:'ndp3.jonoshetu.com'}}) -> API sees host 127.0.0.1:4000
- **Root cause:** undici fetch treats Host as a forbidden/overridden header
- **Fix:** server-to-API calls use node:http(s) (src/lib/http.ts) which keeps the Host header; regression test in apps/web-public/test/helpers.test.ts (2026-09-30)

### BUG-2026-002: Tenant context lost when a lazy Mongoose Query is returned from the tenant runner
- **Priority P1**, RPN 36 (severity 3, occurrence 4, detectability 3), status **verified**, category tenant-isolation, found in unit-test on 2026-09-30 by dev (Claude)
- Module: api/context
- **What:** runInTenant(A, () => Post.find()) threw 'no tenant context' because the query ran after the context ended. Any job or script written the same way would fail, and a future 'fix' might be tempted to loosen the fail-closed check.
- **How to reproduce:** Call runInTenant with a callback that returns a Query without awaiting it.
- **Root cause:** runInTenant returned the un-awaited Query. Mongoose queries execute on await, after AsyncLocalStorage.run() has exited, so the tenant plugin saw no context. The plugin correctly failed closed (no data leaked); the helper was the defect.
- **Fix:** runInTenant/runWithCtx are async and await the callback inside the context; documented in docs/05 (2026-09-30)
- **Regression tests:** apps/api/test/unit/plugins.test.ts

### BUG-2026-009: Auth rate limit was per IP (10 per 15 min): offices and mobile-carrier users get locked out
- **Priority P1**, RPN 36 (severity 3, occurrence 4, detectability 3), status **verified**, category reliability, found in e2e-test on 2026-09-30 by dev (Claude)
- Module: api/routes/auth
- **What:** The officer's login failed with 429 during the end-to-end run. In production, staff on a shared IP could not sign in, while the 2FA endpoints had no per-account limit at all.
- **How to reproduce:** Log in 4 different staff accounts from one IP within 15 minutes.
- **Root cause:** The auth tier limited 10 requests per 15 minutes per IP, and each login is 3 requests (password, enrol, code). Three colleagues behind one office or CGNAT address exhausted it, while brute-force protection should be keyed to the account.
- **Fix:** IP tier raised to 60/15min; new per-account tier (10/15min) on login and on the MFA endpoints keyed by the verified mfa-token subject (2026-09-30)
- **Regression tests:** apps/api/test/integration/auth.test.ts

### BUG-2026-006: Unverified custom domain served the MP's site
- **Priority P1**, RPN 32 (severity 4, occurrence 2, detectability 4), status **verified**, category security, found in integration-test on 2026-09-30 by dev (Claude)
- Module: api/services/tenants · Requirement: FR-SA-04
- **What:** Anyone who pointed a domain at the platform after a super admin registered it (or before the owner proved control) would get the MP's public site served under their own address, enabling impersonation or phishing with real MP content.
- **How to reproduce:** Add a custom domain via POST /super/tenants/:id/domains; GET /public/site with that Host returns 200 without any DNS verification.
- **Root cause:** resolveHost looked up the Domain row only; dnsStatus was never checked, so a custom domain was served as soon as it was added.
- **Fix:** resolveHost returns 404 for a custom domain until dnsStatus is active (verified TXT) (2026-09-30)
- **Regression tests:** apps/api/test/integration/super.test.ts

### BUG-2026-004: PATCH /posts/:id demanded a title on every partial update
- **Priority P1**, RPN 30 (severity 3, occurrence 5, detectability 2), status **verified**, category functional, found in integration-test on 2026-09-30 by dev (Claude)
- Module: api/services/posts
- **What:** Editing only the summary (or any single field) of a post returned 400 VALIDATION_FAILED. The admin form would not be able to autosave partial changes.
- **How to reproduce:** PATCH /admin/tenants/:id/posts/:postId with body { summary: '...' } and no title.
- **Root cause:** update() reused the create/draft schema where title is required, so a partial body such as { summary } failed validation with 400.
- **Fix:** new postPatchSchema (all fields optional, title min 3 if present) used by PostService.update (2026-09-30)
- **Regression tests:** apps/api/test/integration/posts.test.ts, packages/shared/test/shared.test.ts

### BUG-2026-013: Save draft with only a title failed: empty form fields were sent as empty strings
- **Priority P1**, RPN 30 (severity 3, occurrence 5, detectability 2), status **verified**, category functional, found in unit-test on 2026-09-30 by dev (Claude)
- Module: web-admin/pages/Posts
- **What:** PR staff could not save a quick draft: the form showed confusing errors for fields they had not touched.
- **How to reproduce:** Open New post, type only a title, press Save draft.
- **Root cause:** The editor sent every field, including untouched ones as '', and the shared schema rejects summary '' (min 10). The documented rule 'a draft needs only a title' could not be used from the UI.
- **Fix:** empty fields are omitted from the payload (body/quote/upazila/place stay clearable when editing) (2026-09-30)
- **Regression tests:** apps/web-admin/src/pages/pages.test.tsx

### BUG-2026-025: Photo picker's 'earlier uploads' library also listed uploaded videos (a .webm could be chosen as an image)
- **Priority P2**, RPN 27 (severity 3, occurrence 3, detectability 3), status **verified**, category functional, found in review on 2026-09-30
- Module: web-admin/components/ImagePicker.tsx
- **What:** GET /media without kind returned images and videos; videos showed as broken images and could be set as a post/portrait/banner photo.
- **How to reproduce:** Upload a video, open any photo picker, click 'আগে আপলোড করা ছবি থেকে'.
- **Root cause:** The media library gained videos; the picker's query predates that.
- **Fix:** ImagePicker library requests /media?kind=image; regression in components/media.test.tsx. (2026-09-30)
- **Regression tests:** apps/web-admin/src/components/media.test.tsx

### BUG-2026-011: Dashboard API sent complaint statistics to editors (and content data to officers)
- **Priority P2**, RPN 24 (severity 2, occurrence 4, detectability 3), status **verified**, category privacy, found in e2e-test on 2026-09-30 by dev (Claude)
- Module: api/routes/admin · Requirement: FR-CMS-10
- **What:** The PR editor's dashboard showed open-complaint counts and SLA although the role matrix gives editors no access to complaints. Aggregates only (no identities), but it breaks least privilege and the documented role table.
- **How to reproduce:** Log in as editor, open the dashboard: complaint cards are present.
- **Root cause:** GET /dashboard returned the whole aggregate for any role holding dashboard.view; only officers were trimmed. The PR editor has no complaint permissions, but received the numbers, and the UI only hid nothing.
- **Fix:** dashboard response is built per permission (content vs complaint sections); UI hides cards the role cannot use (2026-09-30)
- **Regression tests:** apps/api/test/integration/content.test.ts, apps/web-admin/src/pages/pages.test.tsx

### BUG-2026-016: Public site API showed the seat number with an English digit (নদীপুর-3)
- **Priority P2**, RPN 20 (severity 2, occurrence 5, detectability 2), status **verified**, category ui, found in integration-test on 2026-09-30
- Module: api/services/site
- **What:** publicSite built the seat label from seatNumber without toBn, so every public page header would show নদীপুর-3.
- **How to reproduce:** GET /api/v1/public/site with the demo host; mp.seat
- **Root cause:** number interpolated directly into a Bangla string
- **Fix:** toBn(seatNumber) in services/site.ts publicSite; regression assertion in content.test.ts (2026-09-30)
- **Regression tests:** apps/api/test/integration/content.test.ts

### BUG-2026-008: Valid Wikimedia image URLs with Bangla file names were rejected (500 char limit)
- **Priority P2**, RPN 18 (severity 3, occurrence 3, detectability 2), status **verified**, category validation, found in dev on 2026-09-30 by dev (Claude)
- Module: shared/schemas
- **What:** Posts and banners using real licensed photos with Bangla file names failed validation, so the seed (and real editors) could not attach them.
- **How to reproduce:** Create a post with the hero image URL from client-demo data.js.
- **Root cause:** media and banner url max(500); percent-encoding expands each Bangla character to 9 characters, so realistic URLs are longer.
- **Fix:** url limit raised to 1500 in mediaRefSchema and siteConfigSchema (2026-09-30)
- **Regression tests:** apps/api/test/integration/posts.test.ts

### BUG-2026-024: Banners page lost edits typed in quick succession (state updates built from a stale copy of the form)
- **Priority P2**, RPN 18 (severity 3, occurrence 2, detectability 3), status **verified**, category functional, found in e2e-test on 2026-09-30
- Module: web-admin/pages/tenant/Site.tsx
- **What:** setF({...f, ...}) used the form object captured at render time; two edits before a re-render (autofill, fast typing, a finished upload plus an edit) overwrote each other, so a new banner was saved without its title and caption.
- **How to reproduce:** e2e/cms_smoke.py banner step: fill title and caption right after adding a banner, save: title missing on GET /public/site.
- **Root cause:** State built from the render-time copy of the form.
- **Fix:** Site.tsx updates the form only through functional state updates (up(fn)); regression test in content.test.tsx. (2026-09-30)
- **Regression tests:** apps/web-admin/src/pages/tenant/content/content.test.tsx

### BUG-2026-017: Public site: sanitiser produced mismatched </span> closing tags after an unsafe link in a post body
- **Priority P2**, RPN 16 (severity 2, occurrence 2, detectability 4), status **fixed**, category security, found in unit-test on 2026-09-30
- Module: web-public/lib/sanitize
- **What:** sanitize-html transformTags renamed an unsafe <a> to <span>; the closing tag of the NEXT safe link was then emitted as </span>, giving malformed HTML (<a href=...>ok</span>). Browsers repair it, but link text could swallow following content.
- **How to reproduce:** sanitizeBody('<p><a href="javascript:x">bad</a> <a href="https://ok.example">ok</a></p>')
- **Root cause:** sanitize-html closes function-renamed tags inconsistently
- **Fix:** unsafe links keep the <a> tag name with no attributes (inert); regression test in apps/web-public/test/helpers.test.ts (2026-09-30)

### BUG-2026-022: Tabs variant=pill draws a stray status-pill dot before the tab list (class 'tabs pill' also matches .pill::before)
- **Priority P2**, RPN 16 (severity 2, occurrence 4, detectability 2), status **verified**, category ui, found in e2e-test on 2026-09-30
- Module: web-admin/components/navigation.tsx Tabs + base.css .pill
- **What:** Tabs with variant pill render class 'tabs pill'; the status pill rule .pill::before adds a 6px dot left of the tabs.
- **How to reproduce:** Open /media or /events: a dot appears before the tab group.
- **Root cause:** Variant class name 'pill' collides with the status-pill class.
- **Fix:** content.css: .tabs.pill::before{content:none}; regression in src/styles.test.ts. The design-system owner may move the rule into ds.css or rename the variant class. (2026-09-30)
- **Regression tests:** apps/web-admin/src/styles.test.ts

### BUG-2026-001: SiteConfig/Profile tenantId index defined twice, model init fails
- **Priority P2**, RPN 15 (severity 3, occurrence 5, detectability 1), status **verified**, category reliability, found in unit-test on 2026-09-30 by dev (Claude)
- Module: api/plugins/tenantScoped
- **What:** Creating indexes for SiteConfig and Profile threw 'An existing index has the same name as the requested index', so the app could not start against a fresh database.
- **How to reproduce:** Run the plugin unit tests on an empty database; the suite failed in Model.init().
- **Root cause:** tenantScoped plugin adds tenantId with index:true and the singleton models also declared a unique { tenantId: 1 } index; both get the auto name tenantId_1
- **Fix:** tenantScoped(schema, { index: false }) for singleton models; SiteConfig and Profile use it (2026-09-30)
- **Regression tests:** apps/api/test/unit/plugins.test.ts

### BUG-2026-014: E2E: officer login stuck once after fresh dev-server start (not reproduced in 3 later runs)
- **Priority P2**, RPN 12 (severity 2, occurrence 2, detectability 3), status **triaged**, category reliability, found in e2e-test on 2026-09-30
- Module: e2e/smoke
- **What:** During the first e2e run right after the dev servers started, the officer's TOTP enrolment did not reach the dashboard within 15 s. Later runs (and an isolated debug run) passed. Suspects: cold tsx/vite start, TOTP step boundary, dev rate limit. e2e/smoke.py now prints the URL, network errors and alerts when a login gets stuck.
- **How to reproduce:** Start dev:api and dev:admin, immediately run bash e2e/run.sh

### BUG-2026-015: Form inputs without a type attribute were unstyled (about 21 px high, no padding): the CSS only matched typed inputs
- **Priority P3**, RPN 10 (severity 2, occurrence 5, detectability 1), status **verified**, category ui, found in e2e-test on 2026-09-30
- Module: web-admin/extra.css
- **What:** base.css styled input[type=text] etc., but almost every input in the SPA has no type attribute, so titles, place, credit fields rendered as thin default browser boxes. Reported by the owner from a screenshot.
- **How to reproduce:** Open Posts > New post; measure the title input height
- **Root cause:** CSS selectors listed input types explicitly and never the untyped default
- **Fix:** extra.css now styles input:not([type]) together with the typed selectors (min-height 52px, 16px font, padding); e2e/smoke.py asserts every composer text field is at least 48 px high (2026-09-30)
- **Regression tests:** apps/web-admin/src/styles.test.ts

### BUG-2026-012: Time of day: 3:30 pm was shown as দুপুর instead of বিকেল
- **Priority P3**, RPN 6 (severity 1, occurrence 3, detectability 2), status **verified**, category ui, found in unit-test on 2026-09-30 by dev (Claude)
- Module: web-admin/format
- **What:** Timestamps in the audit log and complaint history used the wrong Bangla word for the hour between 3 and 4 pm.
- **How to reproduce:** bnDateTime('2026-09-27T09:30:00Z')
- **Root cause:** day-part thresholds used 16:00 as the start of বিকেল; Bangla convention starts it at 15:00.
- **Fix:** thresholds corrected and ভোর added (4-5) (2026-09-30)
- **Regression tests:** apps/web-admin/src/format.test.ts

