# 08 · Security, privacy & compliance — Jonoshetu

Posture: security-first (Octagram). Principles: least privilege, defense in depth, fail closed, data
minimisation, privacy by default, everything audited, nothing secret in code. Target: **OWASP ASVS 4.0 L2**.

## 1. Assets and trust boundaries

| Asset | Why it matters |
|---|---|
| Complainant identity (name, phone) and complaint text/photos | Retaliation risk; political misuse; highest sensitivity |
| MP's public reputation (site content) | Defacement or fake content = real-world harm |
| Admin accounts (esp. super admin) | One super admin controls every site |
| Tenant separation | Rival parties share the platform |
| Encryption keys (master key, tenant DEKs, phone pepper, JWT keys) | Compromise exposes PII |
| Availability during sensitive periods (elections, crises) | Sites are targets for DDoS |

Trust boundaries: Internet ↔ Cloudflare ↔ VPS (reverse proxy) ↔ internal network (api, worker, mongo,
redis) ↔ third parties (R2, SMS gateway, Cloudflare API). Browser ↔ admin SPA is untrusted; the API is the
only authority.

## 2. Data classification & inventory

| Class | Examples | Controls |
|---|---|---|
| **Public** | published posts, promises, area data, complaint aggregates | integrity (approval workflow, audit) |
| **Internal** | drafts, analytics, audit metadata, staff names | auth required, tenant scope |
| **Confidential** | complaint text, place, attachments, staff phones, consent documents | tenant scope + role; private bucket; excluded from logs |
| **Restricted** | complainant name/phone, password hashes, MFA secrets, keys | field-level encryption, assigned-officer-only decrypt, audited, never exported/logged |

Personal data processed: staff (name, phone, email, IP, device), citizens (name, phone, free text that may
contain health/family/location details, photos). **No** national ID, bank, biometric data is collected — the
form must not ask for NID.

## 3. Privacy impact assessment (summary)

| Topic | Decision |
|---|---|
| Purpose | Handle the citizen's complaint and inform them of progress. **Not** campaigning, not voter profiling |
| Legal basis / consent | Complaint form states purpose; separate unticked opt-in required for any other contact (not built in v1) |
| Minimisation | Name optional; anonymous allowed; no NID; phone only when SMS updates wanted |
| Access | Assigned officer only for PII; owner/editor/super admin/support never |
| Retention (configurable per tenant, platform defaults) | PII purged **12 months after closure** (record anonymised, stats kept); attachments deleted 12 months after closure; audit logs 3 years; SMS logs (no numbers) 2 years; staff sessions 90 days |
| Data subject requests | Citizen can request deletion via tracking ID + OTP to the same phone → PII purge workflow (manual in v1, audited) |
| Transfers | Data hosted outside Bangladesh (VPS region, Cloudflare, R2) → disclose in privacy notice; review against Bangladesh data-protection law (see §9) |
| Breach | Notify affected MP office within 24 h of confirmation; citizens where risk is high; regulators as law requires |
| Analytics | No cookies, no IP storage, daily-rotated salted hash for uniques |

LINDDUN highlights: **Linkability** (phone HMAC links a person's complaints — used only for rate limits and
shown as a count, never exposed); **Identifiability** (free text/photos may identify → confidential class,
not public); **Disclosure** (encryption + need-to-know); **Unawareness** (privacy notice on form);
**Non-compliance** (retention jobs, lawyer review T6.7).

## 4. Threat model (STRIDE)

| # | Component | Threat | Control |
|---|---|---|---|
| S1 | Admin login | Credential stuffing / phishing | argon2id, mandatory TOTP, WebAuthn for super admins, lockout/backoff, breached-password check, login alerts |
| S2 | Sessions | Token theft | 10-min access token in memory; httpOnly SameSite=Strict refresh cookie; rotation with reuse detection; device revoke |
| T1 | Public content | Defacement via compromised editor | Editor can't publish; owner approval; version history + one-click restore; audit |
| T2 | Audit log | Tampering to hide actions | Insert/find-only DB role; daily hash-chain digest exported to backup bucket |
| T3 | Uploads | Malicious files (polyglot, SVG XSS) | Image MIME + magic-byte allow-list, re-encode with sharp, no SVG, private bucket for originals |
| R1 | Admin actions | "I didn't do that" | Per-user sessions, audit with actor/IP/UA, `viaSuperAdmin` flag |
| I1 | Tenant data | Cross-tenant read (IDOR) | Fail-closed tenant plugin, 404 on foreign ids, isolation suite (MIS-01) |
| I2 | Complainant PII | Harvesting by office staff | Assigned-only decrypt, purpose dialog, rate tier, anomaly alert (> 20 views/day), no export (MIS-02) |
| I3 | Logs/errors | PII in logs or error tracker | Redaction list, request bodies never logged, scrubbing in error tracker |
| I4 | Tracking page | Enumeration | No PII/notes, rate limit, uniform timing (MIS-05) |
| I5 | Backups | Stolen backup | Encrypted before upload (age), separate cloud account, least-privilege write-only key from VPS |
| D1 | Public sites | DDoS during political events | Cloudflare WAF/DDoS, ISR caching, "under attack" mode runbook |
| D2 | SMS | Cost exhaustion via OTP/complaint flood | Turnstile, per-IP/phone limits, per-tenant daily SMS cap, alert at 80 % |
| E1 | RBAC | Editor escalates to owner / officer widens scope | Server-side permission checks; membership changes owner-only + audited; tests on matrix |
| E2 | Act-as | Abuse of super admin impersonation | Reason required, 30-min expiry, banner, audit, PII endpoints refuse act-as |
| E3 | Injection | NoSQL operator injection, XSS, SSRF | zod strict schemas (strings only where strings), strip `$`/`.` keys, output encoding + sanitised Markdown + CSP, no server-side fetch of user URLs except allow-listed (YouTube oEmbed) |

## 5. Security controls checklist (maps to ASVS areas)

**Authentication & sessions** — argon2id (m=64 MB, t=3), min length 10 + breached-password check,
TOTP (RFC 6238, ±1 step), WebAuthn for platform staff, recovery codes hashed, lockout, session list,
re-auth for sensitive actions (team changes, restore, domain delete).

**Access control** — tenant plugin; permission registry; officer scope in queries; 404 for foreign ids;
act-as limits; admin SPA guards are cosmetic only.

**Input/output** — zod everywhere (length limits, enums, phone regex `^01[3-9]\d{8}$` after digit
normalisation); `$`/`.` key stripping; `escapeRegex`; React auto-escaping; Markdown allow-list
(p, strong, em, a[href to http/https], ul/ol/li); CSP: `default-src 'self'; img-src 'self' <cdn> data:;
frame-src https://www.youtube-nocookie.com; script-src 'self' challenges.cloudflare.com;
object-src 'none'; base-uri 'none'; frame-ancestors 'none'` (admin), public allows its own analytics only.

**Transport & headers** — HTTPS only (HSTS preload on platform domain), `helmet` defaults, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` minimal, CORS allow-list from env (admin origin only).

**Cryptography** — AES-256-GCM via Node `crypto`, random 96-bit IVs, AAD binding; master key 32 bytes from
secret store, versioned; tenant DEKs rotated on demand; HMAC-SHA256 for phone with separate pepper; JWT
signed with EdDSA/ES256 keys (rotatable via `kid`). No custom crypto.

**Files** — size limits (media 15 MB, complaint 5 MB × 3), allow-list jpeg/png/webp/heic, re-encode,
EXIF strip, private originals, public variants only.

**Rate limiting & abuse** — Redis tiers in doc 04 §1; Turnstile on public writes; SMS caps.

**Logging & monitoring** — structured logs with request id, no PII; audit log for all admin writes and
PII views; alerts: auth failures spike, PII view anomalies, multi-tenant edits by one super admin in 10 min,
5xx rate, queue lag, SSL < 14 days, backup failure.

**Secrets** — `.env` never committed (gitleaks in CI + pre-commit); production secrets root-only on host
or Docker secrets; rotate on staff departure; separate keys per environment.

**Dependencies & supply chain** — lockfile committed; `pnpm audit` + Dependabot/Renovate; Semgrep;
Trivy image scan; CycloneDX SBOM per release; pinned base images by digest; signed tags for releases.

## 6. Backup, recovery, incident response

- Nightly `mongodump --archive --gzip` + R2 inventory → encrypt with `age` (recipient keys held by two
  super admins offline) → upload with a write-only key to a bucket in a **separate** cloud account;
  30 daily + 12 monthly kept. Redis is not backed up (rebuildable) except BullMQ delayed jobs (scheduled
  posts are also stored in Mongo and re-queued at boot).
- Restore: request by super admin A, approve by super admin B, restore into a fresh database, verify with
  counts report, switch. Quarterly drill into staging (T6.5).
- Incident runbook (`infra/runbooks/incident.md`, to write in M5): detect → contain (revoke sessions,
  rotate keys, Cloudflare under-attack mode, suspend tenant) → assess (audit log, access logs) →
  notify (§3) → recover → post-mortem within 5 working days.

## 7. DevSecOps pipeline

PR: lint, typecheck, unit + integration + isolation + PII suites, Semgrep, gitleaks, `pnpm audit
--audit-level=high`. Main: build multi-arch images, Trivy (fail on Critical/High with fix available),
SBOM, push with immutable tag. Deploy: migrations as one-off job, health-checked rollout, rollback = previous
tag. Staging gets every main build; production on tagged release with changelog.

## 8. Risk register

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R-01 | Cross-tenant data leak through a missed scope | M | Critical | Fail-closed plugin, isolation suite, review checklist | Tech lead |
| R-02 | Complainant PII misused by an MP office for campaigning | M | High | Encryption, assigned-only, logs, anomaly alerts, contract clause with MP office | Platform owner |
| R-03 | Fake or unauthorised site for a real MP | L | High | Consent gate + document, `setup` state, legal review | Super admin lead |
| R-04 | Super admin compromise | L | Critical | WebAuthn, act-as limits, alerts, least staff | Platform owner |
| R-05 | DDoS / defacement during elections | M | High | Cloudflare, ISR cache, approval workflow, restore | Ops |
| R-06 | SMS gateway outage or cost attack | M | M | Provider abstraction, caps, alerts, fallback provider | Ops |
| R-07 | Legal non-compliance with Bangladeshi data-protection or election rules | M | High | Lawyer review (T6.7), retention jobs, EC code-of-conduct check before election periods | Platform owner |
| R-08 | Stale sites harm MP image | H | M | Stale alerts (14 days), owner reminders, mobile composer | Customer success |
| R-09 | Key loss makes PII unrecoverable | L | M | Master key escrow (two offline copies), documented rotation | Tech lead |
| R-10 | Photo licence violation | M | M | Licence/credit fields required, stock guidance | Content lead |

## 9. Compliance applicability

| Framework / law | Applicable? | Why / what we do |
|---|---|---|
| **OWASP Top 10 / ASVS 4.0 L2 / API Security Top 10** | Yes | Public web app + REST API handling PII → controls in §5, verified in T6.1–T6.2 |
| **NIST SSDF / OpenSSF / SBOM (CycloneDX)** | Yes | We ship software to customers → secure pipeline §7, SBOM per release |
| **Bangladesh data-protection & cyber-security legislation** | Yes — **verify current text with a lawyer** | Bangladesh has been revising these laws (personal data protection and cyber security ordinances were in progress/enacted around 2025). Obligations likely include lawful basis, purpose limitation, security safeguards, breach handling and possibly data localisation for certain data. T6.7 must confirm before launch; hosting region may need to change |
| **Election Commission code of conduct** | Yes, around elections | Rules on online campaigning by candidates may restrict content during election periods; add a per-tenant "election period" mode if the lawyer advises |
| ISO/IEC 27001 / 27701 | Optional (company level) | Good target for Octagram; our controls align; not a launch blocker |
| GDPR / UK GDPR / CCPA | No | No targeting of EU/UK/California residents; revisit if diaspora features are added |
| PCI DSS | No | No payments in v1 |
| Bangladesh Bank ICT guidelines | No | Not a financial institution |
| EU AI Act / NIST AI RMF | No | No AI features in v1 |

## 10. Final quality gate (before any release)

- [ ] Isolation and PII suites green; no new route without tests
- [ ] No High/Critical from Semgrep, Trivy, `pnpm audit`, pen-test
- [ ] Audit entries for every new write action
- [ ] Logs checked for PII after a staging run (grep for phone patterns)
- [ ] Backups verified by a restore in the last 90 days
- [ ] Privacy notice and complaint policy current (lawyer-reviewed)
- [ ] `HANDOFF.md` and docs updated
