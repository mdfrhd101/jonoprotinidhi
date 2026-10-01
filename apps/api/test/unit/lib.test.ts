import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { MemoryRateLimitStore, RateLimiter, TIERS } from '../../src/lib/rateLimit.js';
import { OtpService } from '../../src/lib/otp.js';
import { escapeRegex, pick, stripOperators, csvCell, makeSlug, isObjectId, parsePaging } from '../../src/lib/sanitize.js';
import { redact } from '../../src/lib/audit.js';
import { signAccess, verifyAccess, signMfa, verifyMfa } from '../../src/lib/tokens.js';
import { DevTurnstile, CloudflareTurnstile } from '../../src/lib/turnstile.js';
import { ApiError } from '../../src/errors.js';
import { generateKey } from '../../src/lib/crypto.js';

const BASE = { MONGODB_URI: 'mongodb://x/y', JWT_SECRET: 'j'.repeat(32), MASTER_KEY: generateKey().toString('base64'), PHONE_PEPPER: 'p'.repeat(16) };

describe('config guard (fail fast on bad secrets)', () => {
  it('accepts a valid environment and applies safe defaults', () => {
    const c = loadConfig(BASE);
    expect(c.PORT).toBe(4000); expect(c.ACCESS_TTL_SEC).toBe(600); expect(c.corsOrigins).toEqual(['http://localhost:5173']); expect(c.isProd).toBe(false);
  });
  it('rejects a short JWT secret, a wrong-size master key, a missing pepper', () => {
    expect(() => loadConfig({ ...BASE, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(loadConfig(BASE).MFA_REQUIRED).toBe(true); // safe default
    expect(loadConfig({ ...BASE, MFA_REQUIRED: 'false' }).MFA_REQUIRED).toBe(false);
    expect(() => loadConfig({ ...BASE, NODE_ENV: 'production', MFA_REQUIRED: 'false' })).toThrow(/MFA_REQUIRED/);
    expect(loadConfig({ ...BASE, NODE_ENV: 'production', MFA_REQUIRED: 'false', ALLOW_NO_MFA_IN_PRODUCTION: 'true' }).MFA_REQUIRED).toBe(false); // explicit owner opt-in
    expect(() => loadConfig({ ...BASE, MASTER_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/MASTER_KEY/);
    expect(() => loadConfig({ ...BASE, PHONE_PEPPER: undefined })).toThrow(/PHONE_PEPPER/);
    expect(() => loadConfig({})).toThrow(/Invalid environment/);
  });
  it('boolean flags parse the STRING "false" as false (BUG-2026-007)', () => {
    expect(loadConfig({ ...BASE }).RATE_LIMIT_DISABLED).toBe(false);
    expect(loadConfig({ ...BASE, RATE_LIMIT_DISABLED: 'false' }).RATE_LIMIT_DISABLED).toBe(false);
    expect(loadConfig({ ...BASE, RATE_LIMIT_DISABLED: '0' }).RATE_LIMIT_DISABLED).toBe(false);
    expect(loadConfig({ ...BASE, RATE_LIMIT_DISABLED: 'true' }).RATE_LIMIT_DISABLED).toBe(true);
    expect(() => loadConfig({ ...BASE, RATE_LIMIT_DISABLED: 'maybe' })).toThrow(/RATE_LIMIT_DISABLED/);
  });
  it('splits lists, coerces numbers', () => {
    const c = loadConfig({ ...BASE, CORS_ORIGINS: 'https://a.com, https://b.com', MEDIA_HOSTS: 'A.com,b.com', PORT: '8080' });
    expect(c.corsOrigins).toEqual(['https://a.com', 'https://b.com']); expect(c.mediaHosts).toEqual(['a.com', 'b.com']); expect(c.PORT).toBe(8080);
  });
});

describe('rate limiter', () => {
  it('allows up to the limit, then blocks with a retry time, then recovers after the window', () => {
    const s = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i++) expect(s.hit('k', 3, 1000, 0).allowed).toBe(true);
    const blocked = s.hit('k', 3, 1000, 500);
    expect(blocked.allowed).toBe(false); expect(blocked.retryAfterSec).toBe(1);
    expect(s.hit('k', 3, 1000, 1001).allowed).toBe(true);
  });
  it('keys are independent, reset works, disabled limiter always allows', () => {
    const s = new MemoryRateLimitStore();
    s.hit('a', 1, 1000, 0); expect(s.hit('a', 1, 1000, 1).allowed).toBe(false); expect(s.hit('b', 1, 1000, 1).allowed).toBe(true);
    s.reset('a'); expect(s.hit('a', 1, 1000, 2).allowed).toBe(true);
    const off = new RateLimiter(new MemoryRateLimitStore(), true);
    for (let i = 0; i < 1000; i++) expect(off.check('publicWrite', 'x').allowed).toBe(true);
    off.setDisabled(false);
    for (let i = 0; i < TIERS.publicWrite.limit; i++) off.check('publicWrite', 'x');
    expect(off.check('publicWrite', 'x').allowed).toBe(false);
  });
});

describe('OTP service', () => {
  const mk = () => { const c = { t: 1_000_000 }; return { c, otp: new OtpService(undefined, () => c.t) }; };
  it('issues a 6-digit code and verifies it into a single-use ticket', () => {
    const { otp } = mk();
    const i = otp.issue('k'); expect(i.ok).toBe(true);
    const code = (i as { code: string }).code; expect(code).toMatch(/^\d{6}$/);
    const ticket = otp.verify('k', code)!; expect(ticket).toBeTruthy();
    expect(otp.consumeTicket(ticket, 'k')).toBe(true); expect(otp.consumeTicket(ticket, 'k')).toBe(false);
  });
  it('ticket is bound to its key and dies when presented for the wrong one', () => {
    const { otp } = mk(); const code = (otp.issue('k') as { code: string }).code; const t = otp.verify('k', code)!;
    expect(otp.consumeTicket(t, 'other')).toBe(false); expect(otp.consumeTicket(t, 'k')).toBe(false);
    expect(otp.consumeTicket(undefined, 'k')).toBe(false);
  });
  it('cooldown, expiry and attempt limit', () => {
    const { c, otp } = mk();
    expect(otp.issue('k').ok).toBe(true);
    const again = otp.issue('k'); expect(again.ok).toBe(false); expect((again as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0);
    c.t += 61_000; const code = (otp.issue('k') as { code: string }).code;
    c.t += 5 * 60_000 + 1; expect(otp.verify('k', code)).toBeNull();
    c.t += 61_000; const code2 = (otp.issue('k') as { code: string }).code;
    for (let i = 0; i < 5; i++) expect(otp.verify('k', code2 === '000000' ? '111111' : '000000')).toBeNull();
    expect(otp.verify('k', code2)).toBeNull(); // burned after too many attempts
  });
});

describe('sanitize helpers', () => {
  it('escapeRegex neutralises metacharacters', () => {
    const rx = new RegExp(escapeRegex('a.b*c(d)[e]'));
    expect(rx.test('a.b*c(d)[e]')).toBe(true); expect(rx.test('aXb')).toBe(false);
    expect(new RegExp(escapeRegex('.*')).test('anything')).toBe(false);
  });
  it('pick keeps only listed keys and skips undefined', () => {
    expect(pick({ a: 1, b: 2, c: undefined } as { a: number; b: number; c?: number }, ['a', 'c'])).toEqual({ a: 1 });
  });
  it('stripOperators removes $ and dotted keys at any depth but keeps dates and arrays', () => {
    const d = new Date();
    expect(stripOperators({ a: { $ne: 1, ok: 2 }, 'x.y': 3, list: [{ $gt: 1, k: 1 }], d })).toEqual({ a: { ok: 2 }, list: [{ k: 1 }], d });
  });
  it('csvCell quotes and defuses spreadsheet formulas', () => {
    expect(csvCell('a"b')).toBe('"a""b"'); expect(csvCell(null)).toBe('""'); expect(csvCell(5)).toBe('"5"');
    for (const f of ['=1+1', '+cmd', '-2', '@SUM(A1)']) expect(csvCell(f)).toBe(`"'${f}"`);
  });
  it('makeSlug is ASCII, bounded, unique-ish, and safe for Bangla-only titles', () => {
    expect(makeSlug('Road Opening: 6.2 km!')).toMatch(/^road-opening-6-2-km-[a-f0-9]{6}$/);
    expect(makeSlug('চরকান্দি সড়ক')).toMatch(/^post-[a-f0-9]{6}$/);
    expect(makeSlug('x'.repeat(200)).length).toBeLessThanOrEqual(47);
    expect(makeSlug('same')).not.toBe(makeSlug('same'));
  });
  it('isObjectId and parsePaging', () => {
    expect(isObjectId('507f1f77bcf86cd799439011')).toBe(true); for (const b of ['', 'abc', '507f1f77bcf86cd79943901z', 5, null]) expect(isObjectId(b as never)).toBe(false);
    expect(parsePaging({})).toEqual({ page: 1, limit: 20, paged: false });
    expect(parsePaging({ page: '3', limit: '500' })).toEqual({ page: 3, limit: 100, paged: true });
    expect(parsePaging({ page: '-4', limit: 'x' })).toMatchObject({ page: 1, limit: 20, paged: true });
  });
});

describe('audit redaction', () => {
  it('masks secrets and PII keys at any depth', () => {
    const out = redact({ a: 1, password: 'x', nested: { phone: '017', token: 't', keep: 'yes', deep: [{ pii: { n: 1 }, ok: 2 }] } });
    expect(out).toEqual({ a: 1, password: '[redacted]', nested: { phone: '[redacted]', token: '[redacted]', keep: 'yes', deep: [{ pii: '[redacted]', ok: 2 }] } });
  });
  it('passes dates and primitives through', () => { const d = new Date(); expect(redact({ d }).d).toBe(d); expect(redact('s' as never)).toBe('s'); });
});

describe('JWT helpers', () => {
  const S = 'k'.repeat(40);
  it('access and mfa tokens are not interchangeable', () => {
    const a = signAccess(S, { sub: 'u1', sid: 's1', ttlSec: 60 }), m = signMfa(S, 'u1');
    expect(verifyAccess(S, a)).toMatchObject({ sub: 'u1', sid: 's1' });
    expect(() => verifyAccess(S, m)).toThrow(ApiError); expect(() => verifyMfa(S, a)).toThrow(ApiError);
    expect(verifyMfa(S, m).sub).toBe('u1');
  });
  it('carries the act-as claim; wrong secret and garbage fail as 401', () => {
    const a = signAccess(S, { sub: 'u', sid: 's', act: { tenantId: 't1' }, ttlSec: 60 });
    expect(verifyAccess(S, a).act).toEqual({ tenantId: 't1' });
    try { verifyAccess('z'.repeat(40), a); expect.unreachable(); } catch (e) { expect((e as ApiError).status).toBe(401); }
    expect(() => verifyAccess(S, 'nonsense')).toThrow(ApiError);
  });
});

describe('turnstile', () => {
  it('dev mode accepts any non-empty token except "fail"', async () => {
    const t = new DevTurnstile(); expect(await t.verify('ok')).toBe(true); expect(await t.verify('')).toBe(false); expect(await t.verify(undefined)).toBe(false); expect(await t.verify('fail')).toBe(false);
  });
  it('cloudflare mode trusts only success:true and fails closed on network errors', async () => {
    const yes = new CloudflareTurnstile('s', (async () => ({ json: async () => ({ success: true }) })) as never);
    const no = new CloudflareTurnstile('s', (async () => ({ json: async () => ({ success: false }) })) as never);
    const boom = new CloudflareTurnstile('s', (async () => { throw new Error('down'); }) as never);
    expect(await yes.verify('t')).toBe(true); expect(await no.verify('t')).toBe(false); expect(await boom.verify('t')).toBe(false); expect(await yes.verify(undefined)).toBe(false);
  });
});

describe('ApiError', () => {
  it('has stable statuses and codes', () => {
    expect(ApiError.notFound().status).toBe(404); expect(ApiError.forbidden().code).toBe('FORBIDDEN'); expect(ApiError.tooMany(5).details).toEqual({ retryAfterSec: 5 });
    expect(ApiError.conflict('X', 'm').status).toBe(409); expect(ApiError.validation({}).status).toBe(400); expect(ApiError.unprocessable('C', 'm').status).toBe(422);
  });
});
