import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeTenant, api, type TestEnv, type Tenant } from '../helpers/env.js';
import { isPublicSiteBrowserCall } from '../../src/routes/public.js';

/* The public site can be a static export on GitHub Pages (docs/11-DEPLOY-GITHUB-PAGES.md). Its browsers call the API directly:
   PUBLIC_SITE_ORIGINS opens CORS for the OTP / complaint / tracking routes only, for that origin only, without credentials.
   The admin app keeps the credentialed CORS_ORIGINS rule. */

const PAGES = 'https://mdfrhd101.github.io';
const ADMIN = 'https://jonoprotinidhi-admin.onrender.com';
let env: TestEnv, t: Tenant;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  env = makeEnv({ PUBLIC_SITE_ORIGINS: `${PAGES}/`, CORS_ORIGINS: ADMIN }); // a trailing slash in the setting must not break the match
  t = await makeTenant(env, await makeSuperAdmin(env), 'ndp3');
});

const preflight = (path: string, origin: string, method = 'POST', headers = 'content-type') =>
  api(env).options(path).set('Origin', origin).set('Access-Control-Request-Method', method).set('Access-Control-Request-Headers', headers);

describe('static public site CORS: the citizen routes', () => {
  it.each([
    ['POST', '/api/v1/public/otp/send'],
    ['POST', '/api/v1/public/otp/verify'],
    ['POST', '/api/v1/public/complaints'],
    ['GET', '/api/v1/public/complaints/JP-2026-0001'],
  ])('answers the preflight of %s %s for the Pages origin, without credentials', async (method, path) => {
    const r = await preflight(path, PAGES, method);
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(PAGES);
    expect(r.headers['access-control-allow-methods']).toMatch(method);
    expect(r.headers['access-control-allow-headers']?.toLowerCase()).toBe('content-type');
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
    expect(r.headers.vary).toMatch(/Origin/i);
  });

  it('the real calls carry the headers too, errors included (the browser needs them to read an error)', async () => {
    const track = await api(env).get('/api/v1/public/complaints/NO-SUCH-1').set('Host', t.host).set('Origin', PAGES);
    expect(track.status).toBe(404);
    expect(track.headers['access-control-allow-origin']).toBe(PAGES);
    expect(track.headers['access-control-allow-credentials']).toBeUndefined();
    const bad = await api(env).post('/api/v1/public/otp/verify').set('Host', t.host).set('Origin', PAGES).send({ phone: 'x', code: 'y' });
    expect(bad.status).toBe(400);
    expect(bad.headers['access-control-allow-origin']).toBe(PAGES);
  });

  it('any other origin gets no CORS headers (lookalikes, http, other github.io users, null)', async () => {
    for (const origin of ['https://evil.example', 'http://mdfrhd101.github.io', 'https://mdfrhd101.github.io.evil.example', 'https://someone-else.github.io', 'null']) {
      const r = await preflight('/api/v1/public/complaints', origin);
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
      expect(r.headers['access-control-allow-credentials']).toBeUndefined();
      const g = await api(env).get('/api/v1/public/complaints/NO-SUCH-1').set('Host', t.host).set('Origin', origin);
      expect(g.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('is off until PUBLIC_SITE_ORIGINS is set', async () => {
    const off = makeEnv({ CORS_ORIGINS: ADMIN });
    const r = await api(off).options('/api/v1/public/complaints').set('Origin', PAGES).set('Access-Control-Request-Method', 'POST');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('static public site CORS stays away from everything else', () => {
  it.each([
    ['POST', '/api/v1/auth/login'],
    ['POST', '/api/v1/auth/refresh'],
    ['GET', '/api/v1/auth/me'],
    ['GET', '/api/v1/super/tenants'],
    ['GET', '/api/v1/admin/tenants/000000000000000000000000/complaints'],
    ['GET', '/api/v1/public/site'],
    ['GET', '/api/v1/public/complaint-form'],
    ['GET', '/api/v1/public/complaints/JP-2026-0001/extra'],
    ['POST', '/api/v1/public/complaints/JP-2026-0001'],
  ])('%s %s: no CORS for the Pages origin', async (method, path) => {
    const pre = await preflight(path, PAGES, method, 'content-type, authorization');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
    const real = await (method === 'GET' ? api(env).get(path) : api(env).post(path)).set('Host', t.host).set('Origin', PAGES);
    expect(real.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('the admin origin keeps its credentialed CORS on admin and public routes, with the admin headers', async () => {
    for (const path of ['/api/v1/auth/login', '/api/v1/public/complaints']) {
      const r = await preflight(path, ADMIN, 'POST', 'content-type, authorization, x-csrf');
      expect(r.status).toBe(204);
      expect(r.headers['access-control-allow-origin']).toBe(ADMIN);
      expect(r.headers['access-control-allow-credentials']).toBe('true');
      expect(r.headers['access-control-allow-headers']?.toLowerCase()).toBe('content-type,authorization,x-csrf');
    }
  });

  it('the call list is exactly OTP send/verify + submit (POST) and tracking (GET)', () => {
    for (const p of ['/api/v1/public/otp/send', '/api/v1/public/otp/verify', '/api/v1/public/complaints', '/api/v1/public/complaints/']) expect(isPublicSiteBrowserCall('POST', p)).toBe(true);
    for (const p of ['/api/v1/public/complaints/JP-1', '/api/v1/public/complaints/JP-2026-0001']) expect(isPublicSiteBrowserCall('get', p)).toBe(true);
    for (const p of ['/api/v1/public/otp', '/api/v1/public/otp/send/x', '/api/v1/public/complaints/a/b', '/api/v1/public/complaints/%2e%2e', '/api/v1/public/complaints/ab', '/api/v1/public/site', '/api/v1/public/complaint-form', '/api/v1/auth/login', '/x/api/v1/public/complaints']) {
      expect(isPublicSiteBrowserCall('POST', p)).toBe(false);
      expect(isPublicSiteBrowserCall('GET', p)).toBe(false);
    }
    expect(isPublicSiteBrowserCall('GET', '/api/v1/public/complaints')).toBe(false); // listing is not a thing; submit is POST only
    expect(isPublicSiteBrowserCall('POST', '/api/v1/public/complaints/JP-1')).toBe(false);
    for (const m of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', '']) expect(isPublicSiteBrowserCall(m, '/api/v1/public/complaints')).toBe(false);
  });
});
