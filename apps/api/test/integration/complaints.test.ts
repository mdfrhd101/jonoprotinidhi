import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeSupport, makeTenant, api, admin, bearer, type TestEnv, type Tenant } from '../helpers/env.js';
import mongoose from 'mongoose';
import { Complaint, ComplaintEvent, SmsLog, AuditLog } from '../../src/models/index.js';
import { runInTenant } from '../../src/context.js';

let env: TestEnv, sa: string, t: Tenant;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  env = makeEnv();
  sa = await makeSuperAdmin(env);
  t = await makeTenant(env, sa, 'ndp3', { officerUpazilas: ['চরকান্দি'] });
});
/** Build a clean world; when `rate` is set the limiter is switched on AFTER onboarding (which logs in many times). */
async function fresh(slug: string, rate = false, cfg: Record<string, string> = {}) { await clearDb(); env = makeEnv(cfg); sa = await makeSuperAdmin(env); t = await makeTenant(env, sa, slug); if (rate) env.deps.rateLimiter.setDisabled(false); }
/** Direct DB read inside the tenant context, the way a job or script would do it. */
const inT = <T,>(fn: () => Promise<T> | T) => runInTenant(t.id, fn);

const body = (o: Record<string, unknown> = {}) => ({
  category: 'রাস্তা-ঘাট ও সেতু', upazila: 'চরকান্দি', union: 'কাশবন', place: 'বাজারের সামনে', description: 'বাজারের সামনের রাস্তায় বড় গর্ত হয়েছে, রিকশা উল্টে যাচ্ছে।',
  name: 'আব্দুর রহিম', phone: '01712345678', dob: '1985-03-14', nid: '1990123456', turnstileToken: 'ok', ...o,
});
/** Hearing/phone entries by an officer keep the earlier rules (anonymous allowed, no DOB/NID): the only way to make an anonymous record now. */
const { dob: _dob, nid: _nid, ...staffBase } = body();
const staffSubmit = (o: Record<string, unknown> = {}, tok = t.officer) => api(env).post(admin(t, '/complaints')).set(bearer(tok)).send({ ...staffBase, channel: 'hearing', ...o });
const submit = (o: Record<string, unknown> = {}, host = t.host) => api(env).post('/api/v1/public/complaints').set('Host', host).send(body(o));
const list = (tok: string, qs = '') => api(env).get(admin(t, `/complaints${qs}`)).set(bearer(tok));
const get = (tok: string, id: string) => api(env).get(admin(t, `/complaints/${id}`)).set(bearer(tok));
const patch = (tok: string, id: string, b: object) => api(env).patch(admin(t, `/complaints/${id}`)).set(bearer(tok)).send(b);
const pii = (tok: string, id: string, purpose = 'নাগরিকের সাথে যোগাযোগ করতে') => api(env).post(admin(t, `/complaints/${id}/pii-view`)).set(bearer(tok)).send({ purpose });
const idOf = async (trackingId: string) => String((await Complaint.findOne({ tenantId: t.id, trackingId }))!._id);
async function assigned(o: Record<string, unknown> = {}) {
  const { trackingId } = (await submit(o)).body;
  const id = await idOf(trackingId);
  expect((await patch(t.owner, id, { assignedTo: t.officerId })).status).toBe(200);
  return { id, trackingId };
}

describe('submitting a complaint (FR-CMP-01..05)', () => {
  it('creates a tracking id like NDP3-2026-00001 and sends an acknowledgement SMS', async () => {
    const r = await submit();
    expect(r.status).toBe(201);
    expect(r.body.trackingId).toMatch(/^NDP3-\d{4}-00001$/);
    expect((await submit()).body.trackingId).toMatch(/-00002$/);
    const sms = env.sms.outbox.filter((m) => m.to === '+8801712345678');
    expect(sms).toHaveLength(2);
    expect(sms[0]!.text).toContain(r.body.trackingId);
  });

  it('tracking numbers are per tenant and never repeat', async () => {
    const t2 = await makeTenant(env, sa, 'sbp1');
    const a = (await submit()).body.trackingId, b = (await submit({}, t2.host)).body.trackingId;
    expect(a).toMatch(/^NDP3-/); expect(b).toMatch(/^SBP1-/);
    expect(a.endsWith('-00001')).toBe(true); expect(b.endsWith('-00001')).toBe(true);
    const many = await Promise.all(Array.from({ length: 12 }, () => submit()));
    const ids = many.map((r) => r.body.trackingId);
    expect(new Set(ids).size).toBe(12); // atomic counter under concurrency
  });

  it('staff-entered anonymous complaints (hearing/phone) still store no identity and send no SMS', async () => {
    const sentBefore = env.sms.outbox.length; // onboarding already sent invite SMS
    const r = await staffSubmit({ anonymous: true, name: '', phone: '' });
    expect(r.status).toBe(201);
    const raw = await inT(() => Complaint.findOne({ trackingId: r.body.trackingId }).select('+pii +phoneHmac').lean()) as { pii?: unknown; phoneHmac?: string } | null;
    expect(raw?.pii).toBeUndefined();
    expect(raw?.phoneHmac).toBeUndefined();
    expect(env.sms.outbox).toHaveLength(sentBefore);
  });

  it('a complaint needs a valid Bangladeshi mobile number', async () => {
    for (const phone of ['', '12345', '01212345678', '0171234567', 'abcdefghijk']) expect((await submit({ phone })).status).toBe(400);
    expect((await submit({ phone: '০১৭১২৩৪৫৬৭৮' })).status).toBe(201);
    expect((await submit({ phone: '+8801812345678' })).status).toBe(201);
  });

  // owner decision 2 Oct 2026 (adr/0009): the citizen's form always carries name, phone, date of birth and NID; no anonymous option
  describe('identity is mandatory: name, phone, date of birth and NID (adr/0009)', () => {
    it('each missing or blank field gives 400 with a Bangla field error, and nothing is stored', async () => {
      for (const k of ['name', 'phone', 'dob', 'nid']) {
        for (const v of [undefined, '', '   ']) {
          const r = await submit({ [k]: v });
          expect(r.status, `${k}=${JSON.stringify(v)}`).toBe(400);
          expect(r.body.error.code).toBe('VALIDATION_FAILED');
          expect(r.body.error.details.fieldErrors[k]?.[0], k).toMatch(/[\u0980-\u09FF]/);
        }
      }
      const none = await api(env).post('/api/v1/public/complaints').set('Host', t.host).send({ category: 'রাস্তা-ঘাট ও সেতু', upazila: 'চরকান্দি', union: 'কাশবন', description: 'ক'.repeat(30), turnstileToken: 'ok' });
      expect(Object.keys(none.body.error.details.fieldErrors).sort()).toEqual(['dob', 'name', 'nid', 'phone']);
      expect(await inT(() => Complaint.countDocuments({}))).toBe(0);
    });

    it('rejects an impossible, future or too-old date of birth', async () => {
      for (const dob of ['2001-02-29', '1985-13-01', '1899-12-31', '85-03-14', '1985/03/14', 'আজ', '2999-01-01']) expect((await submit({ dob })).status, dob).toBe(400);
      expect((await submit({ dob: '2999-01-01' })).body.error.details.fieldErrors.dob[0]).toMatch(/পরে হতে পারে না/);
      const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10); // the schema judges "future" on the real Dhaka day
      expect((await submit({ dob: today })).status).toBe(201); // born today is odd, but not in the future
    });

    it('accepts an NID of 10, 13 or 17 digits only, ignoring spaces and dashes', async () => {
      for (const nid of ['123456789', '12345678901', '123456789012', '12345678901234', '1234567890123456', '123456789012345678', '12345X7890', '+1234567890']) expect((await submit({ nid })).status, nid).toBe(400);
      for (const nid of ['1234567890', '1234567890123', '12345678901234567', '1234 567 890', '1234-5678-90']) expect((await submit({ nid })).status, nid).toBe(201);
    });

    it('refuses the old anonymous switch, true or false, and stores nothing', async () => {
      expect((await submit({ anonymous: true })).status).toBe(400);
      expect((await submit({ anonymous: true, name: '', phone: '', dob: '', nid: '' })).status).toBe(400);
      expect((await submit({ anonymous: false })).status).toBe(400);
      expect(await inT(() => Complaint.countDocuments({}))).toBe(0);
    });

    it('Bangla digits, spaces and dashes are normalised before encryption', async () => {
      const { trackingId } = (await submit({ dob: '১৯৮৫-০৩-১৪', nid: '১৯৯০-১২৩ ৪৫৬' })).body;
      const id = await idOf(trackingId);
      await patch(t.owner, id, { assignedTo: t.officerId });
      expect((await pii(t.officer, id)).body).toMatchObject({ dob: '1985-03-14', nid: '1990123456' });
    });
  });

  it('validates description length, category, unknown keys and NoSQL operator probes', async () => {
    expect((await submit({ description: 'ছোট' })).status).toBe(400);
    expect((await submit({ description: 'ক'.repeat(10001) })).status).toBe(400);
    expect((await submit({ category: 'নেই এমন বিষয়' })).status).toBe(422);
    expect((await submit({ status: 'solved' })).status).toBe(400);
    expect((await submit({ upazila: { $ne: '' } })).status).toBe(400);
  });

  it('requires a passing Turnstile check (fails closed)', async () => {
    env.turnstile.pass = false;
    expect((await submit()).status).toBe(400);
    env.turnstile.pass = true;
    expect((await submit({ turnstileToken: '' })).status).toBe(400);
  });

  it('is refused when the tenant turned the box off', async () => {
    await api(env).put(admin(t, '/settings')).set(bearer(t.owner)).send({ otpRequired: false, slaDays: 7, complaintCategories: ['রাস্তা-ঘাট ও সেতু', 'অন্যান্য'] });
    expect((await submit()).status).toBe(201); // categories changed but this one is still listed
    const off = await api(env).put(admin(t, '/settings')).set(bearer(t.owner)).send({ otpRequired: false, slaDays: 7, complaintCategories: ['বিদ্যুৎ', 'অন্যান্য'] });
    expect(off.status).toBe(200);
    expect((await submit()).status).toBe(422); // old category no longer allowed
  });

  it('cannot submit to a tenant that is not live, or to an unknown host', async () => {
    const setup = await makeTenant(env, sa, 'newmp', { live: false });
    expect((await submit({}, setup.host)).status).toBe(404);
    expect((await submit({}, 'unknown.example')).status).toBe(404);
    await api(env).post(`/api/v1/super/tenants/${t.id}/status`).set(bearer(sa)).send({ to: 'suspended', reason: 'চুক্তির মেয়াদ শেষ' });
    expect((await submit()).status).toBe(503);
  });
});

describe('identity is encrypted at rest (ADR-0004)', () => {
  it('the database holds ciphertext only: no plaintext name or phone anywhere in the raw document', async () => {
    const { body: r } = await submit();
    const raw = await mongoose.connection.db!.collection('complaints').findOne({ trackingId: r.trackingId });
    const dump = JSON.stringify(raw);
    expect(dump).not.toContain('আব্দুর রহিম');
    expect(dump).not.toContain('01712345678');
    expect(dump).not.toContain('8801712345678');
    expect(raw!.pii.phoneEnc).toMatch(/^v1:1:/);
    expect(raw!.phoneHmac).toMatch(/^[a-f0-9]{64}$/);
  });

  it('date of birth and NID sit in the same encrypted envelope as name and phone: no plaintext anywhere in the raw document (adr/0009)', async () => {
    const { body: r } = await submit({ dob: '1985-03-14', nid: '19901234567890123' });
    const raw = await mongoose.connection.db!.collection('complaints').findOne({ trackingId: r.trackingId });
    const dump = JSON.stringify(raw);
    for (const plain of ['1985-03-14', '19850314', '14-03-1985', '19901234567890123', '1990123456']) expect(dump).not.toContain(plain);
    expect(Object.keys(raw!.pii).sort()).toEqual(['dobEnc', 'keyVersion', 'nameEnc', 'nidEnc', 'phoneEnc']);
    for (const f of ['nameEnc', 'phoneEnc', 'dobEnc', 'nidEnc']) expect(raw!.pii[f], f).toMatch(/^v1:1:/);
    expect(Object.keys(raw!).filter((k) => /dob|nid/i.test(k))).toEqual([]); // no plaintext (or hashed) side field next to pii
    expect(await inT(() => Complaint.findOne({ trackingId: r.trackingId }).lean())).not.toHaveProperty('pii.dobEnc'); // select:false: never loaded by accident
  });

  it('DOB and NID ciphertext is bound to its record and field: swapping breaks decryption', async () => {
    const a = (await submit({ phone: '01711111111', nid: '1111111111' })).body.trackingId, b = (await submit({ phone: '01722222222', nid: '2222222222' })).body.trackingId;
    const coll = mongoose.connection.db!.collection('complaints');
    const A = await coll.findOne({ trackingId: a });
    const idB = await idOf(b);
    await patch(t.owner, idB, { assignedTo: t.officerId });
    await coll.updateOne({ trackingId: b }, { $set: { 'pii.nidEnc': A!.pii.nidEnc } });
    expect((await pii(t.officer, idB)).status).toBe(500); // another record's NID never comes out
    await coll.updateOne({ trackingId: b }, { $set: { 'pii.nidEnc': (await coll.findOne({ trackingId: b }))!.pii.dobEnc } });
    expect((await pii(t.officer, idB)).status).toBe(500); // nor the DOB read as an NID
  });

  it('encrypted values are bound to their record: swapping ciphertext between two complaints breaks decryption', async () => {
    const a = (await submit({ phone: '01711111111' })).body.trackingId, b = (await submit({ phone: '01722222222' })).body.trackingId;
    const A = await inT(() => Complaint.findOne({ trackingId: a }).select('+pii.phoneEnc').lean());
    await mongoose.connection.db!.collection('complaints').updateOne({ trackingId: b }, { $set: { 'pii.phoneEnc': A!.pii!.phoneEnc } });
    const idB = await idOf(b);
    await patch(t.owner, idB, { assignedTo: t.officerId });
    const r = await pii(t.officer, idB);
    expect(r.status).toBe(500); // AAD mismatch: never returns someone else's number
  });

  it('logs and SMS records never contain the phone number', async () => {
    await submit();
    const logs = JSON.stringify(await SmsLog.find().lean());
    expect(logs).not.toContain('01712345678');
    expect(logs).toMatch(/phoneHmac/);
    expect(JSON.stringify(await AuditLog.find().lean())).not.toContain('01712345678');
  });

  it('DOB and NID never reach audit entries, the event history, SMS records, the CSV export or any read response (adr/0009)', async () => {
    const { id, trackingId } = await assigned({ dob: '1985-03-14', nid: '19901234567890123' });
    expect((await pii(t.officer, id)).status).toBe(200); // the reveal itself is logged, with the purpose only
    await patch(t.owner, id, { status: 'verify' });
    const dumps = [
      JSON.stringify(await AuditLog.find().lean()), JSON.stringify(await inT(() => ComplaintEvent.find().lean())), JSON.stringify(await SmsLog.find().lean()),
      (await api(env).get(admin(t, '/complaints/export.csv')).set(bearer(t.owner))).text,
      JSON.stringify([(await list(t.owner)).body, (await get(t.owner, id)).body, (await list(t.officer)).body, (await get(t.officer, id)).body]),
      JSON.stringify((await api(env).get(`/api/v1/public/complaints/${trackingId}`).set('Host', t.host)).body),
      JSON.stringify((await patch(t.owner, id, { note: 'ভেতরের নোট' })).body),
    ];
    for (const d of dumps) { expect(d).not.toContain('1985-03-14'); expect(d).not.toContain('19901234567890123'); expect(d).not.toMatch(/dobEnc|nidEnc/); }
    expect(env.sms.outbox.map((m) => m.text).join('\n')).not.toMatch(/1985|19901234567890123/);
  });
});

describe('who can see a complainant (MIS-02): only the assigned officer', () => {
  it('the assigned officer sees name, phone, date of birth and NID, with a purpose, and the view is logged', async () => {
    const { id } = await assigned();
    const r = await pii(t.officer, id, 'দ্রুত সমাধানের জন্য ফোন করা');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ name: 'আব্দুর রহিম', phone: '01712345678', dob: '1985-03-14', nid: '1990123456' });
    const ev = await inT(() => ComplaintEvent.find({ complaintId: id, type: 'pii_view' }).lean());
    expect(ev).toHaveLength(1);
    expect(ev[0]!.by?.name).toBe('কর্মকর্তা');
    const a = await AuditLog.findOne({ action: 'complaint.pii_view' }).lean();
    expect(a?.reason).toBe('দ্রুত সমাধানের জন্য ফোন করা');
  });

  it('only the assigned officer gets DOB and NID: everyone else is refused and the fields are never in the detail', async () => {
    const { id } = await assigned();
    for (const tok of [t.owner, t.editor]) expect((await pii(tok, id)).status).toBe(403);
    const sup = await makeSupport(env);
    const act = await api(env).post(`/api/v1/super/tenants/${t.id}/act-as`).set(bearer(sup)).send({ reason: 'গ্রাহক সহায়তার অনুরোধ' });
    expect((await pii(act.body.actAsToken, id)).status).toBe(403);
    expect(JSON.stringify((await get(t.owner, id)).body)).not.toMatch(/1990123456|1985-03-14|"dob"|"nid"/);
    const unassigned = await idOf((await submit()).body.trackingId);
    expect((await pii(t.officer, unassigned)).status).toBe(403); // an officer in scope, but not the assignee
  });

  it('complaints from before adr/0009 (no DOB/NID stored) still load; the reveal returns empty values the admin prints as "—"', async () => {
    const { id } = await assigned();
    await mongoose.connection.db!.collection('complaints').updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $unset: { 'pii.dobEnc': '', 'pii.nidEnc': '' } });
    expect((await get(t.officer, id)).status).toBe(200);
    const r = await pii(t.officer, id);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ name: 'আব্দুর রহিম', phone: '01712345678', dob: '', nid: '' });
    // a staff-entered complaint never had them
    const staffId = await idOf((await staffSubmit()).body.trackingId);
    await patch(t.owner, staffId, { assignedTo: t.officerId });
    expect((await pii(t.officer, staffId)).body).toEqual({ name: 'আব্দুর রহিম', phone: '01712345678', dob: '', nid: '' });
  });

  it('a purpose is mandatory', async () => {
    const { id } = await assigned();
    expect((await api(env).post(admin(t, `/complaints/${id}/pii-view`)).set(bearer(t.officer)).send({})).status).toBe(400);
    expect((await pii(t.officer, id, 'ফোন')).status).toBe(400);
  });

  it('the owner (the MP) can never see it', async () => {
    const { id } = await assigned();
    expect((await pii(t.owner, id)).status).toBe(403);
    expect((await get(t.owner, id)).body.canViewPii).toBe(false);
  });

  it('the editor can never see it', async () => {
    const { id } = await assigned();
    expect((await pii(t.editor, id)).status).toBe(403);
  });

  it('support staff acting-as cannot see it', async () => {
    const { id } = await assigned();
    const sup = await makeSupport(env);
    const act = await api(env).post(`/api/v1/super/tenants/${t.id}/act-as`).set(bearer(sup)).send({ reason: 'গ্রাহক সহায়তার অনুরোধ' });
    expect((await pii(act.body.actAsToken, id)).status).toBe(403);
  });

  it('a super admin acting-as cannot see it either, even though they can do everything else', async () => {
    const { id } = await assigned();
    const act = await api(env).post(`/api/v1/super/tenants/${t.id}/act-as`).set(bearer(sa)).send({ reason: 'সাইটের সমস্যা ঠিক করতে' });
    expect(act.status).toBe(200);
    expect((await pii(act.body.actAsToken, id)).status).toBe(403);
    expect((await get(act.body.actAsToken, id)).status).toBe(200); // can read the complaint itself
    expect((await get(act.body.actAsToken, id)).body.canViewPii).toBe(false);
  });

  it('an officer who is not the assignee cannot see it, even in the same upazila', async () => {
    const other = await api(env).post(admin(t, '/team/invites')).set(bearer(t.owner)).send({ name: 'দ্বিতীয় কর্মকর্তা', phone: '01799999999', role: 'officer', upazilas: ['চরকান্দি'] });
    const acc = await api(env).post(`/api/v1/auth/invites/${other.body.inviteToken}/accept`).send({ password: 'Sup3r-secret-pass' });
    expect(acc.status).toBe(200);
    const { loginFlow } = await import('../helpers/env.js');
    const tok2 = (await loginFlow(env, '+8801799999999')).token;
    const { id } = await assigned();
    expect((await pii(tok2, id)).status).toBe(403);
    expect((await get(tok2, id)).body.canViewPii).toBe(false);
  });

  it('nobody can see an anonymous complaint (there is nothing to see)', async () => {
    const { trackingId } = (await staffSubmit({ anonymous: true, name: '', phone: '' })).body;
    const id = await idOf(trackingId);
    await patch(t.owner, id, { assignedTo: t.officerId });
    expect((await pii(t.officer, id)).status).toBe(403);
  });

  it('identity never appears in ANY read response for anyone', async () => {
    const { id } = await assigned();
    for (const tok of [t.owner, t.officer]) {
      const txt = JSON.stringify([(await list(tok)).body, (await get(tok, id)).body]);
      expect(txt).not.toContain('আব্দুর রহিম');
      expect(txt).not.toContain('01712345678');
      expect(txt).not.toContain('phoneEnc');
      expect(txt).not.toContain('phoneHmac');
      expect(txt).not.toMatch(/1985-03-14|1990123456|dobEnc|nidEnc/);
    }
    const track = JSON.stringify((await api(env).get(`/api/v1/public/complaints/NDP3-${new Date().getUTCFullYear()}-00001`).set('Host', t.host)).body);
    expect(track).not.toContain('আব্দুর রহিম');
  });

  it('PII views are rate limited per officer', async () => {
    await fresh('rl1', true);
    const { trackingId } = (await api(env).post('/api/v1/public/complaints').set('Host', t.host).send(body())).body;
    const id = await idOf(trackingId);
    await patch(t.owner, id, { assignedTo: t.officerId });
    let last = 0;
    for (let i = 0; i < 32; i++) last = (await pii(t.officer, id)).status;
    expect(last).toBe(429);
  });
});

describe('officer scope (FR-CMP-07)', () => {
  it('an officer sees only complaints from their own upazila, in lists, details and search', async () => {
    const mine = (await submit({ upazila: 'চরকান্দি' })).body.trackingId;
    const theirs = (await submit({ upazila: 'শালবাগান', union: 'বনগ্রাম' })).body.trackingId;
    const l = await list(t.officer);
    expect(l.body.items.map((c: { trackingId: string }) => c.trackingId)).toEqual([mine]);
    expect((await get(t.officer, await idOf(theirs))).status).toBe(404); // not 403: existence not revealed
    expect((await list(t.officer, '?upazila=' + encodeURIComponent('শালবাগান'))).body.items).toHaveLength(0); // a filter cannot widen scope
    expect((await list(t.owner)).body.total).toBe(2);
    expect((await list(t.officer, '?q=' + theirs)).body.items).toHaveLength(0);
  });

  it('the editor has no access to complaints at all', async () => {
    expect((await list(t.editor)).status).toBe(403);
  });

  it('assignment only to an active officer whose scope covers the complaint', async () => {
    const id = await idOf((await submit({ upazila: 'শালবাগান', union: 'বনগ্রাম' })).body.trackingId);
    expect((await patch(t.owner, id, { assignedTo: t.officerId })).status).toBe(422); // officer covers চরকান্দি only
    expect((await patch(t.owner, id, { assignedTo: t.editor })).status).toBeGreaterThanOrEqual(400);
    expect((await patch(t.officer, id, { assignedTo: t.officerId })).status).toBe(404); // out of scope
  });

  it('an officer can change status on their own case but cannot assign or touch others', async () => {
    const { id } = await assigned();
    expect((await patch(t.officer, id, { status: 'verify' })).status).toBe(200);
    expect((await patch(t.officer, id, { assignedTo: null })).status).toBe(403);
    const unassigned = await idOf((await submit()).body.trackingId);
    expect((await patch(t.officer, unassigned, { status: 'verify' })).status).toBe(403);
  });
});

describe('status machine, SLA and notifications', () => {
  it('follows new -> verify -> progress -> solved -> closed and rejects shortcuts', async () => {
    const { id } = await assigned();
    expect((await patch(t.owner, id, { status: 'solved' })).status).toBe(422);
    for (const s of ['verify', 'progress', 'solved', 'closed']) expect((await patch(t.owner, id, { status: s })).status).toBe(200);
    expect((await patch(t.owner, id, { status: 'progress' })).status).toBe(422); // closed is final
  });

  it('stamps first action, resolution time and a retention date; adds public steps', async () => {
    const { id, trackingId } = await assigned();
    await patch(t.owner, id, { status: 'verify' });
    await patch(t.owner, id, { status: 'progress' });
    env.clock.now += 3 * 86400_000;
    await patch(t.owner, id, { status: 'solved' });
    await patch(t.owner, id, { status: 'closed' });
    const c = await inT(() => Complaint.findById(id).lean());
    expect(c!.firstActionAt).toBeTruthy(); expect(c!.resolvedAt).toBeTruthy(); expect(c!.retentionUntil).toBeTruthy();
    const track = await api(env).get(`/api/v1/public/complaints/${trackingId}`).set('Host', t.host);
    expect(track.body.steps.map((s: { label: string }) => s.label)).toEqual(['অভিযোগ গৃহীত', 'যাচাই চলছে', 'প্রক্রিয়াধীন', 'সমাধান হয়েছে', 'বন্ধ']);
    expect(track.body.status).toBe('closed');
  });

  it('the citizen gets an SMS on status changes (not for anonymous)', async () => {
    const { id } = await assigned();
    const before = env.sms.outbox.length;
    await patch(t.owner, id, { status: 'verify' });
    expect(env.sms.outbox.length).toBe(before + 1);
    expect(env.sms.outbox.at(-1)!.to).toBe('+8801712345678');
    const anon = await idOf((await staffSubmit({ anonymous: true, name: '', phone: '' })).body.trackingId);
    const n = env.sms.outbox.length;
    await patch(t.owner, anon, { status: 'verify' });
    expect(env.sms.outbox.length).toBe(n);
    expect((await api(env).post(admin(t, `/complaints/${anon}/sms`)).set(bearer(t.owner)).send({ templateKey: 'received' })).status).toBe(422);
  });

  it('flags overdue complaints against the tenant SLA', async () => {
    const { id } = await assigned();
    expect((await get(t.owner, id)).body.overdue).toBe(false);
    env.clock.now += 8 * 86400_000;
    expect((await get(t.owner, id)).body.overdue).toBe(true);
    expect((await list(t.owner, '?late=1')).body.items).toHaveLength(1);
  });

  it('optimistic locking: a stale version gets 409', async () => {
    const { id } = await assigned();
    const v = (await get(t.owner, id)).body.version;
    expect((await patch(t.owner, id, { status: 'verify', version: v })).status).toBe(200);
    expect((await patch(t.owner, id, { status: 'progress', version: v })).status).toBe(409);
  });

  it('internal notes are visible to staff only, never on the public tracking page', async () => {
    const { id, trackingId } = await assigned();
    expect((await api(env).post(admin(t, `/complaints/${id}/notes`)).set(bearer(t.officer)).send({ text: 'ভেতরের নোট: প্রকৌশলীর সাথে কথা হয়েছে' })).status).toBe(201);
    expect(JSON.stringify((await get(t.owner, id)).body.events)).toContain('প্রকৌশলীর সাথে');
    expect(JSON.stringify((await api(env).get(`/api/v1/public/complaints/${trackingId}`).set('Host', t.host)).body)).not.toContain('প্রকৌশলীর');
  });

  it('BUG-2026-019: the office audit log never shows a citizen IP or browser, nor reasons on complaint rows', async () => {
    const r = await api(env).post('/api/v1/public/complaints').set('Host', t.host).set('User-Agent', 'CitizenPhone/1.0 (secret-device)').set('X-Forwarded-For', '203.0.113.77').send(body());
    expect(r.status).toBe(201);
    const raw = await inT(() => AuditLog.findOne({ action: 'complaint.create' }).lean());
    expect(raw).toBeTruthy();
    expect(raw!.ip ?? null).toBeNull(); // not even stored
    expect(raw!.userAgent ?? null).toBeNull();
    const log = await api(env).get(admin(t, '/audit?limit=100')).set(bearer(t.owner));
    expect(log.status).toBe(200);
    const txt = JSON.stringify(log.body);
    expect(txt).not.toMatch(/203\.0\.113\.77|CitizenPhone|secret-device|"ip"|"userAgent"/);
    for (const a of log.body.items as Array<{ action: string; reason?: string }>) if (a.action.startsWith('complaint.')) expect(a.reason).toBeUndefined();
  });

  it('every change is in the append-only event history and audit log', async () => {
    const { id } = await assigned();
    await patch(t.owner, id, { status: 'verify' });
    const events = await inT(() => ComplaintEvent.find({ complaintId: id }).lean());
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['created', 'assign', 'status']));
    expect(await AuditLog.countDocuments({ action: 'complaint.update' })).toBe(2);
  });
});

describe('public tracking and statistics (FR-CMP-06, FR-CMP-11)', () => {
  it('shows category, area, status and steps only; unknown ids give the same 404 as unreachable ones', async () => {
    const { trackingId } = (await submit()).body;
    const ok = await api(env).get(`/api/v1/public/complaints/${trackingId}`).set('Host', t.host);
    expect(Object.keys(ok.body).sort()).toEqual(['category', 'status', 'steps', 'submittedAt', 'trackingId', 'union', 'upazila']);
    const miss = await api(env).get('/api/v1/public/complaints/NDP3-2026-99999').set('Host', t.host);
    expect(miss.status).toBe(404);
    const t2 = await makeTenant(env, sa, 'sbp1');
    const cross = await api(env).get(`/api/v1/public/complaints/${trackingId}`).set('Host', t2.host);
    expect(cross.status).toBe(404); // another tenant's site cannot look it up
    expect(cross.body).toEqual(miss.body);
  });

  it('tracking is rate limited', async () => {
    await fresh('rl2', true);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await api(env).get('/api/v1/public/complaints/NDP3-2026-00001').set('Host', t.host)).status;
    expect(last).toBe(429);
  });

  it('statistics are aggregates; categories with fewer than 5 complaints merge into অন্যান্য', async () => {
    for (let i = 0; i < 6; i++) await submit({ category: 'রাস্তা-ঘাট ও সেতু' });
    await submit({ category: 'বিদ্যুৎ' }); await submit({ category: 'শিক্ষা' });
    const { id } = await assigned({ category: 'রাস্তা-ঘাট ও সেতু' });
    for (const s of ['verify', 'progress', 'solved']) await patch(t.owner, id, { status: s });
    const st = (await api(env).get('/api/v1/public/complaint-stats').set('Host', t.host)).body;
    expect(st.received).toBe(9);
    expect(st.resolved).toBe(1);
    expect(st.byCategory).toEqual([{ category: 'রাস্তা-ঘাট ও সেতু', count: 7 }, { category: 'অন্যান্য', count: 2 }]);
    expect(JSON.stringify(st)).not.toMatch(/trackingId|description|phone|name/);
  });

  it('spam is excluded from statistics', async () => {
    const { trackingId } = (await submit()).body;
    await patch(t.owner, await idOf(trackingId), { status: 'spam' });
    expect((await api(env).get('/api/v1/public/complaint-stats').set('Host', t.host)).body.received).toBe(0);
  });
});

describe('OTP (ADR-0007): optional by default, mandatory when the MP turns it on', () => {
  const setOtp = (on: boolean) => api(env).put(admin(t, '/settings')).set(bearer(t.owner)).send({ otpRequired: on, slaDays: 7, complaintCategories: ['রাস্তা-ঘাট ও সেতু', 'বিদ্যুৎ'] });
  const send = (phone = '01712345678') => api(env).post('/api/v1/public/otp/send').set('Host', t.host).send({ phone, turnstileToken: 'ok' });
  const codeFromSms = () => /(\d{6})/.exec(env.sms.outbox.filter((m) => m.text.includes('যাচাই কোড')).at(-1)!.text)![1]!;
  const verify = (code: string, phone = '01712345678') => api(env).post('/api/v1/public/otp/verify').set('Host', t.host).send({ phone, code });

  it('when mandatory, a complaint without a verified number is refused', async () => {
    await setOtp(true);
    const r = await submit();
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('OTP_REQUIRED');
    expect((await staffSubmit()).status).toBe(201); // an officer logging a hearing/phone complaint is not asked for an OTP
  });

  it('send -> verify -> ticket -> complaint works, and the ticket is single use', async () => {
    await setOtp(true);
    expect((await send()).status).toBe(202);
    const v = await verify(codeFromSms());
    expect(v.status).toBe(200);
    const first = await submit({ otpTicket: v.body.otpTicket });
    expect(first.status).toBe(201);
    expect((await inT(() => Complaint.findOne({ trackingId: first.body.trackingId })))!.otpVerified).toBe(true);
    expect((await submit({ otpTicket: v.body.otpTicket })).status).toBe(422); // reuse
  });

  it('a ticket for one number cannot be used for another', async () => {
    await setOtp(true);
    await send(); const v = await verify(codeFromSms());
    expect((await submit({ otpTicket: v.body.otpTicket, phone: '01811111111' })).status).toBe(422);
  });

  it('wrong codes fail, and 5 failures burn the code', async () => {
    await send();
    const good = codeFromSms();
    for (let i = 0; i < 5; i++) expect((await verify('000000')).status).toBe(400);
    expect((await verify(good)).status).toBe(400); // burned
  });

  it('codes expire after 5 minutes, and resend has a 60 s cooldown that reveals nothing', async () => {
    await send();
    const a = env.sms.outbox.length;
    expect((await send()).status).toBe(202); // same response...
    expect(env.sms.outbox.length).toBe(a); // ...but no second SMS inside the cooldown
    const code = codeFromSms();
    env.clock.now += 6 * 60_000;
    expect((await verify(code)).status).toBe(400);
  });

  it('optional mode: a verified ticket is accepted but not required', async () => {
    expect((await submit()).status).toBe(201);
  });
});

describe('staff-entered complaints, CSV export, retention', () => {
  it('officers can log a hearing/phone complaint; it still gets a tracking id and SMS', async () => {
    const r = await staffSubmit();
    expect(r.status).toBe(201);
    expect((await inT(() => Complaint.findOne({ trackingId: r.body.trackingId })))!.channel).toBe('hearing');
    expect((await staffSubmit({ channel: 'web' })).status).toBe(400);
    expect((await staffSubmit({}, t.editor)).status).toBe(403);
    // the staff form does not take DOB/NID (adr/0009 only changes the citizen's form)
    expect((await staffSubmit({ dob: '1985-03-14', nid: '1990123456' })).status).toBe(400);
  });

  it('CSV export has no identity columns, is owner-only, is audited, and neutralises spreadsheet formulas', async () => {
    await submit({ union: '=HYPERLINK("http://evil.example","click")' });
    await submit();
    const csv = await api(env).get(admin(t, '/complaints/export.csv')).set(bearer(t.owner));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const text = csv.text;
    expect(text.split('\r\n')[0]).toContain('trackingId');
    expect(text).not.toMatch(/আব্দুর রহিম|01712345678|phone|name/i);
    expect(text).toContain(`"'=HYPERLINK`); // leading apostrophe defuses the formula
    expect((await api(env).get(admin(t, '/complaints/export.csv')).set(bearer(t.officer))).status).toBe(403);
    expect(await AuditLog.countDocuments({ action: 'complaint.export' })).toBe(1);
  });

  it('retention job removes identity after the retention period but keeps the record for statistics', async () => {
    const { id, trackingId } = await assigned();
    for (const s of ['verify', 'progress', 'solved', 'closed']) await patch(t.owner, id, { status: s });
    expect(await env.services.complaints.purgeExpiredPii()).toBe(0); // not yet
    env.clock.now += 13 * 30 * 86400_000;
    expect(await env.services.complaints.purgeExpiredPii()).toBe(1);
    const raw = await mongoose.connection.db!.collection('complaints').findOne({ trackingId });
    expect(raw!.pii).toBeUndefined(); expect(raw!.phoneHmac).toBeUndefined(); expect(raw!.piiPurgedAt).toBeTruthy();
    expect((await pii(t.officer, id)).status).toBe(403); // nothing left to view
    expect((await api(env).get(`/api/v1/public/complaints/${trackingId}`).set('Host', t.host)).status).toBe(200); // record stays
    expect(await env.services.complaints.purgeExpiredPii()).toBe(0); // idempotent
  });
});

describe('abuse controls (MIS-03)', () => {
  it('rate limits complaint submissions per IP', async () => {
    await fresh('rl3', true);
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await api(env).post('/api/v1/public/complaints').set('Host', t.host).send(body({ phone: `01712000${100 + i}` }))).status);
    expect(codes.slice(0, 5).every((c) => c === 201)).toBe(true);
    expect(codes.slice(5)).toContain(429);
  });

  it('limits repeat submissions from the same phone number per day', async () => {
    await fresh('rl4', true);
    env.deps.rateLimiter.check('publicWriteDaily', 'noop'); // touch to keep the type import honest
    for (let i = 0; i < 20; i++) env.deps.rateLimiter.check('publicWriteDaily', `ph:${t.id}:x`);
    expect(env.deps.rateLimiter.check('publicWriteDaily', `ph:${t.id}:x`).allowed).toBe(false);
  });

  it('enforces the per-tenant daily SMS cap', async () => {
    await fresh('cap1', false, { DAILY_SMS_CAP: '3' });
    const before = env.sms.outbox.length;
    for (let i = 0; i < 6; i++) await api(env).post('/api/v1/public/complaints').set('Host', t.host).send(body({ phone: `01713000${100 + i}` }));
    expect(env.sms.outbox.length - before).toBeLessThanOrEqual(3);
  });

  // BUG-2026-005: a tenant may lower the platform SMS cap but never raise it
  it('a tenant setting cannot raise the platform SMS cap (BUG-2026-005)', async () => {
    await fresh('cap2', false, { DAILY_SMS_CAP: '12' }); // onboarding already used a few of today's messages
    const total = () => inT(() => SmsLog.countDocuments({ status: 'sent' }));
    for (let i = 0; i < 20; i++) await inT(() => env.deps.sms.send({ tenantId: t.id, to: `017130002${String(i).padStart(2, '0')}`, text: 'পরীক্ষা', purpose: 'status', cap: 1000 }));
    expect(await total()).toBe(12); // stops at the platform ceiling, not at the tenant's 1000
    // a LOWER tenant cap still wins
    await fresh('cap3', false, { DAILY_SMS_CAP: '50' });
    const used = await total();
    for (let i = 0; i < 5; i++) await inT(() => env.deps.sms.send({ tenantId: t.id, to: `017130003${String(i).padStart(2, '0')}`, text: 'পরীক্ষা', purpose: 'status', cap: used + 1 }));
    expect(await total()).toBe(used + 1);
  });
});

/* ---------- voice notes and attachments (1 Oct 2026 work) ---------- */
describe('complaint attachments: decoded, checked and rebuilt on the server', () => {
  const b64url = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('voice-bytes')]);
  const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20, 1)]);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
  const voice = (audioData = b64url('audio/webm;codecs=opus', webm), durationSec = 12) => ({ audioData, durationSec });
  const file = (mimeType: string, data: string, name = 'proof.bin', size = 100) => ({ name, mimeType, size, data });
  const raw = (trackingId: string) => mongoose.connection.db!.collection('complaints').findOne({ trackingId });

  // BUG-2026-027: nothing a citizen sends is stored or rendered verbatim
  it('refuses scripts, HTML and type mismatches; stores nothing (BUG-2026-027)', async () => {
    const html = Buffer.from('<script>alert(document.cookie)</script>');
    const bad: Array<[Record<string, unknown>, number]> = [
      [{ files: [file('application/pdf', 'javascript:alert(1)')] }, 400],
      [{ files: [file('application/pdf', b64url('text/html', html))] }, 422], // declared PDF, data says HTML
      [{ files: [file('application/pdf', b64url('application/pdf', html))] }, 422], // says PDF, bytes are not
      [{ files: [file('image/png', b64url('image/png', Buffer.from('<svg onload=alert(1)>')))] }, 422], // not decodable as an image
      [{ files: [file('image/png', 'data:image/png;base64,@@@@')] }, 422], // not base64
      [{ voiceNote: voice(b64url('audio/webm', html)) }, 422], // audio type, wrong bytes
      [{ voiceNote: voice(b64url('text/html', html)) }, 422],
      [{ voiceNote: voice(b64url('audio/ogg', webm)) }, 422], // magic bytes must match the declared container
    ];
    for (const [o, code] of bad) {
      const r = await submit(o);
      expect(r.status, JSON.stringify(o).slice(0, 80)).toBe(code);
      expect(r.status).not.toBe(500);
    }
    expect(await inT(() => Complaint.countDocuments({}))).toBe(0);
  });

  it('photos are re-encoded to WebP (max 1600 px, EXIF dropped); PDFs and voice are rebuilt from their checked bytes (BUG-2026-027)', async () => {
    const sharp = (await import('sharp')).default;
    const jpg = await sharp({ create: { width: 3200, height: 1800, channels: 3, background: '#557799' } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'Secret Person' } } }).toBuffer();
    const r = await submit({ voiceNote: voice(), files: [file('image/jpeg', b64url('image/jpeg', jpg), 'road.jpeg', jpg.length), file('application/pdf', b64url('application/pdf', pdf), 'application.pdf', pdf.length)] });
    expect(r.status).toBe(201);
    const doc = await raw(r.body.trackingId);
    const [img, doc2] = doc!.files;
    expect(img).toMatchObject({ name: 'road.webp', mimeType: 'image/webp' });
    expect(img.data).toMatch(/^data:image\/webp;base64,/);
    const out = Buffer.from(img.data.split(',')[1], 'base64');
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(['webp', 1600, 900, undefined]);
    expect(img.size).toBe(out.length);
    expect(doc2).toEqual({ name: 'application.pdf', mimeType: 'application/pdf', size: pdf.length, data: b64url('application/pdf', pdf) });
    expect(doc!.voiceNote).toEqual({ audioData: b64url('audio/webm', webm), durationSec: 12 }); // codec parameter dropped
    // Firefox records Ogg with a space in the type parameter
    expect((await submit({ voiceNote: voice(`data:audio/ogg; codecs=opus;base64,${ogg.toString('base64')}`) })).status).toBe(201);
  });

  // BUG-2026-028: the total is capped well below MongoDB's 16 MB document limit, with a Bangla field error (never a 500)
  it('a submission whose attachments together exceed the cap gets 400 with a Bangla field error (BUG-2026-028)', async () => {
    const big = Buffer.concat([pdf, Buffer.alloc(4_900_000, 0x20)]); // 2 x 6.5 MB of base64 > the 12 MB cap, still < the 13 MB body limit
    const r = await submit({ files: [file('application/pdf', b64url('application/pdf', big), 'a.pdf', big.length), file('application/pdf', b64url('application/pdf', big), 'b.pdf', big.length)] });
    expect(r.status).toBe(400);
    expect(r.body.error.details.fieldErrors.files[0]).toMatch(/সব ছবি, PDF ও ভয়েস মিলিয়ে/);
    expect((await submit({ voiceNote: { ...voice(), durationSec: 181 } })).status).toBe(400); // same 3-minute limit as the form
  });

  // BUG-2026-029: the inbox and the export never carry payloads; the detail view does
  it('list and CSV export carry only attachment metadata; the detail view carries the payloads (BUG-2026-029)', async () => {
    const r = await submit({ voiceNote: voice(), files: [file('application/pdf', b64url('application/pdf', pdf), 'application.pdf', pdf.length)] });
    await submit();
    const l = await list(t.owner);
    expect(JSON.stringify(l.body)).not.toMatch(/base64|audioData/);
    const item = l.body.items.find((c: { trackingId: string }) => c.trackingId === r.body.trackingId);
    expect(item).toMatchObject({ hasVoice: true, voiceSec: 12, fileCount: 1, fileMeta: [{ name: 'application.pdf', mimeType: 'application/pdf', size: pdf.length }] });
    expect(l.body.items.find((c: { trackingId: string }) => c.trackingId !== r.body.trackingId)).toMatchObject({ hasVoice: false, fileCount: 0 });
    const d = await get(t.owner, item.id);
    expect(d.body.voiceNote.audioData).toBe(b64url('audio/webm', webm));
    expect(d.body.files[0].data).toBe(b64url('application/pdf', pdf));
    expect(JSON.stringify((await patch(t.owner, item.id, { status: 'verify' })).body)).not.toContain('base64');
    expect((await api(env).get(admin(t, '/complaints/export.csv')).set(bearer(t.owner))).text).not.toMatch(/base64|audio/);
  });

  // BUG-2026-030: a voice-only complaint keeps an empty description; a model validation error is a 400, not a 500
  it('voice-only complaint stores an empty description; Mongoose validation errors map to 400 (BUG-2026-030)', async () => {
    const r = await submit({ description: '', voiceNote: voice() });
    expect(r.status).toBe(201);
    expect((await raw(r.body.trackingId))!.description).toBe('');
    expect((await get(t.owner, await idOf(r.body.trackingId))).body).toMatchObject({ description: '', hasVoice: true });
    const spy = vi.spyOn(Complaint, 'create').mockRejectedValueOnce(new mongoose.Error.ValidationError() as never);
    const bad = await submit();
    spy.mockRestore();
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });

  // BUG-2026-031: only the public complaint route reads a large body, and only after host resolution and a per-IP limit
  it('the large body limit applies to the public complaint route only, after host resolution and a rate limit (BUG-2026-031)', async () => {
    const pad = 'x'.repeat(1_200_000); // > the 1 MB default, < the complaint limit
    expect((await api(env).post(admin(t, '/complaints')).send({ pad })).status).toBe(413); // admin route: default limit, before auth
    expect((await api(env).post('/api/v1/public/otp/send').set('Host', t.host).send({ pad })).status).toBe(413);
    expect((await api(env).post('/api/v1/auth/login').send({ pad })).status).toBe(413);
    expect((await submit({ pad }, 'unknown.example')).status).toBe(404); // unknown site: refused before the body is parsed
    expect((await submit({ pad })).status).toBe(400); // parsed (strict schema refuses the extra key), not 413
    await fresh('rlbody', true);
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await api(env).post('/api/v1/public/complaints').set('Host', t.host).send({ junk: i })).status);
    expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true);
    expect(codes[10]).toBe(429); // the pre-parse limit counts even requests the schema rejects
  });

  // BUG-2026-032: retention removes voice and files too, anonymous or not
  it('retention job removes voice notes and attachments, including on anonymous (staff-entered) complaints (BUG-2026-032)', async () => {
    const att = { voiceNote: voice(), files: [file('application/pdf', b64url('application/pdf', pdf), 'a.pdf', pdf.length)] };
    const named = await assigned(att);
    const anon = (await staffSubmit({ ...att, anonymous: true, name: '', phone: '' })).body.trackingId;
    const anonId = await idOf(anon);
    for (const id of [named.id, anonId]) for (const s of ['verify', 'progress', 'solved', 'closed']) await patch(t.owner, id, { status: s });
    env.clock.now += 13 * 30 * 86400_000;
    expect(await env.services.complaints.purgeExpiredPii()).toBe(1); // identity purges (the anonymous one has none)
    for (const tid of [named.trackingId, anon]) {
      const doc = await raw(tid);
      expect(doc!.voiceNote).toBeUndefined();
      expect(doc!.files ?? []).toEqual([]);
      expect(doc!.category).toBeTruthy(); // the record stays for statistics
    }
    expect(await env.services.complaints.purgeExpiredPii()).toBe(0);
  });

  // BUG-2026-033: who may change status is decided by the API and exposed to the UI; a note needs no assignment
  it('detail tells the UI who may change status; an unassigned in-scope officer can still add a note (BUG-2026-033)', async () => {
    const id = await idOf((await submit()).body.trackingId);
    expect((await get(t.officer, id)).body.canUpdate).toBe(false);
    expect((await get(t.owner, id)).body.canUpdate).toBe(true);
    expect((await patch(t.officer, id, { note: 'নোট' + ' দিলাম' })).status).toBe(403);
    expect((await api(env).post(admin(t, `/complaints/${id}/notes`)).set(bearer(t.officer)).send({ text: 'সরেজমিনে দেখব' })).status).toBe(201);
    await patch(t.owner, id, { assignedTo: t.officerId });
    expect((await get(t.officer, id)).body.canUpdate).toBe(true);
  });
});
