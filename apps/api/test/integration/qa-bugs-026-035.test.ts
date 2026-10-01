import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { makeEnv, makeSuperAdmin, makeTenant, loginFlow, api, admin, bearer, PASSWORD, type TestEnv, type Tenant } from '../helpers/env.js';
import { AuditLog, Complaint, Membership, User } from '../../src/models/index.js';
import { COMPLAINT_MAX_TOTAL_B64 } from '@jonoprotinidhi/shared';

/* Independent QA verification of BUG-2026-026 .. 035 (written by QA, not by the implementer). Black-box through HTTP,
   plus direct DB reads for "what was really stored". */

let env: TestEnv, sa: string, t: Tenant;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  env = makeEnv();
  sa = await makeSuperAdmin(env);
  t = await makeTenant(env, sa, 'ndp3', { officerUpazilas: ['চরকান্দি'] });
});

const b64url = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('voice-bytes')]);
const file = (mimeType: string, data: string, name = 'proof.bin', size = 100) => ({ name, mimeType, size, data });
const voice = (audioData: string, durationSec = 12) => ({ audioData, durationSec });
const body = (o: Record<string, unknown> = {}) => ({
  category: 'রাস্তা-ঘাট ও সেতু', upazila: 'চরকান্দি', union: 'কাশবন', place: 'বাজারের সামনে', description: 'বাজারের সামনের রাস্তায় বড় গর্ত হয়েছে, রিকশা উল্টে যাচ্ছে।',
  anonymous: false, name: 'আব্দুর রহিম', phone: '01712345678', turnstileToken: 'ok', ...o,
});
const submit = (o: Record<string, unknown> = {}, host = t.host) => api(env).post('/api/v1/public/complaints').set('Host', host).send(body(o));
const raw = (trackingId: string) => mongoose.connection.db!.collection('complaints').findOne({ trackingId });
const idOf = async (trackingId: string) => String((await raw(trackingId))!._id);
const get = (tok: string, id: string) => api(env).get(admin(t, `/complaints/${id}`)).set(bearer(tok));
const list = (tok: string, qs = '') => api(env).get(admin(t, `/complaints${qs}`)).set(bearer(tok));
const patch = (tok: string, id: string, b: object) => api(env).patch(admin(t, `/complaints/${id}`)).set(bearer(tok)).send(b);
const count = () => mongoose.connection.db!.collection('complaints').countDocuments({});

/* ============================== 026 ============================== */
describe('QA BUG-2026-026: invite never touches an existing account', () => {
  const userRaw = (phone: string) => User.findOne({ phone: `+88${phone}` }).select('+passwordHash').lean();
  const inviteTo = (tt: Tenant, o: Record<string, unknown>) => api(env).post(admin(tt, '/team/invites')).set(bearer(tt.owner)).send(o);

  it('every phone spelling of an existing user is refused with ACCOUNT_EXISTS and nothing changes (BUG-2026-026)', async () => {
    const t2 = await makeTenant(env, sa, 'sbp1');
    const before = await userRaw(t.phones.editor);
    const m0 = await Membership.countDocuments({});
    const sms0 = env.sms.outbox.length;
    for (const phone of [t.phones.editor, `+88${t.phones.editor}`, `88${t.phones.editor}`]) {
      const r = await inviteTo(t2, { name: 'আক্রমণকারী', phone, role: 'editor', password: 'Hijack-pass-123' });
      expect([r.status, r.body.error?.code], phone).toEqual([409, 'ACCOUNT_EXISTS']);
    }
    const after = await userRaw(t.phones.editor);
    expect(after!.passwordHash).toBe(before!.passwordHash);
    expect(after!.status).toBe(before!.status);
    expect(String(after!.updatedAt)).toBe(String(before!.updatedAt)); // not even touched
    expect(await Membership.countDocuments({})).toBe(m0);
    expect(env.sms.outbox.length).toBe(sms0);
    const dup = await inviteTo(t, { name: 'আক্রমণকারী', phone: t.phones.editor, role: 'editor', password: 'Hijack-pass-123' });
    expect([dup.status, dup.body.error.code]).toEqual([409, 'ALREADY_MEMBER']);
    expect((await userRaw(t.phones.editor))!.passwordHash).toBe(before!.passwordHash);
    await expect(loginFlow(env, `+88${t.phones.editor}`, 'Hijack-pass-123')).rejects.toThrow(/401/);
  });

  it('victim in state "invited" (no password yet) or "disabled": still 409, status and hash untouched (BUG-2026-026)', async () => {
    const t2 = await makeTenant(env, sa, 'sbp1');
    // invited, never accepted: another tenant invites a brand-new phone without a password
    const inv = await inviteTo(t, { name: 'অপেক্ষমাণ', phone: '01755550001', role: 'editor' });
    expect(inv.status).toBe(201);
    let u = await userRaw('01755550001');
    expect([u!.status, u!.passwordHash]).toEqual(['invited', undefined]);
    const r = await inviteTo(t2, { name: 'আক্রমণকারী', phone: '01755550001', role: 'editor', password: 'Hijack-pass-123' });
    expect([r.status, r.body.error.code]).toEqual([409, 'ACCOUNT_EXISTS']);
    u = await userRaw('01755550001');
    expect([u!.status, u!.passwordHash]).toEqual(['invited', undefined]);
    // disabled platform account
    await User.updateOne({ phone: `+88${t.phones.editor}` }, { $set: { status: 'disabled' } });
    const h0 = (await userRaw(t.phones.editor))!.passwordHash;
    const r2 = await inviteTo(t2, { name: 'আক্রমণকারী', phone: t.phones.editor, role: 'editor', password: 'Hijack-pass-123' });
    expect([r2.status, r2.body.error.code]).toEqual([409, 'ACCOUNT_EXISTS']);
    const d = await userRaw(t.phones.editor);
    expect([d!.status, d!.passwordHash]).toEqual(['disabled', h0]);
  });

  it('a platform super admin with a phone number cannot be taken over either (BUG-2026-026)', async () => {
    await env.services.auth.createUser({ name: 'Second Root', email: 'root2@octagram.test', phone: '01766660001', password: PASSWORD, platformRole: 'super_admin' });
    const before = await userRaw('01766660001');
    const r = await inviteTo(t, { name: 'আক্রমণকারী', phone: '01766660001', role: 'editor', password: 'Hijack-pass-123' });
    expect([r.status, r.body.error.code]).toEqual([409, 'ACCOUNT_EXISTS']);
    const after = await userRaw('01766660001');
    expect([after!.passwordHash, after!.status, after!.platformRole]).toEqual([before!.passwordHash, 'active', 'super_admin']);
  });

  it('existing phone WITHOUT a password still works (membership invite, SMS) and leaves the password alone; a removed member can be re-invited (BUG-2026-026)', async () => {
    const t2 = await makeTenant(env, sa, 'sbp1');
    const before = (await userRaw(t.phones.editor))!.passwordHash;
    const sms0 = env.sms.outbox.length;
    const r = await inviteTo(t2, { name: 'আক্রমণকারী', phone: t.phones.editor, role: 'editor' });
    expect(r.status).toBe(201);
    expect(env.sms.outbox.length).toBe(sms0 + 1);
    expect((await userRaw(t.phones.editor))!.passwordHash).toBe(before);
    expect((await Membership.findById(r.body.id).lean())!.status).toBe('invited');
    // same tenant: remove then re-invite without a password; with a password -> ACCOUNT_EXISTS
    const m = await Membership.findById(r.body.id).lean();
    expect((await api(env).delete(admin(t2, `/team/${m!._id}`)).set(bearer(t2.owner))).status).toBeLessThan(300);
    const again = await inviteTo(t2, { name: 'আক্রমণকারী', phone: t.phones.editor, role: 'editor' });
    expect(again.status).toBe(201);
    expect(again.body.id).toBe(r.body.id);
  });

  it('two tenants racing to create the same NEW phone with different passwords: exactly one wins, the loser cannot log in (BUG-2026-026)', async () => {
    const t2 = await makeTenant(env, sa, 'sbp1');
    const rs = await Promise.all([
      inviteTo(t, { name: 'রেসার এ', phone: '01788880001', role: 'editor', password: 'Racer-A-pass-111' }),
      inviteTo(t2, { name: 'রেসার বি', phone: '01788880001', role: 'editor', password: 'Racer-B-pass-222' }),
    ]);
    const codes = rs.map((r) => r.status).sort();
    expect(codes[0]).toBe(201);
    expect(codes[1]).toBe(409);
    expect(await User.countDocuments({ phone: '+8801788880001' })).toBe(1);
    const winnerPass = rs[0]!.status === 201 ? 'Racer-A-pass-111' : 'Racer-B-pass-222';
    const loserPass = rs[0]!.status === 201 ? 'Racer-B-pass-222' : 'Racer-A-pass-111';
    await expect(loginFlow(env, '+8801788880001', loserPass)).rejects.toThrow(/401/);
    expect((await loginFlow(env, '+8801788880001', winnerPass)).token).toBeTruthy();
  });

  it('no audit row anywhere carries a hash or a password; weak password rejected (BUG-2026-026)', async () => {
    const r = await inviteTo(t, { name: 'ফ্রেশ', phone: '01799990001', role: 'editor', password: 'Brand-new-pass-9' });
    expect(r.status).toBe(201);
    const all = JSON.stringify(await AuditLog.find({}).lean());
    expect(all).not.toMatch(/argon|passwordHash|Brand-new-pass-9/i);
    expect((await inviteTo(t, { name: 'ফ্রেশ', phone: '01799990002', role: 'editor', password: 'short' })).status).toBe(400);
    expect(await User.countDocuments({ phone: '+8801799990002' })).toBe(0);
  });
});

/* QA FINDING (residual variant of 026, outside what the fix claims): with NODE_ENV != production the invite response
   carries the invite token, and acceptInvite() writes passwordHash + status onto whichever User owns the membership.
   So an owner of tenant B can invite a victim's phone WITHOUT a password, read the token from the response, accept it with
   a password of their choosing and the victim's password is replaced. In production the token only goes by SMS to the
   victim, so this needs a non-production deployment or a leaked token. `it.fails` documents it: it passes while the hole
   exists and starts failing (remove `.fails`) once acceptInvite stops overwriting an existing active account. */
describe('QA finding: acceptInvite can still overwrite an existing active account when the token is exposed (non-prod)', () => {
  it.fails('invite-without-password + accept must not change the password of an already active account (BUG-2026-026 variant)', async () => {
    const t2 = await makeTenant(env, sa, 'sbp1');
    const victim = `+88${t.phones.editor}`;
    const h0 = (await User.findOne({ phone: victim }).select('+passwordHash').lean())!.passwordHash;
    const inv = await api(env).post(admin(t2, '/team/invites')).set(bearer(t2.owner)).send({ name: 'আক্রমণকারী', phone: t.phones.editor, role: 'editor' });
    expect(inv.status).toBe(201);
    expect(inv.body.inviteToken).toBeTruthy(); // exposed outside production
    const acc = await api(env).post(`/api/v1/auth/invites/${inv.body.inviteToken}/accept`).send({ password: 'Attacker-chosen-pass-1' });
    expect(acc.status).toBeGreaterThanOrEqual(400); // desired: refused (or at least the old password stays valid)
    const h1 = (await User.findOne({ phone: victim }).select('+passwordHash').lean())!.passwordHash;
    expect(h1).toBe(h0);
  });
});

/* ============================== 027 ============================== */
describe('QA BUG-2026-027: attachments are decoded, checked and rebuilt', () => {
  const html = Buffer.from('<script>alert(document.cookie)</script>');
  it('rejects every hostile / malformed attachment, never a 500, never stores a row (BUG-2026-027)', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    const cases: Array<[string, Record<string, unknown>]> = [
      ['javascript: url', { files: [file('application/pdf', 'javascript:alert(1)')] }],
      ['vbscript/plain text', { files: [file('image/png', 'vbscript:msgbox(1)')] }],
      ['data:text/html declared pdf', { files: [file('application/pdf', b64url('text/html', html))] }],
      ['data:text/html declared png', { files: [file('image/png', b64url('text/html', html))] }],
      ['svg declared as png (data header svg)', { files: [file('image/png', b64url('image/svg+xml', Buffer.from('<svg onload=alert(1)/>')))] }],
      ['svg bytes, png header', { files: [file('image/png', b64url('image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')))] }],
      ['png declared, PDF bytes', { files: [file('image/png', b64url('image/png', pdf))] }],
      ['pdf declared, PNG bytes', { files: [file('application/pdf', b64url('application/pdf', png))] }],
      ['header png, declared jpeg (mismatch)', { files: [file('image/jpeg', b64url('image/png', png))] }],
      ['not base64 chars', { files: [file('image/png', 'data:image/png;base64,@@@@')] }],
      ['base64 with embedded newline', { files: [file('application/pdf', `data:application/pdf;base64,${pdf.toString('base64').slice(0, 8)}\n${pdf.toString('base64').slice(8)}`)] }],
      ['base64 length not multiple of 4', { files: [file('application/pdf', 'data:application/pdf;base64,JVBERi0xLjQ')] }],
      ['second comma smuggling', { files: [file('application/pdf', `${b64url('application/pdf', pdf)},<script>`)] }],
      ['not even a data url, but plausible', { files: [file('application/pdf', 'https://evil.example/x.pdf')] }],
      ['empty payload', { files: [file('application/pdf', 'data:application/pdf;base64,')] }],
      ['svg mimeType declared', { files: [file('image/svg+xml', b64url('image/svg+xml', Buffer.from('<svg/>')))] }],
      ['html mimeType declared', { files: [file('text/html', b64url('text/html', html))] }],
      ['gif (refused format)', { files: [file('image/png', b64url('image/png', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1')))] }],
      ['garbage png bytes with PNG magic only', { files: [file('image/png', b64url('image/png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('garbage-garbage')])))] }],
      ['audio: text/html data url', { voiceNote: voice(b64url('text/html', html)) }],
      ['audio: webm declared, HTML bytes', { voiceNote: voice(b64url('audio/webm', html)) }],
      ['audio: webm declared, ogg bytes', { voiceNote: voice(b64url('audio/webm', Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]))) }],
      ['audio: ogg declared, webm bytes', { voiceNote: voice(b64url('audio/ogg', webm)) }],
      ['audio: wav with RIFF but not WAVE', { voiceNote: voice(b64url('audio/wav', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI '), Buffer.alloc(8)]))) }],
      ['audio: mp3 with random bytes', { voiceNote: voice(b64url('audio/mpeg', Buffer.from('hello world, definitely not mp3'))) }],
      ['audio: video/webm type', { voiceNote: voice(b64url('video/webm', webm)) }],
      ['audio: svg', { voiceNote: voice(b64url('image/svg+xml', Buffer.from('<svg/>'))) }],
      ['audio: javascript:', { voiceNote: voice('javascript:alert(1)') }],
      ['audio: empty bytes', { voiceNote: voice('data:audio/webm;base64,') }],
    ];
    for (const [name, o] of cases) {
      const r = await submit(o);
      expect([name, r.status >= 400 && r.status < 500, r.status === 500]).toEqual([name, true, false]);
    }
    expect(await count()).toBe(0);
    // codes used: 400 for shape failures (schema), 422 for content failures (API checks)
    expect((await submit({ files: [file('application/pdf', 'javascript:alert(1)')] })).status).toBe(400);
    expect((await submit({ files: [file('image/png', b64url('image/png', pdf))] })).status).toBe(422);
  });

  it('a valid JPEG with EXIF GPS is stored as WebP: no EXIF/GPS/XMP/IPTC bytes remain, orientation applied, trailing script payload gone (BUG-2026-027)', async () => {
    const sharp = (await import('sharp')).default;
    const jpg0 = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#335577' } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '23/1 45/1 12/1', GPSLongitudeRef: 'E', GPSLongitude: '90/1 24/1 30/1' }, IFD0: { Artist: 'Secret Person', Copyright: 'SecretCopyright' } } })
      .toBuffer();
    expect((await sharp(jpg0).metadata()).exif).toBeTruthy(); // sanity: the fixture really has EXIF
    const jpg = Buffer.concat([jpg0, Buffer.from('<script>alert(1)</script>GPSLatitude')]); // polyglot: valid JPEG + trailing HTML
    const r = await submit({ files: [file('image/jpeg', b64url('image/jpeg', jpg), 'photo.jpg', jpg.length)] });
    expect(r.status).toBe(201);
    const doc = await raw(r.body.trackingId);
    const stored = doc!.files[0];
    expect(stored).toMatchObject({ name: 'photo.webp', mimeType: 'image/webp' });
    const out = Buffer.from(stored.data.split(',')[1], 'base64');
    const m = await sharp(out).metadata();
    expect([m.format, m.exif, m.xmp, m.iptc]).toEqual(['webp', undefined, undefined, undefined]);
    // orientation 6 = rotate 90deg: 2400x1200 becomes portrait, capped at 1600 on the long edge -> 800x1600
    expect([m.width, m.height]).toEqual([800, 1600]);
    const text = out.toString('latin1');
    for (const needle of ['GPSLatitude', 'SecretCopyright', 'Secret Person', '<script', 'Exif']) expect(text).not.toContain(needle);
    expect(stored.size).toBe(out.length);
  });

  it('PDF and voice bytes are stored under their checked type only; a PDF/HTML polyglot can never be stored as text/html (BUG-2026-027)', async () => {
    const poly = Buffer.from('%PDF-1.4\n<html><script>alert(1)</script></html>\n%%EOF');
    const r = await submit({ files: [file('application/pdf', b64url('application/pdf', poly), 'p.pdf', poly.length)], voiceNote: voice('data:audio/webm;codecs=opus;base64,' + webm.toString('base64')) });
    expect(r.status).toBe(201);
    const doc = await raw(r.body.trackingId);
    expect(doc!.files[0].data.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(doc!.files[0].mimeType).toBe('application/pdf');
    expect(doc!.voiceNote.audioData.startsWith('data:audio/webm;base64,')).toBe(true);
  });

  it('a decompression-bomb-sized image (> 40 MP) is refused with 422, not a 500/timeout (BUG-2026-027)', async () => {
    const sharp = (await import('sharp')).default;
    const big = await sharp({ create: { width: 7000, height: 7000, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
    expect(big.length).toBeLessThan(4_000_000);
    const r = await submit({ files: [file('image/png', b64url('image/png', big), 'bomb.png', big.length)] });
    expect([r.status, r.body.error?.code]).toEqual([422, 'BAD_IMAGE']);
  });

  it('file names with markup are stored as plain strings (rendered as React text in the admin) (BUG-2026-027)', async () => {
    const r = await submit({ files: [file('application/pdf', b64url('application/pdf', pdf), '<img src=x onerror=alert(1)>.pdf', pdf.length)] });
    expect(r.status).toBe(201);
    const d = await get(t.owner, await idOf(r.body.trackingId));
    expect(d.body.files[0].name).toBe('<img src=x onerror=alert(1)>.pdf'); // stored verbatim; safe only because the admin never uses innerHTML
  });
});

/* ============================== 028 ============================== */
describe('QA BUG-2026-028: total-size cap', () => {
  // two PDFs whose data URLs together are EXACTLY the cap (12 MiB of characters)
  const pdfOfB64Len = (len: number) => { const bytes = (len / 4) * 3; return Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(bytes - 5, 0x20)]); };
  const prefix = 'data:application/pdf;base64,'.length;
  const half = (COMPLAINT_MAX_TOTAL_B64 - 2 * prefix) / 2; // base64 chars per file at the cap
  it('exactly at the cap stores fine (document far below 16 MB); one base64 quantum over -> 400 with the Bangla field message (BUG-2026-028)', async () => {
    expect(Number.isInteger(half / 4)).toBe(true);
    const a = pdfOfB64Len(half), b = pdfOfB64Len(half);
    const okR = await submit({ files: [file('application/pdf', b64url('application/pdf', a), 'a.pdf', a.length), file('application/pdf', b64url('application/pdf', b), 'b.pdf', b.length)] });
    expect(okR.status).toBe(201);
    const stored = await raw(okR.body.trackingId);
    expect(Buffer.byteLength(JSON.stringify(stored))).toBeLessThan(16 * 1024 * 1024);
    const c = pdfOfB64Len(half + 4);
    const over = await submit({ files: [file('application/pdf', b64url('application/pdf', a), 'a.pdf', a.length), file('application/pdf', b64url('application/pdf', c), 'c.pdf', c.length)] });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('VALIDATION_FAILED');
    expect(over.body.error.details.fieldErrors.files[0]).toMatch(/অনেক বড়/);
    expect(await count()).toBe(1);
  });
  it('voice at 180 s is accepted, 181 s / 0 / fractional rejected; voice+files over the cap rejected 400 (BUG-2026-028)', async () => {
    expect((await submit({ voiceNote: voice(b64url('audio/webm', webm), 180) })).status).toBe(201);
    for (const d of [181, 0, -5, 1.5, 300]) expect([d, (await submit({ voiceNote: voice(b64url('audio/webm', webm), d) })).status]).toEqual([d, 400]);
    const v = Buffer.concat([webm, Buffer.alloc(300_000)]); // ~0.4 MB voice: total = cap + 0.4 MB, body still < 13 MiB so the schema (not the body parser) answers
    const f = pdfOfB64Len(half);
    const r = await submit({ voiceNote: voice(b64url('audio/webm', v)), files: [file('application/pdf', b64url('application/pdf', f), 'a.pdf', f.length), file('application/pdf', b64url('application/pdf', f), 'b.pdf', f.length)] });
    expect(r.status).toBe(400);
    expect(r.body.error.details.fieldErrors.files[0]).toMatch(/অনেক বড়/);
  });
});

/* ============================== 029 ============================== */
describe('QA BUG-2026-029: list / export / patch never carry payloads', () => {
  it('every staff response except the detail view is payload-free, including filtered lists, patch and assign (BUG-2026-029)', async () => {
    const r = await submit({ voiceNote: voice(b64url('audio/webm', webm)), files: [file('application/pdf', b64url('application/pdf', pdf), 'a.pdf', pdf.length)] });
    const id = await idOf(r.body.trackingId);
    const need = (j: unknown) => expect(JSON.stringify(j)).not.toMatch(/base64|audioData|"data":/);
    for (const qs of ['', '?status=open', '?q=গর্ত', '?limit=100', '?page=1&limit=1']) need((await list(t.owner, qs)).body);
    need((await list(t.officer)).body);
    need((await patch(t.owner, id, { assignedTo: t.officerId })).body);
    need((await patch(t.officer, id, { status: 'verify' })).body);
    need((await patch(t.owner, id, { note: 'শুধু নোট' })).body);
    expect((await get(t.officer, id)).body.files[0].data).toContain('base64'); // detail still has it (assigned officer)
    expect((await get(t.owner, id)).body.voiceNote.audioData).toContain('base64');
    expect((await get(t.editor, id)).status).toBeLessThan(500);
  });

  // QA finding: the PATCH response drops voiceNote (Mongoose toObject minimizes the emptied sub-document) so hasVoice is false.
  // it.fails keeps the suite green while documenting the defect; when it is fixed this test starts failing: remove `.fails`.
  it.fails('a voice note without durationSec is still flagged hasVoice in list, detail AND patch responses (BUG-2026-029)', async () => {
    const r = await submit({ voiceNote: { audioData: b64url('audio/webm', webm) } }); // no durationSec
    const id = await idOf(r.body.trackingId);
    const l = (await list(t.owner)).body.items.find((c: { id: string }) => c.id === id);
    expect(l.hasVoice).toBe(true);
    expect((await get(t.owner, id)).body.hasVoice).toBe(true);
    const p = await patch(t.owner, id, { status: 'verify' });
    expect(p.body.hasVoice).toBe(true);
  });

  it('a complaint without attachments reports hasVoice:false / fileCount:0 everywhere (BUG-2026-029)', async () => {
    const r = await submit();
    const id = await idOf(r.body.trackingId);
    expect((await list(t.owner)).body.items[0]).toMatchObject({ hasVoice: false, fileCount: 0, fileMeta: [] });
    expect((await patch(t.owner, id, { status: 'verify' })).body).toMatchObject({ hasVoice: false, fileCount: 0 });
    expect((await get(t.owner, id)).body).toMatchObject({ voiceNote: null, files: [] });
  });

  it('CSV export has exactly the 8 documented columns and never selects payload fields (BUG-2026-029)', async () => {
    await submit({ voiceNote: voice(b64url('audio/webm', webm)), files: [file('application/pdf', b64url('application/pdf', pdf), 'a.pdf', pdf.length)] });
    const csv = (await api(env).get(admin(t, '/complaints/export.csv')).set(bearer(t.owner))).text;
    expect(csv.replace(/^\uFEFF/, '').split('\r\n')[0].replace(/"/g, '')).toBe('trackingId,createdAt,channel,category,upazila,union,status,daysToResolve');
    expect(csv).not.toMatch(/base64|audio|a\.pdf/);
  });
});

/* ============================== 030 ============================== */
describe('QA BUG-2026-030: voice-only complaint', () => {
  it('empty / whitespace description with voice -> 201 and stored ""; without voice -> 400; anonymous voice-only works (BUG-2026-030)', async () => {
    const v = voice(b64url('audio/webm', webm));
    for (const d of ['', '   ', '\n\t']) {
      const r = await submit({ description: d, voiceNote: v });
      expect([d, r.status]).toEqual([d, 201]);
      expect((await raw(r.body.trackingId))!.description).toBe('');
    }
    expect((await submit({ description: '', voiceNote: v, anonymous: true, name: '', phone: '' })).status).toBe(201);
    expect((await submit({ description: '' })).status).toBe(400);
    expect((await submit({ description: 'ছোট' })).status).toBe(400);
    const r = await submit({ description: '', voiceNote: v });
    const id = await idOf(r.body.trackingId);
    expect((await list(t.owner)).body.items.find((c: { id: string }) => c.id === id).description).toBe('');
    expect((await patch(t.owner, id, { status: 'verify' })).body.description).toBe('');
  });

  it('a Mongoose ValidationError becomes 400 VALIDATION_FAILED listing field names only, never values (BUG-2026-030)', async () => {
    const ve = new mongoose.Error.ValidationError();
    ve.addError('category', new mongoose.Error.ValidatorError({ path: 'category', message: 'LEAKED-MESSAGE', value: 'LEAKED-VALUE', type: 'required' }));
    const spy = vi.spyOn(Complaint, 'create').mockRejectedValueOnce(ve as never);
    const r = await submit();
    spy.mockRestore();
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect(r.body.error.details.fieldErrors).toHaveProperty('category');
    expect(JSON.stringify(r.body)).not.toMatch(/LEAKED/);
  });
});

/* ============================== 031 ============================== */
describe('QA BUG-2026-031: body limits', () => {
  const pad = (n: number) => 'x'.repeat(n);
  it('2 MB to non-complaint routes is a 413 before auth/host/db work; the public complaint route is the only large one (BUG-2026-031)', async () => {
    const big = { pad: pad(2 * 1024 * 1024) };
    expect((await api(env).post('/api/v1/auth/login').send(big)).status).toBe(413);
    expect((await api(env).post('/api/v1/auth/refresh').send(big)).status).toBe(413);
    expect((await api(env).post(admin(t, '/complaints')).send(big)).status).toBe(413);
    expect((await api(env).post(admin(t, '/complaints')).set(bearer(t.owner)).send(big)).status).toBe(413); // staff route keeps 1 MB even when authenticated
    expect((await api(env).post('/api/v1/public/otp/verify').set('Host', t.host).send(big)).status).toBe(413);
    expect((await api(env).post('/api/v1/public/complaints/').set('Host', t.host).send(big)).status).toBe(413); // trailing slash is NOT the big route
    expect((await api(env).post('/api/v1/public/Complaints').set('Host', t.host).send(big)).status).toBe(413); // nor is a case variant
    expect((await api(env).post('/api/v1/super/tenants').send(big)).status).toBe(413);
    expect((await api(env).post('/api/v1/nonexistent').send(big)).status).toBe(413);
    // the real route: parsed up to 13 MiB (schema then says 400), over 13 MiB -> 413, unknown host -> 404 w/o parsing
    expect((await api(env).post('/api/v1/public/complaints').set('Host', t.host).send({ pad: pad(12.9 * 1024 * 1024) })).status).toBe(400);
    expect((await api(env).post('/api/v1/public/complaints').set('Host', t.host).send({ pad: pad(13.2 * 1024 * 1024) })).status).toBe(413);
    expect((await api(env).post('/api/v1/public/complaints').set('Host', 'nosuch.example').send(big)).status).toBe(404);
  });
  it('malformed bodies on the big route are 4xx, not 500 (BUG-2026-031)', async () => {
    const post = () => api(env).post('/api/v1/public/complaints').set('Host', t.host);
    expect((await post().set('Content-Type', 'application/json').send('{"broken')).status).toBe(400);
    expect((await post().set('Content-Type', 'text/plain').send('hello')).status).toBe(400);
    expect((await post().send()).status).toBe(400);
    expect((await post().send([1, 2, 3])).status).toBe(400);
    expect((await post().send({ $where: 'sleep(1000)', category: { $ne: 1 } })).status).toBe(400);
  });
});

/* ============================== 032 ============================== */
describe('QA BUG-2026-032: retention purges attachments, but only the expired ones', () => {
  const att = () => ({ voiceNote: voice(b64url('audio/webm', webm)), files: [file('application/pdf', b64url('application/pdf', pdf), 'a.pdf', pdf.length)] });
  const close = async (id: string) => { for (const s of ['verify', 'progress', 'solved', 'closed']) expect((await patch(t.owner, id, { status: s })).status).toBe(200); };
  it('expired complaints lose voice/files; unexpired, never-closed and other-tenant complaints keep theirs (BUG-2026-032)', async () => {
    const expired = (await submit(att())).body.trackingId;
    const expiredAnon = (await submit({ ...att(), anonymous: true, name: '', phone: '' })).body.trackingId;
    await close(await idOf(expired)); await close(await idOf(expiredAnon));
    env.clock.now += 13 * 30 * 86400_000; // past the retention of the first two
    const lateClosed = (await submit(att())).body.trackingId; // closed AFTER the clock jump: not expired
    await close(await idOf(lateClosed));
    const open = (await submit(att())).body.trackingId; // never closed: no retentionUntil
    const t2 = await makeTenant(env, sa, 'sbp1');
    const other = (await submit(att(), t2.host)).body.trackingId; // other tenant, open
    expect(await env.services.complaints.purgeExpiredPii()).toBe(1);
    for (const tid of [expired, expiredAnon]) { const d = await raw(tid); expect([tid, d!.voiceNote, d!.files ?? []]).toEqual([tid, undefined, []]); }
    for (const tid of [lateClosed, open, other]) { const d = await raw(tid); expect([tid, !!d!.voiceNote?.audioData, d!.files.length]).toEqual([tid, true, 1]); }
    const e = await raw(expired);
    expect(e!.piiPurgedAt).toBeTruthy();
    expect((await raw(expiredAnon))!.piiPurgedAt).toBeUndefined();
    const row = await AuditLog.findOne({ action: 'complaint.pii_purge' }).sort({ _id: -1 }).lean();
    expect(JSON.stringify(row)).toMatch(/records/);
    expect(JSON.stringify(row)).not.toMatch(/base64|audioData/);
  });
  it('OBSERVATION: a spam/solved-but-never-closed complaint gets no retentionUntil, so its attachments are never purged', async () => {
    const tid = (await submit(att())).body.trackingId;
    expect((await patch(t.owner, await idOf(tid), { status: 'spam' })).status).toBe(200);
    env.clock.now += 10 * 365 * 86400_000;
    await env.services.complaints.purgeExpiredPii();
    const d = await raw(tid);
    // documents current behaviour (not part of the 032 fix claim): spam complaints keep voice and files indefinitely
    expect([!!d!.voiceNote?.audioData, d!.files.length, d!.retentionUntil]).toEqual([true, 1, undefined]);
  });
});

/* ============================== 033 ============================== */
describe('QA BUG-2026-033: canUpdate matches what PATCH really allows', () => {
  it('canUpdate == (PATCH is permitted) for owner, editor, unassigned officer, assigned officer, out-of-scope officer; note path works for in-scope only (BUG-2026-033)', async () => {
    const id = await idOf((await submit()).body.trackingId);
    const probe = async (tok: string) => {
      const d = await get(tok, id);
      if (d.status !== 200) return { detail: d.status };
      const p = await patch(tok, id, { note: 'যাচাই নোট' });
      return { canUpdate: d.body.canUpdate, patchOk: p.status === 200 };
    };
    expect(await probe(t.owner)).toEqual({ canUpdate: true, patchOk: true });
    expect(await probe(t.officer)).toEqual({ canUpdate: false, patchOk: false });
    expect((await api(env).post(admin(t, `/complaints/${id}/notes`)).set(bearer(t.officer)).send({ text: 'সরেজমিনে দেখব' })).status).toBe(201);
    expect((await patch(t.owner, id, { assignedTo: t.officerId })).status).toBe(200);
    expect(await probe(t.officer)).toEqual({ canUpdate: true, patchOk: true });
    // an officer of another upazila cannot see the complaint at all and cannot note it
    const other = await makeTenant(env, sa, 'sbp1', { officerUpazilas: ['অন্য উপজেলা'] });
    expect((await get(other.officer, id)).status).toBe(404);
    // same tenant, different upazila officer
    const inv = await api(env).post(admin(t, '/team/invites')).set(bearer(t.owner)).send({ name: 'অন্য', phone: '01733330001', role: 'officer', upazilas: ['শালবাগান'], password: 'Other-officer-pass-1' });
    expect(inv.status).toBe(201);
    const tok = (await loginFlow(env, '+8801733330001', 'Other-officer-pass-1')).token;
    expect((await get(tok, id)).status).toBe(404);
    expect((await api(env).post(admin(t, `/complaints/${id}/notes`)).set(bearer(tok)).send({ text: 'আমার এলাকা নয়' })).status).toBe(404);
    // editor has no complaint permissions
    expect((await get(t.editor, id)).status).toBe(403);
  });
});

/* ============================== 035 ============================== */
describe('QA BUG-2026-035: test server isolation', () => {
  it('the server answers on 127.0.0.1 and requests are served by Express (request-id + helmet headers) (BUG-2026-035)', async () => {
    const addr = env.app.address() as { address: string; port: number };
    expect(addr.address).toBe('127.0.0.1');
    const r = await api(env).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.headers['x-request-id']).toBeTruthy();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});
