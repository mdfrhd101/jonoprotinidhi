import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import sharp from 'sharp';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeTenant, api, admin, bearer, type TestEnv, type Tenant } from '../helpers/env.js';
import { Post, MediaAsset } from '../../src/models/index.js';
import { runInTenant } from '../../src/context.js';
import type { MemoryMediaStorage } from '../../src/lib/media.js';

let env: TestEnv, sa: string, t: Tenant, t2: Tenant;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  env = makeEnv();
  sa = await makeSuperAdmin(env);
  t = await makeTenant(env, sa, 'ndp3');
  t2 = await makeTenant(env, sa, 'other1');
});

const png = (w = 40, h = 30) => sharp({ create: { width: w, height: h, channels: 3, background: '#b08d57' } }).png().toBuffer();
const upload = (tt: Tenant, tok: string, buf: Buffer | string, type = 'image/png', qs = '') =>
  api(env).post(admin(tt, `/media${qs}`)).set(bearer(tok)).set('Content-Type', type).send(buf);
const store = () => env.deps.media as MemoryMediaStorage;
const good = (media: unknown[] = [], over: Record<string, unknown> = {}) => ({
  title: 'চরকান্দিতে সংযোগ সড়কের কাজ শুরু', summary: 'বর্ষায় বিচ্ছিন্ন নয়টি গ্রাম এখন সারা বছর যোগাযোগে থাকবে।', category: 'dev', eventDate: '2026-09-27', media, ...over,
});
const mkPost = (tt: Tenant, tok: string, body: object) => api(env).post(admin(tt, '/posts')).set(bearer(tok)).send(body);

describe('image upload pipeline', () => {
  it('a real PNG is decoded, re-encoded to WebP and stored under <tenant>/<id>.webp', async () => {
    const r = await upload(t, t.editor, await png(), 'image/png', '?name=field.png&credit=Photo%20Office');
    expect(r.status).toBe(201);
    expect(r.body.url).toBe(`http://127.0.0.1:4000/api/v1/public/media/${t.id}/${r.body.id}.webp`);
    expect(r.body).toMatchObject({ width: 40, height: 30, credit: 'Photo Office', name: 'field.png' });
    const bytes = store().files.get(`${t.id}/${r.body.id}.webp`)!;
    expect((await sharp(bytes).metadata()).format).toBe('webp');
  });

  it('EXIF metadata (GPS, camera, copyright) never reaches the stored file', async () => {
    const jpg = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#123456' } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'Secret Owner', Artist: 'Someone' } } }).toBuffer();
    expect((await sharp(jpg).metadata()).exif).toBeTruthy(); // the input really has EXIF
    const r = await upload(t, t.editor, jpg, 'image/jpeg');
    expect(r.status).toBe(201);
    const out = await sharp(store().files.get(`${t.id}/${r.body.id}.webp`)!).metadata();
    expect(out.exif).toBeUndefined();
    expect(store().files.get(`${t.id}/${r.body.id}.webp`)!.includes(Buffer.from('Secret Owner'))).toBe(false);
  });

  it('large images are scaled down to 2400 px on the longest edge', async () => {
    const r = await upload(t, t.editor, await png(3000, 1000));
    expect(r.body.width).toBe(2400);
    expect(r.body.height).toBe(800);
  });

  it('refuses non-images even with an image content type, SVG, GIF, empty and wrong types', async () => {
    expect((await upload(t, t.editor, '<?php echo 1; ?>', 'image/png')).status).toBe(422);
    expect((await upload(t, t.editor, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml')).status).toBe(422);
    const gif = await sharp({ create: { width: 5, height: 5, channels: 3, background: '#fff' } }).gif().toBuffer();
    expect((await upload(t, t.editor, gif, 'image/gif')).status).toBe(422);
    expect((await upload(t, t.editor, Buffer.alloc(0), 'image/png')).status).toBe(422);
    expect((await upload(t, t.editor, 'hello', 'text/plain')).status).toBe(422);
    expect(store().files.size).toBe(0);
    expect(await runInTenant(t.id, () => MediaAsset.countDocuments({}))).toBe(0);
  });

  it('refuses files above the size limit', async () => {
    env = makeEnv({ MAX_UPLOAD_MB: '1' });
    await clearDb(); sa = await makeSuperAdmin(env); t = await makeTenant(env, sa, 'ndp3');
    const big = Buffer.concat([await png(), Buffer.alloc(1.2 * 1024 * 1024)]);
    const r = await upload(t, t.editor, big);
    expect([413, 422]).toContain(r.status);
  });

  it('officers cannot upload (403) and anonymous cannot (401)', async () => {
    expect((await upload(t, t.officer, await png())).status).toBe(403);
    expect((await api(env).post(admin(t, '/media')).set('Content-Type', 'image/png').send(await png())).status).toBe(401);
  });

  it('a tenant cannot upload into or list another tenant', async () => {
    expect((await upload(t2, t.editor, await png())).status).toBe(404);
    expect((await api(env).get(admin(t2, '/media')).set(bearer(t.owner))).status).toBe(404);
  });

  it('lists only the tenant\'s own images, newest first, paged', async () => {
    const a = await upload(t, t.editor, await png(10, 10)); await upload(t2, t2.editor, await png(11, 11));
    const b = await upload(t, t.editor, await png(12, 12));
    const l = await api(env).get(admin(t, '/media?limit=10')).set(bearer(t.editor));
    expect(l.status).toBe(200);
    expect(l.body.total).toBe(2);
    expect(l.body.items.map((i: { id: string }) => i.id)).toEqual([b.body.id, a.body.id]);
  });
});

describe('serving uploaded images (public)', () => {
  it('anyone can fetch an image; it is always image/webp, nosniff, cross-origin allowed and long-cached', async () => {
    const r = await upload(t, t.editor, await png());
    const g = await api(env).get(`/api/v1/public/media/${t.id}/${r.body.id}.webp`);
    expect(g.status).toBe(200);
    expect(g.headers['content-type']).toBe('image/webp');
    expect(g.headers['x-content-type-options']).toBe('nosniff');
    expect(g.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(g.headers['cache-control']).toMatch(/immutable/);
  });

  it('an image id under another tenant\'s path is 404 (no cross-tenant read), as are bad ids and traversal', async () => {
    const r = await upload(t, t.editor, await png());
    expect((await api(env).get(`/api/v1/public/media/${t2.id}/${r.body.id}.webp`)).status).toBe(404);
    expect((await api(env).get(`/api/v1/public/media/${t.id}/${'0'.repeat(24)}.webp`)).status).toBe(404);
    expect((await api(env).get(`/api/v1/public/media/${t.id}/..%2F..%2Fx.webp`)).status).toBe(404);
    expect((await api(env).get(`/api/v1/public/media/${t.id}/${r.body.id}.png`)).status).toBe(404);
  });

  it('a suspended tenant\'s images are not served', async () => {
    const r = await upload(t, t.editor, await png());
    const s = await api(env).post(`/api/v1/super/tenants/${t.id}/status`).set(bearer(sa)).send({ to: 'suspended', reason: 'পরীক্ষার জন্য স্থগিত' });
    expect(s.status).toBeLessThan(300);
    expect((await api(env).get(`/api/v1/public/media/${t.id}/${r.body.id}.webp`)).status).toBe(404);
  });
});

describe('using uploads in posts', () => {
  it('a post accepts its own tenant\'s upload URL; another tenant\'s upload URL and unknown hosts are refused', async () => {
    const mine = await upload(t, t.editor, await png());
    const theirs = await upload(t2, t2.editor, await png());
    expect((await mkPost(t, t.editor, good([{ url: mine.body.url, caption: 'ক', credit: 'খ' }]))).status).toBe(201);
    const bad = await mkPost(t, t.editor, good([{ url: theirs.body.url }]));
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('MEDIA_HOST_NOT_ALLOWED');
    expect((await mkPost(t, t.editor, good([{ url: 'https://evil.example/x.jpg' }]))).status).toBe(422);
    // a look-alike path on our own host that is not a real asset name
    expect((await mkPost(t, t.editor, good([{ url: `http://127.0.0.1:4000/api/v1/public/media/${t.id}/../${t2.id}/x.webp` }]))).status).toBe(422);
  });

  it('an image used by a post cannot be deleted; an unused one can (file and row are removed)', async () => {
    const used = await upload(t, t.editor, await png()), free = await upload(t, t.editor, await png());
    await mkPost(t, t.editor, good([{ url: used.body.url }]));
    const del = (id: string, tok = t.owner) => api(env).delete(admin(t, `/media/${id}`)).set(bearer(tok));
    const r1 = await del(used.body.id);
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe('MEDIA_IN_USE');
    expect((await del(free.body.id)).status).toBe(204);
    expect(store().files.has(`${t.id}/${free.body.id}.webp`)).toBe(false);
    expect((await api(env).get(`/api/v1/public/media/${t.id}/${free.body.id}.webp`)).status).toBe(404);
    expect((await del(free.body.id)).status).toBe(404);
  });

  it('another tenant cannot delete my image (404, file untouched)', async () => {
    const mine = await upload(t, t.editor, await png());
    expect((await api(env).delete(admin(t2, `/media/${mine.body.id}`)).set(bearer(t2.owner))).status).toBe(404);
    expect(store().files.has(`${t.id}/${mine.body.id}.webp`)).toBe(true);
  });

  it('uploads and deletions are audited', async () => {
    const r = await upload(t, t.editor, await png());
    await api(env).delete(admin(t, `/media/${r.body.id}`)).set(bearer(t.owner));
    const log = await api(env).get(admin(t, '/audit?limit=50')).set(bearer(t.owner));
    const actions = (log.body.items as Array<{ action: string }>).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['media.upload', 'media.delete']));
  });
});

describe('rich text bodies are sanitised on the server', () => {
  const body = async (html: string) => {
    const r = await mkPost(t, t.editor, good([], { body: html }));
    expect(r.status).toBe(201);
    return r.body.body as string;
  };
  it('keeps formatting, drops scripts, handlers, iframes, styles and javascript: links', async () => {
    const out = await body('<h2>শিরোনাম</h2><p onclick="x()">লেখা <strong>মোটা</strong> <em>বাঁকা</em> <script>alert(1)</script><iframe src="https://evil.example"></iframe><img src=x onerror=alert(1)></p><p style="color:red"><a href="javascript:alert(1)">খারাপ</a> <a href="https://example.org/ok">ভালো</a></p><ul><li>এক</li></ul>');
    expect(out).toContain('<h2>শিরোনাম</h2>');
    expect(out).toContain('<strong>মোটা</strong>');
    expect(out).toContain('<li>এক</li>');
    expect(out).toContain('href="https://example.org/ok"');
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
    expect(out).not.toMatch(/script|iframe|onclick|onerror|style=|javascript:|<img/i);
  });
  it('plain text from before the editor existed becomes paragraphs (and is escaped)', async () => {
    const out = await body('প্রথম অনুচ্ছেদ ৩ < ৫\n\nদ্বিতীয় অনুচ্ছেদ\nনতুন লাইন');
    expect(out).toBe('<p>প্রথম অনুচ্ছেদ ৩ &lt; ৫</p><p>দ্বিতীয় অনুচ্ছেদ<br />নতুন লাইন</p>');
  });
  it('the length limit counts visible text, not markup', async () => {
    const ok = '<p>' + 'ক'.repeat(7900) + '</p>';
    expect((await mkPost(t, t.editor, good([], { body: ok }))).status).toBe(201);
    const tooLong = '<p>' + 'ক'.repeat(8100) + '</p>';
    expect((await mkPost(t, t.editor, good([], { body: tooLong }))).status).toBe(400);
    const markupHeavy = '<p><strong><em>' + 'ক'.repeat(100) + '</em></strong></p>'.repeat(1);
    expect((await mkPost(t, t.editor, good([], { body: markupHeavy }))).status).toBe(201);
  });
  it('PATCH sanitises too, and the public site only ever sees sanitised HTML after approval', async () => {
    const c = await mkPost(t, t.editor, good([], { body: '<p>ঠিক</p>' }));
    const p = await api(env).patch(admin(t, `/posts/${c.body._id}`)).set(bearer(t.editor)).send({ body: '<p>নতুন</p><script>steal()</script>', version: c.body.version });
    expect(p.status).toBe(200);
    expect(p.body.body).toBe('<p>নতুন</p>');
    await api(env).post(admin(t, `/posts/${c.body._id}/submit`)).set(bearer(t.editor));
    await api(env).post(admin(t, `/posts/${c.body._id}/approve`)).set(bearer(t.owner)).send({});
    const list = await api(env).get('/api/v1/public/posts').set('Host', t.host);
    const slug = list.body.items[0].slug;
    const one = await api(env).get(`/api/v1/public/posts/${slug}`).set('Host', t.host);
    expect(one.body.body).toBe('<p>নতুন</p>');
    const raw = await runInTenant(t.id, () => Post.findById(c.body._id).lean());
    expect(JSON.stringify(raw)).not.toMatch(/script/);
  });
});
