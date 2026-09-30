import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeSupport, makeTenant, loginFlow, api, admin, bearer, PASSWORD, type TestEnv } from '../helpers/env.js';
import { Tenant, Domain, AuditLog, User, Membership } from '../../src/models/index.js';
import { unwrapKey } from '../../src/lib/crypto.js';

let env: TestEnv, sa: string;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => { await clearDb(); env = makeEnv(); sa = await makeSuperAdmin(env); });

const create = (over: Record<string, unknown> = {}, tok = sa) => api(env).post('/api/v1/super/tenants').set(bearer(tok)).send({
  mpName: 'ড. তাহমিনা নূর', mpRole: 'mp', seatName: 'নদীপুর', seatNumber: 3, slug: 'ndp3', ownerPhone: '01700000010',
  consent: { confirmed: true, documentRef: 'সম্মতিপত্র-২০২৬-০১১' }, ...over,
});

describe('creating a tenant (FR-SA-02, MIS-07: no site without the office\'s written consent)', () => {
  it('creates the tenant in "setup" with a platform subdomain, a wrapped encryption key and an owner invite', async () => {
    const r = await create();
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('setup');
    const t = await Tenant.findById(r.body.id).select('+dek.wrapped');
    expect(t!.trackingPrefix).toBe('NDP3');
    expect(t!.consent.documentRef).toBe('সম্মতিপত্র-২০২৬-০১১');
    expect(unwrapKey(env.deps.master, t!.dek!.wrapped)).toHaveLength(32); // data key is stored wrapped, never raw
    expect((await Domain.findOne({ tenantId: t!._id }))!.host).toBe('ndp3.jonoshetu.test');
    expect(env.sms.outbox.at(-1)!.text).toContain('/invite/');
    expect((await AuditLog.findOne({ action: 'tenant.create' }))!.diff!.after).toMatchObject({ consentRef: 'সম্মতিপত্র-২০২৬-০১১' });
  });

  it('refuses without consent, without a document reference, or with consent=false', async () => {
    expect((await create({ consent: undefined })).status).toBe(400);
    expect((await create({ consent: { confirmed: false, documentRef: 'x-123' } })).status).toBe(400);
    expect((await create({ consent: { confirmed: true } })).status).toBe(400);
    expect((await create({ consent: { confirmed: true, documentRef: '' } })).status).toBe(400);
    expect(await Tenant.countDocuments()).toBe(0);
  });

  it('validates slug, phone, role; rejects duplicates and unknown keys', async () => {
    for (const bad of [{ slug: 'A' }, { slug: 'has space' }, { slug: '-x-' }, { ownerPhone: '123' }, { mpRole: 'president' }, { seatNumber: 0 }, { evil: true }]) expect((await create(bad)).status).toBe(400);
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(409);
    expect((await create({ slug: 'ndp4' })).status).toBe(201);
  });

  it('only super admins can create; support is read-only', async () => {
    const sup = await makeSupport(env);
    expect((await create({}, sup)).status).toBe(403);
    expect((await api(env).get('/api/v1/super/tenants').set(bearer(sup))).status).toBe(200);
  });

  it('the owner invite works once, then the owner sets up 2FA and can reach the admin', async () => {
    const r = await create();
    const acc = await api(env).post(`/api/v1/auth/invites/${r.body.inviteToken}/accept`).send({ password: PASSWORD });
    expect(acc.status).toBe(200);
    expect((await api(env).post(`/api/v1/auth/invites/${r.body.inviteToken}/accept`).send({ password: PASSWORD })).status).toBe(404); // single use
    const s = await loginFlow(env, '+8801700000010');
    const me = await api(env).get('/api/v1/auth/me').set(bearer(s.token));
    expect(me.body.memberships[0]).toMatchObject({ role: 'owner', slug: 'ndp3' });
  });

  it('weak passwords are refused when accepting an invite', async () => {
    const r = await create();
    for (const password of ['short1', 'passwordonly', '1234567890', 'password123']) expect((await api(env).post(`/api/v1/auth/invites/${r.body.inviteToken}/accept`).send({ password })).status).toBe(400);
  });

  it('an expired invite is refused', async () => {
    const r = await create();
    env.clock.now += 73 * 3600_000;
    expect((await api(env).post(`/api/v1/auth/invites/${r.body.inviteToken}/accept`).send({ password: PASSWORD })).status).toBe(404);
  });

  it('reuses an existing user (one person can belong to several tenants)', async () => {
    await create();
    await create({ slug: 'ndp4', seatName: 'অন্যপুর' });
    expect(await User.countDocuments({ phone: '+8801700000010' })).toBe(1);
    expect(await Membership.countDocuments({})).toBe(2);
  });
});

describe('going live, suspending (FR-SA-03, FR-PUB-12)', () => {
  const st = (id: string, body: object) => api(env).post(`/api/v1/super/tenants/${id}/status`).set(bearer(sa)).send(body);

  it('cannot go live without the content check, or before the MP has activated their account', async () => {
    const r = await create();
    expect((await st(r.body.id, { to: 'live', reason: 'প্রস্তুত আছে সব' })).status).toBe(422);
    const noOwner = await st(r.body.id, { to: 'live', reason: 'প্রস্তুত আছে সব', contentChecked: true });
    expect(noOwner.status).toBe(422);
    expect(noOwner.body.error.code).toBe('NO_ACTIVE_OWNER');
  });

  it('setup -> live -> suspended -> live, each with a reason, history and audit; nonsense jumps refused', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    expect((await api(env).get('/api/v1/public/site').set('Host', t.host)).status).toBe(200);
    expect((await st(t.id, { to: 'setup', reason: 'আবার সেটআপে নেব' })).status).toBe(422); // live -> setup not allowed
    expect((await st(t.id, { to: 'suspended', reason: 'x' })).status).toBe(400); // reason too short
    expect((await st(t.id, { to: 'suspended', reason: 'চুক্তির মেয়াদ শেষ' })).status).toBe(200);
    const down = await api(env).get('/api/v1/public/site').set('Host', t.host);
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('SITE_SUSPENDED');
    expect((await st(t.id, { to: 'live', reason: 'চুক্তি নবায়ন হয়েছে', contentChecked: true })).status).toBe(200);
    expect((await api(env).get('/api/v1/public/site').set('Host', t.host)).status).toBe(200);
    const doc = await Tenant.findById(t.id);
    expect(doc!.statusHistory.map((h) => `${h.from}>${h.to}`)).toEqual(['setup>live', 'live>suspended', 'suspended>live']);
    expect(await AuditLog.countDocuments({ action: /^tenant\.status\./ })).toBe(3);
  });

  it('a setup tenant is not publicly reachable at all', async () => {
    await create();
    expect((await api(env).get('/api/v1/public/site').set('Host', 'ndp3.jonoshetu.test')).status).toBe(404);
  });

  it('a suspended tenant\'s admin panel still works for the owner (data kept, nothing deleted)', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await st(t.id, { to: 'suspended', reason: 'সাময়িক স্থগিত রাখা হলো' });
    expect((await api(env).get(admin(t, '/posts')).set(bearer(t.owner))).status).toBe(200);
  });
});

describe('act-as (FR-SA-05, MIS-06)', () => {
  it('requires a reason, is time-boxed, and every action inside is tagged viaSuperAdmin', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    const act = await api(env).post(`/api/v1/super/tenants/${t.id}/act-as`).set(bearer(sa)).send({ reason: 'ব্যানারের ছবি ভাঙা, ঠিক করছি' });
    expect(act.body.expiresAt).toBeTruthy();
    const ttl = new Date(act.body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(29 * 60_000); expect(ttl).toBeLessThan(31 * 60_000);
    const w = await api(env).put(admin(t, '/site-config')).set(bearer(act.body.actAsToken)).send({ slogan: 'সুপার অ্যাডমিন বদলাল', accent: 'brass', banners: [], sections: [] });
    expect(w.status).toBe(200);
    const a = await AuditLog.findOne({ action: 'site.update', tenantId: t.id }).lean();
    expect(a!.actor).toMatchObject({ name: 'Root Admin', viaSuperAdmin: true });
    const start = await AuditLog.findOne({ action: 'tenant.act_as' }).lean();
    expect(start!.reason).toContain('ব্যানারের ছবি');
    const office = await api(env).get(admin(t, '/audit')).set(bearer(t.owner)); // the MP's office can see it
    expect(office.body.items.some((x: { actor?: { viaSuperAdmin: boolean } }) => x.actor?.viaSuperAdmin)).toBe(true);
  });

  it('an expired act-as token stops working', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    const { signAccess } = await import('../../src/lib/tokens.js');
    const me = await api(env).get('/api/v1/auth/me').set(bearer(sa));
    const sess = await User.findById(me.body.user.id);
    const expired = signAccess(env.config.JWT_SECRET, { sub: me.body.user.id, sid: sess!.sessions[0]!.sid, act: { tenantId: t.id }, ttlSec: 60 });
    expect((await api(env).get(admin(t, '/posts')).set(bearer(expired))).status).toBe(200);
    const jwt = (await import('jsonwebtoken')).default;
    const past = jwt.sign({ sub: me.body.user.id, sid: sess!.sessions[0]!.sid, typ: 'access', act: { tenantId: t.id } }, env.config.JWT_SECRET, { algorithm: 'HS256', expiresIn: -10, issuer: 'jonoshetu', audience: 'jonoshetu-api' });
    expect((await api(env).get(admin(t, '/posts')).set(bearer(past))).status).toBe(401);
  });

  it('logging the super admin out also kills the act-as token (it is bound to the session)', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    const act = await api(env).post(`/api/v1/super/tenants/${t.id}/act-as`).set(bearer(sa)).send({ reason: 'सেবার জন্য ঢুকছি এখানে' });
    await api(env).post('/api/v1/auth/logout').set(bearer(sa));
    expect((await api(env).get(admin(t, '/posts')).set(bearer(act.body.actAsToken))).status).toBe(401);
  });
});

describe('domains (FR-SA-04, ADR-0006)', () => {
  it('custom domain: add -> DNS instructions -> verify -> primary; the public site then answers on it', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    const add = await api(env).post(`/api/v1/super/tenants/${t.id}/domains`).set(bearer(sa)).send({ host: 'Tahmina-Noor.example' });
    expect(add.status).toBe(201);
    expect(add.body.instructions.map((i: { type: string }) => i.type)).toEqual(['CNAME', 'TXT']);
    expect((await api(env).get('/api/v1/public/site').set('Host', 'tahmina-noor.example')).status).toBe(404); // BUG-2026-006: not served until ownership is proven
    expect((await api(env).post(`/api/v1/super/domains/${add.body.id}/primary`).set(bearer(sa))).status).toBe(422); // not verified yet
    expect((await api(env).post(`/api/v1/super/domains/${add.body.id}/verify`).set(bearer(sa))).status).toBe(422);
    env.domains.verified.add('tahmina-noor.example');
    expect((await api(env).post(`/api/v1/super/domains/${add.body.id}/verify`).set(bearer(sa))).status).toBe(200);
    expect((await api(env).get('/api/v1/public/site').set('Host', 'tahmina-noor.example')).status).toBe(200); // served after verification
    expect((await api(env).post(`/api/v1/super/domains/${add.body.id}/primary`).set(bearer(sa))).status).toBe(204);
    const primaries = await Domain.find({ tenantId: t.id, primary: true });
    expect(primaries.map((d) => d.host)).toEqual(['tahmina-noor.example']);
  });

  it('rejects malformed and duplicate domains; a domain cannot be claimed by two tenants', async () => {
    const a = await makeTenant(env, sa, 'ndp3'), b = await makeTenant(env, sa, 'sbp1');
    for (const host of ['nodots', 'http://x.com', 'bad_domain.com', '.com']) expect((await api(env).post(`/api/v1/super/tenants/${a.id}/domains`).set(bearer(sa)).send({ host })).status).toBe(400);
    expect((await api(env).post(`/api/v1/super/tenants/${a.id}/domains`).set(bearer(sa)).send({ host: 'shared.example' })).status).toBe(201);
    expect((await api(env).post(`/api/v1/super/tenants/${b.id}/domains`).set(bearer(sa)).send({ host: 'shared.example' })).status).toBe(409);
  });
});

describe('overview and audit', () => {
  it('dashboard and list show counts only and flag stale sites (no complaint text or identities)', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await api(env).post('/api/v1/public/complaints').set('Host', t.host).send({ category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন', description: 'গোপন বিবরণ যা সুপার অ্যাডমিন দেখবে না', phone: '01712345678', name: 'গোপন নাম', turnstileToken: 'ok' });
    const list = await api(env).get('/api/v1/super/tenants').set(bearer(sa));
    expect(list.body[0]).toMatchObject({ slug: 'ndp3', status: 'live', complaintsLast30d: 1, stale: true, daysSinceLastPost: null });
    const dash = await api(env).get('/api/v1/super/dashboard').set(bearer(sa));
    expect(dash.body).toMatchObject({ tenants: 1, live: 1, complaintsLast30d: 1 });
    const txt = JSON.stringify([list.body, dash.body, (await api(env).get(`/api/v1/super/tenants/${t.id}`).set(bearer(sa))).body]);
    expect(txt).not.toMatch(/গোপন|01712345678|phoneEnc|wrapped|dek/);
  });

  it('the global audit log filters by tenant, actor type and action; only platform staff can read it', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await api(env).post(`/api/v1/super/tenants/${t.id}/act-as`).set(bearer(sa)).send({ reason: 'অডিট পরীক্ষার জন্য ঢুকছি' });
    const all = await api(env).get('/api/v1/super/audit').set(bearer(sa));
    expect(all.body.total).toBeGreaterThan(3);
    const one = await api(env).get(`/api/v1/super/audit?tenantId=${t.id}&action=tenant.act_as`).set(bearer(sa));
    expect(one.body.items.every((x: { action: string }) => x.action === 'tenant.act_as')).toBe(true);
    expect((await api(env).get('/api/v1/super/audit?page=1&limit=2').set(bearer(sa))).body.items).toHaveLength(2);
    expect((await api(env).get('/api/v1/super/audit').set(bearer(t.owner))).status).toBe(403);
  });

  it('the audit log itself cannot be rewritten through the app models', async () => {
    const t = await makeTenant(env, sa, 'ndp3');
    await expect(AuditLog.deleteMany({ tenantId: t.id })).rejects.toThrow(/append-only/);
    await expect(AuditLog.updateMany({}, { action: 'x' })).rejects.toThrow(/append-only/);
  });
});
