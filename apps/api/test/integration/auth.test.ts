import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, loginFlow, bearer, PASSWORD, type TestEnv } from '../helpers/env.js';
import { totp } from '../../src/lib/totp.js';
import { User } from '../../src/models/index.js';

let env: TestEnv;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  env = makeEnv();
  await env.services.auth.createUser({ name: 'Nafisa', email: 'nafisa@octagram.test', password: PASSWORD, platformRole: 'super_admin' });
});

const post = (path: string, body: object) => request(env.app).post(`/api/v1/auth${path}`).send(body);

describe('login + mandatory second factor (FR-AUTH-01)', () => {
  it('password alone never yields an access token', async () => {
    const r = await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeUndefined();
    expect(r.body.mfaEnrollRequired).toBe(true);
    expect(r.body.mfaToken).toBeTruthy();
  });

  it('first login enrols TOTP, returns recovery codes once, then issues a session', async () => {
    const { mfaToken } = (await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD })).body;
    const e = await post('/mfa/enroll/totp', { mfaToken });
    expect(e.status).toBe(200);
    expect(e.body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(e.body.otpauthUri).toContain('otpauth://totp/');
    expect(e.body.recoveryCodes).toHaveLength(8);
    env.clock.now += 31_000;
    const ok = await post('/mfa/totp', { mfaToken, code: totp(e.body.secret, env.clock.now) });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    const cookies = (ok.headers['set-cookie'] as unknown as string[]).join(';');
    const rt = (ok.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('jn_rt='))!;
    expect(rt).toContain('HttpOnly');
    expect(rt).toContain('Path=/api/v1/auth');
    expect(cookies).toContain('SameSite=Strict');
    const me = await request(env.app).get('/api/v1/auth/me').set(bearer(ok.body.accessToken));
    expect(me.body.user.platformRole).toBe('super_admin');
    expect(me.body.user.mfaEnrolled).toBe(true);
  });

  it('second login asks for the code (no re-enrolment) and cannot re-enrol', async () => {
    await loginFlow(env, 'nafisa@octagram.test');
    const r = await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD });
    expect(r.body.mfaRequired).toBe(true);
    expect(r.body.mfaEnrollRequired).toBe(false);
    const again = await post('/mfa/enroll/totp', { mfaToken: r.body.mfaToken });
    expect(again.status).toBe(409); // someone with only the password must not be able to swap the second factor
  });

  it('rejects a wrong code and a code replayed within the same step', async () => {
    const { mfaToken } = (await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD })).body;
    const secret = (await post('/mfa/enroll/totp', { mfaToken })).body.secret;
    env.clock.now += 31_000;
    const good = totp(secret, env.clock.now);
    expect((await post('/mfa/totp', { mfaToken, code: '000000' })).status).toBe(401);
    expect((await post('/mfa/totp', { mfaToken, code: good })).status).toBe(200);
    const again = await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD });
    expect((await post('/mfa/totp', { mfaToken: again.body.mfaToken, code: good })).status).toBe(401); // replay
  });

  it('recovery codes work once', async () => {
    const { mfaToken } = (await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD })).body;
    const enrol = (await post('/mfa/enroll/totp', { mfaToken })).body;
    env.clock.now += 31_000;
    await post('/mfa/totp', { mfaToken, code: totp(enrol.secret, env.clock.now) });
    const l2 = (await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD })).body;
    expect((await post('/mfa/totp', { mfaToken: l2.mfaToken, recoveryCode: enrol.recoveryCodes[0] })).status).toBe(200);
    const l3 = (await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD })).body;
    expect((await post('/mfa/totp', { mfaToken: l3.mfaToken, recoveryCode: enrol.recoveryCodes[0] })).status).toBe(401);
  });

  it('gives the same generic error for unknown user and wrong password (no enumeration)', async () => {
    const a = await post('/login', { identifier: 'ghost@octagram.test', password: PASSWORD });
    const b = await post('/login', { identifier: 'nafisa@octagram.test', password: 'wrong-password-1' });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('locks the account after 5 wrong passwords, even for the right password afterwards', async () => {
    for (let i = 0; i < 5; i++) await post('/login', { identifier: 'nafisa@octagram.test', password: 'wrong-password-1' });
    const r = await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD });
    expect(r.status).toBe(401);
    env.clock.now += 16 * 60_000; // lockout expires
    const ok = await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('accepts phone numbers in Bangla digits and +88 form', async () => {
    await env.services.auth.createUser({ name: 'Karim', phone: '01712345678', password: PASSWORD });
    for (const id of ['01712345678', '+8801712345678', '০১৭১২৩৪৫৬৭৮', '8801712345678']) {
      expect((await post('/login', { identifier: id, password: PASSWORD })).status).toBe(200);
    }
  });

  it('validates the body strictly (unknown keys, wrong types)', async () => {
    expect((await post('/login', { identifier: 'a@b.co', password: PASSWORD, extra: 1 })).status).toBe(400);
    expect((await post('/login', { identifier: { $ne: null }, password: { $ne: null } })).status).toBe(400); // NoSQL operator probe
    expect((await post('/login', {})).status).toBe(400);
  });

  it('does not accept an mfa token as an access token, or a garbage bearer', async () => {
    const { mfaToken } = (await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD })).body;
    expect((await request(env.app).get('/api/v1/auth/me').set(bearer(mfaToken))).status).toBe(401);
    expect((await request(env.app).get('/api/v1/auth/me').set(bearer('not.a.jwt'))).status).toBe(401);
    expect((await request(env.app).get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('sessions and refresh tokens (FR-AUTH-03)', () => {
  const refresh = (cookies: string[], csrf: string, withCsrf = true) => {
    const jar = cookies.map((c) => c.split(';')[0]).join('; ');
    const r = request(env.app).post('/api/v1/auth/refresh').set('Cookie', jar);
    return withCsrf ? r.set('X-CSRF', csrf) : r;
  };

  it('refresh rotates the token and the new access token works', async () => {
    const s = await loginFlow(env, 'nafisa@octagram.test');
    const r = await refresh(s.cookies, s.csrf);
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
    expect((await request(env.app).get('/api/v1/auth/me').set(bearer(r.body.accessToken))).status).toBe(200);
  });

  it('refresh needs the CSRF header that matches the cookie', async () => {
    const s = await loginFlow(env, 'nafisa@octagram.test');
    expect((await refresh(s.cookies, s.csrf, false)).status).toBe(401);
    expect((await refresh(s.cookies, 'wrong-csrf-value')).status).toBe(401);
  });

  it('reusing an old refresh token revokes the whole session (theft detection)', async () => {
    const s = await loginFlow(env, 'nafisa@octagram.test');
    const first = await refresh(s.cookies, s.csrf);
    expect(first.status).toBe(200);
    const reuse = await refresh(s.cookies, s.csrf); // the ORIGINAL token again
    expect(reuse.status).toBe(401);
    // the session is gone, so even the freshly rotated access token stops working
    expect((await request(env.app).get('/api/v1/auth/me').set(bearer(first.body.accessToken))).status).toBe(401);
  });

  it('logout kills the session; logout-all kills every device', async () => {
    const a = await loginFlow(env, 'nafisa@octagram.test');
    const b = await loginFlow(env, 'nafisa@octagram.test');
    expect((await request(env.app).post('/api/v1/auth/logout').set(bearer(a.token))).status).toBe(204);
    expect((await request(env.app).get('/api/v1/auth/me').set(bearer(a.token))).status).toBe(401);
    expect((await request(env.app).get('/api/v1/auth/me').set(bearer(b.token))).status).toBe(200);
    const c = await loginFlow(env, 'nafisa@octagram.test');
    await request(env.app).post('/api/v1/auth/logout-all').set(bearer(c.token));
    expect((await request(env.app).get('/api/v1/auth/me').set(bearer(b.token))).status).toBe(401);
  });

  it('lists devices and revokes one', async () => {
    const a = await loginFlow(env, 'nafisa@octagram.test');
    const b = await loginFlow(env, 'nafisa@octagram.test');
    const list = await request(env.app).get('/api/v1/auth/sessions').set(bearer(b.token));
    expect(list.body).toHaveLength(2);
    const other = list.body.find((s: { current: boolean }) => !s.current);
    await request(env.app).delete(`/api/v1/auth/sessions/${other.id}`).set(bearer(b.token));
    expect((await request(env.app).get('/api/v1/auth/me').set(bearer(a.token))).status).toBe(401);
  });

  it('a disabled user is locked out immediately even with a valid token', async () => {
    const s = await loginFlow(env, 'nafisa@octagram.test');
    await User.updateOne({ email: 'nafisa@octagram.test' }, { status: 'disabled' });
    expect((await request(env.app).get('/api/v1/auth/me').set(bearer(s.token))).status).toBe(401);
  });
});

describe('auth rate limiting (BUG-2026-009: per account, generous per IP)', () => {
  it('locks brute force PER ACCOUNT: the 11th attempt on one identifier is refused even from a fresh IP budget', async () => {
    env = makeEnv({}, { rateLimits: true });
    await env.services.auth.createUser({ name: 'X', email: 'x@octagram.test', password: PASSWORD });
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post('/login', { identifier: 'x@octagram.test', password: 'nope-nope-1' })).status);
    expect(codes.slice(0, 10).every((c) => c === 401 || c === 200)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });

  it('does NOT punish many different people behind one shared IP (office / mobile carrier NAT)', async () => {
    env = makeEnv({}, { rateLimits: true });
    for (let i = 0; i < 12; i++) await env.services.auth.createUser({ name: `U${i}`, email: `u${i}@octagram.test`, password: PASSWORD });
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post('/login', { identifier: `u${i}@octagram.test`, password: PASSWORD })).status);
    expect(codes.every((c) => c === 200)).toBe(true);
  });

  it('still has an IP ceiling against spraying many identifiers', async () => {
    env = makeEnv({}, { rateLimits: true });
    let last = 0;
    for (let i = 0; i < 65; i++) last = (await post('/login', { identifier: `ghost${i}@octagram.test`, password: 'nope-nope-1' })).status;
    expect(last).toBe(429);
  }, 60_000);

  it('the second-factor step is throttled per account too', async () => {
    env = makeEnv({}, { rateLimits: true });
    await env.services.auth.createUser({ name: 'Y', email: 'y@octagram.test', password: PASSWORD });
    const { mfaToken } = (await post('/login', { identifier: 'y@octagram.test', password: PASSWORD })).body;
    await post('/mfa/enroll/totp', { mfaToken });
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post('/mfa/totp', { mfaToken, code: '000000' })).status);
    expect(codes).toContain(429);
  });
});

describe('MFA_REQUIRED=false (local development switch)', () => {
  it('password alone opens a working session, with cookies, and /me works', async () => {
    env = makeEnv({ MFA_REQUIRED: 'false' });
    const r = await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
    expect((r.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/jn_rt=.*HttpOnly/);
    const me = await request(env.app).get('/api/v1/auth/me').set(bearer(r.body.accessToken));
    expect(me.status).toBe(200);
  });
  it('a wrong password is still refused, and the direct-session method is closed when MFA is required', async () => {
    env = makeEnv({ MFA_REQUIRED: 'false' });
    expect((await post('/login', { identifier: 'nafisa@octagram.test', password: 'wrong-password-1' })).status).toBe(401);
    env = makeEnv();
    const l = await post('/login', { identifier: 'nafisa@octagram.test', password: PASSWORD });
    await expect(env.services.auth.startSessionAfterPassword(l.body.mfaToken)).rejects.toMatchObject({ status: 403 });
  });
});
