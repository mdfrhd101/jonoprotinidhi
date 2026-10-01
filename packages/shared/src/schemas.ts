import { z } from 'zod';
import { PROMISE_STATUSES } from './workflows.js';
import { isValidBdMobile } from './bangla.js';
import { BODY_MAX_HTML, BODY_MAX_TEXT, plainTextLength } from './richtext.js';
import { COMPLAINT_MAX_FILES, COMPLAINT_MAX_FILE_B64, COMPLAINT_MAX_FILE_BYTES, COMPLAINT_MAX_TOTAL_B64, COMPLAINT_MAX_VOICE_B64, COMPLAINT_MAX_VOICE_SEC } from './complaintLimits.js';

/* Input schemas shared by the API and the admin forms. `.strict()` is used on write bodies so unknown keys are
   rejected instead of silently mass-assigned. */

const noControl = (s: string) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s);
export const text = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine(noControl, 'invalid characters');
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'invalid id');
export const bdMobile = z.string().refine(isValidBdMobile, 'সঠিক মোবাইল নম্বর দিন');

export const POST_CATEGORIES = ['dev', 'health', 'edu', 'hearing', 'parliament', 'agri', 'social'] as const;
export const PROMISE_SECTORS = ['road', 'health', 'edu', 'agri', 'civic'] as const;

export const loginSchema = z.object({ identifier: text(3, 80), password: z.string().min(1).max(200) }).strict();
export const mfaCodeSchema = z
  .object({ mfaToken: z.string().min(10), code: z.string().regex(/^\d{6}$/, '6-digit code').optional(), recoveryCode: z.string().min(8).max(40).optional() })
  .strict()
  .refine((v) => !!v.code !== !!v.recoveryCode, { message: 'provide either code or recoveryCode' });
export const mfaTokenOnlySchema = z.object({ mfaToken: z.string().min(10) }).strict();

const COMMON_PASSWORDS = new Set(['password123', 'password1234', '1234567890', 'qwertyuiop', 'bangladesh123', 'jonoprotinidhi123', 'admin12345', 'letmein1234']);
export const passwordSchema = z
  .string()
  .min(10, 'কমপক্ষে ১০ অক্ষর')
  .max(200)
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), 'এই পাসওয়ার্ড খুব সাধারণ')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'অক্ষর ও সংখ্যা দুটোই দিন');

export const mediaRefSchema = z.object({
  // percent-encoded Bangla file names easily exceed 500 characters (BUG-2026-008)
  // https only; plain http is accepted for a local dev server (the API still checks the host against its allow-list)
  url: z.string().url().max(1500).refine((u) => u.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), 'https only'),
  caption: text(0, 200).optional().default(''),
  credit: text(0, 200).optional().default(''),
});

export const postInputSchema = z
  .object({
    title: text(8, 120),
    summary: text(10, 160),
    body: z.string().trim().max(BODY_MAX_HTML).refine(noControl, 'invalid characters').refine((b) => plainTextLength(b) <= BODY_MAX_TEXT, `পুরো খবর সর্বোচ্চ ${BODY_MAX_TEXT} অক্ষর`).optional().default(''),
    quote: text(0, 300).optional().default(''),
    category: z.enum(POST_CATEGORIES),
    upazila: text(0, 60).optional().default(''),
    place: text(0, 80).optional().default(''),
    eventDate: z.coerce.date(),
    media: z.array(mediaRefSchema).max(10).optional().default([]),
    version: z.number().int().min(1).optional(),
  })
  .strict();
export type PostInput = z.infer<typeof postInputSchema>;

/** Drafts may be saved half-filled: only the title is required. */
export const postDraftSchema = postInputSchema.partial().extend({ title: text(3, 120) }).strict();
/** Partial update (PATCH): every field optional; a title, if sent, still needs 3+ characters. (BUG-2026-004) */
export const postPatchSchema = postInputSchema.partial().extend({ title: text(3, 120).optional() }).strict();

export const rejectSchema = z.object({ reason: text(5, 300) }).strict();
export const approveSchema = z.object({ scheduledAt: z.coerce.date().optional() }).strict();

export const promiseInputSchema = z
  .object({
    sector: z.enum(PROMISE_SECTORS),
    name: text(5, 200),
    place: text(0, 100).optional().default(''),
    budgetLabel: text(0, 60).optional().default(''),
    budgetBdt: z.number().nonnegative().optional(),
    targetLabel: text(0, 80).optional().default(''),
    targetDate: z.coerce.date().optional(),
    pct: z.number().int().min(0).max(100),
    status: z.enum(PROMISE_STATUSES),
    delayReason: text(0, 300).optional().default(''),
    featured: z.boolean().optional().default(false),
    order: z.number().int().min(0).optional().default(0),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'done' && v.pct !== 100) ctx.addIssue({ code: 'custom', path: ['pct'], message: 'সম্পন্ন হলে অগ্রগতি ১০০% হতে হবে' });
    if (v.status === 'late' && v.delayReason.length < 10) ctx.addIssue({ code: 'custom', path: ['delayReason'], message: 'বিলম্বিত হলে দেরির কারণ লিখুন (কমপক্ষে ১০ অক্ষর)' });
  });
export type PromiseInput = z.infer<typeof promiseInputSchema>;
export const promiseUpdateSchema = z.object({ text: text(3, 200) }).strict();

/* Attachments travel as base64 data URLs. The schema checks only the shape; the API decodes every payload, checks its
   real type by its bytes and re-encodes photos before anything is stored (BUG-2026-027, lib/attachments.ts). */
const base64DataUrl = (max: number) => z.string().max(max).regex(/^data:[a-z]+\/[a-z0-9.+-]+(; ?[a-z0-9.+-]+=[a-z0-9.+-]+)*;base64,/i, 'ফাইলটি পড়া যায়নি');
export const complaintFileSchema = z
  .object({
    name: text(1, 120),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    size: z.number().int().min(1).max(COMPLAINT_MAX_FILE_BYTES),
    data: base64DataUrl(COMPLAINT_MAX_FILE_B64),
  })
  .strict();
export type ComplaintFile = z.infer<typeof complaintFileSchema>;

export const complaintSubmitSchema = z
  .object({
    category: text(2, 60),
    upazila: text(2, 60),
    union: text(2, 60),
    place: text(0, 100).optional().default(''),
    description: text(0, 10000).optional().default(''),
    anonymous: z.boolean().optional().default(false),
    name: text(0, 80).optional().default(''),
    phone: z.string().max(20).optional().default(''),
    otpTicket: z.string().max(200).optional(),
    turnstileToken: z.string().max(2000).optional().default(''),
    voiceNote: z
      .object({
        audioData: base64DataUrl(COMPLAINT_MAX_VOICE_B64),
        durationSec: z.number().int().min(1).max(COMPLAINT_MAX_VOICE_SEC).optional(),
      })
      .strict()
      .optional(),
    files: z.array(complaintFileSchema).max(COMPLAINT_MAX_FILES).optional().default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.anonymous && !isValidBdMobile(v.phone)) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'সঠিক মোবাইল নম্বর দিন' });
    const hasVoice = Boolean(v.voiceNote?.audioData);
    const descLen = (v.description ?? '').trim().length;
    if (!hasVoice && descLen < 20) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'সমস্যার বিবরণ অন্তত ২০ অক্ষরে লিখুন অথবা ভয়েস রেকর্ড করুন' });
    }
    // BUG-2026-028: keep the stored document far below MongoDB's 16 MB limit
    const total = (v.voiceNote?.audioData.length ?? 0) + (v.files ?? []).reduce((n, f) => n + f.data.length, 0);
    if (total > COMPLAINT_MAX_TOTAL_B64) ctx.addIssue({ code: 'custom', path: ['files'], message: 'সংযুক্তি অনেক বড়: সব ছবি, PDF ও ভয়েস মিলিয়ে সীমার বেশি হয়ে গেছে। কিছু ফাইল বাদ দিয়ে আবার পাঠান।' });
  });
export type ComplaintSubmit = z.infer<typeof complaintSubmitSchema>;

export const staffComplaintSchema = complaintSubmitSchema;

export const complaintPatchSchema = z
  .object({ status: z.enum(['new', 'verify', 'progress', 'solved', 'closed', 'spam']).optional(), assignedTo: objectId.nullable().optional(), version: z.number().int().min(1).optional(), note: text(2, 600).optional() })
  .strict();
export const noteSchema = z.object({ text: text(2, 600) }).strict();
export const piiViewSchema = z.object({ purpose: text(5, 200) }).strict();
export const smsSendSchema = z.object({ templateKey: z.enum(['received', 'verify', 'progress', 'solved', 'closed']) }).strict();

export const siteConfigSchema = z
  .object({
    slogan: text(0, 90),
    accent: z.enum(['brass', 'river', 'maroon']),
    banners: z.array(z.object({ url: z.string().url().max(1500), caption: text(0, 80), title: text(0, 120).optional(), subtitle: text(0, 240).optional(), ctaLabel: text(0, 40).optional(), ctaHref: text(0, 300).optional() }).strict()).max(6),
    sections: z.array(z.object({ key: z.enum(['stats', 'about', 'activities', 'office', 'promises', 'area', 'gallery', 'videos', 'events', 'cta']), on: z.boolean() }).strict()).max(12),
  })
  .strict();

export const tenantSettingsSchema = z
  .object({
    otpRequired: z.boolean(),
    slaDays: z.number().int().min(1).max(30),
    complaintCategories: z.array(text(2, 40)).min(2).max(20),
  })
  .strict();

export const inviteSchema = z
  .object({
    name: text(3, 80),
    phone: bdMobile,
    role: z.enum(['editor', 'officer']),
    upazilas: z.array(text(2, 60)).max(10).optional().default([]),
    password: passwordSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.role === 'officer' && v.upazilas.length === 0) ctx.addIssue({ code: 'custom', path: ['upazilas'], message: 'কর্মকর্তার জন্য অন্তত একটি উপজেলা দিন' });
  });

export const acceptInviteSchema = z.object({ password: passwordSchema }).strict();

export const slugSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/, '৩–৩০ অক্ষর: ইংরেজি ছোট হাতের অক্ষর, সংখ্যা, হাইফেন');
export const tenantCreateSchema = z
  .object({
    mpName: text(3, 80),
    mpTitle: text(0, 80).optional().default(''),
    mpRole: z.enum(['mp', 'minister', 'state_minister', 'deputy_minister']),
    ministry: text(0, 80).optional().default(''),
    seatName: text(2, 40),
    seatNumber: z.number().int().min(1).max(20),
    slug: slugSchema,
    ownerPhone: bdMobile,
    ownerName: text(3, 80).optional(),
    plan: z.enum(['basic', 'full']).optional().default('full'),
    consent: z.object({ confirmed: z.literal(true, { errorMap: () => ({ message: 'MP অফিসের লিখিত সম্মতি নিশ্চিত করুন' }) }), documentRef: text(3, 120) }).strict(),
  })
  .strict();
export const tenantStatusSchema = z.object({ to: z.enum(['setup', 'live', 'suspended']), reason: text(5, 300), contentChecked: z.boolean().optional() }).strict();
export const actAsSchema = z.object({ reason: text(10, 300) }).strict();
export const domainAddSchema = z.object({ host: z.string().toLowerCase().regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'invalid domain') }).strict();
