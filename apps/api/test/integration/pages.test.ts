import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import sharp from 'sharp';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeTenant, api, admin, bearer, type TestEnv, type Tenant } from '../helpers/env.js';
import { AuditLog } from '../../src/models/index.js';
import { runInTenant } from '../../src/context.js';
import { PAGE_KEYS } from '@jonoshetu/shared';

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

const get = (tt: Tenant, tok: string, key = '') => api(env).get(admin(tt, `/pages${key ? '/' + key : ''}`)).set(bearer(tok));
const put = (tt: Tenant, tok: string, key: string, body: object) => api(env).put(admin(tt, `/pages/${key}`)).set(bearer(tok)).send(body);
const publish = (tt: Tenant, tok: string, key: string) => api(env).post(admin(tt, `/pages/${key}/publish`)).set(bearer(tok)).send({});
const pubPage = (tt: Tenant, key: string) => api(env).get(`/api/v1/public/pages/${key}`).set('Host', tt.host);

const contact = (over: object = {}) => ({
  intro: 'আমাদের অফিসে সরাসরি আসুন বা ফোন করুন।',
  offices: [{ name: 'এলাকা অফিস, নতুনহাট', rows: [{ label: 'ঠিকানা', value: 'বাজার রোড, নতুনহাট' }, { label: 'সময়', value: 'শনি–বৃহস্পতি, সকাল ৯টা–বিকেল ৫টা' }] }],
  channels: [{ label: 'ইমেইল', note: 'সাধারণ যোগাযোগ', url: 'mailto:office@example.org' }],
  hotline: { number: '০১৭০০-০০০০০২', hours: 'শনি–বৃহস্পতি' },
  ...over,
});

describe('site pages: listing, defaults, draft and live', () => {
  it('lists every page key as empty on a new tenant, and get returns fully defaulted data', async () => {
    const l = await get(t, t.owner);
    expect(l.status).toBe(200);
    expect(l.body.map((p: { key: string }) => p.key)).toEqual([...PAGE_KEYS]);
    // the profile page is created (empty draft) together with the tenant; everything else starts empty
    expect(Object.fromEntries(l.body.map((p: { key: string; status: string }) => [p.key, p.status]))).toEqual({ layout: 'empty', home: 'empty', profile: 'draft', heroes: 'empty', area: 'empty', contact: 'empty', complaint: 'empty' });
    const one = await get(t, t.owner, 'contact');
    expect(one.body.draft).toMatchObject({ intro: '', offices: [], channels: [], hotline: { number: '', hours: '' } });
    expect(one.body.live).toBeNull();
    expect(one.body.version).toBe(0);
  });

  it('an editor saves a DRAFT; the public site sees nothing until the owner publishes', async () => {
    const r = await put(t, t.editor, 'contact', contact());
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('draft');
    expect(r.body.hasUnpublishedChanges).toBe(true);
    expect(r.body.version).toBe(1);
    const p0 = await pubPage(t, 'contact');
    expect(p0.body).toMatchObject({ key: 'contact', published: false });
    expect(p0.body.data.offices).toEqual([]);
    expect((await publish(t, t.editor, 'contact')).status).toBe(403);
    const pub = await publish(t, t.owner, 'contact');
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe('published');
    const p1 = await pubPage(t, 'contact');
    expect(p1.body.published).toBe(true);
    expect(p1.body.data.offices[0].name).toBe('এলাকা অফিস, নতুনহাট');
    expect(p1.body.data.hotline.number).toBe('০১৭০০-০০০০০২');
  });

  it('editing a published page changes only the draft; discard restores the live text', async () => {
    await put(t, t.owner, 'contact', contact()); await publish(t, t.owner, 'contact');
    const edited = await put(t, t.editor, 'contact', contact({ intro: 'নতুন পরিচিতি লেখা।' }));
    expect(edited.body.status).toBe('draft');
    expect(edited.body.live.intro).toContain('আমাদের অফিসে');
    expect((await pubPage(t, 'contact')).body.data.intro).toContain('আমাদের অফিসে'); // public unchanged
    const back = await api(env).post(admin(t, '/pages/contact/discard')).set(bearer(t.editor)).send({});
    expect(back.status).toBe(200);
    expect(back.body.draft.intro).toContain('আমাদের অফিসে');
    expect(back.body.status).toBe('published');
    // publish again after a new edit
    await put(t, t.owner, 'contact', contact({ intro: 'শেষ সংস্করণ।' })); await publish(t, t.owner, 'contact');
    expect((await pubPage(t, 'contact')).body.data.intro).toBe('শেষ সংস্করণ।');
  });

  it('listing shows draft / published / empty per page', async () => {
    await put(t, t.owner, 'contact', contact()); await publish(t, t.owner, 'contact');
    await put(t, t.owner, 'area', { intro: 'এলাকার পরিচিতি' });
    const m = Object.fromEntries((await get(t, t.owner)).body.map((p: { key: string; status: string }) => [p.key, p.status]));
    expect(m).toMatchObject({ contact: 'published', area: 'draft', home: 'empty' });
  });

  it('optimistic locking: saving with an old version is a 409', async () => {
    const a = await put(t, t.owner, 'contact', contact());
    await put(t, t.owner, 'contact', { ...contact({ intro: 'দ্বিতীয়' }), version: a.body.version });
    const stale = await put(t, t.owner, 'contact', { ...contact({ intro: 'পুরনো ফর্ম থেকে' }), version: a.body.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('validation and permissions', () => {
  it('rejects unknown fields, javascript: links, over-long text and unknown page keys', async () => {
    expect((await put(t, t.owner, 'contact', { ...contact(), evil: 1 })).status).toBe(400);
    expect((await put(t, t.owner, 'contact', contact({ channels: [{ label: 'x', note: '', url: 'javascript:alert(1)' }] }))).status).toBe(400);
    expect((await put(t, t.owner, 'contact', contact({ intro: 'ক'.repeat(701) }))).status).toBe(400);
    expect((await put(t, t.owner, 'contact', contact({ offices: Array(9).fill({ name: 'অফিস', rows: [] }) }))).status).toBe(400);
    expect((await put(t, t.owner, 'nope', {})).status).toBe(404);
    expect((await get(t, t.owner, 'nope')).status).toBe(404);
    expect((await pubPage(t, 'nope')).status).toBe(404);
  });

  it('officers cannot read or write pages; anonymous is 401', async () => {
    expect((await get(t, t.officer)).status).toBe(403);
    expect((await put(t, t.officer, 'contact', contact())).status).toBe(403);
    expect((await api(env).get(admin(t, '/pages'))).status).toBe(401);
  });

  it('each tenant only sees its own pages, in the admin and on the public site', async () => {
    await put(t, t.owner, 'contact', contact()); await publish(t, t.owner, 'contact');
    expect((await get(t2, t.owner, 'contact')).status).toBe(404); // not a member of t2
    const mine = await get(t2, t2.owner, 'contact');
    expect(mine.body.draft.offices).toEqual([]);
    expect((await pubPage(t2, 'contact')).body).toMatchObject({ published: false });
    expect(JSON.stringify((await pubPage(t2, 'contact')).body)).not.toContain('নতুনহাট');
  });

  it('page saves and publishes are audited without copying the page text', async () => {
    await put(t, t.editor, 'contact', contact()); await publish(t, t.owner, 'contact');
    const rows = await runInTenant(t.id, () => AuditLog.find({ action: { $in: ['page.update', 'page.publish'] } }).lean());
    expect(rows.map((r) => r.action).sort()).toEqual(['page.publish', 'page.update']);
    expect(JSON.stringify(rows)).not.toContain('বাজার রোড');
  });
});

describe('every page schema accepts a realistic full document', () => {
  it('home, layout, area, complaint, heroes and profile round-trip and can be published', async () => {
    const docs: Record<string, object> = {
      layout: { tagline: 'প্রতিটি অভিযোগের উত্তর', notice: { on: true, text: 'শুক্রবার গণশুনানি', link: '/complaint' }, footerAbout: 'এই সাইট সংসদ সদস্যের কার্যালয় পরিচালনা করে।', footerNote: 'সব তথ্য ডেমো।', photoCredit: 'ছবি: উইকিমিডিয়া কমন্স', copyright: '© ২০২৬', social: [{ kind: 'facebook', label: 'ফেসবুক', url: 'https://facebook.com/example' }, { kind: 'email', label: 'ইমেইল', url: 'mailto:a@b.org' }] },
      home: { hero: { kicker: 'সংসদ সদস্য', note: 'নদীপুর-৩' }, stats: [{ n: '৪২', unit: 'কিমি', label: 'সড়ক সংস্কার' }], statsTitle: 'কাজের হিসাব', statsNote: 'উৎস: অফিস', sections: { about: { kicker: 'পরিচিতি', title: 'চরের মানুষের চিকিৎসক', intro: '' } }, complaintCta: { title: 'অভিযোগ জানান', text: 'সরাসরি', button: 'অভিযোগ করুন' } },
      area: { intro: 'তিনটি উপজেলা', totals: [{ value: '৭,৪৩,৭৬০', label: 'জনসংখ্যা' }], voters: [{ label: 'পুরুষ', value: '২,৫৭,১১০' }], extra: [{ value: '৯৬', label: 'মাধ্যমিক বিদ্যালয়' }], upazilas: [{ name: 'চরকান্দি উপজেলা', short: 'চরকান্দি', pop: '২,৮৪,৩১০', unions: ['চরকান্দি সদর', 'কাশবন'] }], note: '' },
      complaint: { intro: 'সরাসরি জানান', steps: [{ title: 'অভিযোগ দিন', text: 'ফর্ম পূরণ' }], privacyNote: 'নাম-নম্বর গোপন', faq: [{ q: 'কী করা যায়?', a: 'সব ধরনের জনসেবা বিষয়ক' }] },
      heroes: { gallery: { kicker: 'গ্যালারি', title: 'ছবিতে কাজ', intro: 'সাম্প্রতিক ছবি' }, videos: { kicker: 'ভিডিও', title: 'ভিডিও', intro: '' } },
      profile: { headline: 'চরের চিকিৎসক থেকে সংসদে', intro: 'পরিচিতি', roleLine: 'সদস্য, স্থায়ী কমিটি', story: ['প্রথম অনুচ্ছেদ', 'দ্বিতীয় অনুচ্ছেদ'], milestones: [{ yr: '২০০৪', title: 'চিকিৎসক', note: 'যোগদান' }, { yr: '২০২৬', title: 'সংসদ সদস্য', note: '', now: true }], committees: [{ title: 'স্বাস্থ্য কমিটি', note: 'সদস্য' }], personal: [{ label: 'জন্ম', value: '১৯৮০' }], education: [{ year: '১৯৯৮', title: 'এমবিবিএস', place: 'মেডিকেল কলেজ', note: '' }], profession: [], politics: [], awards: [{ year: '২০১৯', title: 'সম্মাননা', by: 'সংস্থা' }], priorities: [{ title: 'সড়ক', text: 'সংযোগ' }] },
    };
    for (const [key, body] of Object.entries(docs)) {
      const r = await put(t, t.owner, key, body);
      expect(r.status, `${key}: ${JSON.stringify(r.body).slice(0, 200)}`).toBe(200);
      expect((await publish(t, t.owner, key)).status).toBe(200);
      const back = await pubPage(t, key);
      expect(back.body.published).toBe(true);
    }
    expect((await pubPage(t, 'home')).body.data.stats[0]).toEqual({ n: '৪২', unit: 'কিমি', label: 'সড়ক সংস্কার' });
    expect((await pubPage(t, 'heroes')).body.data.gallery.title).toBe('ছবিতে কাজ');
    expect((await pubPage(t, 'heroes')).body.data.contact).toEqual({ kicker: '', title: '', intro: '' }); // untouched pages stay defaulted
    expect((await pubPage(t, 'profile')).body.data.milestones[1].now).toBe(true);
  });

  it('/profile keeps working as an alias: flat draft + status, publish makes /public/profile appear', async () => {
    expect((await api(env).get('/api/v1/public/profile').set('Host', t.host)).status).toBe(404);
    const w = await api(env).put(admin(t, '/profile')).set(bearer(t.editor)).send({ headline: 'শিরোনাম', story: ['একটি অনুচ্ছেদ'] });
    expect(w.status).toBe(200);
    expect(w.body).toMatchObject({ headline: 'শিরোনাম', status: 'draft' });
    expect((await api(env).post(admin(t, '/profile/publish')).set(bearer(t.editor)).send({})).status).toBe(403);
    expect((await api(env).post(admin(t, '/profile/publish')).set(bearer(t.owner)).send({})).status).toBe(200);
    const pub = await api(env).get('/api/v1/public/profile').set('Host', t.host);
    expect(pub.status).toBe(200);
    expect(pub.body.headline).toBe('শিরোনাম');
  });

  it('the profile portrait must be an own upload (or an allowed host)', async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#444' } }).png().toBuffer();
    const up = await api(env).post(admin(t, '/media')).set(bearer(t.editor)).set('Content-Type', 'image/png').send(png);
    const good = await put(t, t.editor, 'profile', { portrait: { url: up.body.url, credit: 'অফিস' } });
    expect(good.status).toBe(200);
    expect((await put(t, t.editor, 'profile', { portrait: { url: 'https://evil.example/me.jpg', credit: '' } })).status).toBe(422);
    // the used portrait cannot be deleted from the media library
    const del = await api(env).delete(admin(t, `/media/${up.body.id}`)).set(bearer(t.owner));
    expect(del.status).toBe(409);
  });
});
