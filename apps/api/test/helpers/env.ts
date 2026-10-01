import request from 'supertest';
import http from 'node:http';
import { loadConfig, type Config } from '../../src/config.js';
import type { Deps, DomainProvider } from '../../src/deps.js';
import { createApp } from '../../src/app.js';
import { MemoryRateLimitStore, RateLimiter } from '../../src/lib/rateLimit.js';
import { MemoryMediaStorage } from '../../src/lib/media.js';
import { ConsoleSmsProvider, SmsService } from '../../src/lib/sms.js';
import { OtpService } from '../../src/lib/otp.js';
import type { Turnstile } from '../../src/lib/turnstile.js';
import { generateKey } from '../../src/lib/crypto.js';
import { totp } from '../../src/lib/totp.js';
import type { Services } from '../../src/services/index.js';

/* Integration-test environment: real Express app + real Mongoose models, with fakes for everything external
   (clock, SMS gateway, Turnstile, DNS). Rate limiting is off unless a test switches it on. */

export type TestEnv = {
  app: http.Server; services: Services; deps: Deps; config: Config;
  clock: { now: number };
  sms: ConsoleSmsProvider;
  domains: { verified: Set<string> };
  turnstile: { pass: boolean };
  secrets: Map<string, string>; // identifier -> TOTP secret
};

export function makeEnv(overrides: Record<string, string> = {}, opts: { rateLimits?: boolean } = {}): TestEnv {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused',
    JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
    MASTER_KEY: generateKey().toString('base64'),
    PHONE_PEPPER: 'test-pepper-0123456789',
    PLATFORM_DOMAIN: 'jonoprotinidhi.test',
    PW_MEMORY_KIB: '1024', PW_PASSES: '1',
    MEDIA_HOSTS: 'upload.wikimedia.org,cdn.jonoprotinidhi.test',
    ...overrides,
  });
  const clock = { now: Date.now() };
  const now = () => clock.now;
  const sms = new ConsoleSmsProvider();
  const domains = { verified: new Set<string>() };
  const turnstile = { pass: true };
  const ts: Turnstile = { verify: async (t) => turnstile.pass && !!t };
  const dp: DomainProvider = { verifyTxt: async (host) => domains.verified.has(host) };
  const deps: Deps = {
    config,
    master: Buffer.from(config.MASTER_KEY, 'base64'),
    rateLimiter: new RateLimiter(new MemoryRateLimitStore(), !opts.rateLimits),
    smsProvider: sms,
    sms: new SmsService(sms, config.PHONE_PEPPER, config.DAILY_SMS_CAP),
    turnstile: ts,
    otp: new OtpService(undefined, now),
    domainProvider: dp,
    media: new MemoryMediaStorage(),
  };
  const { app, services } = createApp(deps, now);
  // BUG-2026-035: supertest would listen on the wildcard address, and on macOS a local app holding the same port on
  // 127.0.0.1 then receives the test's requests. A server bound to 127.0.0.1 itself cannot share a port that way.
  const server = http.createServer(app).listen(0, '127.0.0.1').unref();
  return { app: server, services, deps, config, clock, sms, domains, turnstile, secrets: new Map() };
}

export const PASSWORD = 'Sup3r-secret-pass';

/** Full login: password -> (enrol TOTP on first use) -> code. Returns the access token. */
export async function loginFlow(env: TestEnv, identifier: string, password = PASSWORD): Promise<{ token: string; cookies: string[]; csrf: string }> {
  const r1 = await request(env.app).post('/api/v1/auth/login').send({ identifier, password });
  if (r1.status !== 200) throw new Error(`login failed ${r1.status} ${JSON.stringify(r1.body)}`);
  const { mfaToken, mfaEnrollRequired } = r1.body as { mfaToken: string; mfaEnrollRequired: boolean };
  if (mfaEnrollRequired) {
    const e = await request(env.app).post('/api/v1/auth/mfa/enroll/totp').send({ mfaToken });
    if (e.status !== 200) throw new Error(`enroll failed ${e.status}`);
    env.secrets.set(identifier, e.body.secret);
  }
  const secret = env.secrets.get(identifier);
  if (!secret) throw new Error('no TOTP secret known for ' + identifier);
  env.clock.now += 31_000; // move to a fresh TOTP step (a step can only be used once)
  const r2 = await request(env.app).post('/api/v1/auth/mfa/totp').send({ mfaToken, code: totp(secret, env.clock.now) });
  if (r2.status !== 200) throw new Error(`mfa failed ${r2.status} ${JSON.stringify(r2.body)}`);
  return { token: r2.body.accessToken as string, cookies: r2.headers['set-cookie'] as unknown as string[], csrf: r2.body.csrfToken as string };
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

export async function makeSuperAdmin(env: TestEnv, email = 'root@octagram.test'): Promise<string> {
  await env.services.auth.createUser({ name: 'Root Admin', email, password: PASSWORD, platformRole: 'super_admin' });
  return (await loginFlow(env, email)).token;
}
export async function makeSupport(env: TestEnv, email = 'support@octagram.test'): Promise<string> {
  await env.services.auth.createUser({ name: 'Support Person', email, password: PASSWORD, platformRole: 'support' });
  return (await loginFlow(env, email)).token;
}

export type Tenant = {
  id: string; slug: string; host: string;
  owner: string; editor: string; officer: string; // access tokens
  officerId: string; officer2?: string;
  phones: { owner: string; editor: string; officer: string };
};

let counter = 0;
/** Create a tenant through the real super-admin API, then onboard owner + editor + officer through real invites. */
export async function makeTenant(env: TestEnv, superToken: string, slug: string, opts: { officerUpazilas?: string[]; live?: boolean } = {}): Promise<Tenant> {
  counter += 1;
  const n = String(counter).padStart(2, '0');
  const phones = { owner: `0171100${n}01`, editor: `0171100${n}02`, officer: `0171100${n}03` };
  const created = await request(env.app).post('/api/v1/super/tenants').set(bearer(superToken)).send({
    mpName: `ড. পরীক্ষা ${slug}`, mpRole: 'mp', seatName: 'পরীক্ষাপুর', seatNumber: (counter % 20) + 1, slug, ownerPhone: phones.owner,
    consent: { confirmed: true, documentRef: `DOC-${slug}` },
  });
  if (created.status !== 201) throw new Error(`tenant create failed ${created.status} ${JSON.stringify(created.body)}`);
  const id = created.body.id as string;
  const accept = async (token: string, ident: string) => {
    const a = await request(env.app).post(`/api/v1/auth/invites/${token}/accept`).send({ password: PASSWORD });
    if (a.status !== 200) throw new Error(`accept failed ${a.status} ${JSON.stringify(a.body)}`);
    return (await loginFlow(env, ident)).token;
  };
  const ownerIdent = `+88${phones.owner}`;
  const owner = await accept(created.body.inviteToken, ownerIdent);
  const invite = async (name: string, phone: string, role: string, upazilas: string[] = []) => {
    const r = await request(env.app).post(`/api/v1/admin/tenants/${id}/team/invites`).set(bearer(owner)).send({ name, phone, role, upazilas });
    if (r.status !== 201) throw new Error(`invite failed ${r.status} ${JSON.stringify(r.body)}`);
    return accept(r.body.inviteToken, `+88${phone}`);
  };
  const editor = await invite('সম্পাদক', phones.editor, 'editor');
  const officer = await invite('কর্মকর্তা', phones.officer, 'officer', opts.officerUpazilas ?? ['চরকান্দি']);
  const me = await request(env.app).get('/api/v1/auth/me').set(bearer(officer));
  if (opts.live !== false) {
    const st = await request(env.app).post(`/api/v1/super/tenants/${id}/status`).set(bearer(superToken)).send({ to: 'live', reason: 'সব যাচাই হয়েছে', contentChecked: true });
    if (st.status !== 200) throw new Error(`go live failed ${st.status} ${JSON.stringify(st.body)}`);
  }
  return { id, slug, host: `${slug}.jonoprotinidhi.test`, owner, editor, officer, officerId: me.body.user.id, phones };
}

export const api = (env: TestEnv) => request(env.app);
export const admin = (t: Tenant, path = '') => `/api/v1/admin/tenants/${t.id}${path}`;
