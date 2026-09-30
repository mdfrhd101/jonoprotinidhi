import { siteConfigSchema, tenantSettingsSchema, toBn } from '@jonoshetu/shared';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { SiteConfig, Tenant, Post, PromiseItem, Complaint, type TenantDoc } from '../models/index.js';
import { audit } from '../lib/audit.js';
import type { Config } from '../config.js';
import { ctx } from '../context.js';
import { mediaUrlAllowed } from '../lib/mediaUrl.js';

/* Site configuration, tenant settings, profile and the dashboard numbers. */

const profileSchema = z.object({
  headline: z.string().max(120).optional(), intro: z.string().max(2000).optional(), story: z.array(z.string().max(1500)).max(8).optional(),
  personal: z.array(z.object({ label: z.string().max(40), value: z.string().max(200) })).max(20).optional(),
  education: z.array(z.object({ year: z.string().max(40), title: z.string().max(120), place: z.string().max(120), note: z.string().max(200) })).max(20).optional(),
  profession: z.array(z.object({ year: z.string().max(40), title: z.string().max(120), place: z.string().max(120), note: z.string().max(200) })).max(20).optional(),
  politics: z.array(z.object({ year: z.string().max(40), title: z.string().max(120), place: z.string().max(120), note: z.string().max(200) })).max(20).optional(),
  awards: z.array(z.object({ year: z.string().max(10), title: z.string().max(120), by: z.string().max(120) })).max(20).optional(),
  priorities: z.array(z.object({ title: z.string().max(80), text: z.string().max(200) })).max(8).optional(),
}).strict();

export class SiteService {
  constructor(private cfg: Config) {}

  async getSiteConfig() { return SiteConfig.findOne().lean(); }
  async putSiteConfig(input: unknown, userId: unknown) {
    const d = siteConfigSchema.parse(input);
    for (const b of d.banners) { if (!mediaUrlAllowed(this.cfg, ctx()?.tenantId, b.url)) throw ApiError.unprocessable('MEDIA_HOST_NOT_ALLOWED', 'ব্যানারের ছবির ঠিকানা অনুমোদিত নয়', { url: b.url }); }
    const before = await SiteConfig.findOne().lean();
    const res = await SiteConfig.findOneAndUpdate({}, { $set: { ...d, updatedBy: userId } }, { new: true, upsert: true });
    await Tenant.updateOne({ _id: res!.tenantId }, { $set: { 'theme.accent': d.accent } });
    await audit({ action: 'site.update', entity: { type: 'siteConfig', id: res!._id }, diff: { before: { slogan: before?.slogan, accent: before?.accent }, after: { slogan: d.slogan, accent: d.accent } } });
    return res!;
  }

  async getSettings(t: TenantDoc) { const { otpRequired, slaDays, complaintCategories } = t.settings; return { otpRequired, slaDays, complaintCategories }; }
  async putSettings(t: TenantDoc, input: unknown) {
    const d = tenantSettingsSchema.parse(input);
    if (new Set(d.complaintCategories).size !== d.complaintCategories.length) throw ApiError.validation({ complaintCategories: 'duplicate categories' });
    await Tenant.updateOne({ _id: t._id }, { $set: { 'settings.otpRequired': d.otpRequired, 'settings.slaDays': d.slaDays, 'settings.complaintCategories': d.complaintCategories } });
    await audit({ action: 'settings.update', entity: { type: 'tenant', id: t._id }, diff: { before: { otpRequired: t.settings.otpRequired, slaDays: t.settings.slaDays }, after: { otpRequired: d.otpRequired, slaDays: d.slaDays } } });
    return d;
  }

  /** Aggregate numbers for the dashboard. No PII by construction (counts only). */
  async dashboard(now = Date.now()) {
    const since = new Date(now - 30 * 86400_000);
    const [posts, promises, complaints, resolvedRows, pending] = await Promise.all([
      Post.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      PromiseItem.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Complaint.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Complaint.aggregate([{ $match: { status: { $in: ['solved', 'closed'] }, resolvedAt: { $exists: true }, createdAt: { $gte: since } } }, { $project: { ms: { $subtract: ['$resolvedAt', '$createdAt'] }, due: { $subtract: ['$slaDueAt', '$createdAt'] } } }]),
      Post.countDocuments({ status: 'review' }),
    ]);
    const toMap = (rows: Array<{ _id: string; n: number }>) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
    const within = resolvedRows.filter((r) => r.ms <= r.due).length;
    return { posts: toMap(posts), promises: toMap(promises), complaints: toMap(complaints), pendingApprovals: pending, slaPct: resolvedRows.length ? Math.round((within / resolvedRows.length) * 100) : null, resolvedLast30d: resolvedRows.length };
  }

  async publicSite(t: TenantDoc, domain: string) {
    const cfg = await SiteConfig.findOne().lean();
    const [published, promises, complaints] = await Promise.all([
      Post.countDocuments({ live: { $ne: null }, status: { $ne: 'archived' } }),
      PromiseItem.countDocuments(),
      Complaint.countDocuments({ status: { $ne: 'spam' } }),
    ]);
    return { host: domain, mp: { name: t.mp.name, title: t.mp.title, role: t.mp.role, ministry: t.mp.ministry, seat: `${t.mp.seatName}-${toBn(t.mp.seatNumber)}` }, theme: t.theme, slogan: cfg?.slogan ?? '', banners: cfg?.banners ?? [], sections: cfg?.sections ?? [], counts: { posts: published, promises, complaints }, complaintBoxEnabled: t.settings.complaintBoxEnabled };
  }

}
