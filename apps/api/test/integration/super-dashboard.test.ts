import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeSupport, makeTenant, api, bearer, type TestEnv, type Tenant } from '../helpers/env.js';
import { Complaint, MediaAsset, Post, Domain, AuditLog } from '../../src/models/index.js';

/* Super Admin platform dashboard, tenant stats, domains list, slug check and the audit API (FR-SA-01/04/06).
   The rule under test everywhere: counts only, never a complainant's identity, complaint text or the citizen's IP. */

const DAY = 86400_000;
const dhakaDay = (ms: number) => new Date(ms + 6 * 3600_000).toISOString().slice(0, 10);
const SECRET_TEXT = 'গোপন-বিবরণ-XYZ';
const SECRET_NAME = 'গোপন-নাম-QRS';

let env: TestEnv, sa: string;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => { await clearDb(); env = makeEnv(); sa = await makeSuperAdmin(env); });

const get = (path: string, tok = sa) => api(env).get(`/api/v1/super${path}`).set(bearer(tok));

/** Raw fixture rows (bypassing the service layer) that carry every kind of secret a complaint can hold. */
async function complaint(t: Tenant, over: Record<string, unknown>) {
  const now = env.clock.now;
  await Complaint.collection.insertOne({
    tenantId: new Types.ObjectId(t.id), trackingId: `T-${Math.random().toString(36).slice(2, 9)}`, category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন',
    description: SECRET_TEXT, pii: { nameEnc: 'ENC:' + SECRET_NAME, phoneEnc: 'ENC:01712345678', keyVersion: 1 }, phoneHmac: 'HMAC-SECRET-VALUE',
    status: 'new', createdAt: new Date(now - DAY), updatedAt: new Date(now), slaDueAt: new Date(now + 6 * DAY), ...over,
  });
}
async function post(t: Tenant, over: Record<string, unknown>) {
  await Post.collection.insertOne({
    tenantId: new Types.ObjectId(t.id), slug: `p-${Math.random().toString(36).slice(2, 9)}`, title: 'পোস্ট', status: 'published', authorId: new Types.ObjectId(),
    live: { title: 'পোস্ট', publishedAt: new Date(env.clock.now - 2 * DAY) }, isDeleted: false, createdAt: new Date(), updatedAt: new Date(), ...over,
  });
}

describe('GET /super/dashboard (FR-SA-01)', () => {
  it('returns platform KPIs, a zero-filled 30-day Dhaka series, open complaints by tenant and recent platform activity', async () => {
    const a = await makeTenant(env, sa, 'ndp3');
    const b = await makeTenant(env, sa, 'sbp1', { live: false });
    const now = env.clock.now;
    await complaint(a, { createdAt: new Date(now - 2 * DAY) }); // open, within SLA
    await complaint(a, { createdAt: new Date(now - 10 * DAY), slaDueAt: new Date(now - 3 * DAY) }); // open, overdue
    await complaint(a, { status: 'solved', createdAt: new Date(now - 5 * DAY), resolvedAt: new Date(now - DAY), slaDueAt: new Date(now + DAY) }); // in SLA
    await complaint(b, { status: 'closed', createdAt: new Date(now - 20 * DAY), resolvedAt: new Date(now - 3 * DAY), slaDueAt: new Date(now - 13 * DAY) }); // late
    await complaint(a, { createdAt: new Date(now - 45 * DAY) }); // previous 30-day window
    await post(a, {});
    await post(a, { live: { title: 'মুছে ফেলা', publishedAt: new Date(now - DAY) }, isDeleted: true }); // BUG-2026-003: deleted rows never count
    await MediaAsset.collection.insertMany([
      { tenantId: new Types.ObjectId(a.id), kind: 'image', bytes: 1000, createdAt: new Date() },
      { tenantId: new Types.ObjectId(a.id), kind: 'video', bytes: 5000, createdAt: new Date() },
      { tenantId: new Types.ObjectId(b.id), bytes: 250, createdAt: new Date() }, // legacy row without kind = image
    ]);

    const r = await get('/dashboard');
    expect(r.status).toBe(200);
    const d = r.body;
    // legacy flat fields keep working
    expect(d).toMatchObject({ tenants: 2, live: 1, setup: 1, suspended: 0, complaintsLast30d: 4 });
    expect(d.kpis.tenants).toMatchObject({ total: 2, live: 1, setup: 1, suspended: 0, ministers: 0, newLast30d: 2 });
    expect(d.kpis.complaints).toMatchObject({ last30d: 4, prev30d: 1, open: 3, overdue: 1, resolvedLast30d: 2, slaPct: 50, slaTarget: 80 });
    expect(d.kpis.posts).toMatchObject({ publishedLast30d: 1, publishedTotal: 1 });
    expect(d.kpis.media).toEqual({ imageBytes: 1250, videoBytes: 5000, imageFiles: 2, videoFiles: 1 });
    expect(d.kpis.sms.today).toBeGreaterThanOrEqual(6); // six owner/team invites went out today
    expect(d.kpis.sms.capPerTenant).toBe(env.config.DAILY_SMS_CAP);
    expect(d.kpis.sms.dailyCapacity).toBe(2 * env.config.DAILY_SMS_CAP);

    // series: exactly 30 consecutive Dhaka days ending today, zero-filled
    expect(d.series).toHaveLength(30);
    expect(d.series.at(-1).date).toBe(dhakaDay(env.clock.now));
    expect(d.series[0].date).toBe(dhakaDay(env.clock.now - 29 * DAY));
    for (let i = 1; i < 30; i++) expect(new Date(d.series[i].date).getTime() - new Date(d.series[i - 1].date).getTime()).toBe(DAY);
    expect(d.series.reduce((s: number, x: { received: number }) => s + x.received, 0)).toBe(4);
    expect(d.series.reduce((s: number, x: { solved: number }) => s + x.solved, 0)).toBe(2);
    expect(d.series.filter((x: { received: number; solved: number }) => x.received === 0 && x.solved === 0).length).toBeGreaterThan(20);

    expect(d.openByTenant).toEqual([expect.objectContaining({ id: a.id, open: 3, overdue: 1, seatNumber: expect.any(Number) })]);
    expect(d.activity.length).toBeGreaterThan(0);
    expect(d.activity[0]).toEqual(expect.objectContaining({ action: expect.any(String), actorName: expect.any(String), at: expect.any(String) }));
    expect(d.activity.some((x: { action: string; tenantName: string }) => x.action === 'tenant.create' && x.tenantName === 'ড. পরীক্ষা ndp3')).toBe(true);
    expect(JSON.stringify(d.activity)).not.toMatch(/reason|"ip"|userAgent|diff/);
  });

  it('"needs attention" lists suspended, SLA, domain, stale, unpublished and setup sites, most urgent first', async () => {
    const live = await makeTenant(env, sa, 'ndp3');
    const setup = await makeTenant(env, sa, 'sbp1', { live: false });
    const off = await makeTenant(env, sa, 'off9');
    await api(env).post(`/api/v1/super/tenants/${off.id}/status`).set(bearer(sa)).send({ to: 'suspended', reason: 'চুক্তির মেয়াদ শেষ' });
    await complaint(live, { createdAt: new Date(env.clock.now - 10 * DAY), slaDueAt: new Date(env.clock.now - DAY) });
    await api(env).post(`/api/v1/super/tenants/${live.id}/domains`).set(bearer(sa)).send({ host: 'noor.example' });

    const { attention, kpis } = (await get('/dashboard')).body;
    const kinds = (id: string) => attention.filter((x: { tenantId: string }) => x.tenantId === id).map((x: { kind: string }) => x.kind);
    expect(kinds(off.id)).toEqual(['suspended']); // nothing else is nagged about a suspended site
    expect(kinds(setup.id)).toEqual(['setup']);
    expect(kinds(live.id)).toEqual(['sla', 'domain', 'stale', 'unpublished']);
    expect(attention[0].kind).toBe('suspended');
    expect(attention.find((x: { kind: string }) => x.kind === 'sla')).toMatchObject({ overdue: 1, tone: 'bad' });
    expect(attention.find((x: { kind: string }) => x.kind === 'domain')).toMatchObject({ hosts: ['noor.example'] });
    expect(attention.find((x: { kind: string }) => x.kind === 'setup')).toMatchObject({ ownerActive: true, pagesTotal: 7 });
    expect(kpis.domains).toMatchObject({ custom: 1, pending: 1 });
    expect(kpis.sms.dailyCapacity).toBe(2 * env.config.DAILY_SMS_CAP); // suspended sites are not counted
  });

  it('never contains complaint text, complainant identity, hashes or key material; tenant users are refused', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await complaint(t, {});
    await api(env).post('/api/v1/public/complaints').set('Host', t.host).send({ category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন', description: `${SECRET_TEXT} আরও বিস্তারিত লেখা`, phone: '01712345678', name: SECRET_NAME, turnstileToken: 'ok' });
    const bodies = await Promise.all(['/dashboard', '/tenants', `/tenants/${t.id}`, '/domains', '/audit?limit=100'].map((p) => get(p)));
    for (const b of bodies) expect(b.status).toBe(200);
    const txt = JSON.stringify(bodies.map((b) => b.body));
    expect(txt).not.toMatch(/গোপন|01712345678|8801712345678|phoneEnc|nameEnc|phoneHmac|HMAC-SECRET|wrapped|"dek"|userAgent/);
    for (const tok of [t.owner, t.editor, t.officer]) {
      for (const p of ['/dashboard', '/domains', '/slug-available?slug=abc']) expect((await get(p, tok)).status).toBe(403);
    }
  });
});

describe('tenants list and detail (stats)', () => {
  it('the list carries domains, open counts, SLA, last activity and seat parts', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await complaint(t, {});
    await post(t, {});
    const [row] = (await get('/tenants')).body;
    expect(row).toMatchObject({ id: t.id, slug: 'ndp3', seatName: 'পরীক্ষাপুর', seatNumber: expect.any(Number), status: 'live', publishedPosts: 1, postsLast30d: 1, daysSinceLastPost: 2, stale: false, openComplaints: 1, complaintsLast30d: 1, ownerActive: true });
    expect(row.domains).toEqual([expect.objectContaining({ host: 'ndp3.jonoshetu.test', type: 'platform', primary: true, dnsStatus: 'active' })]);
    expect(new Date(row.lastActivityAt).getTime()).toBeGreaterThan(env.clock.now - DAY);
  });

  it('the detail view adds team summary, content readiness, usage, complaint counts and a recent audit trail without reasons', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await MediaAsset.collection.insertOne({ tenantId: new Types.ObjectId(t.id), kind: 'image', bytes: 4096, createdAt: new Date() });
    await api(env).post(`/api/v1/super/tenants/${t.id}/act-as`).set(bearer(sa)).send({ reason: 'গোপন-কারণ: ব্যানার ঠিক করতে ঢুকছি' });
    const d = (await get(`/tenants/${t.id}`)).body;
    expect(d.tenant).toMatchObject({ id: t.id, slug: 'ndp3', consent: { documentRef: 'DOC-ndp3' } });
    expect(d.dnsTarget).toBe('sites.jonoshetu.test');
    expect(d.team.byRole).toEqual({ owner: { active: 1, invited: 0 }, editor: { active: 1, invited: 0 }, officer: { active: 1, invited: 0 } });
    expect(d.team.owner).toMatchObject({ name: 'ড. পরীক্ষা ndp3', status: 'active' });
    expect(d.content.pages).toHaveLength(7);
    expect(d.content).toMatchObject({ gallery: 0, videos: 0, events: 0, readinessPct: 0 });
    expect(d.usage).toMatchObject({ imageBytes: 4096, imageFiles: 1, videoBytes: 0, smsDailyCap: env.config.DAILY_SMS_CAP });
    expect(d.usage.smsMonth).toBeGreaterThanOrEqual(3);
    expect(d.complaints).toEqual({ last30d: 0, open: 0, overdue: 0, resolvedLast30d: 0, slaPct: null });
    expect(d.audit[0]).toMatchObject({ action: 'tenant.act_as', viaSuperAdmin: true });
    expect(JSON.stringify(d.audit)).not.toContain('গোপন-কারণ');
    expect(JSON.stringify(d.team)).not.toMatch(/\+880|phone/);
  });
});

describe('slug check and domains list', () => {
  it('slug-available: taken, free, invalid; super admin only', async () => {
    await makeTenant(env, sa, 'ndp3');
    expect((await get('/slug-available?slug=ndp3')).body).toMatchObject({ available: false, host: 'ndp3.jonoshetu.test' });
    expect((await get('/slug-available?slug=NEW-seat')).body).toMatchObject({ slug: 'new-seat', available: true });
    expect((await get('/slug-available?slug=-x')).status).toBe(400);
    expect((await get('/slug-available?slug=ndp4', await makeSupport(env))).status).toBe(403);
  });

  it('lists every domain with its tenant and TXT record; support can read, only super admin can change', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await api(env).post(`/api/v1/super/tenants/${t.id}/domains`).set(bearer(sa)).send({ host: 'noor.example' });
    const sup = await makeSupport(env);
    const r = await get('/domains', sup);
    expect(r.status).toBe(200);
    expect(r.body.dnsTarget).toBe('sites.jonoshetu.test');
    const custom = r.body.items.find((x: { host: string }) => x.host === 'noor.example');
    expect(custom).toMatchObject({ type: 'custom', dnsStatus: 'pending', tenantId: t.id, mpName: 'ড. পরীক্ষা ndp3', txtName: '_jonoshetu.noor.example' });
    expect(custom.txtValue).toMatch(/^jonoshetu-verify=/);
    expect(r.body.items.find((x: { type: string }) => x.type === 'platform').txtValue).toBeNull();
    expect((await api(env).post(`/api/v1/super/domains/${custom.id}/verify`).set(bearer(sup))).status).toBe(403);
    expect(await Domain.countDocuments()).toBe(2);
  });
});

describe('GET /super/audit (FR-SA-06)', () => {
  it('BUG-2026-018: never returns a citizen IP / user agent or an identity-view reason; support never sees IPs', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await api(env).post('/api/v1/public/complaints').set('Host', t.host).set('User-Agent', 'CitizenBrowser/1.0').send({ category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন', description: 'রাস্তার বাতি দুই সপ্তাহ ধরে নষ্ট হয়ে আছে', phone: '01712345678', name: 'নাগরিক', turnstileToken: 'ok' });
    const stored = await AuditLog.findOne({ action: 'complaint.create' }).lean();
    expect(stored!.ip ?? null).toBeNull(); // BUG-2026-019: a citizen's IP is not even stored any more (defence in depth: the API also strips it)
    expect(stored!.userAgent ?? null).toBeNull();
    const all = (await get('/audit?limit=100')).body.items;
    const row = all.find((x: { action: string }) => x.action === 'complaint.create');
    expect(row).toBeTruthy();
    expect(row.ip).toBeNull();
    expect(JSON.stringify(all)).not.toMatch(/CitizenBrowser|userAgent/);
    // an authenticated admin action keeps its IP for super admins (investigations) ...
    const create = all.find((x: { action: string }) => x.action === 'tenant.create');
    expect(create.ip).toBeTruthy();
    expect(create.tenantName).toBe('ড. পরীক্ষা ndp3');
    // ... but support staff never get any IP
    const sup = await makeSupport(env);
    const sAll = (await get('/audit?limit=100', sup)).body.items;
    expect(sAll.length).toBe(all.length);
    expect(sAll.every((x: { ip: unknown }) => x.ip === null)).toBe(true);
  });

  it('filters by actor name, actor type, action prefix and Dhaka date range; bad filters are ignored', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await api(env).post(`/api/v1/super/tenants/${t.id}/act-as`).set(bearer(sa)).send({ reason: 'অডিট পরীক্ষার জন্য ঢুকছি' });
    const today = dhakaDay(env.clock.now);
    const byActor = (await get('/audit?actor=root&limit=100')).body;
    expect(byActor.total).toBeGreaterThan(0);
    expect(byActor.items.every((x: { actor: { name: string } }) => /root/i.test(x.actor.name))).toBe(true);
    const office = (await get('/audit?actorType=office&limit=100')).body.items;
    expect(office.every((x: { actor: { viaSuperAdmin: boolean } | null }) => !x.actor?.viaSuperAdmin)).toBe(true);
    const tenantRows = (await get(`/audit?action=tenant&tenantId=${t.id}`)).body.items;
    expect(tenantRows.length).toBeGreaterThan(0);
    expect(tenantRows.every((x: { action: string }) => x.action.startsWith('tenant.'))).toBe(true);
    const actAs = tenantRows.find((x: { action: string }) => x.action === 'tenant.act_as');
    expect(actAs.reason).toContain('অডিট পরীক্ষার'); // a staff member's own reason is shown
    expect((await get(`/audit?from=${today}&to=${today}`)).body.total).toBeGreaterThan(0);
    expect((await get('/audit?from=2020-01-01&to=2020-01-31')).body.total).toBe(0);
    expect((await get('/audit?to=2020-01-31')).body.total).toBe(0);
    // junk values are ignored rather than turned into queries
    const total = (await get('/audit')).body.total;
    expect((await get('/audit?from=yesterday&actor=%2E%2A&action=$where')).body.total).toBeLessThanOrEqual(total);
    expect((await get('/audit?from=yesterday&action=$where')).body.total).toBe(total);
  });
});
