import { Router } from 'express';
import { z } from 'zod';
import { bdMobile } from '@jonoshetu/shared';
import type { Deps } from '../deps.js';
import type { Services } from '../services/index.js';
import { wrap, limit, byIp } from '../middleware/auth.js';
import { parsePaging } from '../lib/sanitize.js';
import { ctx, runInTenant } from '../context.js';
import { ApiError } from '../errors.js';
import { Tenant } from '../models/index.js';

/* Public API: the tenant comes from the Host header, never from a URL id. Only approved, public data is returned. */

/** Uploaded images and videos. The URL carries the tenant id (a public file has no Host to resolve); ids are random and never reused.
    Supports HTTP Range so browsers can seek inside videos. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header || header.includes(',')) return null; // no range (or multi-range, which we do not support): serve the whole file
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number, end: number;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; } // suffix range: the last N bytes
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

export function mediaFileRoute(d: Deps, s: Services): Router {
  const r = Router();
  r.get('/media/:tenantId/:file', limit(d.rateLimiter, 'public', byIp), wrap(async (req, res) => {
    const tenantId = String(req.params.tenantId), m = /^([a-f0-9]{24})\.(webp|mp4|webm)$/.exec(String(req.params.file));
    if (!/^[a-f0-9]{24}$/.test(tenantId) || !m) throw ApiError.notFound();
    const t = await Tenant.findById(tenantId).select('status').lean();
    if (!t || t.status === 'suspended') throw ApiError.notFound();
    const f = await runInTenant(tenantId, () => s.media.open(m[1]!, m[2]!));
    if (!f) throw ApiError.notFound();
    res.set({ 'Content-Type': f.contentType, 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Disposition': 'inline', 'Accept-Ranges': 'bytes' });
    const range = parseRange(req.headers.range, f.size);
    if (range === 'invalid') { res.set('Content-Range', `bytes */${f.size}`); res.status(416).end(); return; }
    if (range) {
      res.status(206).set({ 'Content-Range': `bytes ${range.start}-${range.end}/${f.size}`, 'Content-Length': String(range.end - range.start + 1) });
      f.stream(range).on('error', () => res.destroy()).pipe(res);
    } else {
      res.set('Content-Length', String(f.size));
      if (req.method === 'HEAD') { res.end(); return; }
      f.stream().on('error', () => res.destroy()).pipe(res);
    }
  }));
  return r;
}

export function publicRoutes(d: Deps, s: Services): Router {
  const r = Router();
  r.use(limit(d.rateLimiter, 'public', byIp));
  r.use(wrap(async (req, res, next) => {
    const { tenant, domain } = await s.tenants.resolveHost(String(req.headers['x-forwarded-host'] && d.config.NODE_ENV !== 'production' ? req.headers['x-forwarded-host'] : req.headers.host ?? ''));
    req.tenant = tenant;
    (req as unknown as { domain: string }).domain = domain;
    const c = ctx(); if (c) c.tenantId = tenant._id;
    res.setHeader('Cache-Control', 'public, max-age=30');
    next();
  }));

  r.get('/site', wrap(async (req, res) => { res.json(await s.site.publicSite(req.tenant!, (req as unknown as { domain: string }).domain)); }));
  r.get('/profile', wrap(async (_req, res) => { res.json(await s.pages.publicProfileData()); }));
  r.get('/pages/:key', wrap(async (req, res) => { res.json(await s.pages.publicPage(String(req.params.key))); }));
  r.get('/events', wrap(async (req, res) => { res.json({ items: await s.events.publicUpcoming(Math.min(50, Number(req.query.limit) || 12)) }); }));
  r.get('/gallery/albums', wrap(async (_req, res) => { res.json({ items: await s.gallery.albums() }); }));
  r.get('/gallery', wrap(async (req, res) => { const p = parsePaging(req.query as Record<string, unknown>, 100); res.json(await s.gallery.publicList({ album: typeof req.query.album === 'string' ? req.query.album.slice(0, 60) : undefined, featured: req.query.featured === '1', page: p.page, limit: p.limit })); }));
  r.get('/videos', wrap(async (req, res) => { const p = parsePaging(req.query as Record<string, unknown>, 100); res.json(await s.videos.publicList({ featured: req.query.featured === '1', page: p.page, limit: p.limit })); }));
  r.get('/posts', wrap(async (req, res) => {
    const p = parsePaging(req.query as Record<string, unknown>, 50);
    res.json(await s.posts.publicList({ category: req.query.category as string | undefined, upazila: req.query.upazila as string | undefined, month: req.query.month as string | undefined, page: p.page, limit: p.limit }));
  }));
  r.get('/posts/:slug', wrap(async (req, res) => { res.json(await s.posts.publicGet(String(req.params.slug))); }));
  r.get('/promises', wrap(async (_req, res) => { res.json(await s.promises.publicList()); }));
  r.get('/complaint-stats', wrap(async (req, res) => { res.json(await s.complaints.publicStats(req.query.month as string | undefined)); }));
  r.get('/complaint-form', wrap(async (req, res) => { res.setHeader('Cache-Control', 'no-store'); const t = req.tenant!; res.json({ categories: t.settings.complaintCategories, otpRequired: t.settings.otpRequired, enabled: t.settings.complaintBoxEnabled }); }));

  /* writes: never cached, tighter limits inside the service */
  r.post('/otp/send', wrap(async (req, res) => {
    const b = z.object({ phone: bdMobile, turnstileToken: z.string().max(2000).optional() }).strict().parse(req.body);
    res.setHeader('Cache-Control', 'no-store');
    await s.complaints.sendOtp(req.tenant!, b.phone, b.turnstileToken, req.ip ?? '');
    res.status(202).json({ ok: true });
  }));
  r.post('/otp/verify', wrap(async (req, res) => {
    const b = z.object({ phone: bdMobile, code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ otpTicket: s.complaints.verifyOtp(req.tenant!, b.phone, b.code) });
  }));
  r.post('/complaints', wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const tenant = await Tenant.findById(req.tenant!._id).select('+dek.wrapped');
    res.status(201).json(await s.complaints.submit(tenant!, req.body, { ip: req.ip ?? '' }));
  }));
  r.get('/complaints/:trackingId', limit(d.rateLimiter, 'tracking', byIp), wrap(async (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(await s.complaints.track(String(req.params.trackingId))); }));
  return r;
}
