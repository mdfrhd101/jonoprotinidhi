# 07 · Tasks & milestones — Jonoprotinidhi

Estimates are ideal developer-days for one mid/senior MERN developer working with Claude; add 30 % for
reviews and surprises. Every task's **Done** means: code + tests + docs updated + `HANDOFF.md` entry.
Requirement IDs refer to `docs/01-PRD.md`.

> **Status (30 Sep 2026):** a first vertical slice is implemented in `apps/api`, `apps/web-admin`, `packages/shared`
> (npm workspaces instead of pnpm for now). Done or mostly done: T0.3, T0.5 (shared + Bangla), T0.6 (seed), most of M1
> (auth + TOTP, tenants, scoping, audit, RBAC), M2 posts/promises/site-config/team UI, M4 complaints incl. PII encryption,
> inbox, SMS/OTP interfaces, M5 super admin core (tenants, domains verify, act-as, audit). Not done: T0.1/T0.2/T0.4
> (git repo, docker, CI), media pipeline, area/events/offices/videos editors, all of M3, backups/restore, WebAuthn, M6.

| Milestone | Goal | Est. |
|---|---|---|
| M0 | Repo, tooling, CI, local stack, seed from demo | 5 d |
| M1 | Platform core: auth + 2FA, tenants, memberships, tenant scoping, audit, RBAC | 12 d |
| M2 | Content: profile, posts + approval, media, promises, area/events/offices/videos, site config + admin UI | 18 d |
| M3 | Public site in Next.js, all 10 pages, host routing, SEO, analytics | 14 d |
| M4 | Complaints end to end, SMS, OTP, PII encryption, inbox, reports | 14 d |
| M5 | Super admin complete: domains/TLS, act-as, backups/restore, staff, monitoring | 10 d |
| M6 | Hardening, pen-test, load + a11y tests, DR drill, pilot onboarding | 10 d |

## M0 — Foundation

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| T0.1 | Init git repo (GitHub, private), pnpm workspaces, TypeScript, ESLint, Prettier, Vitest, commit hooks | — | `pnpm lint && pnpm test` green on empty apps |
| T0.2 | `infra/docker-compose.dev.yml`: mongo (replica set rs0), redis, mailpit; arm64-compatible | T0.1 | `docker compose up` healthy on Windows-on-ARM and x86 |
| T0.3 | `apps/api` skeleton: env guard (zod), pino logger with redaction, helmet, CORS allow-list, `/health`, error middleware, request id | T0.1 | `/health` 200/503 correctly |
| T0.4 | CI (GitHub Actions): lint, typecheck, test, `pnpm audit`, gitleaks, Semgrep, Trivy for images, CycloneDX SBOM artifact | T0.1 | PR blocked on any failure |
| T0.5 | `packages/shared`, `packages/bangla`, `packages/ui-tokens` (tokens copied from demo CSS) | T0.1 | Bangla formatter unit tests |
| T0.6 | Seed script: convert `client-demo/demo-mp/assets/data.js` into the fictional demo tenant | T0.3, M1 models | `pnpm seed` creates tenant `ndp3` with all content |

## M1 — Platform core

| ID | Task | Depends | Req | Acceptance |
|---|---|---|---|---|
| T1.1 | Request context (AsyncLocalStorage) + `tenantScoped`, `softDelete`, `versioned` plugins | T0.3 | — | Unit tests: query without context throws; aggregate gets `$match` injected |
| T1.2 | Models: tenants, domains, users, memberships, auditLogs, counters + migrations for indexes | T1.1 | — | Indexes created by migration; audit collection insert/find-only DB role |
| T1.3 | Auth: login → MFA (TOTP) → access/refresh with rotation + reuse detection, sessions list/revoke, lockout | T1.2 | AUTH-01,03,05 | Integration tests incl. refresh reuse revokes family |
| T1.4 | WebAuthn for platform staff | T1.3 | AUTH-01 | Super admin cannot log in without a security key |
| T1.5 | Invites (SMS/email), accept, forced MFA enrolment, recovery codes | T1.3, T4.6 (SMS stub ok) | AUTH-02 | Expired/used invite rejected |
| T1.6 | Permission registry + `requirePermission`, `loadMembership`, tenant switcher in `/auth/me` | T1.3 | AUTH-06 | Matrix in doc 04 §4 covered by tests |
| T1.7 | Audit service (fire-and-forget), redaction, `/admin/.../audit`, `/super/audit` | T1.2 | CMS-12, SA-06 | Every write endpoint added later must call it (lint rule or test helper) |
| T1.8 | **Tenant isolation test harness** (two tenants, generic route crawler) | T1.6 | MIS-01 | Harness runs in CI; new routes auto-included |
| T1.9 | `web-admin` shell: login/MFA screens, layout from demo, route guards, tenant switcher | T1.3 | — | Matches `client-demo/admin` shell on desktop and 390 px |

## M2 — Content management

| ID | Task | Depends | Req | Acceptance |
|---|---|---|---|---|
| T2.1 | Media: presigned upload to private R2, finalize, worker (magic-byte check, EXIF strip, WebP variants, blurhash) | T1.x | CMS-05, MIS-09 | GPS EXIF absent in all variants (test fixture) |
| T2.2 | Posts CRUD + state machine + versions + scheduled publish job | T1.x, T2.1 | CMS-01..03 | Editor cannot approve (403); reject needs reason; 409 on stale version |
| T2.3 | Approval queue + owner notification (SMS/push stub) | T2.2 | CMS-04 | Badge count correct; notification batched |
| T2.4 | Profile (about + biography) editor + publish | T1.x | CMS-06 | Empty fields hidden on public |
| T2.5 | Promises CRUD + updates + validation (`done`⇒100, `late`⇒reason) | T1.x | PRM-01..04 | API rejects invalid combos |
| T2.6 | Area, events, offices, videos editors | T1.x | CMS-09 | — |
| T2.7 | Site config: slogan, banners, sections order/visibility, accent | T2.1 | CMS-08 | Preview link; revalidation triggered |
| T2.8 | Admin UI for all of the above (mobile-first composer, from demo `mp.js`) | T1.9 | CMS-* | Post from a 360 px phone in ≤ 2 min in a usability test with 3 people |
| T2.9 | Dashboard aggregates (visitors, top pages, complaint status, union heatmap) | T3.6, T4.x | CMS-10 | Numbers match raw queries in tests |
| T2.10 | Team management UI + settings UI | T1.5 | CMS-11, 13 | Officer scope editable |

## M3 — Public site (Next.js)

| ID | Task | Depends | Req | Acceptance |
|---|---|---|---|---|
| T3.1 | Host → tenant resolution (middleware + cached API call), 404 unknown host, 503 suspended | T1.2 | PUB-12 | Works for platform subdomain and custom domain in staging |
| T3.2 | Layout, header (no monogram), footer with credits, fonts, tokens | T0.5 | PUB-11 | Visual diff against demo within tolerance |
| T3.3 | Home + About + Biography | T2.4, T2.7 | PUB-01..03 | Sections follow site config order |
| T3.4 | Activities list + detail + lightbox | T2.2 | PUB-04, 05 | OG image = lead photo 1200×630 |
| T3.5 | Promises, Area (map), Gallery, Contact | T2.5, T2.6 | PUB-06..08, 10 | — |
| T3.6 | Analytics beacon + daily rollup | T1.x | PUB-13 | No cookies; no IP stored |
| T3.7 | ISR + on-demand revalidation by tags from worker | T2.x | NFR-01 | Publish → visible ≤ 10 s |
| T3.8 | SEO: sitemap, robots, canonical (primary domain), JSON-LD | T3.1 | PUB-14 | Lighthouse SEO ≥ 95 |

## M4 — Complaints

| ID | Task | Depends | Req | Acceptance |
|---|---|---|---|---|
| T4.1 | Envelope encryption lib (master key → tenant DEK → AES-256-GCM, AAD), key rotation script | T1.2 | CMP-09, ADR-0004 | Tamper test fails decryption; rotation re-wraps DEKs |
| T4.2 | Complaint model, counters, submit endpoint, Turnstile, rate limits (IP + phone HMAC), attachments to private bucket | T4.1, T2.1 | CMP-01..05, MIS-03 | 6th submit/min from same IP → 429 |
| T4.3 | OTP send/verify (Redis, hashed code, attempts, cooldown), per-tenant mandatory flag | T4.2 | CMP-04 | No anonymous path (ADR-0009): a mandatory OTP applies to every public complaint |
| T4.4 | Public tracking endpoint + page (uniform responses) | T4.2 | CMP-06, MIS-05 | Timing difference known/unknown < 20 ms p50 |
| T4.5 | Inbox API + UI: filters, scope, assign, status machine, notes, events timeline | T4.2 | CMP-07, 08 | Officer of Charkandi never sees Notunhat items (test) |
| T4.6 | SMS provider adapter (first BD gateway), templates, Unicode segment count, delivery webhook, daily cap | T0.3 | NTF-01, 02 | Switching provider = env change |
| T4.7 | PII view endpoint + UI dialog + audit + rate tier | T4.1, T4.5 | CMP-09, MIS-02 | PII suite green (doc 05 §7) |
| T4.8 | CSV export without PII; public monthly stats with small-count merge | T4.5 | CMP-10, 11 | — |
| T4.9 | Feedback link after resolution; SLA reminder job | T4.6 | CMP-12, 13 | — |
| T4.10 | Retention purge job (PII removed after `retentionUntil`, record kept anonymised) | T4.1 | NFR-05 | Purged records show "মুছে ফেলা হয়েছে" for PII |

## M5 — Super admin & operations

| ID | Task | Depends | Req | Acceptance |
|---|---|---|---|---|
| T5.1 | Tenant list/detail/create (consent gate), status changes | T1.x | SA-01..03, MIS-07 | Cannot create without consent + doc ref |
| T5.2 | `DomainProvider` (Cloudflare for SaaS): add hostname, TXT/CNAME instructions, verify, primary, SSL expiry polling | T3.1 | SA-04 | Staging custom domain goes live with TLS |
| T5.3 | Act-as tokens + UI banner + audit tagging + PII refusal | T1.6 | SA-05 | Test: act-as cannot call `pii-view` |
| T5.4 | Backups: nightly `mongodump --archive --gzip` → encrypt (age/GPG) → separate-account bucket; list; restore request + second approval; runbook | T0.2 | SA-07, NFR-03 | Restore drill into staging documented |
| T5.5 | Platform staff management, support read-only role | T1.4 | SA-08 | — |
| T5.6 | Monitoring: uptime checks, error tracking (PII scrubbing), queue lag, SMS balance, SSL expiry alerts | T0.3 | SA-09, NFR-09 | Alert fires in staging drill |

## M6 — Hardening & launch

| ID | Task | Acceptance |
|---|---|---|
| T6.1 | Security review against doc 08 controls + OWASP ASVS L2 checklist | All High items closed |
| T6.2 | External-style pen-test of staging (use our `vuln-assessment` skill), fix findings | No open Critical/High |
| T6.3 | Load test (k6) and performance budget check | NFR-01, 08 met |
| T6.4 | Accessibility audit (axe + manual screen reader in Bangla) | WCAG 2.2 AA for key flows |
| T6.5 | DR drill: restore production backup into staging, measure RTO | ≤ 4 h |
| T6.6 | Pilot: onboard the first consenting MP office (MP_INFO.md intake → content → review → live), train staff, 2-week hypercare | Owner sign-off |
| T6.7 | Privacy notice + complaint policy pages (Bangla), reviewed by a lawyer | Published on every tenant |
