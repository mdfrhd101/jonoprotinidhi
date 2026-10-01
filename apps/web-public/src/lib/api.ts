/* Server-side data access. Every call goes to the public API with the tenant host (see host.ts). Reads are kept for a
   few seconds in a small in-process cache (ttlcache.ts: a CMS edit shows within ~5 s, the API is not hit ten times per
   page view, and a rate-limit/restart hiccup serves the last good copy instead of an error page). React `cache`
   de-duplicates identical calls within one request. The visitor's IP is forwarded so the API's per-IP rate limit
   applies per visitor, not to this server as a whole.
   Static export (STATIC_EXPORT=1, GitHub Pages): there is no request at build time, so the tenant is the pinned TENANT_HOST,
   each read is fetched once for the whole build and kept (buildFetch.ts retries and paces them), and nothing is swallowed:
   a failed read fails the build instead of publishing a site with sections missing. */
import { cache } from 'react';
import { headers } from 'next/headers';
import { env } from './env';
import { resolveTenantHost } from './host';
import { defaultedPage, type PageMap } from './pages';
import { TtlCache } from './ttlcache';
import { serverHeaders, visitorIp } from './serverHeaders';
import { httpRequest, type HttpResult } from './http';
import { buildRequest } from './buildFetch';
import { STATIC_EXPORT } from './staticMode';
import type { Album, ComplaintForm, ComplaintStats, EventItem, GalleryItem, PageKey, Paged, Post, Promises, Site, VideoItem } from './types';

export class ApiFetchError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ApiFetchError'; }
}

/** Host of the current request, resolved to a tenant host. */
export function tenantHost(): string {
  const h = headers();
  const raw = (env.trustProxy && h.get('x-forwarded-host')) || h.get('host');
  return resolveTenantHost(raw, env.tenantHost, env.pinTenant);
}

/** Headers for an API call made for the current visitor (tenant host + visitor IP + site token). */
export function apiHeaders(host: string, ip: string, json = false): Record<string, string> {
  return serverHeaders({ host, ip, token: env.siteServerToken, json });
}


const reads = new TtlCache(STATIC_EXPORT ? Number.POSITIVE_INFINITY : Number(process.env.API_CACHE_MS ?? 5_000));

function get<T>(path: string): Promise<T> {
  const host = STATIC_EXPORT ? resolveTenantHost(null, env.tenantHost, true) : tenantHost();
  const ip = STATIC_EXPORT ? '' : visitorIp(headers());
  return reads.get<T>(`${host}|${path}`, () => fetchJson<T>(path, host, ip));
}

async function fetchJson<T>(path: string, host: string, ip: string): Promise<T> {
  let res: HttpResult;
  try {
    const url = `${env.apiUrl}/api/v1/public${path}`;
    res = STATIC_EXPORT ? await buildRequest(url, apiHeaders(host, ip)) : await httpRequest(url, { headers: apiHeaders(host, ip) });
  } catch {
    throw new ApiFetchError(503, 'API_UNREACHABLE', 'সার্ভারের সঙ্গে যোগাযোগ করা যাচ্ছে না');
  }
  let j: unknown = null;
  try { j = res.text ? JSON.parse(res.text) : null; } catch { /* not JSON */ }
  if (res.status < 200 || res.status >= 300) {
    const e = (j as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiFetchError(res.status, e?.code ?? 'HTTP_' + res.status, e?.message ?? 'তথ্য আনা যায়নি');
  }
  return j as T;
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
/** Every published post, 50 per API call (the API maximum), as one list. Static export only: it has no ?page= to paginate with. */
export const getAllPosts = cache(async (): Promise<Paged<Post>> => {
  const first = await getPosts({ page: 1, limit: 50 });
  const rest = await Promise.all(Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) => getPosts({ page: i + 2, limit: 50 })));
  return { ...first, items: [first, ...rest].flatMap((p) => p.items), page: 1, totalPages: 1 };
});
// the list already carries every field of a post, so a static export reads each post from it instead of calling the API once per post
export const getPost = cache(async (slug: string): Promise<Post> => {
  if (!STATIC_EXPORT) return get<Post>(`/posts/${encodeURIComponent(slug)}`);
  const hit = (await getAllPosts()).items.find((p) => p.slug === slug);
  if (!hit) throw new ApiFetchError(404, 'NOT_FOUND', 'পাওয়া যায়নি');
  return hit;
});
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
  try { return await p; } catch (e) { if (STATIC_EXPORT) throw e; if (process.env.NODE_ENV !== 'production') console.warn('[web-public] section data unavailable:', (e as Error).message); return fallback; }
}

/** A different photo for every inner page: featured gallery photos (excluding the home hero banners), banners as fallback. */
const PAGE_ORDER = ['about', 'biography', 'activities', 'promises', 'area', 'gallery', 'videos', 'complaint', 'contact'];
export async function pageImage(site: { banners?: Array<{ url: string; caption: string }> } | null, key: string): Promise<{ url: string; caption: string } | null> {
  const used = new Set((site?.banners ?? []).map((b) => b.url));
  const g = await getGallery({ featured: true, limit: 40 }).catch((e) => { if (STATIC_EXPORT) throw e; return null; });
  const pool = (g?.items ?? []).filter((x) => x.url && !used.has(x.url)).map((x) => ({ url: x.url, caption: [x.caption, x.credit].filter(Boolean).join(' · ') }));
  const fallback = (site?.banners ?? []).filter((b) => b.url);
  const list = pool.length ? pool : fallback;
  if (!list.length) return null;
  const i = Math.max(0, PAGE_ORDER.indexOf(key));
  return list[i % list.length] ?? null;
}
