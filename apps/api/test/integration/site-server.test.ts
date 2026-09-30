import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeTenant, api, type TestEnv, type Tenant } from '../helpers/env.js';
import { TIERS } from '../../src/lib/rateLimit.js';

/* BUG-2026-020: the Next.js public site renders on its server, so without help every visitor looks like ONE client (the site
   server) to the API and the per-IP limits throttle the whole site. Our site server proves itself with SITE_SERVER_TOKEN and
   names the visitor in X-Client-IP; nobody else can. */

const TOKEN = 'site-server-token-for-tests-0123456789abcdef'; // BUG-2026-020
let env: TestEnv, t: Tenant;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  env = makeEnv({ SITE_SERVER_TOKEN: TOKEN });
  t = await makeTenant(env, await makeSuperAdmin(env), 'ndp3');
  env.deps.rateLimiter.setDisabled(false);
});

const site = (ip: string, token = TOKEN) => api(env).get('/api/v1/public/site').set('Host', t.host).set('X-Site-Token', token).set('X-Client-IP', ip);
const burst = async (n: number, fn: () => Promise<{ status: number }>) => { const s: number[] = []; for (let i = 0; i < n; i++) s.push((await fn()).status); return s; };

describe('BUG-2026-020: rate limits stay per visitor behind our own site server', () => {
  const LIMIT = TIERS.public.limit;

  it('with the token, each named visitor has their own budget (the site as a whole is not throttled)', async () => {
    const a = await burst(LIMIT, () => site('198.51.100.1'));
    expect(a.every((x) => x === 200)).toBe(true);
    expect((await site('198.51.100.1')).status).toBe(429); // that visitor is over the limit ...
    expect((await site('198.51.100.2')).status).toBe(200); // ... another visitor through the same server is not
  });

  it('without the token (or with a wrong one) X-Client-IP is ignored, so it cannot be used to dodge limits', async () => {
    let i = 0;
    const spoof = () => api(env).get('/api/v1/public/site').set('Host', t.host).set('X-Client-IP', `203.0.113.${(i++ % 250) + 1}`);
    const s = await burst(LIMIT + 1, spoof);
    expect(s.at(-1)).toBe(429);
    const wrong = await burst(LIMIT + 1, () => site(`192.0.2.${(i++ % 250) + 1}`, 'x'.repeat(TOKEN.length)));
    expect(wrong.at(-1)).toBe(429);
  });

  it('an invalid claimed IP is ignored even with the token', async () => {
    const s = await burst(LIMIT + 1, () => site('not-an-ip'));
    expect(s.at(-1)).toBe(429); // all counted against the real peer
  });

  it('the feature is off when no token is configured', async () => {
    await clearDb(); env = makeEnv(); t = await makeTenant(env, await makeSuperAdmin(env), 'ndp4'); env.deps.rateLimiter.setDisabled(false);
    let i = 0;
    const s = await burst(LIMIT + 1, () => api(env).get('/api/v1/public/site').set('Host', t.host).set('X-Site-Token', '').set('X-Client-IP', `198.51.100.${(i++ % 250) + 1}`));
    expect(s.at(-1)).toBe(429);
  });

  it('a too-short token is refused at start-up', () => {
    expect(() => makeEnv({ SITE_SERVER_TOKEN: 'short' })).toThrow(/SITE_SERVER_TOKEN/);
  });

  it('image/video files have their own, larger budget and do not eat the page budget', async () => {
    expect(TIERS.media.limit).toBeGreaterThan(TIERS.public.limit);
    const missing = `/api/v1/public/media/${t.id}/${'a'.repeat(24)}.webp`;
    const s = await burst(LIMIT + 5, () => api(env).get(missing));
    expect(s.every((x) => x === 404)).toBe(true); // not 429: files are counted in the media tier
    expect((await api(env).get('/api/v1/public/site').set('Host', t.host)).status).toBe(200);
  });
});
