import { Router, type Request } from 'express';
import { approveSchema, rejectSchema, promiseUpdateSchema, noteSchema, piiViewSchema, smsSendSchema, inviteSchema, staffComplaintSchema, permissionsFor } from '@jonoshetu/shared';
import { z } from 'zod';
import express from 'express';
import type { Deps } from '../deps.js';
import type { Services } from '../services/index.js';
import { ApiError } from '../errors.js';
import { authenticate, tenantAccess, requirePermission, limit, byUser, wrap } from '../middleware/auth.js';
import { AuditLog } from '../models/index.js';
import { isObjectId, parsePaging } from '../lib/sanitize.js';
import type { MemberCtx } from '../services/complaints.js';
import { buildDashboard } from '../services/dashboard.js';

/* Tenant admin API. Chain: authenticate -> tenantAccess (membership or act-as, else 404) -> requirePermission.
   Complaint scoping and PII rules are enforced again inside the services (defence in depth). */

const actorOf = (req: Request) => ({ userId: req.auth!.user._id, name: req.auth!.user.name, viaSuperAdmin: req.member!.viaSuperAdmin });
const memberOf = (req: Request): MemberCtx => ({ role: req.member!.role, perms: req.member!.perms, scope: req.member!.scope, viaSuperAdmin: req.member!.viaSuperAdmin, userId: String(req.auth!.user._id), name: req.auth!.user.name });
const idParam = (req: Request, name = 'id') => { const v = String(req.params[name]); if (!isObjectId(v)) throw ApiError.notFound(); return v; };
const q = (req: Request) => req.query as Record<string, string | undefined>;
const whoOf = (req: Request) => ({ userId: req.auth!.user._id, name: req.auth!.user.name, viaSuperAdmin: req.member!.viaSuperAdmin, canPublish: req.member!.perms.includes('content.publish') });
const wantsPublish = (req: Request) => q(req).publish === '1';

export function adminRoutes(d: Deps, s: Services): Router {
  const r = Router({ mergeParams: true });
  r.use(authenticate(d), tenantAccess(), limit(d.rateLimiter, 'admin', byUser));

  r.get('/me', wrap(async (req, res) => { res.json({ role: req.member!.role, viaSuperAdmin: req.member!.viaSuperAdmin, permissions: req.member!.perms, scope: req.member!.scope, tenant: { id: String(req.tenant!._id), slug: req.tenant!.slug, mpName: req.tenant!.mp.name, status: req.tenant!.status, settings: { otpRequired: req.tenant!.settings.otpRequired, slaDays: req.tenant!.settings.slaDays, complaintCategories: req.tenant!.settings.complaintCategories } } }); }));
  r.get('/dashboard', requirePermission('dashboard.view'), wrap(async (req, res) => {
    // Least privilege (BUG-2026-011): buildDashboard computes and returns only the sections this member may see
    // (complaints need view_all/view_scoped and are scoped to the officer's upazilas; content needs posts.view). No PII.
    res.json(await buildDashboard({ perms: req.member!.perms, scope: req.member!.scope }));
  }));

  /* ----- media (images). The body is the raw file; Content-Type says which of jpeg/png/webp it claims to be ----- */
  const rawImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: `${d.config.MAX_UPLOAD_MB}mb` });
  r.post('/media', requirePermission('media.upload'), limit(d.rateLimiter, 'upload', byUser), rawImage, wrap(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw ApiError.unprocessable('UNSUPPORTED_TYPE', 'JPG, PNG বা WebP ছবি দিন');
    res.status(201).json(await s.media.upload(req.body, { name: q(req).name, credit: q(req).credit }, actorOf(req)));
  }));
  // videos are streamed straight to storage (never buffered in memory); the size limit is MAX_VIDEO_MB
  r.post('/media/video', requirePermission('media.upload'), limit(d.rateLimiter, 'upload', byUser), wrap(async (req, res) => {
    const type = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    const len = req.headers['content-length'] !== undefined ? Number(req.headers['content-length']) : undefined;
    // a refusal sent before the body is read must close the socket, or the rest of a huge upload would be parsed as a new request
    if (len !== undefined && len > d.config.MAX_VIDEO_MB * 1024 * 1024) res.set('Connection', 'close');
    res.status(201).json(await s.media.uploadVideo(req, type, Number.isFinite(len) ? len : undefined, { name: q(req).name, credit: q(req).credit }, actorOf(req)));
  }));
  r.get('/media', requirePermission('media.upload'), wrap(async (req, res) => { const p = parsePaging(q(req), 48); res.json(await s.media.list(p.page, p.limit, q(req).kind)); }));
  r.delete('/media/:id', requirePermission('media.upload'), wrap(async (req, res) => { await s.media.remove(idParam(req), actorOf(req)); res.status(204).end(); }));

  /* ----- posts ----- */
  r.get('/posts', requirePermission('posts.view'), wrap(async (req, res) => { const p = parsePaging(q(req)); res.json(await s.posts.list({ status: q(req).status, category: q(req).category, q: q(req).q, ...p })); }));
  r.post('/posts', requirePermission('posts.create'), wrap(async (req, res) => { res.status(201).json(await s.posts.create(req.body, actorOf(req))); }));
  r.get('/posts/:id', requirePermission('posts.view'), wrap(async (req, res) => { res.json(await s.posts.get(idParam(req))); }));
  r.patch('/posts/:id', requirePermission('posts.create', 'posts.edit_any'), wrap(async (req, res) => { res.json(await s.posts.update(idParam(req), req.body, actorOf(req), req.member!.perms.includes('posts.edit_any'))); }));
  r.delete('/posts/:id', requirePermission('posts.delete'), wrap(async (req, res) => { await s.posts.remove(idParam(req), actorOf(req)); res.status(204).end(); }));
  r.post('/posts/:id/submit', requirePermission('posts.create'), wrap(async (req, res) => { res.json(await s.posts.submit(idParam(req), actorOf(req))); }));
  r.post('/posts/:id/withdraw', requirePermission('posts.create'), wrap(async (req, res) => { res.json(await s.posts.withdraw(idParam(req), actorOf(req))); }));
  r.post('/posts/:id/approve', requirePermission('posts.publish'), wrap(async (req, res) => { const b = approveSchema.extend({ version: z.number().int().optional() }).strict().parse(req.body ?? {}); res.json(await s.posts.approve(idParam(req), actorOf(req), b)); }));
  r.post('/posts/:id/reject', requirePermission('posts.publish'), wrap(async (req, res) => { res.json(await s.posts.reject(idParam(req), rejectSchema.parse(req.body).reason, actorOf(req))); }));
  r.post('/posts/:id/unpublish', requirePermission('posts.publish'), wrap(async (req, res) => { res.json(await s.posts.unpublish(idParam(req), actorOf(req))); }));
  r.post('/posts/:id/restore', requirePermission('posts.publish'), wrap(async (req, res) => { res.json(await s.posts.restoreArchived(idParam(req), actorOf(req))); }));
  r.get('/posts/:id/versions', requirePermission('posts.view'), wrap(async (req, res) => { res.json(await s.posts.versions(idParam(req))); }));
  r.post('/posts/:id/versions/:v/restore', requirePermission('posts.edit_any'), wrap(async (req, res) => { res.json(await s.posts.restoreVersion(idParam(req), parseInt(String(req.params.v), 10), actorOf(req))); }));

  /* ----- promises ----- */
  r.get('/promises', requirePermission('promises.edit', 'posts.view'), wrap(async (_req, res) => { res.json(await s.promises.list()); }));
  r.post('/promises', requirePermission('promises.edit'), wrap(async (req, res) => { res.status(201).json(await s.promises.create(req.body)); }));
  r.patch('/promises/:id', requirePermission('promises.edit'), wrap(async (req, res) => { res.json(await s.promises.update(idParam(req), req.body ?? {})); }));
  r.post('/promises/:id/updates', requirePermission('promises.edit'), wrap(async (req, res) => { res.json(await s.promises.addUpdate(idParam(req), promiseUpdateSchema.parse(req.body), req.auth!.user.name)); }));
  r.delete('/promises/:id', requirePermission('promises.edit'), wrap(async (req, res) => { await s.promises.remove(idParam(req)); res.status(204).end(); }));

  /* ----- site, settings, profile ----- */
  r.get('/site-config', requirePermission('site.edit'), wrap(async (_req, res) => { res.json(await s.site.getSiteConfig()); }));
  r.put('/site-config', requirePermission('site.edit'), wrap(async (req, res) => { res.json(await s.site.putSiteConfig(req.body, req.auth!.user._id)); }));
  r.get('/settings', requirePermission('settings.edit'), wrap(async (req, res) => { res.json(await s.site.getSettings(req.tenant!)); }));
  r.put('/settings', requirePermission('settings.edit'), wrap(async (req, res) => { res.json(await s.site.putSettings(req.tenant!, req.body)); }));
  // /profile is the older name of page key `profile`; it keeps returning the flat draft plus a status
  const flat = (p: Awaited<ReturnType<typeof s.pages.get>>) => ({ ...p.draft, status: p.status });
  r.get('/profile', requirePermission('profile.edit'), wrap(async (_req, res) => { res.json(flat(await s.pages.get('profile'))); }));
  // the legacy alias takes a PARTIAL profile and merges it onto the current draft; replacing the whole draft wiped every field
  // an older client did not send (portrait, milestones, education ...) (BUG-2026-021)
  r.put('/profile', requirePermission('profile.edit'), wrap(async (req, res) => {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
    const cur = await s.pages.get('profile');
    res.json(flat(await s.pages.put('profile', { ...cur.draft, ...body }, whoOf(req))));
  }));
  r.post('/profile/publish', requirePermission('profile.publish'), wrap(async (req, res) => { res.json(flat(await s.pages.publish('profile', whoOf(req)))); }));

  /* ----- site pages (draft + live) ----- */
  r.get('/pages', requirePermission('content.edit'), wrap(async (_req, res) => { res.json(await s.pages.list()); }));
  r.get('/pages/:key', requirePermission('content.edit'), wrap(async (req, res) => { res.json(await s.pages.get(String(req.params.key))); }));
  r.put('/pages/:key', requirePermission('content.edit'), wrap(async (req, res) => { res.json(await s.pages.put(String(req.params.key), req.body, whoOf(req))); }));
  r.post('/pages/:key/publish', requirePermission('content.publish'), wrap(async (req, res) => { res.json(await s.pages.publish(String(req.params.key), whoOf(req))); }));
  r.post('/pages/:key/discard', requirePermission('content.edit'), wrap(async (req, res) => { res.json(await s.pages.discard(String(req.params.key))); }));

  /* ----- events, gallery, videos (draft/published items) ----- */
  type Crud = { list(f: { status?: string; q?: string; page: number; limit: number }): Promise<unknown>; get(id: string): Promise<unknown>; create(b: unknown, w: ReturnType<typeof whoOf>, p?: boolean): Promise<unknown>; update(id: string, b: unknown, w: ReturnType<typeof whoOf>, p?: boolean): Promise<unknown>; remove(id: string, w: ReturnType<typeof whoOf>): Promise<void>; setStatus(id: string, st: 'draft' | 'published'): Promise<unknown>; reorder(ids: string[]): Promise<void> };
  const collection = (path: string, svc: Crud, reorder: boolean) => {
    if (reorder) r.post(`/${path}/reorder`, requirePermission('content.edit'), wrap(async (req, res) => { await svc.reorder((req.body as { ids?: string[] })?.ids ?? []); res.status(204).end(); }));
    r.get(`/${path}`, requirePermission('content.edit'), wrap(async (req, res) => { const p = parsePaging(q(req), 100); res.json(await svc.list({ status: q(req).status, q: q(req).q, page: p.page, limit: p.limit })); }));
    r.post(`/${path}`, requirePermission('content.edit'), wrap(async (req, res) => { res.status(201).json(await svc.create(req.body, whoOf(req), wantsPublish(req))); }));
    r.get(`/${path}/:id`, requirePermission('content.edit'), wrap(async (req, res) => { res.json(await svc.get(idParam(req))); }));
    r.patch(`/${path}/:id`, requirePermission('content.edit'), wrap(async (req, res) => { res.json(await svc.update(idParam(req), req.body, whoOf(req), wantsPublish(req))); }));
    r.delete(`/${path}/:id`, requirePermission('content.edit'), wrap(async (req, res) => { await svc.remove(idParam(req), whoOf(req)); res.status(204).end(); }));
    r.post(`/${path}/:id/publish`, requirePermission('content.publish'), wrap(async (req, res) => { res.json(await svc.setStatus(idParam(req), 'published')); }));
    r.post(`/${path}/:id/unpublish`, requirePermission('content.publish'), wrap(async (req, res) => { res.json(await svc.setStatus(idParam(req), 'draft')); }));
  };
  collection('events', s.events as unknown as Crud, false);
  collection('gallery', s.gallery as unknown as Crud, true);
  collection('videos', s.videos as unknown as Crud, true);

  /* ----- complaints (export first so ":id" does not swallow it) ----- */
  r.get('/complaints/export.csv', requirePermission('complaints.export'), wrap(async (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="complaints.csv"');
    res.send(await s.complaints.exportCsv(memberOf(req)));
  }));
  r.get('/complaints', requirePermission('complaints.view_all', 'complaints.view_scoped'), wrap(async (req, res) => {
    const p = parsePaging(q(req));
    res.json(await s.complaints.list(memberOf(req), { status: q(req).status, upazila: q(req).upazila, q: q(req).q, mine: q(req).mine === '1', late: q(req).late === '1', page: p.page, limit: p.limit }));
  }));
  r.post('/complaints', requirePermission('complaints.create_staff'), wrap(async (req, res) => {
    const channel = z.enum(['hearing', 'phone']).parse((req.body ?? {}).channel);
    const { channel: _c, ...rest } = req.body ?? {};
    res.status(201).json(await s.complaints.submit(req.tenant!, staffComplaintSchema.parse({ ...rest, turnstileToken: 'staff' }), { ip: req.ip ?? '' }, { channel, userName: req.auth!.user.name }));
  }));
  r.get('/complaints/:id', requirePermission('complaints.view_all', 'complaints.view_scoped'), wrap(async (req, res) => { res.json(await s.complaints.get(memberOf(req), idParam(req))); }));
  r.patch('/complaints/:id', requirePermission('complaints.manage', 'complaints.view_scoped'), wrap(async (req, res) => { res.json(await s.complaints.patch(req.tenant!, memberOf(req), idParam(req), req.body)); }));
  r.post('/complaints/:id/notes', requirePermission('complaints.note', 'complaints.manage'), wrap(async (req, res) => { await s.complaints.addNote(memberOf(req), idParam(req), noteSchema.parse(req.body).text); res.status(201).end(); }));
  r.post('/complaints/:id/sms', requirePermission('complaints.manage', 'complaints.view_scoped'), wrap(async (req, res) => { res.json(await s.complaints.sendSms(req.tenant!, memberOf(req), idParam(req), smsSendSchema.parse(req.body).templateKey)); }));
  r.post('/complaints/:id/pii-view', requirePermission('complaints.pii_view'), wrap(async (req, res) => { res.json(await s.complaints.viewPii(req.tenant!, memberOf(req), idParam(req), piiViewSchema.parse(req.body).purpose)); }));

  /* ----- team ----- */
  r.get('/team', requirePermission('team.manage'), wrap(async (req, res) => { res.json(await s.team.list(req.tenant!)); }));
  r.post('/team/invites', requirePermission('team.manage'), wrap(async (req, res) => { res.status(201).json(await s.team.invite(req.tenant!, inviteSchema.parse(req.body), req.auth!.user._id)); }));
  r.patch('/team/:id', requirePermission('team.manage'), wrap(async (req, res) => { const b = z.object({ upazilas: z.array(z.string().min(2).max(60)).max(10) }).strict().parse(req.body); await s.team.setScope(req.tenant!, idParam(req), b.upazilas); res.status(204).end(); }));
  r.delete('/team/:id', requirePermission('team.manage'), wrap(async (req, res) => { await s.team.remove(req.tenant!, idParam(req)); res.status(204).end(); }));

  /* ----- audit ----- */
  r.get('/audit', requirePermission('audit.view'), wrap(async (req, res) => {
    const { page, limit } = parsePaging(q(req));
    const f = { tenantId: req.tenant!._id };
    const [rows, total] = await Promise.all([AuditLog.find(f).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).select('-ip -userAgent').lean(), AuditLog.countDocuments(f)]);
    // BUG-2026-019: no IP / browser details for anyone in the office; a complaint row's free-text reason (e.g. why an officer
    // opened an identity) can describe the citizen, so it is dropped too
    const items = rows.map((a) => (a.action.startsWith('complaint.') ? { ...a, reason: undefined } : a));
    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  }));

  void permissionsFor;
  return r;
}
