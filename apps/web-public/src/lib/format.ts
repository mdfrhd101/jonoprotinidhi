/* Presentation helpers: Bangla digits, dates in Asia/Dhaka, labels for enum values the API returns. Pure functions. */
import { toBn, toEn, bnDate, MONTHS_BN, groupIndian } from '@jonoshetu/shared/src/bangla.js';

export { toBn, toEn, bnDate, MONTHS_BN };

const DHAKA_MS = 6 * 3600_000;
export const WEEKDAYS_BN = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'] as const;

function dhaka(d: Date | string | number | null | undefined): Date | null {
  if (d === null || d === undefined || d === '') return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : new Date(t.getTime() + DHAKA_MS);
}

/** "২৭ সেপ্টেম্বর ২০২৬", or '' for a missing/invalid date. */
export const bnDateSafe = (d: Date | string | number | null | undefined): string => (dhaka(d) ? bnDate(d as string) : '');

/** Parts of a date for the calendar-style event list: day number, month name, weekday (all Bangla). */
export function dateParts(d: Date | string | number | null | undefined): { day: string; month: string; weekday: string; year: string } | null {
  const x = dhaka(d);
  if (!x) return null;
  return { day: toBn(x.getUTCDate()), month: MONTHS_BN[x.getUTCMonth()]!, weekday: WEEKDAYS_BN[x.getUTCDay()]!, year: toBn(x.getUTCFullYear()) };
}

/** "সেপ্টেম্বর ২০২৬" from "2026-09". */
export function bnMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return '';
  const i = Number(m[2]) - 1;
  return i >= 0 && i < 12 ? `${MONTHS_BN[i]} ${toBn(m[1]!)}` : '';
}

/** Parses a number typed in Bangla or ASCII digits with lakh/thousand separators: "২,৫৭,১১০" -> 257110. */
export function parseNumber(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = toEn(String(v ?? '')).replace(/[,\s]/g, '');
  const m = /^-?\d+(\.\d+)?/.exec(s);
  return m ? Number(m[0]) : null;
}

/** Bangla digits with South-Asian grouping: 257110 -> "২,৫৭,১১০". */
export const bnNumber = (n: number): string => toBn(groupIndian(Math.round(n)));

/** Percentage clamped to 0..100 (bad data never draws a bar outside its track). */
export const clampPct = (n: unknown): number => { const x = Number(n); return Number.isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0; };

export const POST_CATEGORY_LABEL: Record<string, string> = { dev: 'উন্নয়ন', health: 'স্বাস্থ্য', edu: 'শিক্ষা', hearing: 'গণশুনানি', parliament: 'সংসদ', agri: 'কৃষি ও ত্রাণ', social: 'নারী, যুব ও পরিবেশ' };
export const SECTOR_LABEL: Record<string, string> = { road: 'যোগাযোগ ও অবকাঠামো', health: 'স্বাস্থ্য', edu: 'শিক্ষা', agri: 'কৃষি ও জীবিকা', civic: 'নাগরিক সেবা' };
export const SECTOR_ORDER = ['road', 'health', 'edu', 'agri', 'civic'];

export const PROMISE_STATUS: Record<string, { t: string; c: string; s: string; bar: string }> = {
  done: { t: 'সম্পন্ন', c: 'var(--ok-d)', s: 'var(--ok-s)', bar: 'var(--ok-d)' },
  ongoing: { t: 'চলমান', c: 'var(--warn-d)', s: 'var(--warn-s)', bar: 'var(--brass)' },
  late: { t: 'বিলম্বিত', c: 'var(--late-d)', s: 'var(--late-s)', bar: 'var(--late-d)' },
  plan: { t: 'শুরু হয়নি', c: 'var(--plan-d)', s: 'var(--plan-s)', bar: 'var(--plan-d)' },
};

export const COMPLAINT_STATUS: Record<string, { t: string; c: string }> = {
  new: { t: 'নতুন', c: 'var(--brass-2)' },
  verify: { t: 'যাচাই চলছে', c: 'var(--warn)' },
  progress: { t: 'প্রক্রিয়াধীন', c: 'var(--warn)' },
  solved: { t: 'সমাধান হয়েছে', c: 'var(--ok)' },
  closed: { t: 'বন্ধ', c: 'var(--muted-light)' },
  spam: { t: 'গ্রহণযোগ্য নয়', c: 'var(--err)' },
};

/** Seat names are stored with ASCII digits ("নদীপুর-3"); the site always shows Bangla digits. */
export const bnText = (s: string | null | undefined): string => toBn(String(s ?? ''));

/** Splits a timeline year like "ফেব্রুয়ারি ২০২৬" into a small month line and the big year. */
export function splitYear(y: string): { small: string; big: string } {
  const m = /^(\S+)\s+(\S+)$/.exec(String(y ?? '').trim());
  return m ? { small: m[1]!, big: m[2]! } : { small: '', big: String(y ?? '') };
}

/** Joins non-empty parts with a separator (for "date · place" meta lines). */
export const joinParts = (parts: Array<string | null | undefined | false>, sep = ' · '): string => parts.filter((p): p is string => !!p && !!String(p).trim()).join(sep);

/** Sectors present in a promise list, in the canonical order (unknown ones last). */
export function sectorsOf(items: ReadonlyArray<{ sector: string }>): string[] {
  const seen = [...new Set(items.map((p) => p.sector))];
  return [...SECTOR_ORDER.filter((s) => seen.includes(s)), ...seen.filter((s) => !SECTOR_ORDER.includes(s))];
}
