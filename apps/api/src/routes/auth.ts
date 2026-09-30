import { Router, type Response, type Request } from 'express';
import { loginSchema, mfaCodeSchema, mfaTokenOnlySchema, acceptInviteSchema } from '@jonoprotinidhi/shared';
import type { Deps } from '../deps.js';
import type { AuthService, Tokens } from '../services/auth.js';
import { ApiError } from '../errors.js';
import { authenticate, wrap, limit, byIp } from '../middleware/auth.js';
import { randomToken, safeEqual } from '../lib/crypto.js';
import { verifyMfa } from '../lib/tokens.js';
import { audit } from '../lib/audit.js';
import { ctx } from '../context.js';

const RT = 'jn_rt', CSRF = 'jn_csrf';

export function authRoutes(d: Deps, auth: AuthService): Router {
  const r = Router();
  const cookieBase = { sameSite: 'strict' as const, secure: d.config.isProd, path: '/api/v1/auth' };
  const maxAge = d.config.REFRESH_TTL_DAYS * 86400_000;

  const setSession = (res: Response, t: Tokens) => {
    const csrf = randomToken(16);
    res.cookie(RT, t.refreshToken, { ...cookieBase, httpOnly: true, maxAge });
    res.cookie(CSRF, csrf, { ...cookieBase, path: '/', httpOnly: false, maxAge }); // readable by the SPA (double-submit token, not a secret)
    res.json({ accessToken: t.accessToken, expiresInSec: t.expiresInSec, csrfToken: csrf });
  };
  const info = (req: Request) => ({ ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') });

  r.post('/login', limit(d.rateLimiter, 'auth', byIp), wrap(async (req, res) => {
    const b = loginSchema.parse(req.body);
    // second limiter keyed by the identifier so one account cannot be brute-forced from many IPs
    const idk = d.rateLimiter.check('authAccount', `id:${b.identifier.toLowerCase()}`);
    if (!idk.allowed) throw ApiError.tooMany(idk.retryAfterSec);
    const r = await auth.login(b.identifier, b.password);
    if (!d.config.MFA_REQUIRED) { setSession(res, await auth.startSessionAfterPassword(r.mfaToken, info(req))); return; }
    res.json(r);
  }));

  /** Second-factor endpoints are throttled per account (from the verified mfa token), not just per IP. */
  const perAccount = (token: string) => {
    const sub = verifyMfa(d.config.JWT_SECRET, token).sub;
    const r2 = d.rateLimiter.check('authAccount', `u:${sub}`);
    if (!r2.allowed) throw ApiError.tooMany(r2.retryAfterSec);
  };

  r.post('/mfa/enroll/totp', limit(d.rateLimiter, 'auth', byIp), wrap(async (req, res) => {
    const { mfaToken } = mfaTokenOnlySchema.parse(req.body);
    perAccount(mfaToken);
    res.json(await auth.beginTotpEnrollment(mfaToken));
  }));

  r.post('/mfa/totp', limit(d.rateLimiter, 'auth', byIp), wrap(async (req, res) => {
    const b = mfaCodeSchema.parse(req.body);
    perAccount(b.mfaToken);
    const { tokens } = await auth.completeMfa(b.mfaToken, { code: b.code, recoveryCode: b.recoveryCode }, info(req));
    setSession(res, tokens);
  }));

  r.post('/refresh', wrap(async (req, res) => {
    const rt = req.cookies?.[RT] as string | undefined;
    const csrfCookie = req.cookies?.[CSRF] as string | undefined;
    const hdr = String(req.headers['x-csrf'] ?? '');
    if (!rt || !csrfCookie || !hdr || !safeEqual(csrfCookie, hdr)) throw ApiError.unauthorized();
    setSession(res, await auth.refresh(rt));
  }));

  r.post('/logout', authenticate(d), wrap(async (req, res) => {
    await auth.revoke(req.auth!.user._id, req.auth!.sid);
    res.clearCookie(RT, cookieBase); res.clearCookie(CSRF, { ...cookieBase, path: '/' });
    res.status(204).end();
  }));
  r.post('/logout-all', authenticate(d), wrap(async (req, res) => {
    await auth.revokeAll(req.auth!.user._id);
    await audit({ action: 'auth.logout_all', tenantId: null, entity: { type: 'user', id: req.auth!.user._id } });
    res.clearCookie(RT, cookieBase); res.clearCookie(CSRF, { ...cookieBase, path: '/' });
    res.status(204).end();
  }));

  r.get('/me', authenticate(d), wrap(async (req, res) => { res.json(await auth.me(req.auth!.user._id)); }));
  r.get('/sessions', authenticate(d), wrap(async (req, res) => { res.json(await auth.sessions(req.auth!.user._id, req.auth!.sid)); }));
  r.delete('/sessions/:id', authenticate(d), wrap(async (req, res) => { await auth.revoke(req.auth!.user._id, String(req.params.id)); res.status(204).end(); }));

  r.post('/invites/:token/accept', limit(d.rateLimiter, 'auth', byIp), wrap(async (req, res) => {
    const b = acceptInviteSchema.parse(req.body);
    res.json(await auth.acceptInvite(String(req.params.token), b.password));
  }));
  void ctx;
  return r;
}
