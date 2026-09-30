import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { hasAnyPermission, permissionsFor, ROLE_PERMS, type Perm, type PanelRole, type PlatformRole } from '@jonoshetu/shared';
import type { Deps } from '../deps.js';
import { ApiError } from '../errors.js';
import { verifyAccess } from '../lib/tokens.js';
import { isObjectId } from '../lib/sanitize.js';
import { User, Tenant, Membership, type UserDoc, type TenantDoc } from '../models/index.js';
import { ctx } from '../context.js';
import type { RateLimiter, TierName } from '../lib/rateLimit.js';

export type Auth = { user: UserDoc; sid: string; act?: { tenantId: string } };
export type Member = { role: PanelRole; perms: Perm[]; scope: string[]; viaSuperAdmin: boolean; membershipId?: string };

declare module 'express-serve-static-core' {
  interface Request { auth?: Auth; tenant?: TenantDoc; member?: Member; }
}

export const wrap = (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export function authenticate(d: Deps): RequestHandler {
  return wrap(async (req, _res, next) => {
    const h = req.headers.authorization ?? '';
    if (!h.startsWith('Bearer ')) throw ApiError.unauthorized();
    const claims = verifyAccess(d.config.JWT_SECRET, h.slice(7));
    const user = await User.findById(claims.sub);
    if (!user || user.status !== 'active') throw ApiError.unauthorized();
    const s = user.sessions.find((x) => x.sid === claims.sid);
    if (!s || s.expiresAt.getTime() <= Date.now()) throw ApiError.unauthorized('সেশন বাতিল হয়েছে, আবার লগইন করুন');
    req.auth = { user, sid: claims.sid, act: claims.act };
    const c = ctx();
    if (c) c.actor = { userId: user._id, name: user.name, role: user.platformRole ?? 'user', viaSuperAdmin: !!user.platformRole };
    next();
  });
}

export function requirePlatformRole(...roles: PlatformRole[]): RequestHandler {
  return (req, _res, next) => {
    const r = req.auth?.user.platformRole;
    if (!r || !roles.includes(r)) return next(ApiError.forbidden());
    next();
  };
}

/** Resolves the caller's role INSIDE the tenant named in the URL. A stranger gets 404 (not 403): existence is not revealed. */
export function tenantAccess(): RequestHandler {
  return wrap(async (req, _res, next) => {
    const id = req.params.tenantId;
    if (!isObjectId(id)) throw ApiError.notFound();
    const user = req.auth!.user;
    const tenant = await Tenant.findById(id);
    if (!tenant) throw ApiError.notFound();
    const m = await Membership.findOne({ userId: user._id, tenantId: tenant._id, status: 'active' });
    let member: Member | null = null;
    if (m) {
      member = { role: m.role, perms: permissionsFor(m.role, m.permissionOverrides), scope: m.scope?.upazilas ?? [], viaSuperAdmin: false, membershipId: String(m._id) };
    } else if (user.platformRole && req.auth!.act?.tenantId === String(tenant._id)) {
      member = { role: user.platformRole, perms: [...ROLE_PERMS[user.platformRole]], scope: [], viaSuperAdmin: true };
    }
    if (!member) throw ApiError.notFound();
    req.tenant = tenant;
    req.member = member;
    const c = ctx();
    if (c) {
      c.tenantId = tenant._id;
      c.actor = { userId: user._id, name: user.name, role: member.role, viaSuperAdmin: member.viaSuperAdmin };
    }
    next();
  });
}

/** OR semantics: allowed if the member holds ANY of the listed permissions. */
export function requirePermission(...perms: Perm[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.member || !hasAnyPermission(req.member.perms, perms)) return next(ApiError.forbidden());
    next();
  };
}

export function limit(limiter: RateLimiter, tier: TierName, identity: (req: Request) => string): RequestHandler {
  return (req, res, next) => {
    const r = limiter.check(tier, identity(req));
    if (!r.allowed) { res.setHeader('Retry-After', String(r.retryAfterSec)); return next(ApiError.tooMany(r.retryAfterSec)); }
    next();
  };
}
export const byIp = (req: Request) => req.ip ?? 'unknown';
export const byUser = (req: Request) => String(req.auth?.user._id ?? req.ip);
