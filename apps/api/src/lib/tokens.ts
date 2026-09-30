import jwt from 'jsonwebtoken';
import { ApiError } from '../errors.js';

/* JWT access tokens (short, in memory on the client) and short MFA-step tokens. Algorithm pinned to HS256,
   issuer/audience checked, `typ` claim separates access from mfa tokens so one cannot be used as the other. */

const ISS = 'jonoprotinidhi';
const AUD = 'jonoprotinidhi-api';

export type AccessClaims = { sub: string; sid: string; typ: 'access'; act?: { tenantId: string } };
export type MfaClaims = { sub: string; typ: 'mfa' };

export function signAccess(secret: string, p: { sub: string; sid: string; act?: { tenantId: string }; ttlSec: number }): string {
  const claims: Record<string, unknown> = { sub: p.sub, sid: p.sid, typ: 'access' };
  if (p.act) claims.act = p.act;
  return jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: p.ttlSec, issuer: ISS, audience: AUD });
}

export function verifyAccess(secret: string, token: string): AccessClaims {
  try {
    const c = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISS, audience: AUD }) as unknown as AccessClaims;
    if (c.typ !== 'access' || !c.sub || !c.sid) throw new Error('wrong token type');
    return c;
  } catch {
    throw ApiError.unauthorized('সেশন শেষ হয়েছে, আবার লগইন করুন');
  }
}

export function signMfa(secret: string, sub: string, ttlSec = 300): string {
  return jwt.sign({ sub, typ: 'mfa' }, secret, { algorithm: 'HS256', expiresIn: ttlSec, issuer: ISS, audience: AUD });
}
export function verifyMfa(secret: string, token: string): MfaClaims {
  try {
    const c = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISS, audience: AUD }) as unknown as MfaClaims;
    if (c.typ !== 'mfa' || !c.sub) throw new Error('wrong token type');
    return c;
  } catch {
    throw ApiError.unauthorized('যাচাইয়ের সময় শেষ, আবার লগইন করুন');
  }
}
