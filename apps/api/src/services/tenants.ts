import { toE164Bd, PAGE_KEYS, PAGE_LABELS } from '@jonoprotinidhi/shared';
import { z } from 'zod';
import type { Types } from 'mongoose';
import type { tenantCreateSchema } from '@jonoprotinidhi/shared';
import type { Deps } from '../deps.js';
import { ApiError } from '../errors.js';
import {
  Tenant, Domain, User, Membership, SiteConfig, PageContent, Post, PromiseItem, Complaint, MediaAsset, GalleryItem, VideoItem, EventItem, SmsLog, AuditLog, type TenantDoc,
} from '../models/index.js';
import { generateKey, wrapKey, randomToken, sha256 } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { runInTenant } from '../context.js';
import { hashPassword } from '../lib/password.js';
import { fillSeries } from './dashboard.js';

/* Super-admin operations on tenants and domains. Complainant PII is never reachable from here. */

type TenantInput = z.infer<typeof tenantCreateSchema>;
const STATUS_FLOW: Record<string, string[]> = { setup: ['live'], live: ['suspended'], suspended: ['live', 'setup'] };

const MS_DAY = 86400_000;
const DHAKA_MS = 6 * 3600_000;
const OPEN = ['new', 'verify', 'progress'];
const RESOLVED = ['solved', 'closed'];
const NOT_DELETED = { isDeleted: { $ne: true } };
/** Share of complaints resolved inside their SLA below which a live site is flagged on the platform dashboard. */
export const SLA_TARGET = 80;
/** A live site without a new post for longer than this is "stale" (FR-SA-01). */
export const STALE_DAYS = 14;
const dhakaDay = (ms: number) => new Date(ms + DHAKA_MS).toISOString().slice(0, 10);
const dhakaMidnight = (ms: number) => { const d = new Date(ms + DHAKA_MS); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - DHAKA_MS; };
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

export type TenantStats = {
  publishedPosts: number; lastPostAt: Date | null; postsLast30d: number;
  complaintsLast30d: number; openComplaints: number; overdue: number; resolvedLast30d: number; resolvedInSla30d: number;
  promises: number; imageBytes: number; videoBytes: number; imageFiles: number; videoFiles: number;
  livePages: string[]; gallery: number; videos: number; events: number; smsToday: number; smsMonth: number;
  ownerActive: boolean; ownerInvited: boolean; lastActivityAt: Date | null;
};
const emptyStats = (): TenantStats => ({
  publishedPosts: 0, lastPostAt: null, postsLast30d: 0, complaintsLast30d: 0, openComplaints: 0, overdue: 0, resolvedLast30d: 0, resolvedInSla30d: 0,
  promises: 0, imageBytes: 0, videoBytes: 0, imageFiles: 0, videoFiles: 0, livePages: [], gallery: 0, videos: 0, events: 0, smsToday: 0, smsMonth: 0,
  ownerActive: false, ownerInvited: false, lastActivityAt: null,
});
type DomainRow = { _id: unknown; tenantId: unknown; host: string; type: string; primary?: boolean | null; dnsStatus?: string | null; sslStatus?: string | null };
type AuditRow = { _id: unknown; action: string; entity?: { label?: string | null } | null; actor?: { name?: string | null; viaSuperAdmin?: boolean | null } | null; at?: Date | null };
/** Timeline line for Super Admin screens: no reason, no diff, no IP (the full, redacted row is on the audit page). */
const auditLine = (a: AuditRow) => ({ id: String(a._id), action: a.action, label: a.entity?.label ?? null, actorName: a.actor?.name ?? null, viaSuperAdmin: !!a.actor?.viaSuperAdmin, at: a.at ?? null });

export class TenantService {
  constructor(private d: Deps, private now: () => number = Date.now) {}

  async create(input: TenantInput, actorId: unknown) {
    if (await Tenant.exists({ slug: input.slug })) throw ApiError.conflict('SLUG_TAKEN', 'এই সাবডোমেইন আগে থেকেই আছে');
    const host = `${input.slug}.${this.d.config.PLATFORM_DOMAIN}`;
    if (await Domain.exists({ host })) throw ApiError.conflict('SLUG_TAKEN', 'এই সাবডোমেইন আগে থেকেই আছে');

    const { wrapped, keyVersion } = wrapKey(this.d.master, generateKey());
    const tenant = await Tenant.create({
      slug: input.slug,
      trackingPrefix: input.slug.replace(/-/g, '').toUpperCase().slice(0, 8),
      mp: { name: input.mpName, title: input.mpTitle, role: input.mpRole, ministry: input.ministry, seatName: input.seatName, seatNumber: input.seatNumber },
      status: 'setup',
      plan: input.plan,
      consent: { confirmed: true, documentRef: input.consent.documentRef, receivedAt: new Date(this.now()), confirmedBy: actorId as never },
      dek: { wrapped, keyVersion },
    });
    await Domain.create({ tenantId: tenant._id, host, type: 'platform', primary: true, dnsStatus: 'active', sslStatus: 'active' });

    const phone = toE164Bd(input.ownerPhone);
    let owner = await User.findOne({ phone });
    if (!owner) owner = await User.create({ name: input.ownerName ?? input.mpName, phone, status: 'invited' });
    const token = randomToken(24);
    await Membership.create({ userId: owner._id, tenantId: tenant._id, role: 'owner', status: 'invited', invitedBy: actorId as never, inviteTokenHash: sha256(token), inviteExpiresAt: new Date(this.now() + 72 * 3600_000) });

    await runInTenant(tenant._id, async () => {
      await SiteConfig.create({});
      await PageContent.create({ key: 'profile', draft: {}, status: 'draft', version: 1 }); // the profile page exists from day one
    });
    await this.d.sms.send({ tenantId: tenant._id, to: phone, text: `জনপ্রতিনিধি: আপনার সাইট প্রস্তুত। পাসওয়ার্ড দিতে লিংক: https://admin.${this.d.config.PLATFORM_DOMAIN}/invite/${token}`, purpose: 'invite' });
    await audit({ action: 'tenant.create', tenantId: tenant._id, entity: { type: 'tenant', id: tenant._id, label: input.mpName }, diff: { after: { slug: input.slug, plan: input.plan, consentRef: input.consent.documentRef } } });
    return { tenant, inviteToken: this.d.config.isProd ? undefined : token };
  }

  /* ------------------------------------------------------------------------------------------------------------------
     Platform statistics (Super Admin). COUNTS ONLY: nothing here reads complaint text, complainant name/phone/pii, or a
     phone hash. Tenant-owned models are read OUTSIDE any request tenant context, so the fail-closed tenantId plugin
     would throw; the controlled bypass is an explicit `tenantId: { $in: <every tenant id from the Tenant collection> }`
     as the FIRST $match stage (the plugin accepts an explicit tenantId). Soft-delete models also carry
     `isDeleted: { $ne: true }` in that first stage so deleted rows are never counted (BUG-2026-003).
     ------------------------------------------------------------------------------------------------------------------ */

  /** Per-tenant counters for the given tenants, one grouped aggregate per collection (no N+1). */
  async stats(ids: Types.ObjectId[]): Promise<Map<string, TenantStats>> {
    const now = this.now();
    const since = new Date(now - 30 * MS_DAY), nowD = new Date(now);
    const today = dhakaDay(now), month = today.slice(0, 7);
    const inT = { tenantId: { $in: ids } };
    const byTenant = (field = 'n', extra: Record<string, unknown> = {}) => ({ $group: { _id: '$tenantId', [field]: { $sum: 1 }, ...extra } });
    const cnt = (c: unknown) => ({ $sum: { $cond: [c, 1, 0] } });
    const isOpen = { $in: ['$status', OPEN] }, isResolved30 = { $and: [{ $in: ['$status', RESOLVED] }, { $gte: ['$resolvedAt', since] }] };
    const [posts, complaints, promises, media, pages, gallery, videos, events, sms, owners, activity] = await Promise.all([
      Post.aggregate([{ $match: { ...inT, ...NOT_DELETED } }, { $group: { _id: '$tenantId', published: cnt({ $eq: ['$status', 'published'] }), last: { $max: '$live.publishedAt' }, last30: cnt({ $gte: ['$live.publishedAt', since] }) } }]),
      Complaint.aggregate([{ $match: inT }, { $group: {
        _id: '$tenantId', last30: cnt({ $gte: ['$createdAt', since] }), open: cnt(isOpen),
        overdue: cnt({ $and: [isOpen, { $gt: ['$slaDueAt', null] }, { $lt: ['$slaDueAt', nowD] }] }),
        resolved30: cnt(isResolved30), inSla30: cnt({ $and: [isResolved30, { $gt: ['$slaDueAt', null] }, { $lte: ['$resolvedAt', '$slaDueAt'] }] }),
      } }]),
      PromiseItem.aggregate([{ $match: { ...inT, ...NOT_DELETED } }, byTenant()]),
      MediaAsset.aggregate([{ $match: inT }, { $group: { _id: { t: '$tenantId', k: '$kind' }, bytes: { $sum: '$bytes' }, n: { $sum: 1 } } }]),
      PageContent.aggregate([{ $match: { ...inT, key: { $in: [...PAGE_KEYS] }, live: { $ne: null } } }, { $group: { _id: '$tenantId', keys: { $addToSet: '$key' } } }]),
      GalleryItem.aggregate([{ $match: { ...inT, ...NOT_DELETED, status: 'published' } }, byTenant()]),
      VideoItem.aggregate([{ $match: { ...inT, ...NOT_DELETED, status: 'published' } }, byTenant()]),
      EventItem.aggregate([{ $match: { ...inT, ...NOT_DELETED, status: 'published' } }, byTenant()]),
      SmsLog.aggregate([{ $match: { ...inT, status: 'sent', day: { $regex: `^${month}` } } }, { $group: { _id: '$tenantId', month: { $sum: 1 }, today: cnt({ $eq: ['$day', today] }) } }]),
      Membership.find({ ...inT, role: 'owner', status: { $ne: 'removed' } }).select('tenantId status').lean(),
      // "last activity" = the office's own work or a citizen's complaint, not a Super Admin visit
      AuditLog.aggregate([{ $match: { ...inT, 'actor.viaSuperAdmin': { $ne: true } } }, { $group: { _id: '$tenantId', at: { $max: '$at' } } }]),
    ]);
    const out = new Map<string, TenantStats>();
    const get = (id: unknown) => { const k = String(id); let s = out.get(k); if (!s) { s = emptyStats(); out.set(k, s); } return s; };
    for (const id of ids) get(id);
    for (const r of posts) Object.assign(get(r._id), { publishedPosts: r.published, lastPostAt: r.last ?? null, postsLast30d: r.last30 });
    for (const r of complaints) Object.assign(get(r._id), { complaintsLast30d: r.last30, openComplaints: r.open, overdue: r.overdue, resolvedLast30d: r.resolved30, resolvedInSla30d: r.inSla30 });
    for (const r of promises) get(r._id).promises = r.n;
    for (const r of media) { const s = get(r._id.t); if (r._id.k === 'video') { s.videoBytes += r.bytes; s.videoFiles += r.n; } else { s.imageBytes += r.bytes; s.imageFiles += r.n; } }
    for (const r of pages) get(r._id).livePages = (r.keys as string[]).sort();
    for (const r of gallery) get(r._id).gallery = r.n;
    for (const r of videos) get(r._id).videos = r.n;
    for (const r of events) get(r._id).events = r.n;
    for (const r of sms) Object.assign(get(r._id), { smsToday: r.today, smsMonth: r.month });
    for (const m of owners) { const s = get(m.tenantId); if (m.status === 'active') s.ownerActive = true; else s.ownerInvited = true; }
    for (const r of activity) get(r._id).lastActivityAt = r.at ?? null;
    return out;
  }

  /** One row of the tenant list (and the `summary` of the detail view). */
  row(t: TenantDoc, s: TenantStats, doms: DomainRow[]) {
    const now = this.now();
    const days = s.lastPostAt ? Math.floor((now - new Date(s.lastPostAt).getTime()) / MS_DAY) : null;
    return {
      id: String(t._id), slug: t.slug, mpName: t.mp.name, seat: `${t.mp.seatName}-${t.mp.seatNumber}`, seatName: t.mp.seatName, seatNumber: t.mp.seatNumber,
      role: t.mp.role, ministry: t.mp.ministry ?? '', status: t.status, plan: t.plan, createdAt: t.get('createdAt') as Date,
      publishedPosts: s.publishedPosts, postsLast30d: s.postsLast30d, daysSinceLastPost: days, stale: t.status === 'live' && (days === null || days > STALE_DAYS),
      complaintsLast30d: s.complaintsLast30d, openComplaints: s.openComplaints, overdue: s.overdue, slaPct: pct(s.resolvedInSla30d, s.resolvedLast30d),
      promises: s.promises, ownerActive: s.ownerActive, lastActivityAt: s.lastActivityAt,
      domains: doms.map((d) => ({ id: String(d._id), host: d.host, type: d.type, primary: !!d.primary, dnsStatus: d.dnsStatus, sslStatus: d.sslStatus })),
    };
  }

  async list() {
    const tenants = await Tenant.find().sort({ createdAt: -1 });
    const ids = tenants.map((t) => t._id);
    const [stats, doms] = await Promise.all([this.stats(ids), Domain.find({ tenantId: { $in: ids } }).sort({ primary: -1, createdAt: 1 }).lean()]);
    return tenants.map((t) => this.row(t, stats.get(String(t._id)) ?? emptyStats(), doms.filter((d) => String(d.tenantId) === String(t._id)) as DomainRow[]));
  }

  /** Counts only, never complaint content or identities. */
  async summary(t: TenantDoc) {
    const s = (await this.stats([t._id])).get(String(t._id)) ?? emptyStats();
    return this.row(t, s, (await Domain.find({ tenantId: t._id }).lean()) as DomainRow[]);
  }

  async get(id: string) {
    const t = await Tenant.findById(id);
    if (!t) throw ApiError.notFound();
    const [domains, statsMap, members] = await Promise.all([
      Domain.find({ tenantId: t._id }).sort({ primary: -1, createdAt: 1 }),
      this.stats([t._id]),
      Membership.find({ tenantId: t._id, status: { $ne: 'removed' } }).select('userId role status').lean(),
    ]);
    const s = statsMap.get(String(t._id)) ?? emptyStats();
    const owner = members.find((m) => m.role === 'owner' && m.status === 'active') ?? members.find((m) => m.role === 'owner');
    const ownerUser = owner ? await User.findById(owner.userId).select('name').lean() : null;
    const team: Record<string, { active: number; invited: number }> = { owner: { active: 0, invited: 0 }, editor: { active: 0, invited: 0 }, officer: { active: 0, invited: 0 } };
    for (const m of members) { const r = team[m.role]; if (r) r[m.status === 'active' ? 'active' : 'invited'] += 1; }
    const ready = new Set(s.livePages);
    const pages = PAGE_KEYS.map((key) => ({ key: key as string, label: PAGE_LABELS[key], ready: ready.has(key) }));
    const done = pages.filter((p) => p.ready).length + [s.gallery, s.videos, s.events, s.publishedPosts, s.promises].filter((n) => n > 0).length;
    const recent = await AuditLog.find({ tenantId: t._id }).sort({ at: -1 }).limit(8).select('action entity.label actor.name actor.viaSuperAdmin at').lean();
    return {
      tenant: t,
      summary: this.row(t, s, domains as unknown as DomainRow[]),
      domains,
      team: { owner: owner ? { name: ownerUser?.name ?? '—', status: owner.status } : null, byRole: team },
      content: { pages, gallery: s.gallery, videos: s.videos, events: s.events, publishedPosts: s.publishedPosts, promises: s.promises, readinessPct: Math.round((done / (PAGE_KEYS.length + 5)) * 100) },
      usage: { imageBytes: s.imageBytes, videoBytes: s.videoBytes, imageFiles: s.imageFiles, videoFiles: s.videoFiles, smsToday: s.smsToday, smsMonth: s.smsMonth, smsDailyCap: Math.min(t.settings.dailySmsCap ?? this.d.config.DAILY_SMS_CAP, this.d.config.DAILY_SMS_CAP) },
      complaints: { last30d: s.complaintsLast30d, open: s.openComplaints, overdue: s.overdue, resolvedLast30d: s.resolvedLast30d, slaPct: pct(s.resolvedInSla30d, s.resolvedLast30d) },
      audit: recent.map(auditLine),
    };
  }

  /** Platform dashboard (docs/04 §5, FR-SA-01): aggregates across every tenant, counts only. */
  async dashboard() {
    const now = this.now();
    const since = new Date(now - 30 * MS_DAY), since60 = new Date(now - 60 * MS_DAY);
    const windowStart = new Date(dhakaMidnight(now - 29 * MS_DAY));
    const today = dhakaDay(now), month = today.slice(0, 7);
    const tenants = await Tenant.find().sort({ createdAt: -1 });
    const ids = tenants.map((t) => t._id);
    const inT = { tenantId: { $in: ids } };
    const day = (field: string) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: '+06:00' } });
    const [stats, doms, received, solved, prevComplaints, prevPosts, smsToday, smsMonth, smsFailedToday, recent] = await Promise.all([
      this.stats(ids),
      Domain.find().lean(),
      Complaint.aggregate([{ $match: { ...inT, createdAt: { $gte: windowStart } } }, { $group: { _id: day('createdAt'), n: { $sum: 1 } } }]),
      Complaint.aggregate([{ $match: { ...inT, status: { $in: RESOLVED }, resolvedAt: { $gte: windowStart } } }, { $group: { _id: day('resolvedAt'), n: { $sum: 1 } } }]),
      Complaint.countDocuments({ ...inT, createdAt: { $gte: since60, $lt: since } }),
      Post.countDocuments({ ...inT, 'live.publishedAt': { $gte: since60, $lt: since } }),
      SmsLog.countDocuments({ day: today, status: 'sent' }),
      SmsLog.countDocuments({ day: { $regex: `^${month}` }, status: 'sent' }),
      SmsLog.countDocuments({ day: today, status: 'failed' }),
      AuditLog.find({ $or: [{ 'actor.viaSuperAdmin': true }, { action: /^(tenant|domain)\./ }] }).sort({ at: -1 }).limit(10).select('action entity.label tenantId actor.name actor.viaSuperAdmin at').lean(),
    ]);
    const S = (t: TenantDoc) => stats.get(String(t._id)) ?? emptyStats();
    const sum = (f: (s: TenantStats) => number) => tenants.reduce((a, t) => a + f(S(t)), 0);
    const count = (st: string) => tenants.filter((t) => t.status === st).length;
    const cap = this.d.config.DAILY_SMS_CAP;
    const capOf = (t: TenantDoc) => Math.min(t.settings.dailySmsCap ?? cap, cap);
    const active = tenants.filter((t) => t.status !== 'suspended');
    const custom = doms.filter((d) => d.type === 'custom');
    const pendingDomains = custom.filter((d) => d.dnsStatus !== 'active');
    const sslSoon = custom.filter((d) => d.dnsStatus === 'active' && d.sslExpiresAt && new Date(d.sslExpiresAt).getTime() < now + 14 * MS_DAY);
    const nameOf = new Map(tenants.map((t) => [String(t._id), t]));
    const resolved30 = sum((s) => s.resolvedLast30d);
    const busiest = [...active].map((t) => ({ t, used: S(t).smsToday, cap: capOf(t) })).sort((a, b) => b.used / b.cap - a.used / a.cap)[0];

    /* "needs attention": one entry per (tenant, reason), most urgent first */
    type Attn = { kind: 'suspended' | 'domain' | 'sla' | 'stale' | 'unpublished' | 'setup'; tone: 'bad' | 'warn' | 'info'; tenantId: string; mpName: string; seatName: string; seatNumber: number; slug: string; [k: string]: unknown };
    const attention: Attn[] = [];
    for (const t of tenants) {
      const s = S(t), base = { tenantId: String(t._id), mpName: t.mp.name, seatName: t.mp.seatName, seatNumber: t.mp.seatNumber, slug: t.slug };
      const days = s.lastPostAt ? Math.floor((now - new Date(s.lastPostAt).getTime()) / MS_DAY) : null;
      const slaPct = pct(s.resolvedInSla30d, s.resolvedLast30d);
      const tDoms = pendingDomains.filter((d) => String(d.tenantId) === String(t._id)).map((d) => d.host);
      const tSsl = sslSoon.filter((d) => String(d.tenantId) === String(t._id)).map((d) => d.host);
      if (t.status === 'suspended') { attention.push({ ...base, kind: 'suspended', tone: 'bad', since: t.statusHistory?.at(-1)?.at ?? null }); continue; }
      if (tDoms.length || tSsl.length) attention.push({ ...base, kind: 'domain', tone: 'warn', hosts: tDoms, sslExpiring: tSsl });
      if (t.status === 'setup') { attention.push({ ...base, kind: 'setup', tone: 'info', ownerActive: s.ownerActive, pagesReady: s.livePages.length, pagesTotal: PAGE_KEYS.length }); continue; }
      if ((slaPct !== null && slaPct < SLA_TARGET) || s.overdue > 0) attention.push({ ...base, kind: 'sla', tone: 'bad', slaPct, target: SLA_TARGET, overdue: s.overdue });
      if (days === null || days > STALE_DAYS) attention.push({ ...base, kind: 'stale', tone: 'warn', daysSinceLastPost: days });
      if (s.livePages.length < PAGE_KEYS.length) attention.push({ ...base, kind: 'unpublished', tone: s.livePages.includes('profile') ? 'info' : 'warn', pagesReady: s.livePages.length, pagesTotal: PAGE_KEYS.length, profilePublished: s.livePages.includes('profile') });
    }
    const RANK = { suspended: 0, sla: 1, domain: 2, stale: 3, unpublished: 4, setup: 5 } as const;
    attention.sort((a, b) => RANK[a.kind] - RANK[b.kind]);

    const openByTenant = tenants.map((t) => ({ id: String(t._id), mpName: t.mp.name, seatName: t.mp.seatName, seatNumber: t.mp.seatNumber, status: t.status, open: S(t).openComplaints, overdue: S(t).overdue }))
      .filter((r) => r.open > 0).sort((a, b) => b.open - a.open || b.overdue - a.overdue).slice(0, 8);
    const staleRows = tenants.map((t) => this.row(t, S(t), [])).filter((r) => r.stale);

    return {
      generatedAt: new Date(now).toISOString(),
      // legacy flat fields (kept for older clients and tests)
      tenants: tenants.length, live: count('live'), setup: count('setup'), suspended: count('suspended'),
      complaintsLast30d: sum((s) => s.complaintsLast30d),
      stale: staleRows.map((r) => ({ id: r.id, slug: r.slug, daysSinceLastPost: r.daysSinceLastPost })),
      kpis: {
        tenants: { total: tenants.length, live: count('live'), setup: count('setup'), suspended: count('suspended'), ministers: tenants.filter((t) => t.mp.role !== 'mp').length, newLast30d: tenants.filter((t) => (t.get('createdAt') as Date) >= since).length },
        complaints: { last30d: sum((s) => s.complaintsLast30d), prev30d: prevComplaints, open: sum((s) => s.openComplaints), overdue: sum((s) => s.overdue), resolvedLast30d: resolved30, slaPct: pct(sum((s) => s.resolvedInSla30d), resolved30), slaTarget: SLA_TARGET },
        posts: { publishedLast30d: sum((s) => s.postsLast30d), prev30d: prevPosts, publishedTotal: sum((s) => s.publishedPosts) },
        media: { imageBytes: sum((s) => s.imageBytes), videoBytes: sum((s) => s.videoBytes), imageFiles: sum((s) => s.imageFiles), videoFiles: sum((s) => s.videoFiles) },
        sms: { today: smsToday, month: smsMonth, failedToday: smsFailedToday, capPerTenant: cap, dailyCapacity: active.reduce((a, t) => a + capOf(t), 0),
          busiest: busiest && busiest.used > 0 ? { tenantId: String(busiest.t._id), mpName: busiest.t.mp.name, used: busiest.used, cap: busiest.cap } : null },
        domains: { custom: custom.length, pending: pendingDomains.length, error: pendingDomains.filter((d) => d.dnsStatus === 'error').length, sslExpiringSoon: sslSoon.length },
      },
      series: fillSeries(30, now, new Map(received.map((r) => [r._id as string, r.n as number])), new Map(solved.map((r) => [r._id as string, r.n as number]))),
      openByTenant,
      attention,
      activity: recent.map((a) => ({ ...auditLine(a), tenantId: a.tenantId ? String(a.tenantId) : null, tenantName: a.tenantId ? nameOf.get(String(a.tenantId))?.mp.name ?? null : null })),
    };
  }

  /** Is this subdomain free? (wizard: live check while typing) */
  async slugAvailable(slug: string) {
    const host = `${slug}.${this.d.config.PLATFORM_DOMAIN}`;
    const taken = !!(await Tenant.exists({ slug })) || !!(await Domain.exists({ host }));
    return { slug, host, available: !taken };
  }

  /** Every domain on the platform with its tenant (the Domains screen). TXT values are public DNS records, not secrets. */
  async listDomains() {
    const [doms, tenants] = await Promise.all([Domain.find().sort({ dnsStatus: 1, createdAt: -1 }).lean(), Tenant.find().select('slug mp.name mp.seatName mp.seatNumber status').lean()]);
    const byId = new Map(tenants.map((t) => [String(t._id), t]));
    return doms.map((d) => {
      const t = byId.get(String(d.tenantId));
      return {
        id: String(d._id), host: d.host, type: d.type, primary: !!d.primary, dnsStatus: d.dnsStatus, sslStatus: d.sslStatus, sslExpiresAt: d.sslExpiresAt ?? null,
        verifiedAt: d.verification?.verifiedAt ?? null, txtName: d.type === 'custom' ? d.verification?.txtName ?? null : null, txtValue: d.type === 'custom' ? d.verification?.txtValue ?? null : null,
        createdAt: d.createdAt, tenantId: String(d.tenantId), mpName: t?.mp?.name ?? '—', seatName: t?.mp?.seatName ?? '', seatNumber: t?.mp?.seatNumber ?? 0, slug: t?.slug ?? '', tenantStatus: t?.status ?? null,
      };
    });
  }

  async setStatus(id: string, to: 'setup' | 'live' | 'suspended', reason: string, contentChecked?: boolean) {
    const t = await Tenant.findById(id);
    if (!t) throw ApiError.notFound();
    if (!STATUS_FLOW[t.status]?.includes(to)) throw ApiError.unprocessable('BAD_TRANSITION', `${t.status} থেকে ${to} করা যাবে না`);
    if (to === 'live') {
      if (!contentChecked) throw ApiError.unprocessable('CONTENT_NOT_CHECKED', 'লাইভ করার আগে কনটেন্ট ও সম্মতি যাচাই নিশ্চিত করুন');
      if (!t.consent?.confirmed) throw ApiError.unprocessable('NO_CONSENT', 'MP অফিসের সম্মতি নেই');
      const owner = await Membership.exists({ tenantId: t._id, role: 'owner', status: 'active' });
      if (!owner) throw ApiError.unprocessable('NO_ACTIVE_OWNER', 'MP এখনো অ্যাকাউন্ট চালু করেননি');
    }
    const from = t.status;
    await Tenant.updateOne({ _id: t._id }, { $set: { status: to }, $push: { statusHistory: { from, to, reason, at: new Date(this.now()) } } });
    await audit({ action: `tenant.status.${to}`, tenantId: t._id, entity: { type: 'tenant', id: t._id, label: t.mp.name }, diff: { before: { status: from }, after: { status: to } }, reason });
    return { from, to };
  }

  async addDomain(tenantId: string, host: string) {
    const t = await Tenant.findById(tenantId);
    if (!t) throw ApiError.notFound();
    if (await Domain.exists({ host })) throw ApiError.conflict('DOMAIN_TAKEN', 'এই ডোমেইন আগে থেকেই যুক্ত');
    const value = 'jonoprotinidhi-verify=' + randomToken(6);
    const dom = await Domain.create({ tenantId: t._id, host, type: 'custom', dnsStatus: 'pending', sslStatus: 'pending', verification: { txtName: `_jonoprotinidhi.${host}`, txtValue: value } });
    await audit({ action: 'domain.add', tenantId: t._id, entity: { type: 'domain', id: dom._id, label: host } });
    return dom;
  }

  async verifyDomain(domainId: string) {
    const dom = await Domain.findById(domainId);
    if (!dom || dom.type !== 'custom') throw ApiError.notFound();
    const ok = await this.d.domainProvider.verifyTxt(dom.host, dom.verification?.txtValue ?? '');
    if (!ok) { await Domain.updateOne({ _id: dom._id }, { $set: { dnsStatus: 'error' } }); throw ApiError.unprocessable('DNS_NOT_READY', 'DNS রেকর্ড এখনো পাওয়া যায়নি'); }
    await Domain.updateOne({ _id: dom._id }, { $set: { dnsStatus: 'active', sslStatus: 'active', 'verification.verifiedAt': new Date(this.now()), sslExpiresAt: new Date(this.now() + 90 * 86400_000) } });
    await audit({ action: 'domain.verify', tenantId: dom.tenantId, entity: { type: 'domain', id: dom._id, label: dom.host } });
    return Domain.findById(dom._id);
  }

  async setPrimary(domainId: string) {
    const dom = await Domain.findById(domainId);
    if (!dom) throw ApiError.notFound();
    if (dom.dnsStatus !== 'active') throw ApiError.unprocessable('DOMAIN_NOT_ACTIVE', 'ডোমেইন যাচাই না হলে প্রধান করা যাবে না');
    await Domain.updateMany({ tenantId: dom.tenantId }, { $set: { primary: false } });
    await Domain.updateOne({ _id: dom._id }, { $set: { primary: true } });
    await audit({ action: 'domain.primary', tenantId: dom.tenantId, entity: { type: 'domain', id: dom._id, label: dom.host } });
  }

  /** Public-site routing: Host header -> tenant. Suspended => 503, not live/unknown => 404. */
  async resolveHost(rawHost: string): Promise<{ tenant: TenantDoc; domain: string }> {
    const host = String(rawHost ?? '').toLowerCase().replace(/:\d+$/, '').trim();
    const dom = host ? await Domain.findOne({ host }) : null;
    if (!dom) throw ApiError.notFound('সাইট পাওয়া যায়নি');
    // A custom domain serves the site only after its ownership was proven by the DNS TXT check (BUG-2026-006)
    if (dom.type === 'custom' && dom.dnsStatus !== 'active') throw ApiError.notFound('সাইট পাওয়া যায়নি');
    const tenant = await Tenant.findById(dom.tenantId).select('+dek.wrapped');
    if (!tenant || tenant.status === 'setup') throw ApiError.notFound('সাইট পাওয়া যায়নি');
    if (tenant.status === 'suspended') throw new ApiError(503, 'SITE_SUSPENDED', 'সাইটটি সাময়িকভাবে বন্ধ আছে');
    return { tenant, domain: host };
  }
}

export { hashPassword };
