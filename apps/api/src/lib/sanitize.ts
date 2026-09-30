import { randomBytes } from 'node:crypto';

/* Small, boring helpers: the mass-assignment guard, regex escaping, CSV-safe cells, slugs. */

export const escapeRegex = (s: string): string => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whitelist copy: only listed keys survive (never Object.assign(doc, req.body)). */
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** Strip keys that could act as NoSQL operators from untrusted input (defence in depth on top of zod). */
export function stripOperators<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripOperators) as unknown as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = stripOperators(val);
    }
    return out as T;
  }
  return v;
}

/** CSV cell: quotes, and a leading apostrophe on values a spreadsheet would execute as a formula. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** ASCII slug plus a short random suffix (Bangla titles have no Latin letters, so the suffix carries uniqueness). */
export function makeSlug(title: string): string {
  const base = title.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${base ? base + '-' : 'post-'}${randomBytes(3).toString('hex')}`;
}

export const isObjectId = (s: unknown): s is string => typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s);

/** Opt-in pagination: no ?page/?limit -> the caller returns the full list unchanged. */
export function parsePaging(q: Record<string, unknown>, max = 100): { page: number; limit: number; paged: boolean } {
  const hasPage = q.page !== undefined || q.limit !== undefined;
  const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(String(q.limit ?? '20'), 10) || 20));
  return { page, limit, paged: hasPage };
}
