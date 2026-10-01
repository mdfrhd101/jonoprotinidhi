# 00 · START HERE — Jonoprotinidhi (জনপ্রতিনিধি)

> Read this file first, then follow the reading order below. Everything a new developer (or their Claude)
> needs is in this repo; nothing lives only in someone's head.
> Last updated: 30 September 2026.

## 1. What we are building (one paragraph)

**Jonoprotinidhi** is a multi-tenant platform, hosted and operated by our company, that gives each Bangladeshi
Member of Parliament (MP) or minister a **premium public website** plus a **CMS / admin panel** and a
**citizen complaint box**. The site builds the MP's image through *real work, transparency and
accountability* — activities, a public promise tracker with progress and delay reasons, constituency data,
and complaint statistics — not through exaggeration. MPs are non-technical: we (the **Super Admin**) create
their account, host everything, manage domains, and can fix any content on any MP's site, with every such
action written to an audit log.

## 2. Current state (30 Sep 2026)

| Item | Where | State |
|---|---|---|
| Public site demo (fictional MP, 10 pages) | `client-demo/demo-mp/` | ✅ Done — the **visual and content spec** for the public site |
| Super Admin + MP Admin panel demos | `client-demo/admin/` | ✅ Done — the **UX spec** for both panels (static, localStorage) |
| Real-MP demo (public facts only, never publish) | `client-demo/mirza-abbas/` | Reference only |
| Product (MERN) | — | ⬜ Not started. Start at `docs/07-TASKS.md` milestone M0 |

The demos are static HTML/JS with no backend. They define *what* the product looks and behaves like.
The product is a fresh build following docs 01–08.

## 3. Reading order

1. `docs/00-START-HERE.md` (this file) — context, decisions, rules, glossary
2. `HANDOFF.md` — the owner's running project log (English); design feedback history and legal rules
3. `docs/01-PRD.md` — what the product must do (requirement IDs used everywhere else)
4. `docs/02-ARCHITECTURE.md` — system shape, tenancy, request flows, deployment
5. `docs/03-DATA-MODEL.md` — MongoDB collections, fields, indexes, encryption
6. `docs/04-API.md` — REST endpoints, permissions, errors
7. `docs/05-DESIGN-PATTERNS.md` — code conventions and the patterns every module must follow
8. `docs/06-UI-UX.md` — design system, page inventory, UX rules
9. `docs/07-TASKS.md` — milestones and tasks with acceptance criteria
10. `docs/08-SECURITY.md` — threat model, privacy, compliance, risk register
11. `adr/` — why each big decision was made

## 4. Decisions already made (do not re-open without the owner)

| # | Decision | ADR |
|---|---|---|
| D1 | One multi-tenant platform we host (not one server per MP). Strict tenant isolation; rival parties' MPs can share it | ADR-0001 |
| D2 | Stack: **MERN** — MongoDB + Express API + React. Public sites in **Next.js** (React, server-rendered for SEO and Facebook/WhatsApp link previews); admin panels as a **React (Vite) SPA** | ADR-0002 |
| D3 | Tenant isolation in MongoDB: single database, `tenantId` on every tenant document, enforced by a fail-closed Mongoose plugin + tests | ADR-0003 |
| D4 | Complainant name, phone, date of birth and NID encrypted at field level; only the assigned officer can view, and each view is logged. Not even Super Admin sees them | ADR-0004 |
| D5 | Content workflow Draft → Review → Publish; nothing goes live without the MP (owner) approving | ADR-0005 |
| D6 | Sites served on `<slug>.<platform-domain>`; optional custom domain per MP, routed by `Host` header, TLS via Cloudflare for SaaS | ADR-0006 |
| D7 | Complaint OTP is **optional by default, and each MP can make it mandatory**; no anonymous complaints: name, mobile, date of birth and NID are required (owner, 2 Oct 2026) | ADR-0007, ADR-0009 |
| D8 | Invented content never goes under a real politician's name; full-content demos use the fictional MP only | ADR-0008 |
| D9 | Project name: **জনপ্রতিনিধি (Jonoprotinidhi)** | — |
| D10 | Other devs may use Claude Code (repo + `CLAUDE.md`) or claude.ai (upload `HANDOFF_BUNDLE.md`) | — |

**Still open** (ask the owner; don't guess): party colours/symbol policy, first real client and their
office's written consent + content, hosting provider and pricing, which Bangladeshi SMS gateway, the final
production domain.

## 5. Non-negotiable rules

**Content & legal**
- Never put invented activities, news, statistics or quotes under a real politician's name — not even marked
  "sample". A screenshot of a fake page is fake news.
- A real MP's site is built only from verifiable facts and content supplied by their office, and goes live
  only with the office's written consent (the "new MP" flow enforces a consent checkbox + document reference).
- Photos: only licensed (MP office's own, or Wikimedia Commons CC0 / CC BY / CC BY-SA) with credit shown.
- No party symbol or logo without the office's permission.

**Security & privacy** (details in `docs/08-SECURITY.md`)
- Every tenant document carries `tenantId`; every query is tenant-scoped; a missing scope must throw, not
  return everything.
- Complainant PII is encrypted, need-to-know, never exported, never used for campaigning without separate
  consent. Only aggregate complaint statistics are public.
- 2FA is mandatory for every admin. Every admin write goes to an append-only audit log.
- No secrets in code or git. `.env.example` only.

**Design** (details in `docs/06-UI-UX.md`)
- "Cinematic premium": real full-bleed photography, dark overlays, huge serif name, brass as the only
  accent, near-square corners, Bangla digits everywhere. "Simple" means uncluttered, not plain.
- Multi-page public site, never a single long page. The complaint box has its own page.

## 6. Repo map

```
CLAUDE.md               instructions any Claude session loads automatically
HANDOFF.md              owner's project log (English) — update after each work session
KICKOFF_PROMPT.md       copy-paste prompts to start a new Claude session
HANDOFF_BUNDLE.md       everything in one file for claude.ai (generated: python scripts/build-bundle.py)
docs/00..08             the kit (this folder)
adr/                    architecture decision records
client-demo/
  demo-mp/              public site demo (index, about, biography, activities, activity, promises, area,
                        gallery, complaint, contact) — assets/data.js holds all content
  admin/                Super Admin + MP Admin demos (index, super, mp) — share localStorage with demo-mp
  mirza-abbas/          real-MP demo, public facts only — never publish
  MP_INFO.md            intake form for a real client's information
  _archive/             superseded demo versions
scripts/build-bundle.py regenerates HANDOFF_BUNDLE.md
```

Product code will live in `apps/` and `packages/` (see `docs/05-DESIGN-PATTERNS.md` §1).

## 7. Run the demos

No build step. Photos load from Wikimedia, so you need internet.

```bash
python -m http.server 8765 --bind 127.0.0.1 --directory client-demo
```

- Public site: <http://localhost:8765/demo-mp/>
- Admin panels: <http://localhost:8765/admin/> (role switcher in the MP panel top bar; "reset demo" on the
  entry page). An approved post, a promise update or a homepage change in the admin shows on the public demo
  immediately (shared `localStorage`, key `jonoprotinidhi-demo-cms`).

## 8. Glossary

| Term | Meaning |
|---|---|
| Tenant | One MP/minister's site + data. Identified by `tenantId` and a slug (e.g. `ndp3`) |
| Super Admin | Our company's platform staff. Manage tenants, domains, backups; can act inside any tenant (audited) |
| Owner | The MP/minister. Approves and publishes content, sees all complaints (without PII) |
| Editor (PR) | MP office staff who write posts and upload photos; cannot publish |
| Officer | Complaint officer scoped to one or more upazilas; sees PII only for complaints assigned to them |
| Activity / post | A news item about the MP's work (কার্যক্রম), with an album |
| Promise | An election promise tracked with budget, deadline, progress %, updates and delay reason |
| Complaint | A citizen submission with a tracking ID like `NDP3-2026-01241`; status new → verify → progress → solved → closed |
| Upazila / Union / Pourashava / Ward | Bangladeshi administrative units: sub-district / rural council / municipality / ward |
| Seat (আসন) | Parliamentary constituency, e.g. "নদীপুর-৩" (fictional) |
| GRS / 333 | Government's national grievance redress system / national helpline — mentioned on the complaint page |
| SLA | Target days to resolve a complaint (per-tenant setting, default 7) |

## 9. Working with Claude on this repo

- **Claude Code**: open the repo folder; `CLAUDE.md` loads automatically. Use `KICKOFF_PROMPT.md` §1 as the
  first message.
- **claude.ai**: create a Project, upload `HANDOFF_BUNDLE.md` as project knowledge, use `KICKOFF_PROMPT.md` §2.
- Talk to the owner in **Bangla**. Code, commits and these docs are in English; UI copy is Bangla.
- After each work session: append to `HANDOFF.md` (dated), keep docs in sync with any decision, regenerate
  the bundle.
