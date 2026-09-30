# 05 · Design patterns & code conventions — Jonoshetu

These are rules, not suggestions. A pull request that breaks §3 (tenant scoping) or §6 (PII) is rejected.

## 1. Monorepo layout (pnpm workspaces, TypeScript everywhere)

```
apps/
  api/                 Express API + worker (same codebase, two entry points)
    src/
      server.ts        http bootstrap (env guard → db → app.listen)
      worker.ts        BullMQ consumers
      app.ts           express app: middleware, routes, error handler
      config/env.ts    zod-validated env; process exits if invalid
      context/         AsyncLocalStorage request context (tenant, actor)
      middleware/      authenticate, loadMembership, actAs, requirePermission, rateLimit, sanitize, error
      modules/
        posts/         posts.routes.ts · posts.controller.ts · posts.service.ts · posts.model.ts · posts.schemas.ts · posts.test.ts
        complaints/ …  (one folder per domain: auth, tenants, domains, users, memberships, profile, promises,
                       area, site-config, media, videos, events, offices, complaints, sms, analytics, audit, backups)
      lib/             crypto (envelope encryption), sms provider adapters, domain provider, storage (S3/R2),
                       turnstile, counters, slug, bangla (digits/dates), logger (pino + redaction)
      plugins/         tenantScoped, softDelete, versioned
      jobs/            image.process, sms.send, post.publishScheduled, complaint.slaReminder, revalidate,
                       domain.poll, backup.daily, retention.purge
    migrations/
  web-public/          Next.js (App Router) — app/[...]/ routes, server components fetch from api
  web-admin/           React + Vite SPA — routes/super/*, routes/tenant/*
packages/
  shared/              zod schemas, permission registry, enums, status machines, types
  ui-tokens/           CSS variables + font setup shared by web-public and web-admin (from the demos)
  bangla/              formatNumber (Bangla digits + lakh grouping), formatDate, month names, transliterated slug
infra/                 docker-compose.*.yml, Caddyfile, backup scripts, runbooks
```

## 2. Layering: route → controller → service → model

- **route**: path + middleware chain + controller function. No logic.
- **controller**: parse & validate (`schema.parse(req.body)`), call one service function, map result to
  HTTP. Wrapped in `asyncHandler`. No DB access.
- **service**: business rules, permissions beyond RBAC (e.g. "officer can only change status of assigned
  complaints"), state machines, DB calls, audit, queueing jobs. No `req`/`res`.
- **model**: Mongoose schema + plugins + indexes. No business logic beyond field validation.

Errors: throw `new ApiError(status, code, bnMessage, details?)`; one error middleware renders the JSON shape
from doc 04 §1 and logs server errors with the request id (never the body).

## 3. Tenant scoping (the most important pattern)

```ts
// context/request-context.ts
export type Ctx = { requestId: string; tenantId?: ObjectId; actor?: Actor; viaSuperAdmin?: boolean };
export const als = new AsyncLocalStorage<Ctx>();
export const ctx = () => als.getStore();

// plugins/tenantScoped.ts (applied to every tenant model)
export function tenantScoped(schema: Schema) {
  schema.add({ tenantId: { type: Types.ObjectId, required: true, index: true, immutable: true } });
  const ops = ['find','findOne','countDocuments','findOneAndUpdate','updateOne','updateMany',
               'deleteOne','deleteMany','findOneAndDelete','replaceOne','distinct'] as const;
  for (const op of ops) schema.pre(op, function () {
    const q = this.getQuery();
    if (q.tenantId) return;                       // explicit (jobs, super admin)
    const t = ctx()?.tenantId;
    if (!t) throw new Error(`tenantScoped: no tenant context for ${op}`);   // FAIL CLOSED
    this.where({ tenantId: t });
  });
  schema.pre('aggregate', function () {
    const first = this.pipeline()[0];
    if (first?.$match?.tenantId) return;
    const t = ctx()?.tenantId;
    if (!t) throw new Error('tenantScoped: no tenant context for aggregate');
    this.pipeline().unshift({ $match: { tenantId: t } });
  });
  schema.pre('save', function () { if (!this.tenantId) this.tenantId = ctx()?.tenantId ?? fail(); });
  schema.pre('insertMany', function (next, docs) { /* set/verify tenantId on each doc */ next(); });
}
```

Rules:
- Never use `Model.collection.*` (raw driver) on tenant collections outside migrations.
- Cross-entity writes re-verify ownership: linking `mediaId` into a post must load that media **through the
  scoped model** first.
- Jobs carry `tenantId` in the payload and run inside `als.run({ tenantId }, …)`.
- Super admin cross-tenant reads use explicit `{ tenantId: { $in: [...] } }` in the `super` module only.

## 4. Request context, auth, RBAC

- `authenticate` verifies the access JWT (`sub`, `sid`), checks the session id still exists on the user
  (revocation), loads the user (cached 60 s).
- `loadMembership(tenantId)` → role + scope; or `actAs` validates an act-as token (bound to `sid`, not
  expired, tenant matches) and sets `viaSuperAdmin = true`.
- `requirePermission(...perms)` uses `packages/shared/permissions.ts` (`hasPermission(granted, perm)`),
  OR-semantics.
- Officer scope is enforced **in the service query** (`upazila: { $in: scope.upazilas }`), not only in the UI.

## 5. Workflow state machines

State machines live in `packages/shared/workflows.ts` and are used by both API (authoritative) and UI
(to show only valid buttons):

```ts
export const postTransitions = {
  draft:     { submit: 'review', delete: 'deleted' },
  review:    { approve: 'published', schedule: 'scheduled', reject: 'rejected', withdraw: 'draft' },
  rejected:  { edit: 'draft' },
  scheduled: { publishNow: 'published', cancel: 'review' },
  published: { unpublish: 'archived', edit: 'review' },   // editing a live post creates a review copy
  archived:  { restore: 'review' },
} as const;
export const complaintTransitions = {
  new: ['verify','spam'], verify: ['progress','spam'], progress: ['solved'], solved: ['closed','progress'], closed: [], spam: ['new'],
} as const;
```

Transition service pattern: load (scoped) → check permission → check transition → update with
`{ _id, version }` filter and `$inc: { version: 1 }` → on 0 matched → 409 → write version snapshot →
audit → enqueue side effects (revalidate, SMS, notify).

## 6. PII handling (ADR-0004)

- `lib/crypto.ts`: envelope encryption. A master key (from env/secret store, 32 bytes, versioned) wraps a
  random per-tenant DEK (`tenants.dek`). Fields encrypted with AES-256-GCM; stored as
  `v1:<keyVersion>:<iv b64>:<ciphertext b64>:<tag b64>`. AAD = `tenantId + complaintId + fieldName` so a
  ciphertext can't be moved to another record.
- `phoneHmac = HMAC-SHA256(normalizedPhone, PHONE_PEPPER)` for rate limits and "same person" grouping.
- Only `complaints.service.viewPii()` decrypts; it checks assignment, refuses act-as, rate-limits, writes
  `complaintEvents(pii_view)` + audit, returns plaintext once (never cached, never logged).
- Logger redaction list: `password, passwordHash, token, refresh, otp, code, phone, name(in complaint
  bodies), pii, description, authorization, cookie`.
- SMS sending takes the complaint id and decrypts inside the worker; the phone never enters queues or logs.

## 7. Testing

| Layer | Tool | Must cover |
|---|---|---|
| Unit | Vitest | services, state machines, crypto round-trip + tamper detection, Bangla formatters |
| Integration | Vitest + Supertest + `mongodb-memory-server` (replica set) + Redis test container | every route: auth required, permission denied, validation, happy path |
| **Tenant isolation suite** | same | seeds tenants A and B; for every tenant route, a user of A requesting B's ids gets 404 and no data; aggregate endpoints never include B |
| PII suite | same | owner/editor/support/act-as can never get PII; officer only for assigned; each view creates an audit row |
| E2E | Playwright (Edge/Chromium) | the demo flows: PR submit → owner approve → public page; complaint submit → track → officer resolve; super admin create tenant (consent gate) |
| Accessibility | axe-core in Playwright | public pages and admin forms |
| Load | k6 | public pages 50 rps, complaint submit burst with rate limits |

CI fails under 80 % service-layer coverage or any failure in isolation/PII suites.

## 8. Front-end patterns

- **web-public**: server components fetch with `fetch(API, { next: { tags: [...] } })`; client components
  only for slideshow, lightbox, filters, forms. Reuse the demo's CSS as the starting stylesheet (tokens in
  `packages/ui-tokens`). Images via `next/image` with the R2 CDN loader.
- **web-admin**: TanStack Query for server state, React Hook Form + zod resolver (shared schemas), route
  guards from the permission registry (UI hint only — API is authoritative), optimistic updates only for
  toggles. Mobile-first layouts for composer and inbox.
- Access token in memory only; refresh cookie httpOnly. No tokens in `localStorage`.
- Any user-provided text rendered as text; Markdown rendered through an allow-list sanitizer
  (DOMPurify/rehype-sanitize) on the server for public pages.

## 9. Other house patterns

| Pattern | Use |
|---|---|
| Env guard at boot (zod) | missing/invalid env → exit 1 before connecting |
| `pick`/zod strip | never pass `req.body` to Mongoose |
| `escapeRegex` | any user text used in a regex |
| `Counter` collection | tracking IDs; atomic `$inc` |
| Soft delete plugin | posts, promises, media, memberships |
| Fire-and-forget audit | `audit.log()` never throws; failures go to error tracking |
| Provider adapters | `SmsProvider`, `DomainProvider`, `StorageProvider` interfaces; config-driven selection |
| Lazy period counters | per-tenant daily SMS cap (`smsDayKey` + count) — no cron resets |
| Health check | `/health` returns 503 when Mongo/Redis down |
| Graceful shutdown | SIGTERM → stop accepting, drain queues, close Mongo |

## 10. Git & review

- Branch per task `feat/T2.3-post-workflow`; PR template includes: requirement IDs, tenant-scope check,
  PII check, tests added, screenshots for UI.
- Conventional commits. `main` is protected; CI (lint, typecheck, tests, audit, secret scan) must pass.
- Update `HANDOFF.md` and the relevant doc in the same PR when behaviour or a decision changes.
