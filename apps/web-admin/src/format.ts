import { bnDate, toBn, formatBn, MONTHS_BN } from '@jonoprotinidhi/shared';

export { bnDate, toBn, formatBn };

/** Bangla date and time (Asia/Dhaka): "২৭ সেপ্টেম্বর ২০২৬, দুপুর ২:৪৫". */
export function bnDateTime(v: string | Date | undefined | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const dh = new Date(d.getTime() + 6 * 3600_000);
  const h = dh.getUTCHours(), m = dh.getUTCMinutes();
  // Bangla day parts: ভোর 4-5, সকাল 6-11, দুপুর 12-14, বিকেল 15-16, সন্ধ্যা 17-18, রাত 19-3 (BUG-2026-012)
  const part = h < 4 ? 'রাত' : h < 6 ? 'ভোর' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 17 ? 'বিকেল' : h < 19 ? 'সন্ধ্যা' : 'রাত';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${bnDate(d)}, ${part} ${toBn(h12)}:${toBn(String(m).padStart(2, '0'))}`;
}

export function daysSince(v: string | Date | undefined | null, now = Date.now()): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 86400_000));
}

export const POST_CATEGORY_LABEL: Record<string, string> = { dev: 'উন্নয়ন', health: 'স্বাস্থ্য', edu: 'শিক্ষা', hearing: 'গণশুনানি', parliament: 'সংসদ', agri: 'কৃষি ও ত্রাণ', social: 'নারী, যুব ও পরিবেশ' };
export const POST_STATUS_LABEL: Record<string, [string, string]> = { draft: ['খসড়া', 'plain'], review: ['অনুমোদনের অপেক্ষায়', 'warn'], scheduled: ['নির্ধারিত সময়ে প্রকাশ', 'info'], published: ['প্রকাশিত', 'ok'], rejected: ['ফেরত পাঠানো', 'bad'], archived: ['অপ্রকাশিত', 'plain'] };
export const COMPLAINT_STATUS_LABEL: Record<string, [string, string]> = { new: ['নতুন', 'info'], verify: ['যাচাই চলছে', 'warn'], progress: ['প্রক্রিয়াধীন', 'warn'], solved: ['সমাধান হয়েছে', 'ok'], closed: ['বন্ধ', 'plain'], spam: ['স্প্যাম', 'bad'] };
export const PROMISE_STATUS_LABEL: Record<string, [string, string]> = { done: ['সম্পন্ন', 'ok'], ongoing: ['চলমান', 'warn'], late: ['বিলম্বিত', 'bad'], plan: ['শুরু হয়নি', 'plain'] };
export const SECTOR_LABEL: Record<string, string> = { road: 'যোগাযোগ ও অবকাঠামো', health: 'স্বাস্থ্য', edu: 'শিক্ষা', agri: 'কৃষি ও জীবিকা', civic: 'নাগরিক সেবা' };
export const ROLE_LABEL: Record<string, string> = { owner: 'MP (মালিক)', editor: 'PR / কনটেন্ট এডিটর', officer: 'অভিযোগ কর্মকর্তা', super_admin: 'Super Admin', support: 'সাপোর্ট' };
export const TENANT_STATUS_LABEL: Record<string, [string, string]> = { live: ['লাইভ', 'ok'], setup: ['সেটআপ চলছে', 'info'], suspended: ['স্থগিত', 'bad'] };

const MONTH_SHORT = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রি', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
const WEEKDAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const ymd = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return { y: y ?? 0, m: (m ?? 1) - 1, d: d ?? 1 }; };

/** "2026-09-25" -> "২৫ সেপ্টে" (chart axes). */
export function bnDayShort(iso: string): string { const { m, d } = ymd(iso); return `${toBn(d)} ${MONTH_SHORT[m] ?? ''}`; }
/** "2026-09-25" -> "২৫ সেপ্টেম্বর ২০২৬" (tooltips, tables). */
export function bnDayLong(iso: string): string { const { y, m, d } = ymd(iso); return `${toBn(d)} ${MONTHS_BN[m] ?? ''} ${toBn(y)}`; }
/** Weekday name in Asia/Dhaka: "বুধবার". */
export function bnWeekday(v: string | Date | number = Date.now()): string { return WEEKDAYS[new Date(new Date(v).getTime() + 6 * 3600_000).getUTCDay()] ?? ''; }
/** Time-of-day greeting in Asia/Dhaka. */
export function bnGreeting(v: string | Date | number = Date.now()): string {
  const h = new Date(new Date(v).getTime() + 6 * 3600_000).getUTCHours();
  return h < 4 ? 'শুভ রাত্রি' : h < 12 ? 'শুভ সকাল' : h < 15 ? 'শুভ দুপুর' : h < 17 ? 'শুভ বিকেল' : h < 19 ? 'শুভ সন্ধ্যা' : 'শুভ রাত্রি';
}
/** Relative time in Bangla: "এইমাত্র", "৫ মিনিট আগে", "৩ ঘণ্টা আগে", "২ দিন আগে", then a date. Future dates: "আগামী ৩ দিনে" style is handled by bnUntil. */
export function bnAgo(v: string | number | Date | undefined | null, now = Date.now()): string {
  if (!v) return '—';
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'এইমাত্র';
  if (s < 3600) return `${toBn(Math.floor(s / 60))} মিনিট আগে`;
  if (s < 86400) return `${toBn(Math.floor(s / 3600))} ঘণ্টা আগে`;
  if (s < 86400 * 7) return `${toBn(Math.floor(s / 86400))} দিন আগে`;
  return bnDate(new Date(t));
}
/** Days until a date in Bangla: "আজ", "আগামীকাল", "৩ দিন পরে". */
export function bnUntil(v: string | Date, now = Date.now()): string {
  const day = (ms: number) => Math.floor((ms + 6 * 3600_000) / 86400_000);
  const diff = day(new Date(v).getTime()) - day(now);
  return diff <= 0 ? 'আজ' : diff === 1 ? 'আগামীকাল' : `${toBn(diff)} দিন পরে`;
}
