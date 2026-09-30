import { z } from 'zod';
import { postInputSchema, postDraftSchema, postPatchSchema, nextPostStatus, type PostAction, type PostStatus, type PostInput } from '@jonoshetu/shared';
import type { Types } from 'mongoose';
import { ApiError } from '../errors.js';
import { Post, PostVersion, Tenant, type PostDoc } from '../models/index.js';
import { audit } from '../lib/audit.js';
import { sanitizeRichText } from '../lib/richtext.js';
import { mediaUrlAllowed } from '../lib/mediaUrl.js';
import { makeSlug, escapeRegex, parsePaging } from '../lib/sanitize.js';
import { ctx, runInTenant } from '../context.js';
import type { Config } from '../config.js';

/* Content workflow (ADR-0005). Editors create and submit; the owner approves, rejects, schedules, unpublishes.
   `live` (what the public sees) is separate from the working copy, so editing a published post never changes the
   public page until the owner approves the change. */

type Actor = { userId: Types.ObjectId | string; name: string; viaSuperAdmin: boolean };
const SNAP = ['title', 'summary', 'body', 'quote', 'category', 'upazila', 'place', 'eventDate', 'media'] as const;

const snapshotOf = (p: Record<string, unknown>) => Object.fromEntries(SNAP.map((k) => [k, p[k]]));

export class PostService {
  constructor(private cfg: Config, private now: () => number = Date.now) {}

  /** An image must be one of this tenant's own uploads or sit on an allow-listed host. */
  private checkMedia(media: Array<{ url: string }> | undefined) {
    for (const m of media ?? []) if (!mediaUrlAllowed(this.cfg, ctx()?.tenantId, m.url)) throw ApiError.unprocessable('MEDIA_HOST_NOT_ALLOWED', 'ছবির ঠিকানা অনুমোদিত নয়', { url: m.url });
  }

  private async version(post: PostDoc, action: 'create' | 'edit' | 'submit' | 'approve' | 'reject' | 'schedule' | 'unpublish' | 'restore' | 'withdraw' | 'publish', actor: Actor) {
    await PostVersion.create({ postId: post._id, version: post.version, action, snapshot: snapshotOf(post.toObject()), by: { userId: actor.userId as never, name: actor.name, viaSuperAdmin: actor.viaSuperAdmin } });
  }

  private async load(id: string): Promise<PostDoc> {
    const p = await Post.findById(id);
    if (!p) throw ApiError.notFound('পোস্ট পাওয়া যায়নি');
    return p;
  }

  async create(input: unknown, actor: Actor) {
    const data = postDraftSchema.parse(input);
    if (data.body !== undefined) data.body = sanitizeRichText(data.body);
    this.checkMedia(data.media);
    const post = await Post.create({ ...data, slug: makeSlug(data.title), status: 'draft', authorId: actor.userId as never, version: 1 });
    await this.version(post, 'create', actor);
    await audit({ action: 'post.create', entity: { type: 'post', id: post._id, label: post.title } });
    return post;
  }

  async update(id: string, input: unknown, actor: Actor, canEditAny: boolean) {
    const post = await this.load(id);
    if (!canEditAny && String(post.authorId) !== String(actor.userId)) throw ApiError.forbidden('শুধু নিজের পোস্ট এডিট করা যায়');
    if (post.status === 'scheduled' || post.status === 'archived') throw ApiError.unprocessable('NOT_EDITABLE', 'এই অবস্থায় এডিট করা যায় না');
    const data = postPatchSchema.parse(input);
    if (data.body !== undefined) data.body = sanitizeRichText(data.body);
    if (data.version !== undefined && data.version !== post.version) throw ApiError.conflict('VERSION_CONFLICT', 'পোস্টটি অন্য কেউ বদলেছেন, পাতা রিফ্রেশ করুন');
    this.checkMedia(data.media);
    const { version: _v, ...fields } = data;
    const nextStatus: PostStatus = post.status === 'published' ? 'review' : post.status === 'rejected' ? 'draft' : post.status;
    const before = snapshotOf(post.toObject());
    const res = await Post.findOneAndUpdate({ _id: post._id, version: post.version }, { $set: { ...fields, status: nextStatus, rejectReason: undefined }, $inc: { version: 1 } }, { new: true });
    if (!res) throw ApiError.conflict('VERSION_CONFLICT', 'পোস্টটি অন্য কেউ বদলেছেন, পাতা রিফ্রেশ করুন');
    await this.version(res, 'edit', actor);
    await audit({ action: 'post.edit', entity: { type: 'post', id: post._id, label: res.title }, diff: { before, after: snapshotOf(res.toObject()) } });
    return res;
  }

  /** A post must be complete before it can be submitted or approved. */
  private assertComplete(post: PostDoc): PostInput {
    const parsed = postInputSchema.safeParse({ ...snapshotOf(post.toObject()), eventDate: post.eventDate });
    if (!parsed.success) throw ApiError.unprocessable('INCOMPLETE', 'পোস্ট অসম্পূর্ণ: শিরোনাম, সারাংশ ইত্যাদি পূরণ করুন', parsed.error.flatten().fieldErrors);
    return parsed.data;
  }

  private async transition(id: string, action: PostAction, actor: Actor, opts: { version?: number; scheduledAt?: Date; reason?: string; own?: boolean }) {
    const post = await this.load(id);
    if (opts.own && String(post.authorId) !== String(actor.userId)) throw ApiError.forbidden();
    if (opts.version !== undefined && opts.version !== post.version) throw ApiError.conflict('VERSION_CONFLICT', 'পোস্টটি অন্য কেউ বদলেছেন। যা দেখে অনুমোদন দিচ্ছেন সেটি এখন আর হালনাগাদ নয়');
    const to = nextPostStatus(post.status as PostStatus, action);
    if (!to) throw ApiError.unprocessable('BAD_TRANSITION', `${post.status} অবস্থায় "${action}" করা যায় না`);
    return { post, to };
  }

  async submit(id: string, actor: Actor) {
    const { post, to } = await this.transition(id, 'submit', actor, { own: false });
    this.assertComplete(post);
    const res = await Post.findOneAndUpdate({ _id: post._id, version: post.version }, { $set: { status: to, rejectReason: undefined }, $inc: { version: 1 } }, { new: true });
    if (!res) throw ApiError.conflict('VERSION_CONFLICT', 'পোস্টটি অন্য কেউ বদলেছেন');
    await this.version(res, 'submit', actor);
    await audit({ action: 'post.submit', entity: { type: 'post', id: post._id, label: post.title } });
    return res;
  }

  async withdraw(id: string, actor: Actor) {
    const { post, to } = await this.transition(id, 'withdraw', actor, { own: true });
    const res = await Post.findOneAndUpdate({ _id: post._id, version: post.version }, { $set: { status: to }, $inc: { version: 1 } }, { new: true });
    await this.version(res!, 'withdraw', actor);
    await audit({ action: 'post.withdraw', entity: { type: 'post', id: post._id, label: post.title } });
    return res!;
  }

  async approve(id: string, actor: Actor, opts: { scheduledAt?: Date; version?: number } = {}) {
    const wantsSchedule = !!opts.scheduledAt && opts.scheduledAt.getTime() > this.now();
    const { post, to } = await this.transition(id, wantsSchedule ? 'schedule' : 'approve', actor, { version: opts.version });
    const data = this.assertComplete(post);
    const set: Record<string, unknown> = { status: to, approvedBy: actor.userId, rejectReason: undefined };
    if (to === 'published') set.live = { ...pickLive(data), publishedAt: new Date(this.now()) };
    else set.scheduledAt = opts.scheduledAt;
    const res = await Post.findOneAndUpdate({ _id: post._id, version: post.version }, { $set: set, $inc: { version: 1 } }, { new: true });
    if (!res) throw ApiError.conflict('VERSION_CONFLICT', 'পোস্টটি অন্য কেউ বদলেছেন');
    await this.version(res, to === 'published' ? 'approve' : 'schedule', actor);
    await audit({ action: to === 'published' ? 'post.approve' : 'post.schedule', entity: { type: 'post', id: post._id, label: post.title }, diff: { before: { status: post.status }, after: { status: to, scheduledAt: opts.scheduledAt } } });
    return res;
  }

  async reject(id: string, reason: string, actor: Actor) {
    const { post, to } = await this.transition(id, 'reject', actor, {});
    const res = await Post.findOneAndUpdate({ _id: post._id, version: post.version }, { $set: { status: to, rejectReason: reason }, $inc: { version: 1 } }, { new: true });
    await this.version(res!, 'reject', actor);
    await audit({ action: 'post.reject', entity: { type: 'post', id: post._id, label: post.title }, reason });
    return res!;
  }

  async unpublish(id: string, actor: Actor) {
    const { post, to } = await this.transition(id, 'unpublish', actor, {});
    const res = await Post.findOneAndUpdate({ _id: post._id, version: post.version }, { $set: { status: to }, $inc: { version: 1 } }, { new: true });
    await this.version(res!, 'unpublish', actor);
    await audit({ action: 'post.unpublish', entity: { type: 'post', id: post._id, label: post.title } });
    return res!;
  }

  async restoreArchived(id: string, actor: Actor) {
    const { post, to } = await this.transition(id, 'restore', actor, {});
    const res = await Post.findOneAndUpdate({ _id: post._id, version: post.version }, { $set: { status: to }, $inc: { version: 1 } }, { new: true });
    await this.version(res!, 'restore', actor);
    await audit({ action: 'post.restore', entity: { type: 'post', id: post._id, label: post.title } });
    return res!;
  }

  async remove(id: string, actor: Actor) {
    const post = await this.load(id);
    if (!['draft', 'rejected'].includes(post.status)) throw ApiError.unprocessable('NOT_DELETABLE', 'প্রকাশিত বা অপেক্ষমাণ পোস্ট মোছা যায় না; আগে অপ্রকাশিত করুন');
    await Post.updateOne({ _id: post._id }, { $set: { isDeleted: true, deletedAt: new Date(this.now()), deletedBy: String(actor.userId) } });
    await audit({ action: 'post.delete', entity: { type: 'post', id: post._id, label: post.title } });
  }

  async versions(id: string) {
    await this.load(id);
    return PostVersion.find({ postId: id }).sort({ version: -1 }).limit(100).lean();
  }

  /** Restoring copies an old snapshot into the working copy; going live still needs approval. */
  async restoreVersion(id: string, v: number, actor: Actor) {
    const post = await this.load(id);
    const snap = await PostVersion.findOne({ postId: post._id, version: v }).lean();
    if (!snap) throw ApiError.notFound('সংস্করণ পাওয়া যায়নি');
    const status: PostStatus = post.status === 'published' ? 'review' : post.status === 'archived' || post.status === 'scheduled' ? post.status : 'draft';
    const res = await Post.findOneAndUpdate({ _id: post._id, version: post.version }, { $set: { ...(snap.snapshot as object), status }, $inc: { version: 1 } }, { new: true });
    if (!res) throw ApiError.conflict('VERSION_CONFLICT', 'পোস্টটি অন্য কেউ বদলেছেন');
    await this.version(res, 'restore', actor);
    await audit({ action: 'post.restore_version', entity: { type: 'post', id: post._id, label: post.title }, reason: `v${v}` });
    return res;
  }

  async list(q: { status?: string; category?: string; q?: string; page?: number; limit?: number; paged?: boolean }) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.category) filter.category = q.category;
    if (q.q) filter.title = new RegExp(escapeRegex(q.q), 'i');
    const find = Post.find(filter).sort({ eventDate: -1, _id: -1 }).select('-live').lean();
    if (!q.paged) return { items: await find };
    const page = q.page ?? 1, limit = q.limit ?? 20;
    const [items, total] = await Promise.all([find.skip((page - 1) * limit).limit(limit), Post.countDocuments(filter)]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async get(id: string) { return this.load(id); }

  /** Job: publish scheduled posts that are due. Iterates tenants and runs each inside its own tenant context. */
  async publishDue(): Promise<number> {
    let n = 0;
    const tenants = await Tenant.find().select('_id');
    for (const t of tenants) {
      n += await runInTenant(t._id, async () => {
        const due = await Post.find({ status: 'scheduled', scheduledAt: { $lte: new Date(this.now()) } });
        let c = 0;
        for (const post of due) {
          const parsed = postInputSchema.safeParse({ ...snapshotOf(post.toObject()) });
          if (!parsed.success) continue;
          const res = await Post.findOneAndUpdate({ _id: post._id, version: post.version, status: 'scheduled' }, { $set: { status: 'published', live: { ...pickLive(parsed.data), publishedAt: new Date(this.now()) }, scheduledAt: undefined }, $inc: { version: 1 } }, { new: true });
          if (res) { c++; await PostVersion.create({ postId: res._id, version: res.version, action: 'publish', snapshot: snapshotOf(res.toObject()), by: { name: 'scheduler' } }); await audit({ action: 'post.publish_scheduled', entity: { type: 'post', id: res._id, label: res.title } }); }
        }
        return c;
      });
    }
    return n;
  }

  /* ---------- public reads: only the approved `live` copy ---------- */
  private liveFilter = { live: { $ne: null }, status: { $ne: 'archived' } };
  private toPublic(p: { slug: string; live?: Record<string, unknown> | null }) { return { slug: p.slug, ...(p.live ?? {}) }; }

  async publicList(q: { category?: string; upazila?: string; month?: string; page: number; limit: number }) {
    const filter: Record<string, unknown> = { ...this.liveFilter };
    if (q.category) filter['live.category'] = q.category;
    if (q.upazila) filter['live.upazila'] = q.upazila;
    if (q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month)) {
      const [y, m] = q.month.split('-').map(Number) as [number, number];
      filter['live.eventDate'] = { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
    }
    const [rows, total] = await Promise.all([
      Post.find(filter).sort({ 'live.eventDate': -1 }).skip((q.page - 1) * q.limit).limit(q.limit).select('slug live').lean(),
      Post.countDocuments(filter),
    ]);
    return { items: rows.map((r) => this.toPublic(r as never)), page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) };
  }

  async publicGet(slug: string) {
    const p = await Post.findOne({ slug, ...this.liveFilter }).select('slug live').lean();
    if (!p) throw ApiError.notFound('খবরটি পাওয়া যায়নি');
    return this.toPublic(p as never);
  }
}

function pickLive(d: PostInput) {
  return { title: d.title, summary: d.summary, body: d.body, quote: d.quote, category: d.category, upazila: d.upazila, place: d.place, eventDate: d.eventDate, media: d.media };
}
export { ctx, z };
