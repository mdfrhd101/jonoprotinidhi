import { hasPermission, PAGE_KEYS, PAGE_LABELS } from '@jonoprotinidhi/shared';
import { AuditLog, Complaint, EventItem, GalleryItem, PageContent, Post, PostVersion, PromiseItem, User, VideoItem } from '../models/index.js';
import { ctx } from '../context.js';
import type { MemberCtx } from './complaints.js';

/* Tenant dashboard numbers (docs/09 §2). Runs inside the request's tenant context, so every aggregate is scoped by the
   fail-closed tenantId plugin. Least privilege (BUG-2026-011): a section is computed AND sent only when the member's
   permissions allow it; nothing here ever reads complainant identity (counts, categories, tracking ids only). */

const MS_DAY = 86400_000;
const DHAKA_MS = 6 * 3600_000;
const OPEN = ['new', 'verify', 'progress'];

export type Series = { date: string; received: number; solved: number };
export type Dashboard = {
  generatedAt: string;
  posts?: { total: number; byStatus: Record<string, number>; last30d: number; recent: Array<{ id: string; title: string; status: string; eventDate: string | null; updatedAt: string; thumb?: string }> };
  promises?: { total: number; byStatus: Record<string, number>; avgPct: number; late: Array<{ id: string; name: string; pct: number }> };
  approvals?: { total: number; items: Array<{ id: string; title: string; authorName: string; submittedAt: string }> };
  complaints?: {
    total: number; open: number; byStatus: Record<string, number>; slaPct: number | null; resolvedLast30d: number; overdue: number; avgResolutionDays: number;
    series: Series[]; byCategory: Array<{ name: string; count: number }>; byUpazila: Array<{ name: string; count: number; open: number }>;
    latest: Array<{ id: string; trackingId: string; category: string; upazila: string; status: string; createdAt: string }>;
  };
  events?: { upcoming: Array<{ id: string; title: string; date: string; place: string }> };
  content?: { gallery: number; videos: number; events: number; readinessPct: number; pages: Array<{ key: string; label: string; ready: boolean }> };
  activity?: { items: Array<{ action: string; label: string; actorName: string; at: string }> };
};

/** Same rule as ComplaintService.scopeFilter: view_all sees everything, view_scoped only their upazilas, otherwise nothing. */
export function complaintScope(m: Pick<MemberCtx, 'perms' | 'scope'>): Record<string, unknown> | null {
  if (hasPermission(m.perms, 'complaints.view_all')) return {};
  if (hasPermission(m.perms, 'complaints.view_scoped')) return { upazila: { $in: m.scope } };
  return null;
}

const toMap = (rows: Array<{ _id: string; n: number }>) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
const round1 = (n: number) => Math.round(n * 10) / 10;
const dhakaDay = (ms: number) => new Date(ms + DHAKA_MS).toISOString().slice(0, 10);
/** UTC instant of 00:00 Asia/Dhaka on the day containing `ms`. */
const dhakaMidnight = (ms: number) => { const d = new Date(ms + DHAKA_MS); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - DHAKA_MS; };

/** Last `days` Dhaka calendar days (oldest first), zero-filled. */
export function fillSeries(days: number, now: number, received: Map<string, number>, solved: Map<string, number>): Series[] {
  const out: Series[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dhakaDay(now - i * MS_DAY);
    out.push({ date, received: received.get(date) ?? 0, solved: solved.get(date) ?? 0 });
  }
  return out;
}

async function complaintsBlock(scope: Record<string, unknown>, now: number): Promise<NonNullable<Dashboard['complaints']>> {
  const since = new Date(now - 30 * MS_DAY);
  const startOfWindow = new Date(dhakaMidnight(now - 29 * MS_DAY));
  const day = (field: string) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: '+06:00' } });
  const resolvedMatch = { ...scope, status: { $in: ['solved', 'closed'] }, resolvedAt: { $gte: since } };
  const [byStatus, resolvedRows, receivedRows, solvedRows, byCategory, byUpazila, latest, overdue] = await Promise.all([
    Complaint.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Complaint.aggregate([{ $match: resolvedMatch }, { $project: { ms: { $subtract: ['$resolvedAt', '$createdAt'] }, due: { $subtract: ['$slaDueAt', '$createdAt'] } } }]),
    Complaint.aggregate([{ $match: { ...scope, createdAt: { $gte: startOfWindow } } }, { $group: { _id: day('createdAt'), n: { $sum: 1 } } }]),
    Complaint.aggregate([{ $match: { ...scope, status: { $in: ['solved', 'closed'] }, resolvedAt: { $gte: startOfWindow } } }, { $group: { _id: day('resolvedAt'), n: { $sum: 1 } } }]),
    Complaint.aggregate([{ $match: { ...scope, status: { $ne: 'spam' } } }, { $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }, { $limit: 8 }]),
    Complaint.aggregate([{ $match: { ...scope, status: { $ne: 'spam' } } }, { $group: { _id: '$upazila', n: { $sum: 1 }, open: { $sum: { $cond: [{ $in: ['$status', OPEN] }, 1, 0] } } } }, { $sort: { n: -1, _id: 1 } }, { $limit: 10 }]),
    Complaint.find(scope).sort({ createdAt: -1 }).limit(6).select('trackingId category upazila status createdAt').lean(),
    Complaint.countDocuments({ ...scope, status: { $in: OPEN }, slaDueAt: { $lt: new Date(now) } }),
  ]);
  const statusMap = toMap(byStatus);
  const within = resolvedRows.filter((r) => r.ms <= r.due).length;
  const avgMs = resolvedRows.length ? resolvedRows.reduce((a, r) => a + r.ms, 0) / resolvedRows.length : 0;
  return {
    total: Object.values(statusMap).reduce((a, b) => a + b, 0),
    open: OPEN.reduce((a, k) => a + (statusMap[k] ?? 0), 0),
    byStatus: statusMap,
    slaPct: resolvedRows.length ? Math.round((within / resolvedRows.length) * 100) : null,
    resolvedLast30d: resolvedRows.length,
    overdue,
    avgResolutionDays: round1(avgMs / MS_DAY),
    series: fillSeries(30, now, new Map(receivedRows.map((r) => [r._id as string, r.n as number])), new Map(solvedRows.map((r) => [r._id as string, r.n as number]))),
    byCategory: byCategory.map((r) => ({ name: r._id as string, count: r.n as number })),
    byUpazila: byUpazila.map((r) => ({ name: r._id as string, count: r.n as number, open: r.open as number })),
    latest: latest.map((c) => ({ id: String(c._id), trackingId: c.trackingId, category: c.category, upazila: c.upazila, status: c.status, createdAt: new Date(c.createdAt).toISOString() })),
  };
}

async function postsBlock(now: number): Promise<{ posts: NonNullable<Dashboard['posts']>; promises: NonNullable<Dashboard['promises']>; publishedPosts: number }> {
  const since = new Date(now - 30 * MS_DAY);
  const [byStatus, last30d, recent, pByStatus, pAvg, late] = await Promise.all([
    Post.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Post.countDocuments({ createdAt: { $gte: since } }),
    Post.find().sort({ updatedAt: -1 }).limit(5).select('title status eventDate updatedAt media').lean(),
    PromiseItem.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    PromiseItem.aggregate([{ $group: { _id: null, avg: { $avg: '$pct' } } }]),
    PromiseItem.find({ status: 'late' }).sort({ pct: 1, updatedAt: -1 }).limit(5).select('name pct').lean(),
  ]);
  const sMap = toMap(byStatus), pMap = toMap(pByStatus);
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return {
    publishedPosts: sMap.published ?? 0,
    posts: {
      total: sum(sMap), byStatus: sMap, last30d,
      recent: recent.map((p) => ({ id: String(p._id), title: p.title, status: p.status as string, eventDate: p.eventDate ? new Date(p.eventDate).toISOString() : null, updatedAt: new Date(p.updatedAt as Date).toISOString(), ...(p.media?.[0]?.url ? { thumb: p.media[0].url } : {}) })),
    },
    promises: { total: sum(pMap), byStatus: pMap, avgPct: Math.round(pAvg[0]?.avg ?? 0), late: late.map((p) => ({ id: String(p._id), name: p.name, pct: p.pct ?? 0 })) },
  };
}

async function approvalsBlock(): Promise<NonNullable<Dashboard['approvals']>> {
  const [total, items] = await Promise.all([Post.countDocuments({ status: 'review' }), Post.find({ status: 'review' }).sort({ updatedAt: -1 }).limit(5).select('title authorId updatedAt').lean()]);
  const ids = items.map((p) => p._id);
  const [authors, submits] = await Promise.all([
    User.find({ _id: { $in: items.map((p) => p.authorId) } }).select('name').lean(),
    ids.length ? PostVersion.find({ postId: { $in: ids }, action: 'submit' }).sort({ at: -1 }).select('postId at').lean() : Promise.resolve([]),
  ]);
  const nameOf = new Map(authors.map((u) => [String(u._id), u.name as string]));
  const submittedAt = new Map<string, Date>();
  for (const v of submits) if (!submittedAt.has(String(v.postId))) submittedAt.set(String(v.postId), v.at as Date);
  return { total, items: items.map((p) => ({ id: String(p._id), title: p.title, authorName: nameOf.get(String(p.authorId)) ?? '—', submittedAt: new Date(submittedAt.get(String(p._id)) ?? (p.updatedAt as Date)).toISOString() })) };
}

async function contentBlock(publishedPosts: number, promiseCount: number, now: number): Promise<{ content: NonNullable<Dashboard['content']>; events: NonNullable<Dashboard['events']> }> {
  const startOfToday = new Date(dhakaMidnight(now));
  const [gallery, videos, events, upcoming, pages] = await Promise.all([
    GalleryItem.countDocuments({ status: 'published' }),
    VideoItem.countDocuments({ status: 'published' }),
    EventItem.countDocuments({ status: 'published' }),
    EventItem.find({ status: 'published', date: { $gte: startOfToday } }).sort({ date: 1 }).limit(5).select('title date place').lean(),
    PageContent.find({ key: { $in: [...PAGE_KEYS] }, live: { $ne: null } }).select('key').lean(),
  ]);
  const ready = new Set(pages.map((p) => p.key as string));
  const pageRows = PAGE_KEYS.map((key) => ({ key: key as string, label: PAGE_LABELS[key], ready: ready.has(key) }));
  const done = pageRows.filter((p) => p.ready).length + [gallery, videos, events, publishedPosts, promiseCount].filter((n) => n > 0).length;
  const total = PAGE_KEYS.length + 5;
  return {
    content: { gallery, videos, events, readinessPct: Math.round((done / total) * 100), pages: pageRows },
    events: { upcoming: upcoming.map((e) => ({ id: String(e._id), title: e.title, date: new Date(e.date).toISOString(), place: e.place ?? '' })) },
  };
}

/* Audit rows become one Bangla sentence. Unknown / technical actions (login, domains, tenant lifecycle) are skipped so the feed
   stays about the office's work. The audit `reason` (e.g. why an identity was viewed) is never included. */
const NOUN: Record<string, string> = { post: 'পোস্ট', promise: 'প্রতিশ্রুতি', complaint: 'অভিযোগ', media: 'ছবি', profile: 'প্রোফাইল', site: 'সাইট', settings: 'সেটিংস', team: 'টিম', page: 'পেজ', gallery: 'গ্যালারি', video: 'ভিডিও', event: 'কর্মসূচি' };
const VERB: Record<string, string> = {
  create: 'যোগ করা হয়েছে', edit: 'এডিট করা হয়েছে', update: 'হালনাগাদ করা হয়েছে', submit: 'অনুমোদনের জন্য পাঠানো হয়েছে', withdraw: 'ফিরিয়ে নেওয়া হয়েছে',
  approve: 'প্রকাশ করা হয়েছে', publish: 'প্রকাশ করা হয়েছে', publish_scheduled: 'নির্ধারিত সময়ে প্রকাশ হয়েছে', reject: 'ফেরত পাঠানো হয়েছে', unpublish: 'অপ্রকাশিত করা হয়েছে',
  restore: 'পুনরুদ্ধার করা হয়েছে', restore_version: 'পুরনো সংস্করণ ফেরানো হয়েছে', delete: 'মুছে ফেলা হয়েছে', upload: 'আপলোড করা হয়েছে', note: 'নোট যোগ হয়েছে',
  sms: 'SMS পাঠানো হয়েছে', export: 'রিপোর্ট নামানো হয়েছে', pii_view: 'নাগরিকের পরিচয় দেখা হয়েছে', pii_purge: 'মেয়াদোত্তীর্ণ পরিচয় মুছে ফেলা হয়েছে', add_update: 'হালনাগাদ যোগ হয়েছে',
  invite: 'নতুন সদস্যকে আমন্ত্রণ', remove: 'সদস্য সরানো হয়েছে', scope: 'দায়িত্বের এলাকা বদলানো হয়েছে', reorder: 'ক্রম বদলানো হয়েছে', discard: 'খসড়া বাতিল হয়েছে',
};
const SKIP_PREFIX = ['auth.', 'domain.', 'tenant.'];

export function activityLabel(action: string, entityLabel?: string): string | null {
  if (SKIP_PREFIX.some((p) => action.startsWith(p))) return null;
  const [noun, ...rest] = action.split('.');
  const verb = VERB[rest.join('.')] ;
  const n = NOUN[noun ?? ''];
  const base = n && verb ? `${n} ${verb}` : n ? `${n} বদলানো হয়েছে` : 'সাইটে পরিবর্তন';
  return entityLabel ? `${base}: ${entityLabel}` : base;
}

async function activityBlock(canComplaints: boolean): Promise<NonNullable<Dashboard['activity']>> {
  const tenantId = ctx()?.tenantId;
  const rows = await AuditLog.find({ tenantId }).sort({ at: -1 }).limit(40).select('action entity.label actor.name actor.viaSuperAdmin at').lean();
  const items: NonNullable<Dashboard['activity']>['items'] = [];
  for (const r of rows) {
    if (!canComplaints && r.action.startsWith('complaint.')) continue;
    const label = activityLabel(r.action, r.entity?.label ?? undefined);
    if (!label) continue;
    items.push({ action: r.action, label, actorName: r.actor?.viaSuperAdmin ? 'Super Admin' : r.actor?.name ?? 'সিস্টেম', at: new Date(r.at as Date).toISOString() });
    if (items.length >= 8) break;
  }
  return { items };
}

export async function buildDashboard(m: Pick<MemberCtx, 'perms' | 'scope'>, now = Date.now()): Promise<Dashboard> {
  const out: Dashboard = { generatedAt: new Date(now).toISOString() };
  const scope = complaintScope(m);
  const canContent = hasPermission(m.perms, 'posts.view');
  const tasks: Promise<unknown>[] = [];
  if (scope) tasks.push(complaintsBlock(scope, now).then((c) => { out.complaints = c; }));
  if (canContent) {
    tasks.push((async () => {
      const p = await postsBlock(now);
      out.posts = p.posts; out.promises = p.promises;
      const c = await contentBlock(p.publishedPosts, p.promises.total, now);
      out.content = c.content; out.events = c.events;
    })());
  }
  if (hasPermission(m.perms, 'posts.publish')) tasks.push(approvalsBlock().then((a) => { out.approvals = a; }));
  if (hasPermission(m.perms, 'audit.view')) tasks.push(activityBlock(!!scope).then((a) => { out.activity = a; }));
  await Promise.all(tasks);
  return out;
}
