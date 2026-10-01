import { describe, it, expect } from 'vitest';
import {
  toBn, toEn, groupIndian, formatBn, bnDate, normalizeBdPhone, isValidBdMobile, toE164Bd, smsSegments,
  hasPermission, hasAnyPermission, permissionsFor, ROLE_PERMS, PERMS,
  nextPostStatus, availablePostActions, canComplaintTransition, postTransitions, complaintTransitions, POST_STATUSES, COMPLAINT_STATUSES,
  promiseInputSchema, complaintSubmitSchema, postInputSchema, postPatchSchema, postDraftSchema, tenantCreateSchema, passwordSchema, inviteSchema, mfaCodeSchema, loginSchema, siteConfigSchema,
  COMPLAINT_MAX_TOTAL_B64, COMPLAINT_MAX_VOICE_SEC,
} from '../src/index.js';

describe('Bangla digits, grouping and dates', () => {
  it('converts digits both ways and leaves other text alone', () => {
    expect(toBn('২০২৬ সালে 42 জন')).toBe('২০২৬ সালে ৪২ জন');
    expect(toBn(1234)).toBe('১২৩৪');
    expect(toEn('০১৭১২৩৪৫৬৭৮')).toBe('01712345678');
    expect(toEn(toBn('0123456789'))).toBe('0123456789');
  });
  it('groups the South-Asian way', () => {
    expect(groupIndian(0)).toBe('0'); expect(groupIndian(999)).toBe('999'); expect(groupIndian(1000)).toBe('1,000');
    expect(groupIndian(743760)).toBe('7,43,760'); expect(groupIndian(51567300)).toBe('5,15,67,300'); expect(groupIndian(-12345)).toBe('-12,345');
    expect(formatBn(515673)).toBe('৫,১৫,৬৭৩');
  });
  it('renders dates in Asia/Dhaka (UTC+6), including across midnight', () => {
    expect(bnDate('2026-09-27T10:00:00Z')).toBe('২৭ সেপ্টেম্বর ২০২৬');
    expect(bnDate('2026-09-27T19:00:00Z')).toBe('২৮ সেপ্টেম্বর ২০২৬'); // 01:00 next day in Dhaka
    expect(bnDate('garbage')).toBe('');
  });
});

describe('Bangladeshi mobile numbers', () => {
  it('normalises every common spelling', () => {
    for (const v of ['01712345678', '+8801712345678', '8801712345678', '01712-345678', '০১৭১২৩৪৫৬৭৮', ' 0171 234 5678 ', '1712345678']) expect(normalizeBdPhone(v)).toBe('01712345678');
  });
  it('validates operator prefixes 013-019 and length', () => {
    for (const ok of ['01312345678', '01412345678', '01512345678', '01612345678', '01712345678', '01812345678', '01912345678']) expect(isValidBdMobile(ok)).toBe(true);
    for (const bad of ['01212345678', '01012345678', '0171234567', '017123456789', '02123456789', '', 'abc', '+44712345678']) expect(isValidBdMobile(bad)).toBe(false);
  });
  it('builds the E.164 login id', () => { expect(toE164Bd('01712345678')).toBe('+8801712345678'); expect(toE164Bd('+8801712345678')).toBe('+8801712345678'); });
});

describe('SMS segments', () => {
  it('counts Unicode (Bangla) at 70/67 and GSM-7 at 160/153', () => {
    expect(smsSegments('')).toBe(0);
    expect(smsSegments('ক'.repeat(70))).toBe(1); expect(smsSegments('ক'.repeat(71))).toBe(2); expect(smsSegments('ক'.repeat(134))).toBe(2); expect(smsSegments('ক'.repeat(135))).toBe(3);
    expect(smsSegments('a'.repeat(160))).toBe(1); expect(smsSegments('a'.repeat(161))).toBe(2);
  });
});

describe('permissions', () => {
  it('nobody but an officer has complaint PII permission, and it is not grantable', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMS)) expect(perms.includes('complaints.pii_view'), role).toBe(role === 'officer');
    expect(permissionsFor('editor', ['complaints.pii_view', 'posts.publish'])).not.toContain('complaints.pii_view');
    expect(permissionsFor('editor', ['posts.publish'])).toContain('posts.publish');
    expect(permissionsFor('editor', ['not.a.perm' as never])).toEqual([...ROLE_PERMS.editor]);
  });
  it('editors cannot publish; owners can; support is read-only', () => {
    expect(hasPermission(ROLE_PERMS.editor, 'posts.publish')).toBe(false);
    expect(hasPermission(ROLE_PERMS.owner, 'posts.publish')).toBe(true);
    for (const p of PERMS.filter((x) => /\.(create|edit|edit_any|publish|delete|manage|upload|export)$/.test(x))) expect(hasPermission(ROLE_PERMS.support, p), p).toBe(false);
  });
  it('wildcard and OR semantics', () => {
    expect(hasPermission(['*'], 'audit.view')).toBe(true);
    expect(hasAnyPermission(['posts.view'], ['posts.publish', 'posts.view'])).toBe(true);
    expect(hasAnyPermission([], ['posts.view'])).toBe(false);
  });
});

describe('workflows', () => {
  it('post: only legal moves exist and every status is reachable', () => {
    expect(nextPostStatus('draft', 'submit')).toBe('review'); expect(nextPostStatus('review', 'approve')).toBe('published');
    expect(nextPostStatus('published', 'edit')).toBe('review'); expect(nextPostStatus('published', 'approve')).toBeNull();
    expect(nextPostStatus('archived', 'submit')).toBeNull(); expect(nextPostStatus('rejected', 'approve')).toBeNull();
    const reach = new Set(Object.values(postTransitions).flatMap((m) => Object.values(m)));
    for (const s of POST_STATUSES.filter((x) => x !== 'draft')) expect(reach.has(s), s).toBe(true);
    expect(availablePostActions('review').sort()).toEqual(['approve', 'reject', 'schedule', 'withdraw']);
  });
  it('complaint: forward only, closed is final, spam can be reopened, no self-loops', () => {
    expect(canComplaintTransition('new', 'verify')).toBe(true); expect(canComplaintTransition('new', 'solved')).toBe(false);
    expect(canComplaintTransition('closed', 'progress')).toBe(false); expect(canComplaintTransition('spam', 'new')).toBe(true);
    for (const s of COMPLAINT_STATUSES) expect(complaintTransitions[s]).not.toContain(s);
  });
});

describe('input schemas', () => {
  const prom = { sector: 'road', name: 'একটি প্রকল্পের নাম', pct: 50, status: 'ongoing' };
  it('promise invariants', () => {
    expect(promiseInputSchema.safeParse(prom).success).toBe(true);
    expect(promiseInputSchema.safeParse({ ...prom, status: 'done' }).success).toBe(false);
    expect(promiseInputSchema.safeParse({ ...prom, status: 'done', pct: 100 }).success).toBe(true);
    expect(promiseInputSchema.safeParse({ ...prom, status: 'late' }).success).toBe(false);
    expect(promiseInputSchema.safeParse({ ...prom, status: 'late', delayReason: 'জমি অধিগ্রহণে দেরি' }).success).toBe(true);
    expect(promiseInputSchema.safeParse({ ...prom, extra: 1 }).success).toBe(false);
  });
  it('complaint: anonymous needs no phone, otherwise a valid one; description bounds and voice note', () => {
    const c = { category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন', description: 'ক'.repeat(20) };
    expect(complaintSubmitSchema.safeParse({ ...c, anonymous: true }).success).toBe(true);
    expect(complaintSubmitSchema.safeParse({ ...c }).success).toBe(false);
    expect(complaintSubmitSchema.safeParse({ ...c, phone: '01712345678' }).success).toBe(true);
    expect(complaintSubmitSchema.safeParse({ ...c, phone: '01712345678', description: 'ক'.repeat(19) }).success).toBe(false);
    expect(complaintSubmitSchema.safeParse({ ...c, phone: '01712345678', description: 'ক'.repeat(10000) }).success).toBe(true);
    expect(complaintSubmitSchema.safeParse({ ...c, phone: '01712345678', description: 'ক'.repeat(10001) }).success).toBe(false);
    // Voice note alone without description or with short description is valid
    const withVoice = { category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন', phone: '01712345678', voiceNote: { audioData: 'data:audio/webm;base64,AAA' } };
    expect(complaintSubmitSchema.safeParse({ ...withVoice, description: '' }).success).toBe(true);
    expect(complaintSubmitSchema.safeParse({ ...withVoice, description: 'ছোট বিবরণ' }).success).toBe(true);
    expect(complaintSubmitSchema.safeParse({ ...withVoice, description: 'ক'.repeat(50) }).success).toBe(true);
    // Neither voice nor description >= 20 fails
    expect(complaintSubmitSchema.safeParse({ category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন', phone: '01712345678', description: '' }).success).toBe(false);
  });
  // BUG-2026-028: attachments together stay far below MongoDB's 16 MB document limit; voice limit = the form's 3 minutes
  it('complaint attachments: data URL shape, 12 MB total cap with a Bangla message, 180 s voice (BUG-2026-028)', () => {
    const c = { category: 'বিদ্যুৎ', upazila: 'চরকান্দি', union: 'কাশবন', phone: '01712345678', description: 'ক'.repeat(20) };
    const pdf = (n: number) => ({ name: 'a.pdf', mimeType: 'application/pdf', size: 100, data: 'data:application/pdf;base64,' + 'A'.repeat(n) });
    expect(complaintSubmitSchema.safeParse({ ...c, files: [pdf(4)] }).success).toBe(true);
    expect(complaintSubmitSchema.safeParse({ ...c, files: [{ ...pdf(4), data: 'javascript:alert(1)' }] }).success).toBe(false);
    expect(complaintSubmitSchema.safeParse({ ...c, files: [pdf(4_000_000), pdf(4_000_000), pdf(4_000_000)] }).success).toBe(true); // 12,000,084 chars
    const over = complaintSubmitSchema.safeParse({ ...c, files: [pdf(4_000_000), pdf(4_000_000), pdf(4_000_000)], voiceNote: { audioData: 'data:audio/webm;base64,' + 'A'.repeat(600_000) } });
    expect(over.success).toBe(false);
    expect(over.error?.flatten().fieldErrors.files?.[0]).toMatch(/সব ছবি, PDF ও ভয়েস মিলিয়ে/);
    expect(COMPLAINT_MAX_TOTAL_B64).toBeLessThanOrEqual(12 * 1024 * 1024);
    const v = (durationSec: number, audioData = 'data:audio/ogg; codecs=opus;base64,AAAA') => complaintSubmitSchema.safeParse({ ...c, voiceNote: { audioData, durationSec } }).success;
    expect([v(COMPLAINT_MAX_VOICE_SEC), v(COMPLAINT_MAX_VOICE_SEC + 1), v(5, 'not-a-data-url')]).toEqual([true, false, false]);
  });
  it('post schemas: full vs draft vs patch (BUG-2026-004)', () => {
    const full = { title: 'একটি সম্পূর্ণ শিরোনাম', summary: 'একটি সম্পূর্ণ সারাংশ এখানে', category: 'dev', eventDate: '2026-09-01' };
    expect(postInputSchema.safeParse(full).success).toBe(true);
    expect(postInputSchema.safeParse({ title: 'একটি সম্পূর্ণ শিরোনাম' }).success).toBe(false);
    expect(postDraftSchema.safeParse({ title: 'ক' }).success).toBe(false);
    expect(postDraftSchema.safeParse({ title: 'কখগ' }).success).toBe(true);
    expect(postPatchSchema.safeParse({ summary: 'শুধু সারাংশ বদলানো হচ্ছে এখানে' }).success).toBe(true);
    expect(postPatchSchema.safeParse({}).success).toBe(true);
    expect(postPatchSchema.safeParse({ title: 'ক' }).success).toBe(false);
    expect(postPatchSchema.safeParse({ status: 'published' }).success).toBe(false);
  });
  it('passwords: length, letters+digits, common list', () => {
    for (const bad of ['short1', 'onlyletterspassword', '12345678901', 'Password123']) expect(passwordSchema.safeParse(bad).success, bad).toBe(false);
    expect(passwordSchema.safeParse('Sup3r-secret-pass').success).toBe(true);
    expect(passwordSchema.safeParse('পাসওয়ার্ড-1234567').success).toBe(false); // needs a Latin letter and a digit (documented policy)
  });
  it('tenant create: consent literal true + document ref, slug shape', () => {
    const t = { mpName: 'ড. নাম', mpRole: 'mp', seatName: 'নদীপুর', seatNumber: 3, slug: 'ndp3', ownerPhone: '01712345678', consent: { confirmed: true, documentRef: 'REF-1' } };
    expect(tenantCreateSchema.safeParse(t).success).toBe(true);
    expect(tenantCreateSchema.safeParse({ ...t, consent: { confirmed: false, documentRef: 'REF-1' } }).success).toBe(false);
    for (const slug of ['a', 'Ab', 'a b', '-ab', 'ab-', 'a'.repeat(31)]) expect(tenantCreateSchema.safeParse({ ...t, slug }).success, slug).toBe(false);
  });
  it('invite: officers need at least one upazila', () => {
    expect(inviteSchema.safeParse({ name: 'একজন কর্মকর্তা', phone: '01712345678', role: 'officer' }).success).toBe(false);
    expect(inviteSchema.safeParse({ name: 'একজন কর্মকর্তা', phone: '01712345678', role: 'officer', upazilas: ['চরকান্দি'] }).success).toBe(true);
    expect(inviteSchema.safeParse({ name: 'একজন সম্পাদক', phone: '01712345678', role: 'owner' }).success).toBe(false);
  });
  it('login / mfa bodies reject operators and ambiguous input', () => {
    expect(loginSchema.safeParse({ identifier: { $ne: 1 }, password: 'x' }).success).toBe(false);
    expect(mfaCodeSchema.safeParse({ mfaToken: 'x'.repeat(20), code: '123456' }).success).toBe(true);
    expect(mfaCodeSchema.safeParse({ mfaToken: 'x'.repeat(20) }).success).toBe(false);
    expect(mfaCodeSchema.safeParse({ mfaToken: 'x'.repeat(20), code: '123456', recoveryCode: 'abcdefgh' }).success).toBe(false);
  });
  it('site config: at most 5 banners, known sections only', () => {
    const ok = { slogan: 's', accent: 'brass', banners: [], sections: [{ key: 'stats', on: true }] };
    expect(siteConfigSchema.safeParse(ok).success).toBe(true);
    expect(siteConfigSchema.safeParse({ ...ok, sections: [{ key: 'evil', on: true }] }).success).toBe(false);
  });
});
