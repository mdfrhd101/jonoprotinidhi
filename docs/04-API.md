# 04 · API — Jonoprotinidhi (`/api/v1`)

## 1. Conventions

- JSON over HTTPS. `Content-Type: application/json; charset=utf-8`.
- Validation with **zod** schemas from `packages/shared` (same schemas used by the admin SPA forms).
- Unknown fields are **stripped** (mass-assignment guard); only whitelisted fields reach services.
- Errors: `{ "error": { "code": "VALIDATION_FAILED", "message": "বাংলা বার্তা", "details": [...] } }`
  with HTTP 400/401/403/404/409/422/429/500. Foreign-tenant IDs return **404**, never 403.
- Pagination (opt-in): `?page=1&limit=20` → `{ items, page, limit, total, totalPages }`; max limit 100.
- Dates ISO-8601 UTC. Numbers as numbers. The client formats Bangla digits.
- Concurrency: mutable documents carry `version`; send it back on update; mismatch → `409 VERSION_CONFLICT`.
- Idempotency: `POST` endpoints that create billable/side-effect actions (complaints, SMS) accept
  `Idempotency-Key` header (stored 24 h).
- Rate-limit tiers (Redis, per IP unless noted): `public` 120/min, `publicWrite` 5/min + 20/day per
  `phoneHmac`, `tracking` 10/min, `auth` 10/15 min per account + IP, `admin` 300/min per user,
  `pii` 30/hour per officer.
- Auth: `Authorization: Bearer <access JWT, 10 min>`; refresh via httpOnly, Secure, SameSite=Strict cookie
  on the admin domain (rotating). CSRF: refresh endpoint requires the `X-CSRF` header token.

## 2. Public (tenant from `Host`; called by `web-public` server-side and by browsers for forms)

| Method | Path | Notes | Req |
|---|---|---|---|
| GET | `/public/site` | tenant header info, siteConfig, theme, primary domain, counts | FR-PUB-01 |
| GET | `/public/profile` | published profile | FR-PUB-02/03 |
| GET | `/public/posts` | `?category&upazila&month=YYYY-MM&page` published only | FR-PUB-04 |
| GET | `/public/posts/:slug` | + related, prev/next | FR-PUB-05 |
| GET | `/public/promises` | grouped; summary computed | FR-PUB-06 |
| GET | `/public/area` | | FR-PUB-07 |
| GET | `/public/gallery` | albums (from posts) + videos | FR-PUB-08 |
| GET | `/public/events`, `/public/offices` | | FR-PUB-10 |
| GET | `/public/complaint-stats?month=YYYY-MM` | aggregates; categories < 5 merged into "অন্যান্য" | FR-CMP-11 |
| GET | `/public/complaint-form` | categories, upazilas → unions, `otpRequired`, Turnstile site key | FR-CMP-01 |
| POST | `/public/otp/send` | `{ phone, turnstileToken }` → 202 always (no enumeration) | FR-CMP-04 |
| POST | `/public/otp/verify` | `{ phone, code }` → `{ otpTicket }` (10 min, single use) | FR-CMP-04 |
| POST | `/public/complaints` | `{ category, upazila, union, place?, description, voiceNote?, files?, name, phone, dob, nid, otpTicket?, turnstileToken }` → `{ trackingId }`. **name (2–80), phone, dob (`YYYY-MM-DD`, real date, ≥ 1900, not in the future) and nid (10, 13 or 17 digits, spaces/dashes ignored) are all required, there is no anonymous option** (ADR-0009): a missing or bad field → 400 `VALIDATION_FAILED` with a Bangla message per field in `details.fieldErrors`; an `anonymous` key is refused (400). dob and nid are stored encrypted with name and phone. The only route with a large body (13 MB, parsed after host resolution and the pre-parse `complaintBody` tier, 10/min per IP; every other route 1 MB). Attachments are base64 data URLs: files + voice ≤ 12 MB together, voice ≤ 180 s; the server checks magic bytes, re-encodes photos to WebP ≤ 1600 px (EXIF dropped) and rebuilds the data URLs; bad data → 422 `BAD_FILE` / `BAD_IMAGE` / `BAD_VOICE` (BUG-2026-027/028/031) | FR-CMP-01..05 |
| GET | `/public/complaints/:trackingId` | `{ category, area, status, publicSteps }` — no PII/notes | FR-CMP-06 |
| POST | `/public/feedback/:token` | `{ rating, text }` single-use token from SMS | FR-CMP-12 |
| POST | `/public/analytics/hit` | `{ path }` beacon; no cookies | FR-PUB-13 |

## 3. Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ identifier, password }` → `{ mfaRequired: true, mfaToken }` (never a session directly) |
| POST | `/auth/mfa/totp` | `{ mfaToken, code }` → access token + refresh cookie |
| POST | `/auth/mfa/webauthn/options`, `/auth/mfa/webauthn/verify` | super admins (mandatory), optional for others |
| POST | `/auth/refresh` | rotates refresh token; reuse of an old one revokes the whole session family |
| POST | `/auth/logout` | current session; `/auth/logout-all` all sessions |
| GET | `/auth/me` | user, platformRole, memberships `[{ tenantId, slug, role, scope }]` |
| GET/DELETE | `/auth/sessions`, `/auth/sessions/:id` | device list / revoke |
| POST | `/auth/invites/:token/accept` | set password; returns `mfaEnrollToken` |
| POST | `/auth/mfa/enroll/totp` | returns otpauth URI (QR rendered client-side) + recovery codes once |
| POST | `/auth/password/reset/request`, `/auth/password/reset/confirm` | OTP to registered phone, then MFA |

## 4. Tenant admin — `/admin/tenants/:tenantId/...`

Middleware chain: `authenticate → loadMembership(tenantId) | actAs → requirePermission(...) → tenantContext`.

| Method | Path | Permission | Req |
|---|---|---|---|
| GET | `/dashboard` | `dashboard.view` | FR-CMS-10 |
| GET/POST | `/posts` | `posts.view` / `posts.create` | FR-CMS-01 |
| GET/PATCH/DELETE | `/posts/:id` | `posts.view` / `posts.edit` (own draft or `posts.edit_any`) / `posts.delete` | |
| POST | `/posts/:id/submit` | `posts.create` | FR-CMS-02 |
| POST | `/posts/:id/approve` | `posts.publish` · body `{ scheduledAt? }` | FR-CMS-02 |
| POST | `/posts/:id/reject` | `posts.publish` · body `{ reason }` | FR-CMS-02 |
| POST | `/posts/:id/unpublish` | `posts.publish` | |
| GET | `/posts/:id/versions` · POST `/posts/:id/versions/:v/restore` | `posts.view` / `posts.edit` | FR-CMS-03 |
| POST | `/media/upload-url` · POST `/media/:id/finalize` · PATCH `/media/:id` | `media.upload` | FR-CMS-05 |
| GET/PUT | `/profile` · POST `/profile/publish` | `profile.edit` / `profile.publish` | FR-CMS-06 |
| GET/POST/PATCH | `/promises`, `/promises/:id` · POST `/promises/:id/updates` | `promises.edit` | FR-PRM-* |
| GET/PUT | `/site-config` | `site.edit` | FR-CMS-08 |
| GET/PUT | `/area`, `/events`, `/offices`, `/videos` | `site.edit` | FR-CMS-09 |
| GET | `/complaints` | `complaints.view_all` or `complaints.view_scoped` (officer: upazila filter forced server-side). Items carry `hasVoice`, `voiceSec`, `fileCount`, `fileMeta[]`, never the payloads (BUG-2026-029) | FR-CMP-07 |
| GET | `/complaints/:id` | same; returns `pii: { available: bool }` only, `canUpdate` (manage or assigned officer), and the `voiceNote` / `files` payloads | |
| PATCH | `/complaints/:id` | `complaints.manage` (owner) or assigned officer: `{ status?, assignedTo?, version, note? }` (a note alone goes to `/notes`) | FR-CMP-08 |
| POST | `/complaints/:id/notes` | `complaints.note` | FR-CMP-08 |
| POST | `/complaints/:id/sms` | assigned officer or owner · `{ templateKey, vars }` (free text limited to 300 chars) | FR-CMP-08 |
| POST | `/complaints/:id/pii-view` | **assigned officer only**, not via act-as, `pii` rate tier · body `{ purpose }` → `{ name, phone, dob, nid }` (`dob`/`nid` are `''` on older and staff-entered complaints) + audit `complaint.pii_view` | FR-CMP-09 |
| POST | `/complaints` | `complaints.create_staff` (hearing/phone channel) | FR-CMP-14 |
| GET | `/complaints/export.csv` | `complaints.export` — no PII columns, audited | FR-CMP-10 |
| GET/POST/DELETE | `/team`, `/team/invites`, `/team/:membershipId` | `team.manage` | FR-CMS-11 |
| GET/PUT | `/settings` | `settings.edit` | FR-CMS-13 |
| GET | `/audit` | `audit.view` | FR-CMS-12 |

### Permission registry (defaults per role)

| Permission | owner | editor | officer | super_admin (act-as) | support (act-as, read) |
|---|---|---|---|---|---|
| `dashboard.view` | ✓ | ✓ | ✓ (scoped) | ✓ | ✓ |
| `posts.view/create` | ✓ | ✓ | — | ✓ | view |
| `posts.edit_any`, `posts.publish`, `posts.delete` | ✓ | — | — | ✓ | — |
| `media.upload` | ✓ | ✓ | — | ✓ | — |
| `profile.edit` / `profile.publish` | ✓/✓ | ✓/— | — | ✓/✓ | — |
| `promises.edit`, `site.edit`, `settings.edit`, `team.manage` | ✓ | — | — | ✓ | — |
| `complaints.view_all` | ✓ | — | — | ✓ | ✓ |
| `complaints.view_scoped`, `complaints.note` | ✓ | — | ✓ | ✓ | — |
| `complaints.manage` (assign, any status) | ✓ | — | own assigned: status only | ✓ | — |
| `complaints.pii_view` | — | — | **own assigned only** | **never** | **never** |
| `complaints.export` | ✓ | — | — | ✓ | — |
| `audit.view` | ✓ | — | — | ✓ | ✓ |

Registry lives in `packages/shared/permissions.ts`; per-membership overrides allowed except `pii_view`.

## 5. Super admin — `/super/...` (requires `platformRole`)

| Method | Path | Notes | Req |
|---|---|---|---|
| GET | `/super/dashboard` | counts only: `kpis` (tenants by status, complaints 30d/prev/open/overdue/SLA, posts 30d, media bytes image/video, SMS today/month vs cap, domains pending/SSL), `series` (30 Dhaka days, zero-filled), `openByTenant`, `attention` (suspended, SLA, domain, stale, unpublished, setup), `activity`; legacy flat fields kept | FR-SA-01, SA-09 |
| GET | `/super/slug-available?slug=` | super_admin; `{ slug, host, available }` (wizard live check) | FR-SA-02 |
| GET/POST | `/super/tenants` | create requires `consent.confirmed === true` + `documentRef` | FR-SA-02 |
| GET/PATCH | `/super/tenants/:id` | plan, settings caps | |
| POST | `/super/tenants/:id/status` | `{ to, reason, contentChecked? }` | FR-SA-03 |
| POST | `/super/tenants/:id/act-as` | `{ reason }` → `{ actAsToken, expiresAt }` (30 min) | FR-SA-05 |
| GET | `/super/domains` | every domain + tenant, DNS/SSL state, TXT record (implemented, read for support too) | FR-SA-04 |
| POST | `/super/tenants/:id/domains` · POST `/super/domains/:id/verify` · POST `/super/domains/:id/primary` · (DELETE: not implemented) | Cloudflare for SaaS via `DomainProvider` | FR-SA-04 |
| GET | `/super/audit` | filters `tenantId, actorType (super/office), action (prefix), actor (name contains), from, to (Dhaka days)`; rows carry `tenantName`; never a user agent; complaint.* rows without IP and reason; IP of admin actions to super_admin only (BUG-2026-018) | FR-SA-06 |
| GET/POST | `/super/backups` · POST `/super/backups/:id/restore-requests` · POST `/super/restore-requests/:id/approve` | second approver must be a different super admin | FR-SA-07 |
| GET/POST/PATCH | `/super/staff` | | FR-SA-08 |

## 6. Internal

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | 200 when Mongo + Redis ready, else 503; no auth, no details |
| GET | `/internal/metrics` | Prometheus; bound to the internal network only |
| POST | `web-public: /api/revalidate` | called by worker with a shared secret; `{ tags: [] }` |

## 7. Webhooks

- SMS gateway delivery reports → `POST /webhooks/sms/:provider` (HMAC signature or IP allow-list,
  idempotent by `providerMsgId`).
- Cloudflare custom hostname status (if used) → `POST /webhooks/cloudflare` (signature verified).
