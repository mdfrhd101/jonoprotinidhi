/* Server-side data access. Every call goes to the public API with the tenant host (see host.ts). Reads are kept for a
   few seconds in a small in-process cache (ttlcache.ts: a CMS edit shows within ~5 s, the API is not hit ten times per
   page view, and a rate-limit/restart hiccup serves the last good copy instead of an error page). React `cache`
   de-duplicates identical calls within one request. The visitor's IP is forwarded so the API's per-IP rate limit
   applies per visitor, not to this server as a whole. */
import { cache } from 'react';
import { headers } from 'next/headers';
import { env } from './env';
import { resolveTenantHost } from './host';
import { defaultedPage, type PageMap } from './pages';
import { TtlCache } from './ttlcache';
import type { Album, ComplaintForm, ComplaintStats, EventItem, GalleryItem, PageKey, Paged, Post, Promises, Site, VideoItem } from './types';

export class ApiFetchError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ApiFetchError'; }
}

/** Host of the current request, resolved to a tenant host. */
export function tenantHost(): string {
  const h = headers();
  const raw = (env.trustProxy && h.get('x-forwarded-host')) || h.get('host');
  return resolveTenantHost(raw, env.tenantHost);
}

/** Headers that tell the API which tenant (and, for writes, which client) this is. */
export function apiHeaders(host: string, extra: Record<string, string> = {}): Record<string, string> {
  // `host` works in production; the API also honours X-Forwarded-Host outside production (dev servers behind us)
  return { accept: 'application/json', host, 'x-forwarded-host': host, ...extra };
}

/** The visitor's IP as seen by the hop in front of us (right-most X-Forwarded-For entry; left ones are client-supplied). */
export function visitorIp(h: { get(name: string): string | null }): string {
  return h.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).pop() ?? h.get('x-real-ip') ?? '';
}

const reads = new TtlCache(Number(process.env.API_CACHE_MS ?? 5_000));

function get<T>(path: string): Promise<T> {
  const host = tenantHost();
  const ip = visitorIp(headers());
  return reads.get<T>(`${host}|${path}`, () => fetchJson<T>(path, host, ip));
}

async function fetchJson<T>(path: string, host: string, ip: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}/api/v1/public${path}`, { headers: apiHeaders(host, ip ? { 'x-forwarded-for': ip } : {}), cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ApiFetchError(503, 'API_UNREACHABLE', 'সার্ভারের সঙ্গে যোগাযোগ করা যাচ্ছে না');
  }
  if (!res.ok) {
    let code = 'HTTP_' + res.status, message = 'তথ্য আনা যায়নি';
    try { const j = (await res.json()) as { error?: { code?: string; message?: string } }; code = j.error?.code ?? code; message = j.error?.message ?? message; } catch { /* not JSON */ }
    throw new ApiFetchError(res.status, code, message);
  }
  return (await res.json()) as T;
}

const qs = (o: Record<string, string | number | undefined | null | boolean>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const getSite = cache(() => get<Site>('/site'));
export const getPage = cache(async <K extends PageKey>(key: K): Promise<PageMap[K]> => {
  const r = await get<{ key: string; published: boolean; data: unknown }>(`/pages/${key}`);
  return defaultedPage(key, r.data);
});
export const getPosts = cache((q: { category?: string; upazila?: string; month?: string; page?: number; limit?: number }) =>
  get<Paged<Post>>(`/posts${qs(q)}`));
export const getPost = cache((slug: string) => get<Post>(`/posts/${encodeURIComponent(slug)}`));
export const getPromises = cache(() => get<Promises>('/promises'));
export const getEvents = cache((limit = 12) => get<{ items: EventItem[] }>(`/events${qs({ limit })}`).then((r) => r.items));
export const getGallery = cache((q: { album?: string; featured?: boolean; page?: number; limit?: number }) =>
  get<Paged<GalleryItem>>(`/gallery${qs({ album: q.album, featured: q.featured ? 1 : undefined, page: q.page, limit: q.limit })}`));
export const getAlbums = cache(() => get<{ items: Album[] }>('/gallery/albums').then((r) => r.items));
export const getVideos = cache((q: { featured?: boolean; limit?: number } = {}) => get<Paged<VideoItem>>(`/videos${qs({ featured: q.featured ? 1 : undefined, limit: q.limit })}`));
export const getComplaintStats = cache(() => get<ComplaintStats>('/complaint-stats'));
export const getComplaintForm = cache(() => get<ComplaintForm>('/complaint-form'));

/** Runs a loader; on failure returns the fallback so one missing section never takes a whole page down. */
export async function soft<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch (e) { if (process.env.NODE_ENV !== 'production') console.warn('[web-public] section data unavailable:', (e as Error).message); return fallback; }
}
