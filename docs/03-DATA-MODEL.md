# 03 · Data model (MongoDB) — Jonoprotinidhi

Conventions
- All tenant-owned collections have `tenantId: ObjectId` (required, indexed first in every compound index)
  and use the `tenantScoped` plugin (doc 05 §3). Platform collections are marked **[platform]**.
- Timestamps: `createdAt`, `updatedAt` (Mongoose `timestamps: true`), UTC.
- Soft delete where history matters: `isDeleted`, `deletedAt`, `deletedBy` (plugin).
- Bangla text stored as UTF-8 as typed; digits stored as ASCII numbers where numeric (`pct: 72`), formatted
  to Bangla digits only at render.
- Data classification in brackets: **[Public] [Internal] [Confidential] [Restricted]** (doc 08 §2).
- Field names in `camelCase`. Enums listed inline.

## 1. Platform collections

### `tenants` [platform]
| Field | Type | Notes |
|---|---|---|
| `slug` | string, unique | e.g. `ndp3`; used for subdomain and tracking prefix |
| `trackingPrefix` | string | e.g. `NDP3` |
| `mp` | `{ name, title, role: 'mp'\|'minister'\|'state_minister'\|'deputy_minister', ministry?, seat: { name, number } }` | [Public] |
| `status` | `'setup'\|'live'\|'suspended'` | only `live` is publicly served |
| `plan` | `'basic'\|'full'` | feature flags derive from plan |
| `consent` | `{ confirmed: true, documentRef, receivedAt, confirmedBy }` | required to create (FR-SA-02) [Confidential] |
| `settings` | `{ otpRequired: false, slaDays: 7, complaintCategories: string[], smsSenderId, complaintBoxEnabled: true, dailySmsCap: 500 }` | editable by owner (except sender/cap) |
| `theme` | `{ accent: 'brass'\|'river'\|'maroon' }` | |
| `dek` | `{ wrapped: base64, keyVersion }` | tenant data-encryption key, wrapped by the master key (ADR-0004) [Restricted] |
| `statusHistory` | `[{ from, to, reason, by, at }]` | |

Indexes: `{ slug: 1 }` unique, `{ status: 1 }`.

### `domains` [platform]
| Field | Type | Notes |
|---|---|---|
| `tenantId` | ObjectId | |
| `host` | string, unique, lowercase | `ndp3.jonoprotinidhi.example`, `tahmina-noor.example` |
| `type` | `'platform'\|'custom'` | |
| `primary` | boolean | exactly one primary per tenant (canonical URL) |
| `verification` | `{ txtName, txtValue, verifiedAt }` | |
| `dnsStatus` / `sslStatus` | `'pending'\|'active'\|'error'` | from Cloudflare for SaaS |
| `providerId` | string | Cloudflare custom hostname id |
| `sslExpiresAt` | Date | |

Indexes: `{ host: 1 }` unique, `{ tenantId: 1, primary: -1 }`.

### `users` [platform]
| Field | Type | Notes |
|---|---|---|
| `name` | string | [Internal] |
| `phone` | string E.164, unique sparse | login id for MP office staff [Confidential] |
| `email` | string, unique sparse | login id for platform staff |
| `passwordHash` | string | argon2id [Restricted] |
| `mfa` | `{ totpSecretEnc?, webauthn: [{ credId, publicKey, counter, name }], enrolledAt, recoveryCodesHash: [] }` | [Restricted] |
| `platformRole` | `null\|'super_admin'\|'support'` | |
| `status` | `'invited'\|'active'\|'disabled'` | |
| `sessions` | `[{ id, refreshHash, device, ip, createdAt, lastUsedAt }]` | revocable (FR-AUTH-03) |
| `failedLogins` | `{ count, lockedUntil }` | |

### `memberships` [platform]
`{ userId, tenantId, role: 'owner'|'editor'|'officer', scope: { upazilas: string[] }, status: 'invited'|'active'|'removed', invitedBy, inviteTokenHash, inviteExpiresAt }`
Indexes: `{ userId: 1, tenantId: 1 }` unique, `{ tenantId: 1, role: 1 }`.

### `auditLogs` (platform + tenant rows) — append-only
| Field | Type | Notes |
|---|---|---|
| `tenantId` | ObjectId \| null | null = platform action |
| `actor` | `{ userId, name, role, viaSuperAdmin: boolean }` | |
| `action` | string | dot-namespaced, e.g. `post.approve`, `complaint.pii_view`, `tenant.suspend` |
| `entity` | `{ type, id, label }` | label is human text, never PII |
| `diff` | `{ before?, after? }` | redacted field list applied (no PII, no secrets) |
| `reason` | string? | required for act-as, suspend, restore |
| `ip`, `userAgent` | string | [Internal] |
| `at` | Date | |

Indexes: `{ tenantId: 1, at: -1 }`, `{ 'actor.userId': 1, at: -1 }`, `{ action: 1, at: -1 }`.
DB user for the app has **insert + find only** on this collection (no update/delete). Retention configurable
(default 3 years).

### `counters` [platform]
`{ _id: '<tenantId>:complaint:<year>', seq: number }` — atomic `$inc` with upsert.

## 2. Tenant content collections

### `profiles` (one per tenant)
`{ tenantId, headline, intro, story: string[], personal: [{label, value}], education: [TimelineItem], profession: [TimelineItem], politics: [TimelineItem], roles: [{title, since}], parliament: [{value, label}], awards: [{year, title, by}], works: [{year, title, type}], priorities: [{title, text}], milestones: [TimelineItem & {now?: boolean}], portraitMediaId?, status: 'draft'|'published', publishedAt }`
`TimelineItem = { year: string, title, place, note }` (year is text because it can be "ফেব্রুয়ারি ২০২৬" or a range).
Index: `{ tenantId: 1 }` unique.

### `posts` (activities)
| Field | Type | Notes |
|---|---|---|
| `slug` | string | unique per tenant, Latin transliteration + short id |
| `category` | `'dev'\|'health'\|'edu'\|'hearing'\|'parliament'\|'agri'\|'social'` | list configurable later |
| `upazila` | string? | key from `areas.upazilas[].key`; null = whole seat |
| `place`, `title`, `summary` | string | title ≤ 120, summary ≤ 160 |
| `body` | string | sanitised Markdown subset (paragraphs, bold, links to allow-listed hosts) |
| `quote` | string? | |
| `eventDate` | Date | date of the activity (shown publicly) |
| `media` | `[{ mediaId, caption }]` | first = lead image |
| `status` | `'draft'\|'review'\|'scheduled'\|'published'\|'rejected'\|'archived'` | |
| `scheduledAt`, `publishedAt` | Date? | |
| `authorId`, `approvedBy` | ObjectId? | |
| `rejectReason` | string? | |
| `version` | number | optimistic concurrency |
| soft delete | | |

Indexes: `{ tenantId: 1, status: 1, eventDate: -1 }`, `{ tenantId: 1, slug: 1 }` unique,
`{ tenantId: 1, category: 1, eventDate: -1 }`, `{ tenantId: 1, upazila: 1, eventDate: -1 }`, text index on
`title, summary`.

### `postVersions`
`{ tenantId, postId, version, action: 'create'|'edit'|'submit'|'approve'|'reject'|'schedule'|'unpublish'|'restore', snapshot: {title, summary, body, media, category, …}, by, at }`
Index: `{ tenantId: 1, postId: 1, version: -1 }`.

### `promises`
`{ tenantId, sector: 'road'|'health'|'edu'|'agri'|'civic', name, place, budget: { amountBdt?: number, label }, target: { date?: Date, label }, pct: 0..100, status: 'done'|'ongoing'|'late'|'plan', delayReason?, updates: [{ date, text, by }], featured: boolean, order: number }`
Validation: `status==='done' ⇒ pct===100`; `status==='late' ⇒ delayReason.length ≥ 10`.
Index: `{ tenantId: 1, sector: 1, order: 1 }`.

### `areas` (one per tenant)
`{ tenantId, totals: [{value, label}], voters: [{label, value}], extra: [{value, label}], upazilas: [{ key, name, short, pop, voters, sizeKm2, literacy, households, schools, clinics, about, office, unions: string[], mapShape?: GeoJSON }], source: string }`

### `siteConfigs` (one per tenant)
`{ tenantId, slogan, banners: [{ mediaId, caption, order }], sections: [{ key: 'stats'|'about'|'activities'|'office'|'promises'|'area'|'gallery'|'events'|'cta', on, order }], stats: [{ n, unit, label }], statsNote, accent, socials: [{label, url}], updatedBy }`

### `media`
`{ tenantId, kind: 'image', originalKey (private bucket), variants: [{ w, h, key }], blurhash, alt, credit, license: 'own'|'cc0'|'cc-by'|'cc-by-sa'|'pd', sourceUrl?, uploadedBy, status: 'uploading'|'processing'|'ready'|'rejected', exifStripped: true, bytes }`
Index: `{ tenantId: 1, createdAt: -1 }`.

### `videos`, `events`, `offices`
- `videos`: `{ tenantId, youtubeId, title, date, duration, thumbMediaId? }`
- `events`: `{ tenantId, title, startsAt?, recurrence?: 'weekly:thu' , timeText, place, note, published }`
- `offices`: `{ tenantId, name, rows: [{label, value}], order }`

## 3. Complaints

### `complaints`
| Field | Type | Class | Notes |
|---|---|---|---|
| `trackingId` | string | [Internal] | `NDP3-2026-01241`, unique |
| `category` | string | [Internal] | from tenant settings at submit time |
| `upazila`, `union`, `place` | string | [Confidential] | place is free text, may identify a household |
| `description` | string | [Confidential] | 20–10000 chars; may be `''` when a voiceNote is present (default `''`, BUG-2026-030) |
| `voiceNote` | `{ audioData, durationSec }?` | [Confidential] | in-browser recording as a data URL rebuilt by the server (audio webm, ogg, mp4, mpeg or wav; magic bytes checked), max 180 s / 4 MB; removed by the retention job |
| `files` | `[{ name, mimeType, size, data }]` | [Confidential] | up to 5 attachments as data URLs; photos re-encoded to WebP ≤ 1600 px (EXIF dropped), PDFs checked for `%PDF-`; files + voice ≤ 12 MB of base64 so the document stays far below 16 MB; never in list/export responses; removed by the retention job |
| `channel` | `'web'\|'hearing'\|'phone'` | | |
| `anonymous` | boolean | | |
| `pii` | `{ nameEnc?, phoneEnc?, keyVersion }` | **[Restricted]** | AES-256-GCM with tenant DEK; absent when anonymous |
| `phoneHmac` | string? | [Confidential] | HMAC-SHA256(phone, platform pepper) for rate limits / dedupe; not reversible |
| `otpVerified` | boolean | | |
| `status` | `'new'\|'verify'\|'progress'\|'solved'\|'closed'\|'spam'` | | |
| `assignedTo` | ObjectId? | | officer userId |
| `slaDueAt`, `firstActionAt`, `resolvedAt` | Date? | | |
| `publicSteps` | `[{ label, note, at }]` | [Public to the holder of the ID] | curated, no names |
| `feedback` | `{ rating 1..5, text, at }?` | | |
| `retentionUntil` | Date | | PII purge date (doc 08 §3) |

Indexes: `{ trackingId: 1 }` unique, `{ tenantId: 1, status: 1, createdAt: -1 }`,
`{ tenantId: 1, upazila: 1, status: 1 }`, `{ tenantId: 1, assignedTo: 1, status: 1 }`,
`{ tenantId: 1, phoneHmac: 1, createdAt: -1 }`, `{ retentionUntil: 1 }`.

### `complaintEvents`
`{ tenantId, complaintId, type: 'status'|'assign'|'note'|'sms'|'pii_view'|'feedback', by, at, data }` —
notes live here with `type: 'note'` and `data.text` (internal only).
Index: `{ tenantId: 1, complaintId: 1, at: 1 }`.

### `smsLogs`
`{ tenantId, complaintId?, purpose: 'otp'|'ack'|'status'|'invite'|'reset'|'owner_alert', phoneHmac, template, segments, provider, providerMsgId, status: 'queued'|'sent'|'failed'|'delivered', costBdt?, at }` — never the phone number or OTP.

### `analyticsDaily`
`{ tenantId, date: 'YYYY-MM-DD', path, views, uniques (daily salted hash, salt rotated daily) }` — no IP.
Index: `{ tenantId: 1, date: -1 }`.

## 4. Mapping from the demo

`client-demo/demo-mp/assets/data.js` (`window.SITE`) maps 1:1 to seed data:
`mp→tenants.mp`, `about→profiles`, `activities→posts`, `promises→promises`, `area→areas`,
`banners/stats→siteConfigs`, `videos/events/offices→…`, `complaintCats→tenants.settings.complaintCategories`,
`img→media` (credit/licence fields). The M0 seed script converts it (doc 07 T0.6).

## 5. Migrations

Use `migrate-mongo` (or a tiny custom runner) with numbered scripts in `apps/api/migrations/`. Every
migration is idempotent and must run inside a tenant context loop when it touches tenant data. Index
creation happens in migrations (not `autoIndex` in production).
