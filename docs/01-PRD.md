# 01 · Product Requirements (PRD) — Jonoshetu

Requirement IDs (`FR-…`, `NFR-…`, `MIS-…`) are referenced by the architecture, API, tasks and tests.
Priority uses MoSCoW: **M** must (MVP), **S** should (MVP if time), **C** could (later), **W** won't (v1).

## 1. Problem and goals

Bangladeshi MPs are judged on visible work, but their online presence is usually a Facebook page that mixes
propaganda with sporadic updates, and citizens have no trackable way to raise problems. Offices have no
technical staff.

**Goals**
1. Give each MP a premium, always-current website that shows real work: activities, promises with honest
   progress (including delays and reasons), constituency data.
2. Give citizens a complaint box with a tracking ID and SMS updates, with their identity protected.
3. Let a non-technical MP office run it from a phone: post in ≤ 2 minutes, approve with one tap.
4. Let our company run many MPs on one platform with strict isolation, and fix anything anywhere, audited.

**Success metrics (first 6 months after a site goes live)**

| Metric | Target |
|---|---|
| Median time for an editor to publish an activity from a phone (start → submit) | ≤ 2 min |
| Complaints acknowledged (moved out of `new`) within 24 h | ≥ 90 % |
| Complaints resolved within the tenant SLA (default 7 days) | ≥ 80 % |
| Days since last published post, per live site | ≤ 7 (alert at 14) |
| Public page LCP on a mid-range Android over 4G | ≤ 2.5 s |
| Time to onboard a new MP (account → live, content supplied) | ≤ 1 working day |
| Cross-tenant data exposure incidents | 0 |

## 2. Personas

| Persona | Needs | Device |
|---|---|---|
| **Citizen** | Read what the MP did; check promise progress; file a complaint (maybe anonymously); track it | Android phone, often slow data |
| **MP / minister (Owner)** | Look good through real work; approve content fast; see complaint health | Phone |
| **PR / content editor** | Post activities with photos in minutes; update banners | Phone first, sometimes laptop |
| **Complaint officer** | See and resolve complaints for their upazila; contact complainant | Phone + laptop |
| **Super Admin (our staff)** | Create tenants, domains, fix any site, backups, monitoring | Laptop |
| **Support (our staff)** | Read-only help for MP offices | Laptop |

## 3. Scope

**MVP (v1)**: public site (10 pages), admin panel (content, approval, promises, homepage, complaints,
team, audit, settings), complaint box with tracking + SMS + optional OTP, super admin (tenants, domains,
audit, backups, staff, act-as), Bangla UI.

**Later**: English version of public site (C), Facebook auto-post (C), WhatsApp notifications (C),
citizen feedback survey analytics (C), multi-MP comparison dashboards (W — sensitive), native apps (W).

## 4. Functional requirements

### 4.1 Public site (per tenant) — reference: `client-demo/demo-mp/`

| ID | P | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-PUB-01 | M | Home: banner slideshow (≤ 5), name, title, slogan, stats (4), recent activities, promise summary, constituency overview + map, gallery preview, upcoming events, complaint-box CTA | Sections render from CMS; owner can hide/reorder sections (FR-CMS-08); page works with JS disabled except slideshow/count-up |
| FR-PUB-02 | M | About page: personal info, story, role, parliamentary numbers, awards, publications, priorities | All fields editable in CMS; empty fields hidden, never "sample" text |
| FR-PUB-03 | M | Biography page: education, profession, political career timelines | Separate page linked from About; anchors `#edu #work #politics` |
| FR-PUB-04 | M | Activities list with filters (category, upazila, month) and pagination | Filters reflected in URL; 12 per page; server-rendered |
| FR-PUB-05 | M | Activity detail: full text, date, place, quote, album with lightbox, prev/next, related | Open Graph tags with the lead photo; lightbox keyboard + swipe |
| FR-PUB-06 | M | Promises page grouped by sector: budget, deadline, progress %, status, updates, delay reason | Late promises always show the delay reason (FR-PRM-03) |
| FR-PUB-07 | M | Constituency page: map, per-upazila stats, voters, comparison table | Numbers from CMS with a source line |
| FR-PUB-08 | M | Gallery: albums (from activities) + YouTube videos | Videos embed with `youtube-nocookie.com` only after user clicks |
| FR-PUB-09 | M | Complaint page: form, tracking, monthly public statistics, how-it-works, FAQ, GRS/333 mention | See FR-CMP-* |
| FR-PUB-10 | M | Contact: offices, hours, phones, upcoming events, social links | — |
| FR-PUB-11 | M | Photo credits in footer for licensed photos; "fictional" label on demo tenants | Credit string stored per media item |
| FR-PUB-12 | M | Suspended tenant shows a neutral "temporarily unavailable" page; data kept | HTTP 503 with `Retry-After` |
| FR-PUB-13 | S | Privacy-friendly analytics (page views, no cookies, no personal data) | No consent banner needed; IP not stored |
| FR-PUB-14 | S | Sitemap, robots, canonical URL, structured data (Person, NewsArticle) | Custom domain is canonical when primary |

### 4.2 Content management (MP admin) — reference: `client-demo/admin/mp.html`

| ID | P | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-CMS-01 | M | Mobile-first post composer: category chips, title, date, upazila, place, summary, body, up to 10 photos | Usable one-handed on a 360 px screen; photo upload resumes on flaky networks |
| FR-CMS-02 | M | Workflow: draft → review → published / rejected; scheduled publish | Editor can only submit; owner (or act-as super admin) approves/rejects; reject requires a reason |
| FR-CMS-03 | M | Version history per post (who, when, what) | Any published version can be viewed; restore creates a new version |
| FR-CMS-04 | M | Approval queue with count badge; notify owner (SMS/push) when something waits | Owner can approve from the notification link |
| FR-CMS-05 | M | Media library: upload, strip EXIF/GPS, generate WebP sizes, alt text, credit, licence | Originals kept private; public gets resized variants only |
| FR-CMS-06 | M | Profile editor (about + biography + roles + awards + works + priorities) | Owner-only publish |
| FR-CMS-07 | M | Promises editor: add/edit, progress %, status, dated update, delay reason | FR-PRM-* |
| FR-CMS-08 | M | Homepage builder: slogan, banners (image + caption + order), section on/off + order, accent colour (3 presets) | Preview before publish; change goes live on save by owner |
| FR-CMS-09 | M | Area data, events, offices, videos editors | — |
| FR-CMS-10 | S | Dashboard: visitors (30 days), top pages, complaint status, SLA %, union heatmap, pending approvals | Numbers are aggregates only |
| FR-CMS-11 | M | Team: invite by phone, roles owner/editor/officer, officer upazila scope, remove member | Invite link expires in 72 h; 2FA setup forced on first login |
| FR-CMS-12 | M | Tenant audit log (read-only) incl. super admin actions inside the tenant | Super admin rows visually marked |
| FR-CMS-13 | M | Settings: complaint categories, OTP mandatory toggle, SLA days | — |

### 4.3 Complaints — reference: `client-demo/demo-mp/complaint.html` + admin inbox

| ID | P | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-CMP-01 | M | Form: category, upazila → union/pourashava (cascading), village/ward, description (20–1000 chars), ≤ 3 photos, name (optional), mobile | Bangla digits accepted in phone; mobile must match `01[3-9]` + 8 digits |
| FR-CMP-02 | M | Anonymous option: no name/phone stored; no SMS; tracking ID shown prominently | — |
| FR-CMP-03 | M | Spam control: Cloudflare Turnstile + rate limits (per IP, per phone hash) | Blocked attempts counted for super admin dashboard |
| FR-CMP-04 | M | OTP verification: optional by default; mandatory when tenant setting on (not for anonymous) | OTP 6 digits, 5 min, 5 attempts, resend after 60 s |
| FR-CMP-05 | M | Tracking ID `<PREFIX>-<YEAR>-<5-digit seq>` per tenant; SMS with ID to non-anonymous | Sequential per tenant/year, never reused |
| FR-CMP-06 | M | Public tracking by ID shows category, area, public step timeline — never PII, never internal notes | Strict rate limit; unknown ID gives the same response time |
| FR-CMP-07 | M | Inbox: filters (status, upazila, age, mine), search, detail pane | Officer sees only their upazilas |
| FR-CMP-08 | M | Assign to officer, change status, internal notes, SMS to citizen from templates | Each action → complaint event + audit log; status change triggers SMS if not anonymous |
| FR-CMP-09 | M | PII view: assigned officer only, explicit "view" action with purpose reminder, logged | Owner, editor, super admin, support can never decrypt PII |
| FR-CMP-10 | M | Reports: CSV export without PII | Export logged |
| FR-CMP-11 | M | Public monthly stats: received, resolved, average days, by category | Aggregates only; hide categories with < 5 complaints in a month |
| FR-CMP-12 | S | After resolution, SMS link for feedback (1–5 + text) | Feedback link single-use |
| FR-CMP-13 | S | SLA reminders to officer/owner when a complaint nears/exceeds SLA | Daily job |
| FR-CMP-14 | M | Channel field: web / public hearing (entered by staff) / phone | Staff-entered complaints still get tracking ID + SMS |

### 4.4 Promises

| ID | P | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-PRM-01 | M | Promise: sector, name, place, budget, target date, progress 0–100, status (done/ongoing/late/plan), home-featured flag | `done` requires 100 % |
| FR-PRM-02 | M | Dated public updates list | Newest first |
| FR-PRM-03 | M | `late` requires a delay reason (≥ 10 chars) and new target | Enforced by API |
| FR-PRM-04 | M | Public summary bar (counts by status) computed, never typed | — |

### 4.5 Super Admin — reference: `client-demo/admin/super.html`

| ID | P | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-SA-01 | M | Tenant list with status, last post age, visitors, complaints/month (counts only) | Stale sites (> 14 days) flagged |
| FR-SA-02 | M | Create tenant: MP name, role, seat, ministry, slug/subdomain, owner phone, editor email, plan, complaint box on/off, **written consent confirmed + document reference** | Cannot create without consent; tenant starts in `setup` (not public) |
| FR-SA-03 | M | Change status setup → live → suspended (reason required; going live requires content check confirmation) | Logged |
| FR-SA-04 | M | Domains: platform subdomain automatic; add custom domain → show CNAME + TXT; verify; TLS via Cloudflare for SaaS; set primary | Status polled; expiry warnings |
| FR-SA-05 | M | Act-as (impersonate) into a tenant admin: reason required, 30-min token, banner in UI, all actions tagged `viaSuperAdmin` | Cannot view complainant PII while acting-as |
| FR-SA-06 | M | Global audit log with filters (tenant, actor type) | Append-only |
| FR-SA-07 | M | Backups: list, trigger manual, restore request needing a second super admin's approval | Runbook in `docs/08-SECURITY.md` |
| FR-SA-08 | M | Platform staff: super admin / support (read-only) roles; security keys for super admins | — |
| FR-SA-09 | S | Health: uptime, error rate, queue depth, SMS balance, SSL expiries | — |

### 4.6 Authentication & accounts

| ID | P | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-AUTH-01 | M | Login with phone (or email for staff) + password; then mandatory second factor (TOTP; WebAuthn for super admins) | No admin session without 2FA |
| FR-AUTH-02 | M | Invites via SMS/email link (72 h), set password + enrol 2FA | — |
| FR-AUTH-03 | M | Sessions: short access token + rotating refresh token, device list, revoke one/all | Revoked session dies within 1 min |
| FR-AUTH-04 | M | Password reset via OTP to registered phone, then re-verify 2FA | — |
| FR-AUTH-05 | M | Lockout / backoff after repeated failures | 5 failures → 15 min backoff |
| FR-AUTH-06 | M | A user can belong to several tenants (e.g. a PR agency); tenant switcher | Membership decides role per tenant |

### 4.7 Notifications

| ID | P | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-NTF-01 | M | SMS via a pluggable Bangladeshi gateway (sender ID per tenant) | Provider switch = config only |
| FR-NTF-02 | M | Templates in Bangla with variables; Unicode segment counter | — |
| FR-NTF-03 | S | Owner notification for pending approvals and SLA breaches | Batched, max 3/day |

## 5. Misuse cases (must be defended — see `docs/08-SECURITY.md`)

| ID | Misuse | Required defence |
|---|---|---|
| MIS-01 | Rival MP's staff reads another tenant's complaints by changing an ID in the URL | Tenant-scoped queries; 404 on foreign IDs; isolation test suite |
| MIS-02 | MP office harvests complainants' phone numbers for campaigning | PII encrypted; only assigned officer decrypts, one at a time, logged; no bulk export; rate-limited PII views |
| MIS-03 | Bot floods the complaint form or SMS OTP (SMS cost attack) | Turnstile, rate limits per IP/phone hash, daily SMS cap per tenant |
| MIS-04 | Editor publishes without approval / backdates a post to fake activity | Server-side workflow; audit log; `createdAt` immutable and shown in version history |
| MIS-05 | Attacker enumerates tracking IDs to read complaints | Public view has no PII/notes; strict rate limit; uniform responses |
| MIS-06 | Compromised super admin account defaces many sites | WebAuthn, IP allowlist optional, act-as needs reason and is time-boxed, anomaly alert on multi-tenant edits |
| MIS-07 | Fake site for a real MP created without consent | Consent gate + document reference; tenant stays in `setup` until super admin confirms |
| MIS-08 | Stored XSS through post body or captions | Sanitised rich text allow-list; output encoding; CSP |
| MIS-09 | Uploaded photo leaks GPS location of a citizen or staff | EXIF stripped on upload for all images |
| MIS-10 | Insider silently edits a promise's progress to look better | Every change audit-logged with before/after; public "last updated" date |

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 Performance | Public pages server-rendered and cached; LCP ≤ 2.5 s, CLS ≤ 0.1 on mid-range Android/4G; images WebP, responsive `srcset`; JS ≤ 150 KB gz per public page |
| NFR-02 Availability | 99.9 % monthly for public sites; admin 99.5 % |
| NFR-03 Backup/DR | RPO ≤ 24 h (daily encrypted backup; oplog/PITR if the host allows → 1 h), RTO ≤ 4 h; quarterly restore drill |
| NFR-04 Security | OWASP ASVS 4.0 Level 2 for API and admin; see doc 08 |
| NFR-05 Privacy | Data minimisation; retention policies configurable (doc 08 §3) |
| NFR-06 Accessibility | WCAG 2.2 AA; full keyboard use; Bangla screen-reader-friendly labels |
| NFR-07 Localisation | Bangla first (UI, digits, dates, `Asia/Dhaka`); English UI strings externalised for later |
| NFR-08 Scalability | 200 tenants, 50 req/s sustained public traffic, 1 M complaints total without redesign |
| NFR-09 Observability | Structured logs (no PII), metrics, alerting on errors, queue lag, SSL expiry |
| NFR-10 Maintainability | TypeScript, lint + tests in CI, ≥ 80 % coverage on services; tenant-isolation tests mandatory |
| NFR-11 Browser support | Last 2 versions of Chrome/Edge/Firefox/Safari; Android Chrome 100+ |

## 7. Out of scope for v1

Payments/donations, election campaigning features (voter lists, canvassing), comments on posts,
public forums, AI-generated content, English public site, native mobile apps.

## 8. Release plan

See `docs/07-TASKS.md`: M0 setup → M1 platform core → M2 content → M3 public site → M4 complaints →
M5 super admin & ops → M6 hardening, pen-test and pilot with the first consenting MP office.
