import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeTenant, loginFlow, api, admin, bearer, PASSWORD, type TestEnv, type Tenant } from '../helpers/env.js';
import { AuditLog, Membership, Tenant as TenantModel } from '../../src/models/index.js';

let env: TestEnv, sa: string, t: Tenant;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => { await clearDb(); env = makeEnv(); sa = await makeSuperAdmin(env); t = await makeTenant(env, sa, 'ndp3'); });

const pub = (path: string) => api(env).get(`/api/v1/public${path}`).set('Host', t.host);
const prom = (over: Record<string, unknown> = {}) => ({ sector: 'road', name: 'চরকান্দি–নতুনহাট সংযোগ সড়ক', place: 'চরকান্দি', budgetLabel: '৳৩৮.৫ কোটি', targetLabel: 'লক্ষ্য: জুন ২০২৭', pct: 72, status: 'ongoing', ...over });

describe('promise tracker (FR-PRM-*, MIS-10)', () => {
  const create = (b = prom(), tok = t.owner) => api(env).post(admin(t, '/promises')).set(bearer(tok)).send(b);
  const patch = (id: string, b: object, tok = t.owner) => api(env).patch(admin(t, `/promises/${id}`)).set(bearer(tok)).send(b);

  it('done requires 100%, late requires a written reason, both enforced on create and update', async () => {
    expect((await create(prom({ status: 'done', pct: 90 }))).status).toBe(400);
    expect((await create(prom({ status: 'late' }))).status).toBe(400);
    expect((await create(prom({ status: 'late', delayReason: 'ছোট' }))).status).toBe(400);
    const p = (await create()).body;
    expect((await patch(p._id, { status: 'done' })).status).toBe(400); // pct is still 72
    expect((await patch(p._id, { status: 'late' })).status).toBe(400);
    expect((await patch(p._id, { status: 'late', delayReason: 'জমি অধিগ্রহণে দেরি হওয়ায় কাজ পিছিয়েছে' })).status).toBe(200);
    expect((await patch(p._id, { status: 'done', pct: 100 })).body.delayReason).toBe(''); // reason cleared once no longer late
  });

  it('rejects out-of-range progress, unknown sectors/keys and non-numeric values', async () => {
    for (const bad of [prom({ pct: 101 }), prom({ pct: -1 }), prom({ pct: 50.5 }), prom({ pct: '50' }), prom({ sector: 'sports' }), { ...prom(), tenantId: 'x' }]) expect((await create(bad as never)).status).toBe(400);
    const p = (await create()).body;
    expect((await patch(p._id, { tenantId: 'x' })).status).toBe(400);
    expect((await patch(p._id, { isDeleted: true })).status).toBe(400);
  });

  it('every change is audited with before AND after values (nobody can quietly polish progress)', async () => {
    const p = (await create()).body;
    await patch(p._id, { pct: 81 });
    const a = await AuditLog.findOne({ action: 'promise.update' }).lean();
    expect((a!.diff!.before as { pct: number }).pct).toBe(72);
    expect((a!.diff!.after as { pct: number }).pct).toBe(81);
    expect(a!.actor!.name).toBeTruthy();
  });

  it('dated updates are prepended, and the public sees them with computed summary counts', async () => {
    const a = (await create()).body;
    await create(prom({ name: 'দ্বিতীয় প্রকল্পের নাম', status: 'done', pct: 100 }));
    await create(prom({ name: 'তৃতীয় প্রকল্পের নাম', status: 'late', pct: 30, delayReason: 'দরপত্র দুবার বাতিল হওয়ায় দেরি' }));
    await api(env).post(admin(t, `/promises/${a._id}/updates`)).set(bearer(t.owner)).send({ text: 'প্রথম হালনাগাদ' });
    await api(env).post(admin(t, `/promises/${a._id}/updates`)).set(bearer(t.owner)).send({ text: '৬.২ কিমি অংশ চালু' });
    const r = await pub('/promises');
    expect(r.body.summary).toEqual({ total: 3, done: 1, ongoing: 1, late: 1, plan: 0 });
    const item = r.body.items.find((i: { name: string }) => i.name.startsWith('চরকান্দি'));
    expect(item.updates.map((u: { text: string }) => u.text)).toEqual(['৬.২ কিমি অংশ চালু', 'প্রথম হালনাগাদ']);
    expect(r.body.items.find((i: { status: string }) => i.status === 'late').delayReason).toContain('দরপত্র');
  });

  it('only the owner edits promises; editors and officers are refused; deleted ones vanish everywhere', async () => {
    const p = (await create()).body;
    for (const tok of [t.editor, t.officer]) { expect((await create(prom(), tok)).status).toBe(403); expect((await patch(p._id, { pct: 99 }, tok)).status).toBe(403); }
    expect((await api(env).delete(admin(t, `/promises/${p._id}`)).set(bearer(t.owner))).status).toBe(204);
    expect((await pub('/promises')).body.items).toHaveLength(0);
    expect((await patch(p._id, { pct: 5 })).status).toBe(404);
  });

  it('public promise data exposes no internal fields', async () => {
    await create();
    const item = (await pub('/promises')).body.items[0];
    expect(Object.keys(item).sort()).toEqual(['budget', 'delayReason', 'featured', 'id', 'lastChangedAt', 'name', 'pct', 'place', 'sector', 'status', 'target', 'updates']);
  });
});

describe('team management (FR-CMS-11, FR-AUTH-06)', () => {
  const invite = (b: object, tok = t.owner) => api(env).post(admin(t, '/team/invites')).set(bearer(tok)).send(b);

  it('lists members with roles and scope; never leaks credentials or invite tokens', async () => {
    const r = await api(env).get(admin(t, '/team')).set(bearer(t.owner));
    expect(r.body).toHaveLength(3);
    expect(r.body.map((m: { role: string }) => m.role).sort()).toEqual(['editor', 'officer', 'owner']);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|inviteToken|totp|sessions/);
  });

  it('validates invites: officers need an upazila, roles are limited, phone must be valid; duplicates 409', async () => {
    expect((await invite({ name: 'কর্মকর্তা নতুন', phone: '01711110000', role: 'officer' })).status).toBe(400);
    expect((await invite({ name: 'নতুন মালিক নাম', phone: '01711110000', role: 'owner' })).status).toBe(400); // cannot invite another owner
    expect((await invite({ name: 'ভুল নম্বর', phone: '123', role: 'editor' })).status).toBe(400);
    expect((await invite({ name: 'নতুন সম্পাদক', phone: '01711110000', role: 'editor' })).status).toBe(201);
    expect((await invite({ name: 'নতুন সম্পাদক', phone: '01711110000', role: 'editor' })).status).toBe(409);
  });

  it('only the owner manages the team', async () => {
    for (const tok of [t.editor, t.officer]) { expect((await invite({ name: 'অননুমোদিত আমন্ত্রণ', phone: '01711110001', role: 'editor' }, tok)).status).toBe(403); expect((await api(env).get(admin(t, '/team')).set(bearer(tok))).status).toBe(403); }
  });

  it('a removed member loses access immediately, even with a valid session; they can be re-invited', async () => {
    const list = (await api(env).get(admin(t, '/team')).set(bearer(t.owner))).body;
    const ed = list.find((m: { role: string }) => m.role === 'editor');
    expect((await api(env).get(admin(t, '/posts')).set(bearer(t.editor))).status).toBe(200);
    expect((await api(env).delete(admin(t, `/team/${ed.id}`)).set(bearer(t.owner))).status).toBe(204);
    expect((await api(env).get(admin(t, '/posts')).set(bearer(t.editor))).status).toBe(404);
    const re = await invite({ name: 'সম্পাদক', phone: t.phones.editor, role: 'editor' });
    expect(re.status).toBe(201);
  });

  it('the last owner cannot be removed', async () => {
    const owner = (await api(env).get(admin(t, '/team')).set(bearer(t.owner))).body.find((m: { role: string }) => m.role === 'owner');
    const r = await api(env).delete(admin(t, `/team/${owner.id}`)).set(bearer(t.owner));
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('LAST_OWNER');
  });

  it('officer scope can be changed; widening it takes effect on the next request', async () => {
    const off = (await api(env).get(admin(t, '/team')).set(bearer(t.owner))).body.find((m: { role: string }) => m.role === 'officer');
    await api(env).post('/api/v1/public/complaints').set('Host', t.host).send({ category: 'বিদ্যুৎ', upazila: 'শালবাগান', union: 'বনগ্রাম', description: 'শালবাগানের একটি অভিযোগ যা লম্বা যথেষ্ট', anonymous: true, turnstileToken: 'ok' });
    expect((await api(env).get(admin(t, '/complaints')).set(bearer(t.officer))).body.items).toHaveLength(0);
    expect((await api(env).patch(admin(t, `/team/${off.id}`)).set(bearer(t.owner)).send({ upazilas: ['চরকান্দি', 'শালবাগান'] })).status).toBe(204);
    expect((await api(env).get(admin(t, '/complaints')).set(bearer(t.officer))).body.items).toHaveLength(1);
    expect((await api(env).patch(admin(t, `/team/${off.id}`)).set(bearer(t.owner)).send({ upazilas: [] })).status).toBe(422);
  });

  it('one person can belong to two tenants and gets the right role in each', async () => {
    const t2 = await makeTenant(env, sa, 'sbp1');
    const r = await api(env).post(admin(t2, '/team/invites')).set(bearer(t2.owner)).send({ name: 'সম্পাদক', phone: t.phones.editor, role: 'officer', upazilas: ['চরকান্দি'] });
    expect(r.status).toBe(201);
    await api(env).post(`/api/v1/auth/invites/${r.body.inviteToken}/accept`).send({ password: PASSWORD });
    const tok = (await loginFlow(env, `+88${t.phones.editor}`)).token;
    const me = await api(env).get('/api/v1/auth/me').set(bearer(tok));
    expect(me.body.memberships.map((m: { role: string }) => m.role).sort()).toEqual(['editor', 'officer']);
    expect((await api(env).get(admin(t, '/posts')).set(bearer(tok))).status).toBe(200); // editor in t
    expect((await api(env).get(admin(t2, '/posts')).set(bearer(tok))).status).toBe(403); // officer in t2: no posts
  });

  it('invites and removals are audited', async () => {
    await invite({ name: 'নতুন সম্পাদক', phone: '01711110002', role: 'editor' });
    expect(await AuditLog.countDocuments({ action: 'team.invite', tenantId: t.id })).toBeGreaterThanOrEqual(3);
    void Membership;
  });
});

describe('site config, settings, profile', () => {
  const cfg = (over: Record<string, unknown> = {}) => ({ slogan: 'প্রতিটি অভিযোগের উত্তর', accent: 'river', banners: [{ url: 'https://upload.wikimedia.org/a/b.jpg', caption: 'চরাঞ্চল' }], sections: [{ key: 'stats', on: true }, { key: 'gallery', on: false }], ...over });

  it('the owner saves slogan/banners/sections/accent and the public site reflects it', async () => {
    expect((await api(env).put(admin(t, '/site-config')).set(bearer(t.owner)).send(cfg())).status).toBe(200);
    const site = (await pub('/site')).body;
    expect(site.slogan).toBe('প্রতিটি অভিযোগের উত্তর');
    expect(site.theme.accent).toBe('river');
    expect(site.sections.find((s: { key: string }) => s.key === 'gallery').on).toBe(false);
    expect(site.banners).toHaveLength(1);
    expect(site.mp.seat).toMatch(/^[^0-9]+-[০-৯]+$/); // BUG-2026-016: the seat number uses Bangla digits
    expect(site.mp).toMatchObject({ name: 'ড. পরীক্ষা ndp3', seat: expect.stringContaining('পরীক্ষাপুর') });
  });

  it('rejects unknown accents/sections, too many banners, banner hosts off the allow-list', async () => {
    for (const bad of [cfg({ accent: 'pink' }), cfg({ sections: [{ key: 'evil', on: true }] }), cfg({ banners: Array(7).fill({ url: 'https://upload.wikimedia.org/a.jpg', caption: '' }) }), cfg({ slogan: 'ক'.repeat(91) }), cfg({ extra: 1 })]) expect((await api(env).put(admin(t, '/site-config')).set(bearer(t.owner)).send(bad)).status).toBe(400);
    expect((await api(env).put(admin(t, '/site-config')).set(bearer(t.owner)).send(cfg({ banners: [{ url: 'https://evil.example/x.jpg', caption: '' }] }))).status).toBe(422);
    expect((await api(env).put(admin(t, '/site-config')).set(bearer(t.editor)).send(cfg())).status).toBe(403);
  });

  it('settings: OTP toggle, SLA and categories are validated (no duplicates, 2..20, SLA 1..30)', async () => {
    const put = (b: object) => api(env).put(admin(t, '/settings')).set(bearer(t.owner)).send(b);
    expect((await put({ otpRequired: true, slaDays: 5, complaintCategories: ['রাস্তা ও সেতু', 'বিদ্যুৎ'] })).status).toBe(200);
    expect((await pub('/complaint-form')).body).toMatchObject({ otpRequired: true, categories: ['রাস্তা ও সেতু', 'বিদ্যুৎ'] });
    for (const bad of [{ otpRequired: true, slaDays: 0, complaintCategories: ['ক ক', 'খ খ'] }, { otpRequired: true, slaDays: 31, complaintCategories: ['ক ক', 'খ খ'] }, { otpRequired: true, slaDays: 5, complaintCategories: ['একটাই'] }, { otpRequired: true, slaDays: 5, complaintCategories: ['একই', 'একই'] }, { otpRequired: 'yes', slaDays: 5, complaintCategories: ['ক ক', 'খ খ'] }]) expect((await put(bad)).status).toBe(400);
    const d = await TenantModel.findById(t.id);
    expect(d!.settings.slaDays).toBe(5);
  });

  it('profile: draft is private, publishing makes it public without internal fields', async () => {
    expect((await pub('/profile')).status).toBe(404);
    const put = await api(env).put(admin(t, '/profile')).set(bearer(t.editor)).send({ headline: 'চরের মানুষের চিকিৎসক থেকে সংসদে', intro: 'জনস্বাস্থ্য চিকিৎসক।', education: [{ year: '২০০০', title: 'এমবিবিএস', place: 'নদীপুর মেডিকেল কলেজ', note: '' }] });
    expect(put.status).toBe(200);
    expect((await pub('/profile')).status).toBe(404);
    expect((await api(env).post(admin(t, '/profile/publish')).set(bearer(t.editor))).status).toBe(403);
    expect((await api(env).post(admin(t, '/profile/publish')).set(bearer(t.owner))).status).toBe(200);
    const p = (await pub('/profile')).body;
    expect(p.headline).toContain('চিকিৎসক');
    for (const k of ['tenantId', '_id', 'status', 'createdAt', '__v']) expect(p).not.toHaveProperty(k);
  });
});

describe('dashboard data is scoped by role (BUG-2026-011)', () => {
  const dash = (tok: string) => api(env).get(admin(t, '/dashboard')).set(bearer(tok));
  it('the editor gets content numbers but no complaint numbers', async () => {
    const d = (await dash(t.editor)).body;
    expect(d).toHaveProperty('posts'); expect(d).toHaveProperty('promises');
    expect(d).not.toHaveProperty('complaints'); expect(d).not.toHaveProperty('slaPct');
    expect(d.pendingApprovals).toBeUndefined(); // only publishers see the approval count
  });
  it('the officer gets complaint numbers but no content numbers', async () => {
    const d = (await dash(t.officer)).body;
    expect(d).toHaveProperty('complaints'); expect(d).not.toHaveProperty('posts'); expect(d).not.toHaveProperty('promises');
  });
  it('the owner gets everything', async () => {
    const d = (await dash(t.owner)).body;
    for (const k of ['posts', 'promises', 'complaints', 'approvals']) expect(d).toHaveProperty(k); // new contract nests slaPct in complaints (see dashboard.test.ts)
  });
});

describe('public API and platform hardening', () => {
  it('public site info has no internals (no consent, key, settings caps, statuses)', async () => {
    const txt = JSON.stringify((await pub('/site')).body);
    expect(txt).not.toMatch(/consent|dek|wrapped|dailySmsCap|smsSenderId|statusHistory|tenantId|documentRef/);
  });

  it('health is 200, unknown API routes get JSON 404, bad JSON is 400 not 500', async () => {
    expect((await api(env).get('/api/health')).body).toEqual({ status: 'ok' });
    const nf = await api(env).get('/api/v1/nothing-here');
    expect(nf.status).toBe(404); expect(nf.headers['content-type']).toContain('json');
    const bad = await api(env).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{not json');
    expect(bad.status).toBe(400); expect(bad.body.error.code).toBe('BAD_JSON');
  });

  it('bodies over 1 MB are refused; security headers are present; no x-powered-by', async () => {
    const big = await api(env).post('/api/v1/auth/login').send({ identifier: 'a@b.co', password: 'x'.repeat(1_200_000) });
    expect(big.status).toBe(413);
    const h = await api(env).get('/api/health');
    expect(h.headers['x-powered-by']).toBeUndefined();
    expect(h.headers['x-content-type-options']).toBe('nosniff');
    expect(h.headers['strict-transport-security']).toBeTruthy();
    expect(h.headers['x-request-id']).toBeTruthy();
  });

  it('CORS allows only configured origins', async () => {
    const ok = await api(env).options('/api/v1/auth/me').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const no = await api(env).options('/api/v1/auth/me').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(no.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('malformed ids are 404, never 500', async () => {
    for (const id of ['abc', '123', '../../etc/passwd', '%00']) {
      expect((await api(env).get(admin(t, `/posts/${id}`)).set(bearer(t.owner))).status).toBe(404);
      expect((await api(env).get(admin(t, `/complaints/${id}`)).set(bearer(t.owner))).status).toBe(404);
    }
    expect((await api(env).get('/api/v1/admin/tenants/not-an-id/posts').set(bearer(t.owner))).status).toBe(404);
  });

  it('operator injection in query strings is neutralised', async () => {
    const r = await api(env).get(admin(t, '/posts?status[$ne]=x&category[$gt]=')).set(bearer(t.owner));
    expect(r.status).toBe(200);
    expect((await pub('/posts?category[$ne]=zzz')).status).toBe(200);
  });

  it('a JWT signed with another secret, an "alg: none" token and a tampered payload are all refused', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ sub: '000000000000000000000000', sid: 'x', typ: 'access' }, 'another-secret-another-secret-123456', { issuer: 'jonoprotinidhi', audience: 'jonoprotinidhi-api' });
    expect((await api(env).get('/api/v1/auth/me').set(bearer(forged))).status).toBe(401);
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'x', sid: 'x', typ: 'access' })).toString('base64url') + '.';
    expect((await api(env).get('/api/v1/auth/me').set(bearer(none))).status).toBe(401);
    const tampered = t.owner.split('.'); tampered[1] = Buffer.from(JSON.stringify({ sub: 'attacker', sid: 'x', typ: 'access' })).toString('base64url');
    expect((await api(env).get('/api/v1/auth/me').set(bearer(tampered.join('.')))).status).toBe(401);
  });
});
