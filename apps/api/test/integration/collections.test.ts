import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import sharp from 'sharp';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeTenant, api, admin, bearer, type TestEnv, type Tenant } from '../helpers/env.js';
import { parseYouTubeId } from '@jonoshetu/shared';
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

const day = 86400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);
const post = (tt: Tenant, tok: string, path: string, body: object = {}, qs = '') => api(env).post(admin(tt, `${path}${qs}`)).set(bearer(tok)).send(body);
const patch = (tt: Tenant, tok: string, path: string, body: object, qs = '') => api(env).patch(admin(tt, `${path}${qs}`)).set(bearer(tok)).send(body);
const list = (tt: Tenant, tok: string, path: string) => api(env).get(admin(tt, path)).set(bearer(tok));
const del = (tt: Tenant, tok: string, path: string) => api(env).delete(admin(tt, path)).set(bearer(tok));
const pub = (tt: Tenant, path: string) => api(env).get(`/api/v1/public${path}`).set('Host', tt.host);
const png = () => sharp({ create: { width: 30, height: 20, channels: 3, background: '#2f5d50' } }).png().toBuffer();
const upImage = async (tt: Tenant, tok: string) => (await api(env).post(admin(tt, '/media')).set(bearer(tok)).set('Content-Type', 'image/png').send(await png())).body as { id: string; url: string };

describe('events', () => {
  const ev = (over: object = {}) => ({ title: 'গণশুনানি', date: iso(3), time: 'সকাল ১০টা', place: 'চরকান্দি ইউনিয়ন পরিষদ মাঠ', note: 'সরাসরি সমস্যা জানান', ...over });

  it('editor creates a draft; the public sees only PUBLISHED, UPCOMING events, soonest first', async () => {
    const a = await post(t, t.editor, '/events', ev({ title: 'পরের সপ্তাহের সভা', date: iso(9) }));
    const b = await post(t, t.editor, '/events', ev({ title: 'আগামী পরশু', date: iso(2) }));
    const past = await post(t, t.editor, '/events', ev({ title: 'গত সপ্তাহের অনুষ্ঠান', date: iso(-7) }));
    expect([a.status, a.body.status]).toEqual([201, 'draft']);
    expect((await pub(t, '/events')).body.items).toEqual([]);
    for (const e of [a, b, past]) expect((await post(t, t.editor, `/events/${e.body.id}/publish`)).status).toBe(403);
    for (const e of [a, b, past]) expect((await post(t, t.owner, `/events/${e.body.id}/publish`)).body.status).toBe('published');
    const titles = (await pub(t, '/events')).body.items.map((i: { title: string }) => i.title);
    expect(titles).toEqual(['আগামী পরশু', 'পরের সপ্তাহের সভা']);
    expect(JSON.stringify((await pub(t, '/events')).body)).not.toMatch(/"status"|createdBy|tenantId/);
  });

  it('owner can create-and-publish in one call; an editor cannot smuggle publish=1', async () => {
    expect((await post(t, t.owner, '/events', ev(), '?publish=1')).body.status).toBe('published');
    expect((await post(t, t.editor, '/events', ev(), '?publish=1')).body.status).toBe('draft');
  });

  it('an editor changing a published event sends it back to draft; only the owner can delete it', async () => {
    const e = await post(t, t.owner, '/events', ev(), '?publish=1');
    const changed = await patch(t, t.editor, `/events/${e.body.id}`, { place: 'নতুন স্থান' });
    expect(changed.body).toMatchObject({ place: 'নতুন স্থান', status: 'draft' });
    expect((await pub(t, '/events')).body.items).toEqual([]);
    await post(t, t.owner, `/events/${e.body.id}/publish`);
    expect((await del(t, t.editor, `/events/${e.body.id}`)).status).toBe(403);
    expect((await patch(t, t.owner, `/events/${e.body.id}`, { note: 'মালিকের সংশোধন' })).body.status).toBe('published'); // owner edits stay live
    expect((await del(t, t.owner, `/events/${e.body.id}`)).status).toBe(204);
    expect((await list(t, t.owner, `/events/${e.body.id}`)).status).toBe(404);
  });

  it('validates input, filters and paginates the admin list, and counts by status', async () => {
    expect((await post(t, t.owner, '/events', { title: 'ab', date: iso(1) })).status).toBe(400);
    expect((await post(t, t.owner, '/events', { ...ev(), evil: 1 })).status).toBe(400);
    expect((await post(t, t.owner, '/events', { ...ev(), date: 'not-a-date' })).status).toBe(400);
    await post(t, t.owner, '/events', ev({ title: 'চক্ষু শিবির' }), '?publish=1');
    await post(t, t.owner, '/events', ev({ title: 'বিজ্ঞান মেলা' }));
    const all = await list(t, t.owner, '/events?limit=1&page=2');
    expect(all.body).toMatchObject({ total: 2, page: 2, totalPages: 2, counts: { draft: 1, published: 1 } });
    expect((await list(t, t.owner, '/events?q=শিবির')).body.items).toHaveLength(1);
    expect((await list(t, t.owner, '/events?status=draft')).body.items[0].title).toBe('বিজ্ঞান মেলা');
  });

  it('tenants are isolated (admin, public, foreign ids)', async () => {
    const e = await post(t, t.owner, '/events', ev(), '?publish=1');
    expect((await pub(t2, '/events')).body.items).toEqual([]);
    expect((await list(t2, t2.owner, `/events/${e.body.id}`)).status).toBe(404);
    expect((await patch(t2, t2.owner, `/events/${e.body.id}`, { title: 'হ্যাক করা নাম' })).status).toBe(404);
    expect((await del(t2, t2.owner, `/events/${e.body.id}`)).status).toBe(404);
    expect((await list(t, t.officer, '/events')).status).toBe(403);
  });
});

describe('gallery', () => {
  it('accepts own uploads and allow-listed hosts only; the public sees published photos in order', async () => {
    const mine = await upImage(t, t.editor), theirs = await upImage(t2, t2.editor);
    const ok = await post(t, t.editor, '/gallery', { url: mine.url, caption: 'সড়ক উদ্বোধন', credit: 'অফিস', album: 'উন্নয়ন' });
    expect(ok.status).toBe(201);
    const wiki = await post(t, t.owner, '/gallery', { url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/x.jpg', caption: 'নদী', album: 'এলাকা' }, '?publish=1');
    expect(wiki.status).toBe(201);
    const bad = await post(t, t.editor, '/gallery', { url: theirs.url });
    expect(bad.status).toBe(422);
    expect((await post(t, t.editor, '/gallery', { url: 'https://evil.example/x.jpg' })).status).toBe(422);
    expect((await pub(t, '/gallery')).body.items).toHaveLength(1); // draft hidden
    await post(t, t.owner, `/gallery/${ok.body.id}/publish`);
    const g = await pub(t, '/gallery');
    expect(g.body.total).toBe(2);
    expect(g.body.items[0]).toMatchObject({ caption: expect.any(String), credit: expect.any(String), album: expect.any(String) });
    expect(JSON.stringify(g.body)).not.toMatch(/"status"|createdBy|tenantId/);
  });

  it('reorder sets the display order, ignores foreign ids and rejects bad input', async () => {
    const ids: string[] = [];
    for (const c of ['এক', 'দুই', 'তিন']) ids.push((await post(t, t.owner, '/gallery', { url: 'https://upload.wikimedia.org/a.jpg', caption: c }, '?publish=1')).body.id);
    const foreign = (await post(t2, t2.owner, '/gallery', { url: 'https://upload.wikimedia.org/b.jpg', caption: 'অন্য' }, '?publish=1')).body.id;
    const r = await post(t, t.editor, '/gallery/reorder', { ids: [ids[2]!, foreign, ids[0]!, ids[1]!] });
    expect(r.status).toBe(204);
    expect((await pub(t, '/gallery')).body.items.map((i: { caption: string }) => i.caption)).toEqual(['তিন', 'এক', 'দুই']);
    expect((await pub(t2, '/gallery')).body.items[0].caption).toBe('অন্য'); // t2's row untouched (order still 0)
    expect((await post(t, t.editor, '/gallery/reorder', { ids: ['zzz'] })).status).toBe(400);
    expect((await post(t, t.editor, '/gallery/reorder', { ids: 'nope' })).status).toBe(400);
  });

  it('albums are listed with counts; album and featured filters work', async () => {
    for (const [c, a, f] of [['১', 'উন্নয়ন', true], ['২', 'উন্নয়ন', false], ['৩', 'স্বাস্থ্য', false]] as const) await post(t, t.owner, '/gallery', { url: 'https://upload.wikimedia.org/a.jpg', caption: c, album: a, featured: f }, '?publish=1');
    await post(t, t.owner, '/gallery', { url: 'https://upload.wikimedia.org/a.jpg', caption: 'খসড়া', album: 'গোপন' });
    expect((await pub(t, '/gallery/albums')).body.items).toEqual([{ name: 'উন্নয়ন', count: 2 }, { name: 'স্বাস্থ্য', count: 1 }]);
    expect((await pub(t, `/gallery?album=${encodeURIComponent('উন্নয়ন')}`)).body.total).toBe(2);
    expect((await pub(t, '/gallery?featured=1')).body.items.map((i: { caption: string }) => i.caption)).toEqual(['১']);
  });

  it('an image used in the gallery cannot be deleted from the media library', async () => {
    const m = await upImage(t, t.owner);
    await post(t, t.owner, '/gallery', { url: m.url, caption: 'ব্যবহৃত' });
    expect((await del(t, t.owner, `/media/${m.id}`)).status).toBe(409);
  });
});

describe('videos', () => {
  const yt = (over: object = {}) => ({ title: 'সংসদে বক্তব্য', description: 'চরাঞ্চলের স্বাস্থ্য', kind: 'youtube', youtube: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', duration: '১২:৪০', ...over });

  it('parseYouTubeId understands every common link form and rejects the rest', () => {
    for (const u of ['https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30s', 'https://youtu.be/aqz-KE-bpKQ?si=x', 'https://m.youtube.com/watch?v=aqz-KE-bpKQ', 'https://www.youtube.com/embed/aqz-KE-bpKQ', 'https://www.youtube.com/shorts/aqz-KE-bpKQ', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ', 'youtube.com/watch?v=aqz-KE-bpKQ', 'aqz-KE-bpKQ']) expect(parseYouTubeId(u), u).toBe('aqz-KE-bpKQ');
    for (const u of ['', 'https://vimeo.com/123456', 'https://www.youtube.com/watch?v=short', 'https://evil.example/watch?v=aqz-KE-bpKQ', 'javascript:alert(1)', 'https://www.youtube.com/']) expect(parseYouTubeId(u), u).toBeNull();
  });

  it('a YouTube video is stored as its 11-char id with an embed URL and an automatic thumbnail', async () => {
    const r = await post(t, t.editor, '/videos', yt());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ kind: 'youtube', youtubeId: 'aqz-KE-bpKQ', embedUrl: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ', posterUrl: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg', status: 'draft' });
    expect((await post(t, t.editor, '/videos', yt({ youtube: 'https://vimeo.com/1' }))).status).toBe(400);
    expect((await post(t, t.editor, '/videos', yt({ youtube: '' }))).status).toBe(400);
    expect((await pub(t, '/videos')).body.items).toEqual([]);
    await post(t, t.owner, `/videos/${r.body.id}/publish`);
    const p = (await pub(t, '/videos')).body.items[0];
    expect(p).toMatchObject({ title: 'সংসদে বক্তব্য', youtubeId: 'aqz-KE-bpKQ', duration: '১২:৪০' });
    expect(JSON.stringify(p)).not.toMatch(/"status"|createdBy|tenantId|mediaId/);
  });

  it('editing the link re-parses it; switching kind requires the matching source', async () => {
    const r = await post(t, t.owner, '/videos', yt(), '?publish=1');
    const changed = await patch(t, t.owner, `/videos/${r.body.id}`, { youtube: 'https://youtu.be/R6MlUcmOul8' });
    expect(changed.body.youtubeId).toBe('R6MlUcmOul8');
    expect((await patch(t, t.owner, `/videos/${r.body.id}`, { youtube: 'not a link' })).status).toBe(400);
    expect((await patch(t, t.owner, `/videos/${r.body.id}`, { kind: 'upload' })).status).toBe(400); // no uploaded file chosen
  });

  it('featured filter, ordering and the poster image rule', async () => {
    const a = await post(t, t.owner, '/videos', yt({ title: 'প্রথম ভিডিও' }), '?publish=1');
    const b = await post(t, t.owner, '/videos', yt({ title: 'দ্বিতীয় ভিডিও', featured: true }), '?publish=1');
    await post(t, t.owner, '/videos/reorder', { ids: [b.body.id, a.body.id] });
    expect((await pub(t, '/videos')).body.items.map((v: { title: string }) => v.title)).toEqual(['দ্বিতীয় ভিডিও', 'প্রথম ভিডিও']);
    expect((await pub(t, '/videos?featured=1')).body.items).toHaveLength(1);
    const own = await upImage(t, t.owner), other = await upImage(t2, t2.owner);
    expect((await patch(t, t.owner, `/videos/${a.body.id}`, { posterUrl: own.url })).body.posterUrl).toBe(own.url);
    expect((await patch(t, t.owner, `/videos/${a.body.id}`, { posterUrl: other.url })).status).toBe(422);
    expect((await del(t, t.owner, `/media/${own.id}`)).status).toBe(409); // poster in use
  });

  it('tenants cannot see or change each other\'s videos', async () => {
    const r = await post(t, t.owner, '/videos', yt(), '?publish=1');
    expect((await pub(t2, '/videos')).body.items).toEqual([]);
    expect((await list(t2, t2.owner, `/videos/${r.body.id}`)).status).toBe(404);
    expect((await patch(t2, t2.owner, `/videos/${r.body.id}`, { title: 'হ্যাক করা নাম' })).status).toBe(404);
    expect((await post(t2, t2.owner, `/videos/${r.body.id}/publish`)).status).toBe(404);
  });
});

describe('video upload (raw body, streamed to storage)', () => {
  const mp4 = (extra = 2048) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.from([0, 0, 0, 0]), Buffer.from('mp42isom'), Buffer.alloc(extra, 7)]);
  const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(1000, 9)]);
  const send = (tt: Tenant, tok: string, buf: Buffer | string, type = 'video/mp4', qs = '?name=%E0%A6%B8%E0%A6%82%E0%A6%B8%E0%A6%A6.mp4&credit=Office') =>
    api(env).post(admin(tt, `/media/video${qs}`)).set(bearer(tok)).set('Content-Type', type).send(buf);
  const files = () => (env.deps.media as MemoryMediaStorage).files;

  it('stores an MP4 or WebM, lists it under kind=video and serves it publicly with the right type', async () => {
    const r = await send(t, t.editor, mp4());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ kind: 'video', bytes: 2048 + 24, name: 'সংসদ.mp4', credit: 'Office' });
    expect(r.body.url).toBe(`http://127.0.0.1:4000/api/v1/public/media/${t.id}/${r.body.id}.mp4`);
    expect(files().has(`${t.id}/${r.body.id}.mp4`)).toBe(true);
    const w = await send(t, t.editor, webm(), 'video/webm');
    expect(w.status).toBe(201);
    expect(w.body.url).toMatch(/\.webm$/);
    const vids = await list(t, t.editor, '/media?kind=video');
    expect(vids.body.total).toBe(2);
    expect((await list(t, t.editor, '/media?kind=image')).body.total).toBe(0);
    const g = await api(env).get(`/api/v1/public/media/${t.id}/${r.body.id}.mp4`);
    expect(g.status).toBe(200);
    expect(g.headers['content-type']).toBe('video/mp4');
    expect(g.headers['accept-ranges']).toBe('bytes');
    expect(g.headers['x-content-type-options']).toBe('nosniff');
    expect(g.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Number(g.headers['content-length'])).toBe(2048 + 24);
    // wrong extension for the stored type is not found
    expect((await api(env).get(`/api/v1/public/media/${t.id}/${r.body.id}.webm`)).status).toBe(404);
  });

  it('supports HTTP Range requests (seeking): 206 partial, suffix ranges, open-ended ranges, 416 when invalid', async () => {
    const buf = mp4(1000); const r = await send(t, t.editor, buf);
    const url = `/api/v1/public/media/${t.id}/${r.body.id}.mp4`;
    const part = await api(env).get(url).set('Range', 'bytes=10-19').buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(part.status).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 10-19/${buf.length}`);
    expect(Buffer.compare(part.body as Buffer, buf.subarray(10, 20))).toBe(0);
    const open = await api(env).get(url).set('Range', `bytes=${buf.length - 5}-`);
    expect([open.status, open.headers['content-length']]).toEqual([206, '5']);
    const suffix = await api(env).get(url).set('Range', 'bytes=-7');
    expect([suffix.status, suffix.headers['content-range']]).toEqual([206, `bytes ${buf.length - 7}-${buf.length - 1}/${buf.length}`]);
    const clamp = await api(env).get(url).set('Range', 'bytes=0-999999');
    expect([clamp.status, clamp.headers['content-range']]).toEqual([206, `bytes 0-${buf.length - 1}/${buf.length}`]);
    expect((await api(env).get(url).set('Range', `bytes=${buf.length + 5}-`)).status).toBe(416);
    expect((await api(env).get(url).set('Range', 'bytes=abc')).status).toBe(416);
    expect((await api(env).head(url)).headers['content-length']).toBe(String(buf.length));
  });

  it('refuses files that are not real MP4/WebM, mismatched types, unsupported types and empty bodies', async () => {
    expect((await send(t, t.editor, '<?php echo 1; ?> this is not a video at all')).status).toBe(422);
    expect((await send(t, t.editor, webm(), 'video/mp4')).status).toBe(422); // claims mp4, is webm
    expect((await send(t, t.editor, mp4(), 'video/quicktime')).status).toBe(422);
    expect((await send(t, t.editor, mp4(), 'application/octet-stream')).status).toBe(422);
    expect((await send(t, t.editor, Buffer.alloc(0), 'video/mp4')).status).toBe(422);
    expect((await send(t, t.editor, Buffer.from('ftyp'), 'video/mp4')).status).toBe(422); // too short to be a video
    expect(files().size).toBe(0);
    expect((await list(t, t.owner, '/media?kind=video')).body.total).toBe(0);
  });

  it('enforces the size limit while streaming (nothing is left behind)', async () => {
    env = makeEnv({ MAX_VIDEO_MB: '1' });
    await clearDb(); sa = await makeSuperAdmin(env); t = await makeTenant(env, sa, 'ndp3');
    const big = mp4(1.5 * 1024 * 1024);
    // the API refuses from Content-Length before reading the body, so the client may see the reply or a reset socket
    const r = await send(t, t.editor, big).catch((e: NodeJS.ErrnoException) => ({ status: e.code }));
    expect([413, 422, 'ECONNRESET', 'EPIPE']).toContain(r.status);
    // without a trustworthy length (chunked upload) the limit is enforced while streaming
    const { MemoryMediaStorage, TooLargeError } = await import('../../src/lib/media.js');
    const mem = new MemoryMediaStorage();
    async function* chunks() { for (let i = 0; i < 20; i++) yield Buffer.alloc(100 * 1024); }
    await expect(mem.putStream(`${t.id}/${'a'.repeat(24)}.mp4`, chunks(), 1024 * 1024)).rejects.toBeInstanceOf(TooLargeError);
    expect(mem.files.size).toBe(0);
    expect(files().size).toBe(0);
    expect((await list(t, t.owner, '/media?kind=video')).body.total).toBe(0);
    expect((await send(t, t.editor, mp4(500 * 1024))).status).toBe(201); // under the limit still works
  });

  it('officers cannot upload, tenants are isolated, and files of a suspended tenant are not served', async () => {
    expect((await send(t, t.officer, mp4())).status).toBe(403);
    expect((await send(t2, t.editor, mp4())).status).toBe(404);
    const r = await send(t, t.editor, mp4());
    expect((await api(env).get(`/api/v1/public/media/${t2.id}/${r.body.id}.mp4`)).status).toBe(404);
    await api(env).post(`/api/v1/super/tenants/${t.id}/status`).set(bearer(sa)).send({ to: 'suspended', reason: 'পরীক্ষার জন্য স্থগিত' });
    expect((await api(env).get(`/api/v1/public/media/${t.id}/${r.body.id}.mp4`)).status).toBe(404);
  });

  it('an uploaded video becomes a video-collection item with a playable public file URL; it cannot be deleted while used', async () => {
    const up = await send(t, t.editor, mp4());
    const item = await post(t, t.owner, '/videos', { title: 'উদ্বোধনের ভিডিও', kind: 'upload', mediaId: up.body.id, duration: '৪:১৫' }, '?publish=1');
    expect(item.status).toBe(201);
    expect(item.body).toMatchObject({ kind: 'upload', mediaId: up.body.id, fileUrl: up.body.url, youtubeId: null, embedUrl: null });
    const p = (await pub(t, '/videos')).body.items[0];
    expect(p.fileUrl).toBe(up.body.url);
    expect(p).not.toHaveProperty('mediaId');
    expect((await api(env).get(new URL(p.fileUrl).pathname)).status).toBe(200);
    expect((await del(t, t.owner, `/media/${up.body.id}`)).status).toBe(409);
    await del(t, t.owner, `/videos/${item.body.id}`);
    expect((await del(t, t.owner, `/media/${up.body.id}`)).status).toBe(204);
    expect(files().has(`${t.id}/${up.body.id}.mp4`)).toBe(false);
  });

  it('a video item cannot point at another tenant\'s file or at an image', async () => {
    const other = await send(t2, t2.editor, mp4());
    expect((await post(t, t.owner, '/videos', { title: 'অন্যের ভিডিও', kind: 'upload', mediaId: other.body.id })).status).toBe(400);
    const img = await upImage(t, t.owner);
    expect((await post(t, t.owner, '/videos', { title: 'ছবি ভিডিও নয়', kind: 'upload', mediaId: img.id })).status).toBe(400);
    expect((await post(t, t.owner, '/videos', { title: 'ফাইল ছাড়া', kind: 'upload' })).status).toBe(400);
  });
});
