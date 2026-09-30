import { z } from 'zod';
import { text } from './schemas.js';

/* Everything a visitor can read on the public site is content the MP's office can edit in the CMS.
   Singleton pages (layout, home, ...) are stored as one document per key with a draft and a live copy.
   Collections (events, gallery, videos) are lists of small items with their own draft/published status.
   Every field is optional with a sane default so a half-filled page never breaks the public site. */

const str = (max: number) => z.string().trim().max(max).default('');
const url = z.string().trim().max(1500).refine((u) => u === '' || /^(https?:\/\/|mailto:|tel:|\/)/i.test(u), 'লিংক https:// দিয়ে শুরু করুন');
const kv = z.object({ label: text(1, 80), value: str(300) }).strict();
const valueLabel = z.object({ value: text(1, 40), label: text(1, 100) }).strict();

const hero = z.object({ kicker: str(60), title: str(140), intro: str(700) }).strict();
export type Hero = z.infer<typeof hero>;

/* ---------- page keys ---------- */

export const PAGE_KEYS = ['layout', 'home', 'profile', 'heroes', 'area', 'contact', 'complaint'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const PAGE_LABELS: Record<PageKey, string> = {
  layout: 'হেডার ও ফুটার', home: 'হোম পেজ', profile: 'পরিচিতি ও জীবনী', heroes: 'পেজের শিরোনাম',
  area: 'নির্বাচনী এলাকা', contact: 'যোগাযোগ', complaint: 'অভিযোগ পেজ',
};

const socialKinds = ['facebook', 'youtube', 'x', 'instagram', 'linkedin', 'web', 'email', 'phone'] as const;

export const layoutSchema = z.object({
  tagline: str(160),
  notice: z.object({ on: z.boolean().default(false), text: str(200), link: url.default('') }).strict().default({ on: false, text: '', link: '' }),
  footerAbout: str(500),
  footerNote: str(500),
  photoCredit: str(400),
  copyright: str(160),
  social: z.array(z.object({ kind: z.enum(socialKinds), label: text(1, 60), url }).strict()).max(8).default([]),
}).strict();

const cta = z.object({ title: str(120), text: str(400), button: str(40) }).strict();
export const homeSchema = z.object({
  hero: z.object({ kicker: str(60), note: str(200) }).strict().default({ kicker: '', note: '' }),
  stats: z.array(z.object({ n: text(1, 20), unit: str(20), label: text(1, 100) }).strict()).max(8).default([]),
  statsTitle: str(80), statsNote: str(300),
  sections: z.object({
    about: hero.default({ kicker: '', title: '', intro: '' }),
    office: hero.default({ kicker: '', title: '', intro: '' }),
    activities: hero.default({ kicker: '', title: '', intro: '' }),
    promises: hero.default({ kicker: '', title: '', intro: '' }),
    area: hero.default({ kicker: '', title: '', intro: '' }),
    gallery: hero.default({ kicker: '', title: '', intro: '' }),
    videos: hero.default({ kicker: '', title: '', intro: '' }),
    events: hero.default({ kicker: '', title: '', intro: '' }),
  }).strict().default({} as never),
  complaintCta: cta.default({ title: '', text: '', button: '' }),
}).strict();

const dated = z.object({ year: str(40), title: text(1, 140), place: str(140), note: str(300) }).strict();
export const profileSchema = z.object({
  headline: str(140), intro: str(2000), roleLine: str(400),
  portrait: z.object({ url: z.string().trim().max(1500).default(''), credit: str(200) }).strict().default({ url: '', credit: '' }),
  story: z.array(text(1, 1500)).max(10).default([]),
  milestones: z.array(z.object({ yr: text(1, 20), title: text(1, 120), note: str(300), now: z.boolean().optional() }).strict()).max(10).default([]),
  committees: z.array(z.object({ title: text(1, 140), note: str(300) }).strict()).max(12).default([]),
  personal: z.array(kv).max(24).default([]),
  education: z.array(dated).max(20).default([]),
  profession: z.array(dated).max(20).default([]),
  politics: z.array(dated).max(20).default([]),
  awards: z.array(z.object({ year: str(20), title: text(1, 140), by: str(140) }).strict()).max(20).default([]),
  works: z.array(z.object({ year: str(20), title: text(1, 160), type: str(80) }).strict()).max(20).default([]),
  parliament: z.array(z.object({ n: text(1, 20), label: text(1, 80) }).strict()).max(8).default([]),
  parliamentNote: str(600),
  priorities: z.array(z.object({ title: text(1, 80), text: str(300) }).strict()).max(10).default([]),
}).strict();

const heroKeys = ['about', 'biography', 'activities', 'promises', 'area', 'gallery', 'videos', 'complaint', 'contact'] as const;
export const HERO_KEYS = heroKeys;
export const heroesSchema = z.object(Object.fromEntries(heroKeys.map((k) => [k, hero.default({ kicker: '', title: '', intro: '' })])) as Record<(typeof heroKeys)[number], z.ZodDefault<typeof hero>>).strict();

export const areaSchema = z.object({
  intro: str(1200),
  totals: z.array(valueLabel).max(8).default([]),
  voters: z.array(z.object({ label: text(1, 60), value: text(1, 40) }).strict()).max(6).default([]),
  extra: z.array(valueLabel).max(16).default([]),
  upazilas: z.array(z.object({
    name: text(1, 80), short: str(40), pop: str(30), voters: str(30), size: str(30), lit: str(20), households: str(30),
    schools: str(20), clinics: str(20), projects: str(20), complaints: str(20), unions: z.array(text(1, 60)).max(40).default([]), note: str(500),
  }).strict()).max(12).default([]),
  note: str(500),
}).strict();

export const contactSchema = z.object({
  intro: str(700),
  offices: z.array(z.object({ name: text(1, 100), rows: z.array(kv).max(8).default([]) }).strict()).max(8).default([]),
  channels: z.array(z.object({ label: text(1, 60), note: str(200), url: url.default('') }).strict()).max(8).default([]),
  hotline: z.object({ number: str(40), hours: str(120) }).strict().default({ number: '', hours: '' }),
}).strict();

export const complaintPageSchema = z.object({
  intro: str(700),
  steps: z.array(z.object({ title: text(1, 80), text: str(300) }).strict()).max(8).default([]),
  privacyNote: str(600),
  faq: z.array(z.object({ q: text(1, 200), a: text(1, 1200) }).strict()).max(20).default([]),
}).strict();

export const PAGE_SCHEMAS = { layout: layoutSchema, home: homeSchema, profile: profileSchema, heroes: heroesSchema, area: areaSchema, contact: contactSchema, complaint: complaintPageSchema } as const;
export type PageData<K extends PageKey> = z.infer<(typeof PAGE_SCHEMAS)[K]>;

/** Parses raw input for a page key. Unknown keys are rejected (`.strict()`), missing ones get their defaults. */
export function parsePage(key: PageKey, input: unknown) {
  return PAGE_SCHEMAS[key].parse(input ?? {});
}

/* ---------- collections ---------- */

export const CONTENT_STATUSES = ['draft', 'published'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

const dateField = z.coerce.date();

export const eventInputSchema = z.object({
  title: text(3, 140), date: dateField, time: str(60), place: str(160), note: str(400),
}).strict();
export const eventPatchSchema = eventInputSchema.partial().strict();

export const galleryInputSchema = z.object({
  url: z.string().url().max(1500), caption: str(200), credit: str(200), album: str(60),
  takenAt: dateField.optional(), order: z.number().int().min(0).max(100000).default(0), featured: z.boolean().default(false),
}).strict();
export const galleryPatchSchema = galleryInputSchema.partial().strict();

/** youtube.com/watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, /live/ID or the bare 11-character id. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else { const m = /^\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname); id = m?.[2] ?? null; }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export const videoInputSchema = z.object({
  title: text(3, 160), description: str(600), date: dateField.optional(),
  kind: z.enum(['youtube', 'upload']),
  /** youtube: a watch/share URL or the 11-character id (normalised to the id on save) */
  youtube: str(300),
  /** upload: id of an uploaded video in the media library */
  mediaId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  posterUrl: z.string().url().max(1500).optional().or(z.literal('')),
  duration: str(20), order: z.number().int().min(0).max(100000).default(0), featured: z.boolean().default(false),
}).strict().superRefine((v, ctx) => {
  if (v.kind === 'youtube' && !parseYouTubeId(v.youtube)) ctx.addIssue({ code: 'custom', path: ['youtube'], message: 'সঠিক YouTube লিংক দিন' });
  if (v.kind === 'upload' && !v.mediaId) ctx.addIssue({ code: 'custom', path: ['mediaId'], message: 'ভিডিও ফাইল আপলোড করুন' });
});
export const videoPatchSchema = z.object({
  title: text(3, 160), description: str(600), date: dateField, kind: z.enum(['youtube', 'upload']), youtube: str(300),
  mediaId: z.string().regex(/^[a-f0-9]{24}$/i), posterUrl: z.string().url().max(1500).or(z.literal('')), duration: str(20),
  order: z.number().int().min(0).max(100000), featured: z.boolean(),
}).partial().strict();

export const VIDEO_UPLOAD_TYPES = ['video/mp4', 'video/webm'] as const;
