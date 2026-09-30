import { Router } from 'express';
import { tenantCreateSchema, tenantStatusSchema, actAsSchema, domainAddSchema, slugSchema, type PlatformRole } from '@jonoprotinidhi/shared';
import type { Deps } from '../deps.js';
import type { TenantService } from '../services/tenants.js';
import { ApiError } from '../errors.js';
import { authenticate, requirePlatformRole, wrap } from '../middleware/auth.js';
import { signAccess } from '../lib/tokens.js';
import { AuditLog, Tenant } from '../models/index.js';
import { audit } from '../lib/audit.js';
import { escapeRegex, isObjectId, parsePaging } from '../lib/sanitize.js';

/* Platform-owner panel API. `support` staff are read-only; every write needs super_admin.
   Nothing here returns complainant identity or complaint text: the Super Admin sees counts and site status only. */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DHAKA_MS = 6 * 3600_000;
/** 'YYYY-MM-DD' (a Dhaka calendar day) -> the UTC instant of 00:00 Asia/Dhaka on that day. */
const dhakaDayStart = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y!, m! - 1, d!) - DHAKA_MS); };

type AuditDoc = {
  _id: unknown; tenantId?: unknown; action: string; at?: Date; reason?: string | null; ip?: string | null;
  actor?: { userId?: unknown; name?: string | null; role?: string | null; viaSuperAdmin?: boolean | null } | null;
  entity?: { type?: string | null; id?: string | null; label?: string | null } | null; diff?: { before?: unknown; after?: unknown } | null;
};

/** What a platform staff member may see of one audit row. The user agent is never sent. For complaint.* rows the free-text
    reason (e.g. why an officer opened an identity) and the IP (a citizen's, for a public submission) are dropped; the IP of
    an authenticated admin action is shown to super admins only (security investigations), never to support. */
export function auditForStaff(a: AuditDoc, role: PlatformRole, tenantName: string | null) {
  const complaint = a.action.startsWith('complaint.');
  return {
    _id: String(a._id), tenantId: a.tenantId ? String(a.tenantId) : null, tenantName,
    actor: a.actor ? { name: a.actor.name ?? null, role: a.actor.role ?? null, viaSuperAdmin: !!a.actor.viaSuperAdmin } : null,
    action: a.action, entity: a.entity ?? null, diff: a.diff ?? null,
    reason: complaint ? null : a.reason ?? null,
    ip: role === 'super_admin' && !complaint && a.actor?.userId ? a.ip ?? null : null,
    at: a.at ?? null,
  };
}

export function superRoutes(d: Deps, tenants: TenantService): Router {
  const r = Router();
  const superOnly = requirePlatformRole('super_admin');
  r.use(authenticate(d), requirePlatformRole('super_admin', 'support'));

  r.get('/dashboard', wrap(async (_req, res) => { res.json(await tenants.dashboard()); }));

  r.get('/tenants', wrap(async (_req, res) => { res.json(await tenants.list()); }));
  r.post('/tenants', superOnly, wrap(async (req, res) => {
    const out = await tenants.create(tenantCreateSchema.parse(req.body), req.auth!.user._id);
    res.status(201).json({ id: String(out.tenant._id), slug: out.tenant.slug, status: out.tenant.status, inviteToken: out.inviteToken });
  }));
  /** Wizard helper: is this subdomain still free? Only creators need it. */
  r.get('/slug-available', superOnly, wrap(async (req, res) => {
    res.json(await tenants.slugAvailable(slugSchema.parse(String(req.query.slug ?? '').toLowerCase())));
  }));
  r.get('/tenants/:id', wrap(async (req, res) => {
    const id = String(req.params.id); if (!isObjectId(id)) throw ApiError.notFound();
    const g = await tenants.get(id);
    const t = g.tenant;
    res.json({
      tenant: { id: String(t._id), slug: t.slug, mp: t.mp, status: t.status, plan: t.plan, settings: t.settings, consent: { documentRef: t.consent.documentRef, receivedAt: t.consent.receivedAt }, statusHistory: t.statusHistory, createdAt: t.get('createdAt') },
      summary: g.summary, domains: g.domains, dnsTarget: `sites.${d.config.PLATFORM_DOMAIN}`,
      team: g.team, content: g.content, usage: g.usage, complaints: g.complaints, audit: g.audit,
    });
  }));
  r.post('/tenants/:id/status', superOnly, wrap(async (req, res) => {
    const id = String(req.params.id); if (!isObjectId(id)) throw ApiError.notFound();
    const b = tenantStatusSchema.parse(req.body);
    res.json(await tenants.setStatus(id, b.to, b.reason, b.contentChecked));
  }));

  /** Act-as: a short-lived token bound to this session and this tenant. Reason is mandatory and audited. */
  r.post('/tenants/:id/act-as', wrap(async (req, res) => {
    const id = String(req.params.id); if (!isObjectId(id)) throw ApiError.notFound();
    const b = actAsSchema.parse(req.body);
    const t = await Tenant.findById(id); if (!t) throw ApiError.notFound();
    const ttl = d.config.ACT_AS_TTL_SEC;
    const token = signAccess(d.config.JWT_SECRET, { sub: String(req.auth!.user._id), sid: req.auth!.sid, act: { tenantId: String(t._id) }, ttlSec: ttl });
    await audit({ action: 'tenant.act_as', tenantId: t._id, entity: { type: 'tenant', id: t._id, label: t.mp.name }, reason: b.reason });
    res.json({ actAsToken: token, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), tenantId: String(t._id) });
  }));

  r.get('/domains', wrap(async (_req, res) => { res.json({ items: await tenants.listDomains(), dnsTarget: `sites.${d.config.PLATFORM_DOMAIN}` }); }));
  r.post('/tenants/:id/domains', superOnly, wrap(async (req, res) => {
    const id = String(req.params.id); if (!isObjectId(id)) throw ApiError.notFound();
    const dom = await tenants.addDomain(id, domainAddSchema.parse(req.body).host);
    res.status(201).json({ id: String(dom._id), host: dom.host, instructions: [{ type: 'CNAME', name: dom.host, value: `sites.${d.config.PLATFORM_DOMAIN}` }, { type: 'TXT', name: dom.verification?.txtName, value: dom.verification?.txtValue }] });
  }));
  r.post('/domains/:id/verify', superOnly, wrap(async (req, res) => { const id = String(req.params.id); if (!isObjectId(id)) throw ApiError.notFound(); res.json(await tenants.verifyDomain(id)); }));
  r.post('/domains/:id/primary', superOnly, wrap(async (req, res) => { const id = String(req.params.id); if (!isObjectId(id)) throw ApiError.notFound(); await tenants.setPrimary(id); res.status(204).end(); }));

  /** Global audit log (FR-SA-06). Filters: tenantId, actorType (super|office), action (prefix), actor (name contains), from/to (Dhaka days). */
  r.get('/audit', wrap(async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const { page, limit } = parsePaging(q);
    const f: Record<string, unknown> = {};
    if (typeof q.tenantId === 'string' && isObjectId(q.tenantId)) f.tenantId = q.tenantId;
    if (q.actorType === 'super') f['actor.viaSuperAdmin'] = true;
    if (q.actorType === 'office') f['actor.viaSuperAdmin'] = { $ne: true };
    if (typeof q.action === 'string' && /^[a-z_.]{1,40}$/.test(q.action)) f.action = new RegExp('^' + q.action.replace(/\./g, '\\.'));
    if (typeof q.actor === 'string' && q.actor.trim()) f['actor.name'] = new RegExp(escapeRegex(q.actor.trim().slice(0, 60)), 'i');
    const at: Record<string, Date> = {};
    if (typeof q.from === 'string' && DAY_RE.test(q.from)) at.$gte = dhakaDayStart(q.from);
    if (typeof q.to === 'string' && DAY_RE.test(q.to)) at.$lt = new Date(dhakaDayStart(q.to).getTime() + 86400_000);
    if (Object.keys(at).length) f.at = at;
    const [rows, total] = await Promise.all([AuditLog.find(f).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).select('-userAgent').lean(), AuditLog.countDocuments(f)]);
    const tids = [...new Set(rows.map((a) => a.tenantId).filter(Boolean).map(String))];
    const names = new Map((await Tenant.find({ _id: { $in: tids } }).select('mp.name').lean()).map((t) => [String(t._id), t.mp.name]));
    const role = req.auth!.user.platformRole as PlatformRole;
    const items = rows.map((a) => auditForStaff(a as unknown as AuditDoc, role, a.tenantId ? names.get(String(a.tenantId)) ?? null : null));
    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  }));
  return r;
}
