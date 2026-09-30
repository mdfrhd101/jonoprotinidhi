import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeTenant, api, admin, bearer, type TestEnv, type Tenant } from '../helpers/env.js';
import { Post, PostVersion, AuditLog } from '../../src/models/index.js';
import { runInTenant } from '../../src/context.js';

let env: TestEnv, sa: string, t: Tenant;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  env = makeEnv();
  sa = await makeSuperAdmin(env);
  t = await makeTenant(env, sa, 'ndp3');
});

const good = (over: Record<string, unknown> = {}) => ({
  title: 'চরকান্দিতে সংযোগ সড়কের কাজ শুরু', summary: 'বর্ষায় বিচ্ছিন্ন নয়টি গ্রাম এখন সদরের সঙ্গে যুক্ত।', body: 'প্রথম অনুচ্ছেদ।\n\nদ্বিতীয় অনুচ্ছেদ।',
  category: 'dev', upazila: 'চরকান্দি', place: 'কাশবন', eventDate: '2026-09-27', media: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/x.jpg', caption: 'সড়ক', credit: 'CC BY' }], ...over,
});
const create = (tok: string, body = good()) => api(env).post(admin(t, '/posts')).set(bearer(tok)).send(body);
const act = (tok: string, id: string, what: string, body: object = {}) => api(env).post(admin(t, `/posts/${id}/${what}`)).set(bearer(tok)).send(body);
const pub = (path: string) => api(env).get(`/api/v1/public${path}`).set('Host', t.host);

describe('post workflow: draft -> review -> published (ADR-0005)', () => {
  it('editor drafts and submits; the public sees nothing until the owner approves', async () => {
    const c = await create(t.editor);
    expect(c.status).toBe(201);
    expect(c.body.status).toBe('draft');
    expect(c.body.slug).toMatch(/^[a-z0-9-]+-[a-f0-9]{6}$/);
    expect((await act(t.editor, c.body._id, 'submit')).body.status).toBe('review');
    expect((await pub('/posts')).body.items).toHaveLength(0);
    expect((await act(t.owner, c.body._id, 'approve')).body.status).toBe('published');
    const list = await pub('/posts');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].title).toContain('সংযোগ সড়ক');
    expect((await pub(`/posts/${list.body.items[0].slug}`)).status).toBe(200);
  });

  it('an editor can never approve, reject, schedule or unpublish (403)', async () => {
    const c = (await create(t.editor)).body;
    await act(t.editor, c._id, 'submit');
    for (const a of ['approve', 'reject', 'unpublish', 'restore']) expect((await act(t.editor, c._id, a, { reason: 'কারণ লিখলাম' })).status).toBe(403);
    expect((await act(t.editor, c._id, 'approve', { scheduledAt: '2999-01-01' })).status).toBe(403);
  });

  it('an officer cannot touch posts at all', async () => {
    expect((await create(t.officer)).status).toBe(403);
    expect((await api(env).get(admin(t, '/posts')).set(bearer(t.officer))).status).toBe(403);
  });

  it('reject needs a reason, goes back to the author, and can be re-edited and re-submitted', async () => {
    const c = (await create(t.editor)).body;
    await act(t.editor, c._id, 'submit');
    expect((await act(t.owner, c._id, 'reject', {})).status).toBe(400);
    expect((await act(t.owner, c._id, 'reject', { reason: 'ছবির ক্রেডিট নেই' })).body.status).toBe('rejected');
    const edited = await api(env).patch(admin(t, `/posts/${c._id}`)).set(bearer(t.editor)).send({ title: 'সংশোধিত শিরোনাম এখানে' });
    expect(edited.body.status).toBe('draft');
    expect((await act(t.editor, c._id, 'submit')).body.status).toBe('review');
  });

  it('incomplete posts cannot be submitted or approved (422)', async () => {
    const c = (await api(env).post(admin(t, '/posts')).set(bearer(t.editor)).send({ title: 'শুধু শিরোনাম আছে এখানে' })).body;
    const r = await act(t.editor, c._id, 'submit');
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('INCOMPLETE');
    expect((await act(t.owner, c._id, 'approve')).status).toBe(422);
  });

  it('owner can publish a draft directly, and schedule for later', async () => {
    const a = (await create(t.owner)).body;
    expect((await act(t.owner, a._id, 'approve')).body.status).toBe('published');
    const b = (await create(t.owner, good({ title: 'পরে প্রকাশের জন্য রাখা পোস্ট' }))).body;
    const s = await act(t.owner, b._id, 'approve', { scheduledAt: new Date(env.clock.now + 3600_000).toISOString() });
    expect(s.body.status).toBe('scheduled');
    expect((await pub('/posts')).body.items).toHaveLength(1); // the scheduled one is still hidden
  });

  it('illegal transitions are refused (approve a published post, submit an archived one)', async () => {
    const c = (await create(t.owner)).body;
    await act(t.owner, c._id, 'approve');
    expect((await act(t.owner, c._id, 'approve')).status).toBe(422);
    await act(t.owner, c._id, 'unpublish');
    expect((await act(t.owner, c._id, 'submit')).status).toBe(422);
  });
});

describe('live copy vs working copy', () => {
  it('editing a published post moves it to review but the public keeps the approved text', async () => {
    const c = (await create(t.owner)).body;
    await act(t.owner, c._id, 'approve');
    const ed = await api(env).patch(admin(t, `/posts/${c._id}`)).set(bearer(t.owner)).send({ title: 'সম্পূর্ণ নতুন শিরোনাম বদলানো', version: 2 });
    expect(ed.body.status).toBe('review');
    const slug = (await pub('/posts')).body.items[0].slug;
    expect((await pub(`/posts/${slug}`)).body.title).toContain('সংযোগ সড়ক'); // still the approved version
    await act(t.owner, c._id, 'approve');
    expect((await pub(`/posts/${slug}`)).body.title).toBe('সম্পূর্ণ নতুন শিরোনাম বদলানো');
  });

  it('a rejected edit of a live post does not take the live page down', async () => {
    const c = (await create(t.owner)).body;
    await act(t.owner, c._id, 'approve');
    await api(env).patch(admin(t, `/posts/${c._id}`)).set(bearer(t.owner)).send({ title: 'প্রস্তাবিত পরিবর্তন শিরোনাম', version: 2 });
    await act(t.owner, c._id, 'reject', { reason: 'ভুল তথ্য আছে' });
    expect((await pub('/posts')).body.items).toHaveLength(1);
  });

  it('unpublish hides it from every public route; restore + approve brings it back', async () => {
    const c = (await create(t.owner)).body;
    await act(t.owner, c._id, 'approve');
    const slug = (await pub('/posts')).body.items[0].slug;
    await act(t.owner, c._id, 'unpublish');
    expect((await pub('/posts')).body.items).toHaveLength(0);
    expect((await pub(`/posts/${slug}`)).status).toBe(404);
    expect((await act(t.owner, c._id, 'restore')).body.status).toBe('review');
    await act(t.owner, c._id, 'approve');
    expect((await pub(`/posts/${slug}`)).status).toBe(200);
  });

  it('public list never leaks working-copy or workflow fields', async () => {
    const c = (await create(t.owner)).body;
    await act(t.owner, c._id, 'approve');
    const item = (await pub('/posts')).body.items[0];
    for (const k of ['authorId', 'approvedBy', 'status', 'version', 'rejectReason', '_id', 'tenantId', 'isDeleted', 'live']) expect(item).not.toHaveProperty(k);
  });
});

describe('concurrency, ownership, deletion', () => {
  it('stale version updates get 409 instead of overwriting (BUG-2026-004: partial PATCH must not require a title)', async () => {
    const c = (await create(t.owner)).body;
    const ok = await api(env).patch(admin(t, `/posts/${c._id}`)).set(bearer(t.owner)).send({ title: 'প্রথম পরিবর্তন করা শিরোনাম', version: 1 });
    expect(ok.status).toBe(200);
    const stale = await api(env).patch(admin(t, `/posts/${c._id}`)).set(bearer(t.owner)).send({ title: 'পুরনো সংস্করণ থেকে পরিবর্তন', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('approving a version the owner did not see is refused (no approve-what-you-did-not-read)', async () => {
    const c = (await create(t.editor)).body;
    await act(t.editor, c._id, 'submit'); // version 2 in review
    await api(env).patch(admin(t, `/posts/${c._id}`)).set(bearer(t.editor)).send({ summary: 'সম্পাদক চুপচাপ সারাংশ বদলে দিল' }); // version 3
    const r = await act(t.owner, c._id, 'approve', { version: 2 });
    expect(r.status).toBe(409);
  });

  it('an editor can only edit their own posts', async () => {
    const c = (await create(t.owner)).body;
    const r = await api(env).patch(admin(t, `/posts/${c._id}`)).set(bearer(t.editor)).send({ title: 'অন্যের পোস্ট বদলানোর চেষ্টা' });
    expect(r.status).toBe(403);
  });

  it('only drafts/rejected posts can be deleted (soft); published must be unpublished first', async () => {
    const d = (await create(t.owner)).body;
    expect((await api(env).delete(admin(t, `/posts/${d._id}`)).set(bearer(t.owner))).status).toBe(204);
    expect((await api(env).get(admin(t, `/posts/${d._id}`)).set(bearer(t.owner))).status).toBe(404);
    const raw = await runInTenant(t.id, () => Post.findById(d._id).setOptions({ withDeleted: true }).lean());
    expect((raw as { isDeleted?: boolean } | null)?.isDeleted).toBe(true); // kept for history
    const p = (await create(t.owner)).body;
    await act(t.owner, p._id, 'approve');
    expect((await api(env).delete(admin(t, `/posts/${p._id}`)).set(bearer(t.owner))).status).toBe(422);
    expect((await api(env).delete(admin(t, `/posts/${p._id}`)).set(bearer(t.editor))).status).toBe(403);
  });
});

describe('validation and safety', () => {
  it('rejects bad input: short title, bad category, unknown keys, bad date', async () => {
    for (const body of [good({ title: 'ক' }), good({ category: 'sports' }), { ...good(), status: 'published' }, { ...good(), authorId: '1' }, good({ eventDate: 'nope' })]) {
      expect((await create(t.owner, body as never)).status).toBe(400);
    }
  });

  it('media must be https on an allow-listed host (no javascript:, no random hosts)', async () => {
    for (const url of ['javascript:alert(1)', 'http://upload.wikimedia.org/a.jpg', 'https://evil.example/a.jpg']) {
      expect((await create(t.owner, good({ media: [{ url }] }))).status).toBeGreaterThanOrEqual(400);
    }
    expect((await create(t.owner, good({ media: [{ url: 'https://cdn.jonoshetu.test/a.webp' }] }))).status).toBe(201);
  });

  it('stores markup as inert text; nothing is interpreted server-side', async () => {
    const r = await create(t.owner, good({ title: '<script>alert(1)</script> শিরোনাম', body: '<img src=x onerror=alert(1)>' }));
    expect(r.status).toBe(201);
    await act(t.owner, r.body._id, 'approve');
    const item = (await pub('/posts')).body.items[0];
    expect(item.title).toBe('<script>alert(1)</script> শিরোনাম'); // returned as data; the front end renders it as text
    expect((await pub('/posts')).headers['content-type']).toContain('application/json');
  });

  it('accepts long percent-encoded (Bangla file name) media URLs (BUG-2026-008)', async () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/5/58/' + encodeURIComponent('ব্রহ্মপুত্রনদীর_সুন্দর_একটি_দৃশ্য_ভোরবেলা_নৌকা_সহ.jpg');
    expect(url.length).toBeGreaterThan(200);
    expect((await create(t.owner, good({ media: [{ url }] }))).status).toBe(201);
  });

  it('control characters are rejected', async () => {
    expect((await create(t.owner, good({ title: 'শিরোনাম\u0000 আছে এখানে' }))).status).toBe(400);
  });

  it('the list supports opt-in pagination and title search with regex characters escaped', async () => {
    for (let i = 0; i < 3; i++) await create(t.owner, good({ title: `পরীক্ষামূলক পোস্ট নম্বর ${i + 1}` }));
    await create(t.owner, good({ title: 'বিশেষ (কাজ) [চিহ্ন] সহ পোস্ট' }));
    const all = await api(env).get(admin(t, '/posts')).set(bearer(t.owner));
    expect(all.body.items).toHaveLength(4);
    expect(all.body.page).toBeUndefined(); // no ?page => unchanged full list
    const paged = await api(env).get(admin(t, '/posts?page=2&limit=3')).set(bearer(t.owner));
    expect(paged.body).toMatchObject({ page: 2, limit: 3, total: 4, totalPages: 2 });
    expect(paged.body.items).toHaveLength(1);
    const q = await api(env).get(admin(t, '/posts?q=' + encodeURIComponent('(কাজ) [চিহ্ন]'))).set(bearer(t.owner));
    expect(q.body.items).toHaveLength(1);
    expect((await api(env).get(admin(t, '/posts?q=' + encodeURIComponent('.*'))).set(bearer(t.owner))).body.items).toHaveLength(0); // literal, not a wildcard
  });

  it('public filters by category, upazila and month', async () => {
    const mk = async (over: Record<string, unknown>) => { const c = (await create(t.owner, good(over))).body; await act(t.owner, c._id, 'approve'); };
    await mk({ category: 'health', upazila: 'শালবাগান', eventDate: '2026-08-10', title: 'চক্ষু শিবির অনুষ্ঠিত হয়েছে আজ' });
    await mk({ category: 'edu', upazila: 'চরকান্দি', eventDate: '2026-09-12', title: 'বিদ্যালয়ে বিজ্ঞানাগার হস্তান্তর' });
    expect((await pub('/posts?category=health')).body.total).toBe(1);
    expect((await pub('/posts?upazila=' + encodeURIComponent('চরকান্দি'))).body.total).toBe(1);
    expect((await pub('/posts?month=2026-08')).body.total).toBe(1);
    expect((await pub('/posts?month=bad')).body.total).toBe(2); // invalid month is ignored, not an error
  });
});

describe('versions and audit trail', () => {
  it('records every step with who did it, and old versions can be restored into the working copy', async () => {
    const c = (await create(t.editor)).body;
    await api(env).patch(admin(t, `/posts/${c._id}`)).set(bearer(t.editor)).send({ title: 'দ্বিতীয় সংস্করণের শিরোনাম' });
    await act(t.editor, c._id, 'submit');
    await act(t.owner, c._id, 'approve');
    const v = await api(env).get(admin(t, `/posts/${c._id}/versions`)).set(bearer(t.owner));
    expect(v.body.map((x: { action: string }) => x.action)).toEqual(['approve', 'submit', 'edit', 'create']);
    expect(v.body[3].by.name).toBe('সম্পাদক');
    const restored = await api(env).post(admin(t, `/posts/${c._id}/versions/1/restore`)).set(bearer(t.owner));
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe('review'); // published -> needs approval again
    expect(restored.body.title).toContain('সংযোগ সড়ক');
    expect((await api(env).post(admin(t, `/posts/${c._id}/versions/1/restore`)).set(bearer(t.editor))).status).toBe(403);
  });

  it('writes an audit row for each action, with the actor, and a before/after diff for edits', async () => {
    const c = (await create(t.editor)).body;
    await api(env).patch(admin(t, `/posts/${c._id}`)).set(bearer(t.editor)).send({ title: 'অডিটের জন্য বদলানো শিরোনাম' });
    await act(t.editor, c._id, 'submit');
    await act(t.owner, c._id, 'approve');
    const rows = await AuditLog.find({ tenantId: t.id }).sort({ at: 1 }).lean();
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['post.create', 'post.edit', 'post.submit', 'post.approve']));
    const edit = rows.find((r) => r.action === 'post.edit')!;
    expect((edit.diff!.before as { title: string }).title).toContain('সংযোগ সড়ক');
    expect((edit.diff!.after as { title: string }).title).toBe('অডিটের জন্য বদলানো শিরোনাম');
    expect(edit.actor?.name).toBe('সম্পাদক');
    expect(edit.actor?.viaSuperAdmin).toBe(false);
    const ownerAudit = await api(env).get(admin(t, '/audit')).set(bearer(t.owner));
    expect(ownerAudit.status).toBe(200);
    expect((await api(env).get(admin(t, '/audit')).set(bearer(t.editor))).status).toBe(403);
  });
});

describe('scheduled publishing job', () => {
  it('publishes due posts across tenants, each inside its own tenant context, and leaves future ones alone', async () => {
    const t2 = await makeTenant(env, sa, 'sbp1');
    const mk = async (tn: Tenant, title: string, at: number) => { const c = (await api(env).post(admin(tn, '/posts')).set(bearer(tn.owner)).send(good({ title }))).body; await api(env).post(admin(tn, `/posts/${c._id}/approve`)).set(bearer(tn.owner)).send({ scheduledAt: new Date(at).toISOString() }); return c._id as string; };
    const a = await mk(t, 'প্রথম টেন্যান্টের নির্ধারিত পোস্ট', env.clock.now + 60_000);
    await mk(t, 'প্রথম টেন্যান্টের ভবিষ্যৎ পোস্ট', env.clock.now + 999_999_000);
    await mk(t2, 'দ্বিতীয় টেন্যান্টের নির্ধারিত পোস্ট', env.clock.now + 60_000);
    expect(await env.services.posts.publishDue()).toBe(0); // nothing due yet
    env.clock.now += 120_000;
    expect(await env.services.posts.publishDue()).toBe(2);
    expect((await api(env).get(admin(t, `/posts/${a}`)).set(bearer(t.owner))).body.status).toBe('published');
    expect((await pub('/posts')).body.items).toHaveLength(1);
    expect((await api(env).get('/api/v1/public/posts').set('Host', t2.host)).body.items).toHaveLength(1);
    expect(await env.services.posts.publishDue()).toBe(0); // idempotent
    const last = await runInTenant(t.id, () => PostVersion.findOne({ postId: a }).sort({ version: -1 }).lean());
    expect(last?.action).toBe('publish');
  });
});
