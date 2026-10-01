import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeTenant, api, admin, bearer, type TestEnv, type Tenant } from '../helpers/env.js';
import { Complaint, EventItem, GalleryItem, Membership, PageContent, Post, PromiseItem, VideoItem } from '../../src/models/index.js';
import { runInTenant } from '../../src/context.js';
import { fillSeries } from '../../src/services/dashboard.js';

/* Tenant dashboard (docs/09 §2): shape, 30 zero-filled days, role filtering (BUG-2026-011), scoped officers, no PII, isolation. */

let env: TestEnv, sa: string, t: Tenant;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  env = makeEnv();
  sa = await makeSuperAdmin(env);
  t = await makeTenant(env, sa, 'ndp3', { officerUpazilas: ['চরকান্দি'] });
});

const dash = (tok: string, tenant: Tenant = t) => api(env).get(admin(tenant, '/dashboard')).set(bearer(tok));
const inT = <T,>(tenant: Tenant, fn: () => Promise<T> | T) => runInTenant(tenant.id, fn);
const DAY = 86400_000;

const submit = (over: Record<string, unknown> = {}, host = t.host) => api(env).post('/api/v1/public/complaints').set('Host', host).send({
  category: 'রাস্তা-ঘাট ও সেতু', upazila: 'চরকান্দি', union: 'কাশবন', place: 'বাজারের সামনে', description: 'বাজারের সামনের রাস্তায় বড় গর্ত হয়েছে, রিকশা উল্টে যাচ্ছে।',
  name: 'আব্দুর রহিম', phone: '01712345678', dob: '1985-03-14', nid: '1990123456', turnstileToken: 'ok', ...over,
});
const idOf = async (trackingId: string, tenant = t) => String((await inT(tenant, () => Complaint.findOne({ trackingId })))!._id);

describe('shape and content', () => {
  it('owner gets every section of the contract on an empty site, with a 30-day zero-filled series', async () => {
    const r = await dash(t.owner);
    expect(r.status).toBe(200);
    const d = r.body;
    expect(new Date(d.generatedAt).getTime()).toBeGreaterThan(0);
    expect(d.posts).toMatchObject({ total: 0, byStatus: {}, last30d: 0, recent: [] });
    expect(d.promises).toMatchObject({ total: 0, byStatus: {}, avgPct: 0, late: [] });
    expect(d.approvals).toEqual({ total: 0, items: [] });
    expect(d.events).toEqual({ upcoming: [] });
    expect(d.complaints).toMatchObject({ total: 0, open: 0, byStatus: {}, slaPct: null, resolvedLast30d: 0, overdue: 0, avgResolutionDays: 0, byCategory: [], byUpazila: [], latest: [] });
    expect(d.complaints.series).toHaveLength(30);
    for (const p of d.complaints.series) { expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(p.received).toBe(0); expect(p.solved).toBe(0); }
    const dates = d.complaints.series.map((p: { date: string }) => p.date);
    expect([...dates].sort()).toEqual(dates); // oldest first
    expect(new Set(dates).size).toBe(30);
    expect(d.content).toMatchObject({ gallery: 0, videos: 0, events: 0, readinessPct: 0 });
    expect(d.content.pages.map((p: { key: string }) => p.key)).toEqual(['layout', 'home', 'profile', 'heroes', 'area', 'contact', 'complaint']);
    expect(d.content.pages.every((p: { ready: boolean; label: string }) => p.ready === false && p.label.length > 0)).toBe(true);
    expect(Array.isArray(d.activity.items)).toBe(true);
  });

  it('counts complaints per day, status, category and upazila, and the latest ones carry no identity', async () => {
    for (let i = 0; i < 3; i++) expect((await submit()).status).toBe(201);
    expect((await submit({ upazila: 'শালবাগান', category: 'পানি ও পয়ঃনিষ্কাশন' })).status).toBe(201);
    const d = (await dash(t.owner)).body.complaints;
    expect(d.total).toBe(4); expect(d.open).toBe(4); expect(d.byStatus).toEqual({ new: 4 });
    const today = d.series[29];
    expect(today.received).toBe(4); expect(today.solved).toBe(0);
    expect(d.series.slice(0, 29).every((p: { received: number }) => p.received === 0)).toBe(true);
    expect(d.byCategory[0]).toEqual({ name: 'রাস্তা-ঘাট ও সেতু', count: 3 });
    expect(d.byUpazila).toEqual([{ name: 'চরকান্দি', count: 3, open: 3 }, { name: 'শালবাগান', count: 1, open: 1 }]);
    expect(d.latest).toHaveLength(4);
    for (const l of d.latest) expect(Object.keys(l).sort()).toEqual(['category', 'createdAt', 'id', 'status', 'trackingId', 'upazila']);
  });

  it('resolved complaints feed slaPct, resolvedLast30d, avgResolutionDays and the solved series; overdue counts open past-SLA ones', async () => {
    const a = (await submit()).body.trackingId, b = (await submit()).body.trackingId, c = (await submit()).body.trackingId;
    await inT(t, async () => {
      const now = Date.now();
      // raw collection updates: createdAt is immutable through Mongoose
      // a: solved in 2 days (within its SLA), b: solved after 13 days (late), c: still open and 3 days past due
      await Complaint.collection.updateOne({ trackingId: a }, { $set: { status: 'solved', createdAt: new Date(now - 4 * DAY), resolvedAt: new Date(now - 2 * DAY), slaDueAt: new Date(now + 3 * DAY) } });
      await Complaint.collection.updateOne({ trackingId: b }, { $set: { status: 'solved', createdAt: new Date(now - 14 * DAY), resolvedAt: new Date(now - 1 * DAY), slaDueAt: new Date(now - 7 * DAY) } });
      await Complaint.collection.updateOne({ trackingId: c }, { $set: { slaDueAt: new Date(now - 3 * DAY) } });
    });
    const d = (await dash(t.owner)).body.complaints;
    expect(d.resolvedLast30d).toBe(2); expect(d.slaPct).toBe(50); expect(d.avgResolutionDays).toBe(7.5); // (2 days + 13 days) / 2
    expect(d.overdue).toBe(1); expect(d.open).toBe(1); expect(d.byStatus).toEqual({ solved: 2, new: 1 });
    expect(d.series.reduce((n: number, p: { solved: number }) => n + p.solved, 0)).toBe(2);
    expect(d.series.reduce((n: number, p: { received: number }) => n + p.received, 0)).toBe(3);
  });

  it('posts, promises, approvals, events and site readiness reflect the data', async () => {
    const mk = (title: string) => api(env).post(admin(t, '/posts')).set(bearer(t.editor)).send({ title, summary: 'এক লাইনের সারাংশ এখানে।', category: 'dev', eventDate: '2026-09-27' });
    const p1 = (await mk('প্রথম পোস্ট এখানে')).body._id, p2 = (await mk('দ্বিতীয় পোস্ট এখানে')).body._id;
    await mk('তৃতীয় খসড়া পোস্ট');
    await api(env).post(admin(t, `/posts/${p1}/submit`)).set(bearer(t.editor));
    await api(env).post(admin(t, `/posts/${p2}/submit`)).set(bearer(t.editor));
    await api(env).post(admin(t, `/posts/${p1}/approve`)).set(bearer(t.owner)).send({});
    await inT(t, async () => {
      await PromiseItem.create({ sector: 'road', name: 'সংযোগ সড়ক', pct: 100, status: 'done' });
      await PromiseItem.create({ sector: 'health', name: 'হাসপাতাল ভবন', pct: 20, status: 'late', delayReason: 'ঠিকাদার বদল' });
      await EventItem.create({ title: 'গণশুনানি', date: new Date(Date.now() + 3 * DAY), place: 'কাশবন', status: 'published' });
      await EventItem.create({ title: 'গত মাসের সভা', date: new Date(Date.now() - 20 * DAY), status: 'published' });
      await EventItem.create({ title: 'খসড়া কর্মসূচি', date: new Date(Date.now() + 5 * DAY), status: 'draft' });
      await GalleryItem.create({ url: 'https://upload.wikimedia.org/a.jpg', status: 'published' });
      await GalleryItem.create({ url: 'https://upload.wikimedia.org/b.jpg', status: 'draft' });
      await VideoItem.create({ title: 'ভিডিও', kind: 'youtube', youtubeId: 'dQw4w9WgXcQ', status: 'published' });
      await PageContent.create({ key: 'home', draft: {}, live: { x: 1 }, status: 'published' });
      await PageContent.create({ key: 'contact', draft: { y: 1 }, live: null });
    });
    const d = (await dash(t.owner)).body;
    expect(d.posts.total).toBe(3); expect(d.posts.byStatus).toEqual({ published: 1, review: 1, draft: 1 }); expect(d.posts.last30d).toBe(3);
    expect(d.posts.recent).toHaveLength(3);
    expect(Object.keys(d.posts.recent[0])).toEqual(expect.arrayContaining(['eventDate', 'id', 'status', 'title', 'updatedAt']));
    expect(d.promises).toMatchObject({ total: 2, byStatus: { done: 1, late: 1 }, avgPct: 60 });
    expect(d.promises.late).toEqual([{ id: expect.any(String), name: 'হাসপাতাল ভবন', pct: 20 }]);
    expect(d.approvals.total).toBe(1);
    expect(d.approvals.items[0]).toMatchObject({ id: p2, title: 'দ্বিতীয় পোস্ট এখানে', authorName: 'সম্পাদক' });
    expect(new Date(d.approvals.items[0].submittedAt).getTime()).toBeGreaterThan(0);
    expect(d.events.upcoming).toEqual([{ id: expect.any(String), title: 'গণশুনানি', date: expect.any(String), place: 'কাশবন' }]);
    expect(d.content).toMatchObject({ gallery: 1, videos: 1, events: 2 });
    const ready = d.content.pages.filter((p: { ready: boolean }) => p.ready).map((p: { key: string }) => p.key);
    expect(ready).toEqual(['home']); // contact has only a draft
    expect(d.content.readinessPct).toBe(Math.round((6 / 12) * 100)); // home + gallery + videos + events + posts + promises, of 7 pages + 5 collections
  });

  it('the activity feed is Bangla text without the audit reason and hides technical actions', async () => {
    await api(env).post(admin(t, '/posts')).set(bearer(t.editor)).send({ title: 'কাশবনে বীজ বিতরণ', summary: 'এক লাইনের সারাংশ এখানে।', category: 'dev', eventDate: '2026-09-27' });
    const a = (await dash(t.owner)).body.activity.items as Array<{ action: string; label: string; actorName: string; at: string }>;
    const hit = a.find((x) => x.action === 'post.create');
    expect(hit).toBeTruthy();
    expect(hit!.label).toContain('কাশবনে বীজ বিতরণ'); expect(hit!.actorName).toBe('সম্পাদক');
    expect(a.every((x) => !/^(auth|domain|tenant)\./.test(x.action))).toBe(true);
    expect(Object.keys(hit!).sort()).toEqual(['action', 'actorName', 'at', 'label']);
  });
});

describe('role filtering (least privilege, BUG-2026-011)', () => {
  it('editor: content, promises, events and readiness; no approvals, no complaints, no activity', async () => {
    const d = (await dash(t.editor)).body;
    for (const k of ['generatedAt', 'posts', 'promises', 'events', 'content']) expect(d).toHaveProperty(k);
    for (const k of ['complaints', 'approvals', 'activity', 'slaPct', 'pendingApprovals']) expect(d, k).not.toHaveProperty(k);
  });
  it('officer: complaints only', async () => {
    const d = (await dash(t.officer)).body;
    expect(Object.keys(d).sort()).toEqual(['complaints', 'generatedAt']);
  });
  it('owner sees every section', async () => {
    const o = (await dash(t.owner)).body;
    for (const k of ['posts', 'promises', 'approvals', 'complaints', 'events', 'content', 'activity']) expect(o).toHaveProperty(k);
  });
  it('the activity feed shows complaint events to a viewer with complaint access', async () => {
    await submit();
    const own = (await dash(t.owner)).body.activity.items as Array<{ action: string }>;
    expect(own.some((x) => x.action === 'complaint.create')).toBe(true);
  });
  it('unauthenticated is 401', async () => {
    expect((await api(env).get(admin(t, '/dashboard'))).status).toBe(401);
  });
});

describe('scoped officer', () => {
  it('sees only their upazila in totals, series, categories, upazilas and latest', async () => {
    for (let i = 0; i < 2; i++) await submit();
    for (let i = 0; i < 3; i++) await submit({ upazila: 'শালবাগান', union: 'বাজার', category: 'পানি ও পয়ঃনিষ্কাশন' });
    const own = (await dash(t.officer)).body.complaints;
    expect(own.total).toBe(2); expect(own.open).toBe(2);
    expect(own.byUpazila).toEqual([{ name: 'চরকান্দি', count: 2, open: 2 }]);
    expect(own.byCategory).toEqual([{ name: 'রাস্তা-ঘাট ও সেতু', count: 2 }]);
    expect(own.series[29].received).toBe(2);
    expect(own.latest.every((l: { upazila: string }) => l.upazila === 'চরকান্দি')).toBe(true);
    const all = (await dash(t.owner)).body.complaints;
    expect(all.total).toBe(5);
  });
  it('an officer with no upazila in scope sees zeros, never everything', async () => {
    await submit();
    await inT(t, async () => { await Membership.updateMany({ role: 'officer' }, { $set: { 'scope.upazilas': [] } }); });
    const c = (await dash(t.officer)).body.complaints;
    expect(c.total).toBe(0); expect(c.latest).toEqual([]);
  });
});

describe('no PII, ever', () => {
  it('names, phones, descriptions and purposes from complaints never appear in any role\'s dashboard', async () => {
    await submit();
    await submit({ name: 'গোপন নাগরিক', phone: '01899999999', dob: '1972-11-30', nid: '19721234567890123' });
    const assigned = await idOf((await submit()).body.trackingId);
    await api(env).patch(admin(t, `/complaints/${assigned}`)).set(bearer(t.owner)).send({ assignedTo: t.officerId });
    await api(env).post(admin(t, `/complaints/${assigned}/pii-view`)).set(bearer(t.officer)).send({ purpose: 'নাগরিকের সাথে যোগাযোগ করতে' });
    for (const tok of [t.owner, t.officer, t.editor]) {
      const txt = JSON.stringify((await dash(tok)).body);
      expect(txt).not.toContain('আব্দুর রহিম');
      expect(txt).not.toMatch(/01\d{9}|\+8801/);
      expect(txt).not.toMatch(/গোপন নাগরিক|1985-03-14|1972-11-30|1990123456|19721234567890123/); // date of birth and NID (adr/0009)
      expect(txt).not.toContain('বাজারের সামনের রাস্তায়'); // description
      expect(txt).not.toContain('নাগরিকের সাথে যোগাযোগ করতে'); // pii-view purpose lives in audit.reason
      expect(txt).not.toMatch(/nameEnc|phoneEnc|dobEnc|nidEnc|phoneHmac/);
    }
  });
});

describe('tenant isolation', () => {
  it('B\'s data never leaks into A\'s dashboard, and A\'s owner cannot read B\'s dashboard', async () => {
    const b = await makeTenant(env, sa, 'sbp1');
    await submit({ category: 'রাস্তা-ঘাট ও সেতু' }, b.host);
    await inT(b, async () => {
      await Post.create({ slug: 'b-post-aaaaaa', title: 'দ্বিতীয় দলের পোস্ট', authorId: b.officerId, status: 'published' });
      await PromiseItem.create({ sector: 'road', name: 'দ্বিতীয় দলের প্রকল্প', pct: 40, status: 'ongoing' });
      await EventItem.create({ title: 'দ্বিতীয় দলের কর্মসূচি', date: new Date(Date.now() + DAY), status: 'published' });
      await GalleryItem.create({ url: 'https://upload.wikimedia.org/z.jpg', status: 'published' });
    });
    const a = (await dash(t.owner)).body;
    expect(a.posts.total).toBe(0); expect(a.promises.total).toBe(0); expect(a.complaints.total).toBe(0); expect(a.content.gallery).toBe(0); expect(a.events.upcoming).toEqual([]);
    expect(JSON.stringify(a)).not.toContain('দ্বিতীয় দল'); expect(JSON.stringify(a)).not.toContain(b.id);
    const bd = (await dash(b.owner, b)).body;
    expect(bd.complaints.total).toBe(1); expect(bd.posts.total).toBe(1);
    expect((await dash(t.owner, b)).status).toBe(404); // not a member of B
  });
});

describe('fillSeries', () => {
  it('produces exactly N consecutive Dhaka days, oldest first, zero-filled', () => {
    const now = Date.UTC(2026, 8, 30, 20, 0); // 20:00 UTC on 30 Sep is already 02:00 on 1 Oct in Dhaka
    const s = fillSeries(3, now, new Map([['2026-10-01', 4]]), new Map([['2026-09-29', 1]]));
    expect(s).toEqual([{ date: '2026-09-29', received: 0, solved: 1 }, { date: '2026-09-30', received: 0, solved: 0 }, { date: '2026-10-01', received: 4, solved: 0 }]);
  });
});
