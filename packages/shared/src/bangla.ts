/* Bangla number/date/phone helpers. Stored data is ASCII; Bangla digits are a presentation concern. */

const BN = '০১২৩৪৫৬৭৮৯';

export const MONTHS_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'] as const;

export const toBn = (v: string | number): string => String(v).replace(/\d/g, (d) => BN[Number(d)]!);
export const toEn = (v: string): string => String(v).replace(/[০-৯]/g, (c) => String(BN.indexOf(c)));

/** South-Asian (lakh/crore) grouping, e.g. 743760 -> "7,43,760". */
export function groupIndian(n: number): string {
  const neg = n < 0;
  const s = String(Math.trunc(Math.abs(n)));
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + head + ',' + s.slice(-3);
}
export const formatBn = (n: number): string => toBn(groupIndian(n));

/** Dates are rendered in Asia/Dhaka (UTC+6, no DST). */
export function bnDate(d: Date | string | number): string {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  const dhaka = new Date(t.getTime() + 6 * 3600_000);
  return `${toBn(dhaka.getUTCDate())} ${MONTHS_BN[dhaka.getUTCMonth()]} ${toBn(dhaka.getUTCFullYear())}`;
}

/** Normalise a Bangladeshi mobile number to national form 01XXXXXXXXX ("+8801712-345678", "০১৭১২৩৪৫৬৭৮"). */
export function normalizeBdPhone(input: string): string {
  const s = toEn(String(input ?? '')).replace(/[\s()-]/g, '');
  return s.replace(/^\+?880/, '0').replace(/^(?=1[3-9]\d{8}$)/, '0');
}
export const isValidBdMobile = (input: string): boolean => /^01[3-9]\d{8}$/.test(normalizeBdPhone(input));
/** E.164 form used as the stored login id. */
export const toE164Bd = (input: string): string => '+88' + normalizeBdPhone(input);

/** Number of SMS segments for a message (Unicode messages carry 70 chars, then 67 per part). */
export function smsSegments(text: string): number {
  const isUnicode = /[^\x00-\x7F]/.test(text);
  const len = [...text].length;
  if (!len) return 0;
  if (isUnicode) return len <= 70 ? 1 : Math.ceil(len / 67);
  return len <= 160 ? 1 : Math.ceil(len / 153);
}
