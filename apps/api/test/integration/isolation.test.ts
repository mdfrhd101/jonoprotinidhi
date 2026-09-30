import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeSupport, makeTenant, api, admin, bearer, type TestEnv, type Tenant } from '../helpers/env.js';
import sharp from 'sharp';
import { Complaint, Post, PromiseItem, MediaAsset } from '../../src/models/index.js';
import type { MemoryMediaStorage } from '../../src/lib/media.js';
import { runInTenant } from '../../src/context.js';

/* MIS-01 / ADR-0003: two rival tenants share the platform. This suite seeds data in tenant B and then, as every kind
   of user of tenant A, tries to reach B's data through every admin route. Foreign ids must look like "not found".
   New tenant routes MUST be added to ROUTES below (the coverage check at the bottom fails otherwise). */

let env: TestEnv, sa: string, A: Tenant, B: Tenant;
let bPost = '', bPromise = '', bComplaint = '', bMembership = '', bMedia = '', bEvent = '', bGallery = '', bVideo = '';

beforeAll(async () => {
  await startDb(); await clearDb();
  env = makeEnv();
  sa = await makeSuperAdmin(env);
  A = await makeTenant(env, sa, 'party-a');
  B = await makeTenant(env, sa, 'party-b');
  const good = { title: 'দ্বিতীয় দলের এমপির গোপন খবর', summary: 'শুধু দ্বিতীয় দলের নিজস্ব সারাংশ এখানে।', category: 'dev', eventDate: '2026-09-01' };
  bPost = (await api(env).post(admin(B, '/posts')).set(bearer(B.owner)).send(good)).body._id;
  await api(env).post(admin(B, `/posts/${bPost}/approve`)).set(bearer(B.owner)).send({});
  bPromise = (await api(env).post(admin(B, '/promises')).set(bearer(B.owner)).send({ sector: 'road', name: 'দ্বিতীয় দলের প্রতিশ্রুতি', pct: 10, status: 'ongoing' })).body._id;
  const c = await api(env).post('/api/v1/public/complaints').set('Host', B.host).send({ category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন', description: 'দ্বিতীয় দলের এলাকার একটি অভিযোগ যা গোপন', phone: '01755555555', name: 'গোপন নাম', turnstileToken: 'ok' });
  bComplaint = String((await runInTenant(B.id, () => Complaint.findOne({ trackingId: c.body.trackingId })))!._id);
  const team = await api(env).get(admin(B, '/team')).set(bearer(B.owner));
  bMembership = team.body[0].id;
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#333' } }).png().toBuffer();
  bEvent = (await api(env).post(admin(B, '/events?publish=1')).set(bearer(B.owner)).send({ title: 'দ্বিতীয় দলের সভা', date: '2030-01-01' })).body.id;
  bGallery = (await api(env).post(admin(B, '/gallery?publish=1')).set(bearer(B.owner)).send({ url: 'https://upload.wikimedia.org/a.jpg', caption: 'দ্বিতীয় দলের ছবি' })).body.id;
  bVideo = (await api(env).post(admin(B, '/videos?publish=1')).set(bearer(B.owner)).send({ title: 'দ্বিতীয় দলের ভিডিও', kind: 'youtube', youtube: 'aqz-KE-bpKQ' })).body.id;
  await api(env).put(admin(B, '/pages/contact')).set(bearer(B.owner)).send({ intro: 'দ্বিতীয় দলের যোগাযোগ' });
  bMedia = (await api(env).post(admin(B, '/media')).set(bearer(B.owner)).set('Content-Type', 'image/png').send(png)).body.id;
});
afterAll(stopDb);

type Route = { m: 'get' | 'post' | 'patch' | 'put' | 'delete'; path: (id: { post: string; promise: string; complaint: string; member: string; media: string; event: string; gallery: string; video: string; page: string }) => string; body?: object };
const ROUTES: Route[] = [
  { m: 'get', path: () => '/me' }, { m: 'get', path: () => '/dashboard' },
  { m: 'get', path: () => '/posts' }, { m: 'post', path: () => '/posts', body: { title: 'অনুপ্রবেশের চেষ্টা করা পোস্ট' } },
  { m: 'get', path: (i) => `/posts/${i.post}` }, { m: 'patch', path: (i) => `/posts/${i.post}`, body: { title: 'হ্যাক করা শিরোনাম' } }, { m: 'delete', path: (i) => `/posts/${i.post}` },
  ...['submit', 'withdraw', 'approve', 'unpublish', 'restore'].map((a): Route => ({ m: 'post', path: (i) => `/posts/${i.post}/${a}`, body: {} })),
  { m: 'post', path: (i) => `/posts/${i.post}/reject`, body: { reason: 'কারণ লিখলাম' } },
  { m: 'get', path: (i) => `/posts/${i.post}/versions` }, { m: 'post', path: (i) => `/posts/${i.post}/versions/1/restore` },
  { m: 'get', path: () => '/promises' }, { m: 'post', path: () => '/promises', body: { sector: 'road', name: 'অনুপ্রবেশ প্রতিশ্রুতি', pct: 1, status: 'plan' } },
  { m: 'patch', path: (i) => `/promises/${i.promise}`, body: { pct: 99 } }, { m: 'post', path: (i) => `/promises/${i.promise}/updates`, body: { text: 'হ্যাক আপডেট' } }, { m: 'delete', path: (i) => `/promises/${i.promise}` },
  { m: 'post', path: () => '/media/video', body: {} },
  { m: 'get', path: () => '/pages' }, { m: 'get', path: (i) => `/pages/${i.page}` }, { m: 'put', path: (i) => `/pages/${i.page}`, body: { intro: 'হ্যাক' } },
  { m: 'post', path: (i) => `/pages/${i.page}/publish`, body: {} }, { m: 'post', path: (i) => `/pages/${i.page}/discard`, body: {} },
  ...([['events', 'event'], ['gallery', 'gallery'], ['videos', 'video']] as const).flatMap(([p, k]): Route[] => [
    { m: 'get', path: () => `/${p}` }, { m: 'post', path: () => `/${p}`, body: { title: 'অনুপ্রবেশ' } },
    { m: 'get', path: (i) => `/${p}/${i[k]}` }, { m: 'patch', path: (i) => `/${p}/${i[k]}`, body: { title: 'হ্যাক করা' } }, { m: 'delete', path: (i) => `/${p}/${i[k]}` },
    { m: 'post', path: (i) => `/${p}/${i[k]}/publish`, body: {} }, { m: 'post', path: (i) => `/${p}/${i[k]}/unpublish`, body: {} },
  ]),
  { m: 'post', path: () => '/gallery/reorder', body: { ids: [] } }, { m: 'post', path: () => '/videos/reorder', body: { ids: [] } },
  { m: 'get', path: () => '/media' }, { m: 'post', path: () => '/media', body: {} }, { m: 'delete', path: (i) => `/media/${i.media}` },
  { m: 'get', path: () => '/site-config' }, { m: 'put', path: () => '/site-config', body: { slogan: 'x', accent: 'brass', banners: [], sections: [] } },
  { m: 'get', path: () => '/settings' }, { m: 'put', path: () => '/settings', body: { otpRequired: true, slaDays: 3, complaintCategories: ['ক ক', 'খ খ'] } },
  { m: 'get', path: () => '/profile' }, { m: 'put', path: () => '/profile', body: { headline: 'x' } }, { m: 'post', path: () => '/profile/publish', body: {} },
  { m: 'get', path: () => '/complaints' }, { m: 'get', path: () => '/complaints/export.csv' },
  { m: 'post', path: () => '/complaints', body: { channel: 'hearing', category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন', description: 'অনুপ্রবেশের চেষ্টা করা অভিযোগ', anonymous: true } },
  { m: 'get', path: (i) => `/complaints/${i.complaint}` }, { m: 'patch', path: (i) => `/complaints/${i.complaint}`, body: { status: 'verify' } },
  { m: 'post', path: (i) => `/complaints/${i.complaint}/notes`, body: { text: 'হ্যাক নোট' } }, { m: 'post', path: (i) => `/complaints/${i.complaint}/sms`, body: { templateKey: 'received' } },
  { m: 'post', path: (i) => `/complaints/${i.complaint}/pii-view`, body: { purpose: 'অনুপ্রবেশের চেষ্টা' } },
  { m: 'get', path: () => '/team' }, { m: 'post', path: () => '/team/invites', body: { name: 'অনুপ্রবেশকারী', phone: '01711111111', role: 'editor' } },
  { m: 'patch', path: (i) => `/team/${i.member}`, body: { upazilas: ['চরকান্দি'] } }, { m: 'delete', path: (i) => `/team/${i.member}` },
  { m: 'get', path: () => '/audit' },
];
const ids = () => ({ post: bPost, promise: bPromise, complaint: bComplaint, member: bMembership, media: bMedia, event: bEvent, gallery: bGallery, video: bVideo, page: 'contact' });

describe('tenant A users cannot reach tenant B through B\'s own URL (membership check)', () => {
  for (const who of ['owner', 'editor', 'officer'] as const) {
    it(`${who} of A -> every B route is 404`, async () => {
      const bad: string[] = [];
      for (const r of ROUTES) {
        const res = await api(env)[r.m](admin(B, r.path(ids()))).set(bearer(A[who])).send(r.body as never);
        if (res.status !== 404) bad.push(`${r.m.toUpperCase()} ${r.path(ids())} -> ${res.status}`);
      }
      expect(bad).toEqual([]);
    });
  }
  it('unauthenticated requests are 401 on every admin route', async () => {
    const bad: string[] = [];
    for (const r of ROUTES) { const res = await api(env)[r.m](admin(B, r.path(ids()))).send(r.body as never); if (res.status !== 401) bad.push(`${r.m} ${r.path(ids())} -> ${res.status}`); }
    expect(bad).toEqual([]);
  });
});

describe('tenant A users cannot reach B\'s records by putting B\'s ids into A\'s own URL', () => {
  it('owner of A gets 404 for B\'s post/promise/complaint/membership ids on every id route', async () => {
    const withIds = ROUTES.filter((r) => /post|promise|complaint|member|media|events|gallery|videos/.test(r.path(ids())) && r.path(ids()).split('/').filter(Boolean).length >= 2 && /[a-f0-9]{24}/.test(r.path(ids())));
    expect(withIds.length).toBeGreaterThan(16);
    const bad: string[] = [];
    for (const r of withIds) {
      // pii-view is officer-only, so probe it with A's officer (the owner is refused earlier, by permission)
      const tok = r.path(ids()).endsWith('/pii-view') ? A.officer : A.owner;
      const res = await api(env)[r.m](admin(A, r.path(ids()))).set(bearer(tok)).send(r.body as never);
      if (res.status !== 404) bad.push(`${r.m.toUpperCase()} ${r.path(ids())} -> ${res.status} ${JSON.stringify(res.body).slice(0, 80)}`);
    }
    expect(bad).toEqual([]);
  });

  it('B\'s data is completely untouched after all those attempts', async () => {
    const post = await runInTenant(B.id, () => Post.findById(bPost).lean());
    expect(post!.title).toBe('দ্বিতীয় দলের এমপির গোপন খবর'); expect(post!.status).toBe('published');
    expect((await runInTenant(B.id, () => PromiseItem.findById(bPromise).lean()))!.pct).toBe(10);
    expect((await runInTenant(B.id, () => Complaint.findById(bComplaint).lean()))!.status).toBe('new');
    expect(await runInTenant(A.id, () => Post.countDocuments())).toBe(0);
    expect(await runInTenant(B.id, () => MediaAsset.countDocuments({ _id: bMedia }))).toBe(1);
    expect((env.deps.media as MemoryMediaStorage).files.has(`${B.id}/${bMedia}.webp`)).toBe(true);
    for (const [path, host] of [['/events', B.host], ['/gallery', B.host], ['/videos', B.host]] as const) expect((await api(env).get(`/api/v1/public${path}`).set('Host', host)).body.items, path).toHaveLength(1);
    expect((await api(env).get(admin(B, '/pages/contact')).set(bearer(B.owner))).body.draft.intro).toBe('দ্বিতীয় দলের যোগাযোগ');
  });

  it('lists in A never contain B\'s rows (posts, promises, complaints, team, audit, dashboard)', async () => {
    for (const path of ['/posts', '/promises', '/complaints', '/team', '/audit']) {
      const txt = JSON.stringify((await api(env).get(admin(A, path)).set(bearer(A.owner))).body);
      expect(txt, path).not.toContain('দ্বিতীয় দল');
      expect(txt, path).not.toContain(B.id);
    }
    for (const path of ['/media', '/events', '/gallery', '/videos', '/pages', '/pages/contact']) {
      const txt = JSON.stringify((await api(env).get(admin(A, path)).set(bearer(A.owner))).body);
      expect(txt, path).not.toContain(bMedia);
    }
    const dash = (await api(env).get(admin(A, '/dashboard')).set(bearer(A.owner))).body;
    expect(dash.posts).toMatchObject({ total: 0, byStatus: {} }); expect(dash.complaints).toMatchObject({ total: 0, byStatus: {} }); expect(dash.promises).toMatchObject({ total: 0, byStatus: {} });
  });
});

describe('public sites are isolated by Host', () => {
  it('each host returns only its own content', async () => {
    const a = await api(env).get('/api/v1/public/posts').set('Host', A.host);
    const b = await api(env).get('/api/v1/public/posts').set('Host', B.host);
    expect(a.body.items).toHaveLength(0);
    expect(b.body.items).toHaveLength(1);
    expect((await api(env).get('/api/v1/public/promises').set('Host', A.host)).body.items).toHaveLength(0);
  });
  it('B\'s post slug is 404 on A\'s host', async () => {
    const slug = (await api(env).get('/api/v1/public/posts').set('Host', B.host)).body.items[0].slug;
    expect((await api(env).get(`/api/v1/public/posts/${slug}`).set('Host', A.host)).status).toBe(404);
    expect((await api(env).get(`/api/v1/public/posts/${slug}`).set('Host', B.host)).status).toBe(200);
  });
  it('a Host header cannot be spoofed via x-forwarded-host in production mode', async () => {
    const prod = makeEnv({ NODE_ENV: 'production', TURNSTILE_SECRET: 'x' });
    const r = await api(prod).get('/api/v1/public/site').set('Host', 'unknown.example').set('x-forwarded-host', B.host);
    expect(r.status).toBe(404);
  });
});

describe('platform staff and act-as boundaries', () => {
  it('a super admin WITHOUT act-as cannot use tenant admin routes (must state a reason first)', async () => {
    expect((await api(env).get(admin(B, '/posts')).set(bearer(sa))).status).toBe(404);
  });
  it('an act-as token is bound to the tenant it was issued for', async () => {
    const act = await api(env).post(`/api/v1/super/tenants/${A.id}/act-as`).set(bearer(sa)).send({ reason: 'সাইট ঠিক করার জন্য A-তে ঢুকছি' });
    expect(act.status).toBe(200);
    expect((await api(env).get(admin(A, '/posts')).set(bearer(act.body.actAsToken))).status).toBe(200);
    expect((await api(env).get(admin(B, '/posts')).set(bearer(act.body.actAsToken))).status).toBe(404);
  });
  it('act-as needs a real reason and support staff are read-only inside a tenant', async () => {
    expect((await api(env).post(`/api/v1/super/tenants/${A.id}/act-as`).set(bearer(sa)).send({ reason: 'ঠিক' })).status).toBe(400);
    const sup = await makeSupport(env);
    const act = await api(env).post(`/api/v1/super/tenants/${A.id}/act-as`).set(bearer(sup)).send({ reason: 'গ্রাহক সহায়তার জন্য দেখছি' });
    expect((await api(env).get(admin(A, '/posts')).set(bearer(act.body.actAsToken))).status).toBe(200);
    expect((await api(env).post(admin(A, '/posts')).set(bearer(act.body.actAsToken)).send({ title: 'সাপোর্ট থেকে লেখা পোস্ট' })).status).toBe(403);
    expect((await api(env).post(admin(A, '/promises')).set(bearer(act.body.actAsToken)).send({ sector: 'road', name: 'সাপোর্টের প্রতিশ্রুতি', pct: 1, status: 'plan' })).status).toBe(403);
  });
  it('tenant users cannot call any /super route', async () => {
    for (const path of ['/dashboard', '/tenants', '/audit']) expect((await api(env).get(`/api/v1/super${path}`).set(bearer(A.owner))).status).toBe(403);
    expect((await api(env).post('/api/v1/super/tenants').set(bearer(A.owner)).send({})).status).toBe(403);
  });
});

describe('role matrix (docs/04 §4)', () => {
  const cases: Array<[string, Route['m'], string, object | undefined, { owner: number; editor: number; officer: number }]> = [
    ['dashboard', 'get', '/dashboard', undefined, { owner: 200, editor: 200, officer: 200 }],
    ['list posts', 'get', '/posts', undefined, { owner: 200, editor: 200, officer: 403 }],
    ['list promises', 'get', '/promises', undefined, { owner: 200, editor: 200, officer: 403 }],
    ['create promise', 'post', '/promises', { sector: 'road', name: 'নতুন প্রতিশ্রুতি এখানে', pct: 0, status: 'plan' }, { owner: 201, editor: 403, officer: 403 }],
    ['site config', 'get', '/site-config', undefined, { owner: 200, editor: 403, officer: 403 }],
    ['settings', 'get', '/settings', undefined, { owner: 200, editor: 403, officer: 403 }],
    ['profile edit', 'get', '/profile', undefined, { owner: 200, editor: 200, officer: 403 }],
    ['profile publish', 'post', '/profile/publish', {}, { owner: 200, editor: 403, officer: 403 }],
    ['complaints list', 'get', '/complaints', undefined, { owner: 200, editor: 403, officer: 200 }],
    ['complaints export', 'get', '/complaints/export.csv', undefined, { owner: 200, editor: 403, officer: 403 }],
    ['team list', 'get', '/team', undefined, { owner: 200, editor: 403, officer: 403 }],
    ['audit', 'get', '/audit', undefined, { owner: 200, editor: 403, officer: 403 }],
  ];
  for (const [name, m, path, body, exp] of cases) {
    it(`${name}: owner ${exp.owner} / editor ${exp.editor} / officer ${exp.officer}`, async () => {
      for (const who of ['owner', 'editor', 'officer'] as const) {
        const r = await api(env)[m](admin(A, path)).set(bearer(A[who])).send(body as never);
        expect(r.status, `${who} ${m} ${path}`).toBe(exp[who]);
      }
    });
  }
});

describe('coverage guard', () => {
  it('every tenant admin route registered in the app appears in the crawler table', async () => {
    const { adminRoutes } = await import('../../src/routes/admin.js');
    const router = adminRoutes(env.deps, env.services) as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
    const registered = router.stack.filter((l) => l.route).flatMap((l) => Object.keys(l.route!.methods).map((m) => `${m.toUpperCase()} ${l.route!.path}`));
    const norm = (s: string) => s.replace(/:[a-zA-Z]+/g, ':x').replace(/\/\d+(?=\/|$)/g, '/:x');
    const covered = new Set(ROUTES.map((r) => `${r.m.toUpperCase()} ${norm(r.path({ post: ':id', promise: ':id', complaint: ':id', member: ':id', media: ':id', event: ':id', gallery: ':id', video: ':id', page: ':id' }))}`));
    const missing = registered.map(norm).filter((r) => !covered.has(r));
    expect(missing, 'add these routes to ROUTES in isolation.test.ts').toEqual([]);
  });
});
