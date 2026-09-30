import type { Model } from 'mongoose';
import {
  eventInputSchema, eventPatchSchema, galleryInputSchema, galleryPatchSchema, videoInputSchema, videoPatchSchema, parseYouTubeId,
} from '@jonoshetu/shared';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';
import { ctx } from '../context.js';
import { EventItem, GalleryItem, VideoItem } from '../models/index.js';
import { audit } from '../lib/audit.js';
import { escapeRegex, isObjectId } from '../lib/sanitize.js';
import { mediaUrl, mediaUrlAllowed } from '../lib/mediaUrl.js';
import type { MediaService } from './media.js';

/* Events, gallery photos and videos. Each item is `draft` or `published`. Editors (content.edit) create and change drafts;
   only someone with content.publish can publish, unpublish or delete a published item. When an editor changes a published
   item it goes back to `draft` (the owner approves the new version), so the public never shows unapproved text. */

export type Who = { userId: unknown; name: string; canPublish: boolean };

const dhakaToday = (now: number) => { const d = new Date(now + 6 * 3600_000); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() - 6 * 3600_000); };

type Doc = { _id: unknown; status?: string | null; title?: string | null; caption?: string | null };

abstract class Base<D extends Doc> {
  protected abstract model: Model<any>;
  protected abstract entity: string;
  protected abstract label(d: D): string;
  protected abstract searchFields: string[];
  protected sort: Record<string, 1 | -1> = { createdAt: -1 };
  constructor(protected cfg: Config, protected now: () => number = Date.now) {}

  protected abstract shape(d: D, aux?: any): Record<string, unknown>;
  /** Optional batch lookup (e.g. file URLs of uploaded videos) done once per request, passed to shape(). */
  protected async prepare(_rows: D[]): Promise<any> { return undefined; }
  protected async load(id: string): Promise<D> {
    if (!isObjectId(id)) throw ApiError.notFound();
    const d = await this.model.findById(id);
    if (!d) throw ApiError.notFound('আইটেমটি পাওয়া যায়নি');
    return d as D;
  }

  async list(f: { status?: string; q?: string; page: number; limit: number }) {
    const filter: Record<string, unknown> = {};
    if (f.status === 'draft' || f.status === 'published') filter.status = f.status;
    if (f.q) { const re = new RegExp(escapeRegex(f.q.slice(0, 60)), 'i'); filter.$or = this.searchFields.map((k) => ({ [k]: re })); }
    const [items, total, counts] = await Promise.all([
      this.model.find(filter).sort(this.sort).skip((f.page - 1) * f.limit).limit(f.limit).lean(),
      this.model.countDocuments(filter),
      this.model.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const aux = await this.prepare(items as D[]);
    return { items: (items as D[]).map((d) => this.shape(d, aux)), total, page: f.page, totalPages: Math.max(1, Math.ceil(total / f.limit)), counts: Object.fromEntries((counts as Array<{ _id: string; n: number }>).map((c) => [c._id, c.n])) };
  }

  async get(id: string) { const d = await this.load(id); return this.shape(d, await this.prepare([d])); }

  protected async afterEdit(d: D, who: Who, extra: Record<string, unknown> = {}) {
    // an editor's change to a published item sends it back for approval
    if (d.status === 'published' && !who.canPublish) extra.status = 'draft';
    return extra;
  }

  async remove(id: string, who: Who) {
    const d = await this.load(id);
    if (d.status === 'published' && !who.canPublish) throw ApiError.forbidden('প্রকাশিত আইটেম মুছতে MP-র অনুমতি লাগে');
    await this.model.deleteOne({ _id: (d as { _id: unknown })._id });
    await audit({ action: `${this.entity}.delete`, entity: { type: this.entity, id: d._id, label: this.label(d) } });
  }

  async setStatus(id: string, status: 'draft' | 'published') {
    const d = await this.load(id);
    await this.model.updateOne({ _id: d._id }, { $set: { status } });
    await audit({ action: `${this.entity}.${status === 'published' ? 'publish' : 'unpublish'}`, entity: { type: this.entity, id: d._id, label: this.label(d) } });
    return this.get(id);
  }

  protected async created(doc: D, who: Who, publish: boolean) {
    if (publish && who.canPublish) await this.model.updateOne({ _id: doc._id }, { $set: { status: 'published' } });
    await audit({ action: `${this.entity}.create`, entity: { type: this.entity, id: doc._id, label: this.label(doc) } });
    return this.get(String(doc._id));
  }

  protected async edited(doc: D, set: Record<string, unknown>, who: Who, publish: boolean) {
    const extra = await this.afterEdit(doc, who, { ...set });
    if (publish && who.canPublish) extra.status = 'published';
    await this.model.updateOne({ _id: doc._id }, { $set: extra });
    await audit({ action: `${this.entity}.update`, entity: { type: this.entity, id: doc._id, label: this.label(doc) } });
    return this.get(String(doc._id));
  }

  async reorder(ids: string[]) {
    if (!Array.isArray(ids) || ids.length > 500 || !ids.every((i) => typeof i === 'string' && isObjectId(i))) throw ApiError.validation({ ids: 'invalid ids' });
    // only this tenant's rows can match (the tenant plugin scopes the update); unknown ids are simply ignored
    await this.model.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: i } } } })));
    await audit({ action: `${this.entity}.reorder`, entity: { type: this.entity } });
  }
}

/* ---------------- events ---------------- */
export class EventService extends Base<any> {
  protected model = EventItem as unknown as Model<any>;
  protected entity = 'event';
  protected searchFields = ['title', 'place'];
  protected sort: Record<string, 1 | -1> = { date: -1 };
  protected label(d: any) { return d.title; }
  protected shape(d: any) { return { id: String(d._id), title: d.title, date: d.date, time: d.time ?? '', place: d.place ?? '', note: d.note ?? '', status: d.status, updatedAt: d.updatedAt }; }

  async create(input: unknown, who: Who, publish = false) {
    const data = eventInputSchema.parse(input);
    const doc = await EventItem.create({ ...data, status: 'draft', createdBy: who.userId as never });
    return this.created(doc, who, publish);
  }
  async update(id: string, input: unknown, who: Who, publish = false) {
    const doc = await this.load(id); // a foreign or unknown id is 404 before any validation message
    return this.edited(doc, eventPatchSchema.parse(input), who, publish);
  }
  async publicUpcoming(limit = 12) {
    const from = dhakaToday(this.now());
    const items = await EventItem.find({ status: 'published', date: { $gte: from } }).sort({ date: 1 }).limit(limit).lean();
    return items.map((d) => { const { status: _s, updatedAt: _u, ...rest } = this.shape(d); return rest; });
  }
}

/* ---------------- gallery ---------------- */
export class GalleryService extends Base<any> {
  protected model = GalleryItem as unknown as Model<any>;
  protected entity = 'gallery';
  protected searchFields = ['caption', 'album', 'credit'];
  protected sort: Record<string, 1 | -1> = { order: 1, createdAt: -1 };
  protected label(d: any) { return d.caption || d.album || 'ছবি'; }
  protected shape(d: any) { return { id: String(d._id), url: d.url, caption: d.caption ?? '', credit: d.credit ?? '', album: d.album ?? '', takenAt: d.takenAt ?? null, order: d.order ?? 0, featured: !!d.featured, status: d.status, updatedAt: d.updatedAt }; }

  private check(url?: string) {
    if (url && !mediaUrlAllowed(this.cfg, ctx()?.tenantId, url)) throw ApiError.unprocessable('MEDIA_HOST_NOT_ALLOWED', 'ছবির ঠিকানা অনুমোদিত নয়', { url });
  }
  async create(input: unknown, who: Who, publish = false) {
    const data = galleryInputSchema.parse(input);
    this.check(data.url);
    const doc = await GalleryItem.create({ ...data, status: 'draft', createdBy: who.userId as never });
    return this.created(doc, who, publish);
  }
  async update(id: string, input: unknown, who: Who, publish = false) {
    const doc = await this.load(id);
    const data = galleryPatchSchema.parse(input);
    this.check(data.url);
    return this.edited(doc, data, who, publish);
  }
  async albums() {
    const rows = await GalleryItem.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$album', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
    return (rows as Array<{ _id: string; n: number }>).filter((r) => r._id).map((r) => ({ name: r._id, count: r.n }));
  }
  async publicList(f: { album?: string; featured?: boolean; page: number; limit: number }) {
    const filter: Record<string, unknown> = { status: 'published' };
    if (f.album) filter.album = f.album;
    if (f.featured) filter.featured = true;
    const [items, total] = await Promise.all([
      GalleryItem.find(filter).sort({ order: 1, createdAt: -1 }).skip((f.page - 1) * f.limit).limit(f.limit).lean(),
      GalleryItem.countDocuments(filter),
    ]);
    return { items: items.map((d) => { const { status: _s, updatedAt: _u, order: _o, ...rest } = this.shape(d); return rest; }), total, page: f.page, totalPages: Math.max(1, Math.ceil(total / f.limit)) };
  }
}

/* ---------------- videos ---------------- */
export class VideoService extends Base<any> {
  protected model = VideoItem as unknown as Model<any>;
  protected entity = 'video';
  protected searchFields = ['title', 'description'];
  protected sort: Record<string, 1 | -1> = { order: 1, date: -1, createdAt: -1 };
  constructor(cfg: Config, private media: MediaService, now: () => number = Date.now) { super(cfg, now); }
  protected label(d: any) { return d.title; }

  protected async prepare(rows: any[]) {
    const ids = [...new Set(rows.filter((r) => r.kind === 'upload' && r.mediaId).map((r) => String(r.mediaId)))];
    const found = await Promise.all(ids.map((i) => this.media.findVideo(i)));
    return new Map(found.filter((f): f is NonNullable<typeof f> => !!f).map((f) => [f.id, f.url]));
  }
  protected shape(d: any, urls?: Map<string, string>) {
    const id = d.youtubeId as string;
    const fileUrl = d.kind === 'upload' && d.mediaId ? urls?.get(String(d.mediaId)) ?? null : null;
    return {
      id: String(d._id), title: d.title, description: d.description ?? '', date: d.date ?? null, kind: d.kind, youtubeId: id || null,
      mediaId: d.mediaId ? String(d.mediaId) : null, fileUrl,
      posterUrl: d.posterUrl || (d.kind === 'youtube' && id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''),
      embedUrl: d.kind === 'youtube' && id ? `https://www.youtube-nocookie.com/embed/${id}` : null,
      duration: d.duration ?? '', order: d.order ?? 0, featured: !!d.featured, status: d.status, updatedAt: d.updatedAt,
    };
  }

  private async normalise(data: { kind?: string; youtube?: string; mediaId?: string; posterUrl?: string }, existing?: any) {
    const out: Record<string, unknown> = {};
    const kind = data.kind ?? existing?.kind;
    if (data.posterUrl !== undefined) {
      if (data.posterUrl && !mediaUrlAllowed(this.cfg, ctx()?.tenantId, data.posterUrl)) throw ApiError.unprocessable('MEDIA_HOST_NOT_ALLOWED', 'পোস্টার ছবির ঠিকানা অনুমোদিত নয়', { url: data.posterUrl });
      out.posterUrl = data.posterUrl;
    }
    if (kind === 'youtube') {
      const idInput = data.youtube ?? existing?.youtubeId;
      const id = idInput ? parseYouTubeId(idInput) : null;
      if (!id) throw ApiError.validation({ youtube: ['সঠিক YouTube লিংক দিন'] });
      out.youtubeId = id; out.kind = 'youtube'; out.mediaId = undefined;
    } else if (kind === 'upload') {
      const mid = data.mediaId ?? (existing?.mediaId ? String(existing.mediaId) : undefined);
      if (!mid || !(await this.media.findVideo(mid))) throw ApiError.validation({ mediaId: ['ভিডিও ফাইলটি পাওয়া যায়নি, আবার আপলোড করুন'] });
      out.mediaId = mid; out.kind = 'upload'; out.youtubeId = '';
    }
    return out;
  }

  async create(input: unknown, who: Who, publish = false) {
    const data = videoInputSchema.parse(input);
    const { youtube: _y, mediaId: _m, kind: _k, posterUrl: _p, ...plain } = data;
    const doc = await VideoItem.create({ ...plain, ...(await this.normalise(data)), status: 'draft', createdBy: who.userId as never });
    return this.created(doc, who, publish);
  }
  async update(id: string, input: unknown, who: Who, publish = false) {
    const doc = await this.load(id);
    const data = videoPatchSchema.parse(input);
    const { youtube: _y, mediaId: _m, kind: _k, posterUrl: _p, ...plain } = data;
    const set = { ...plain, ...(data.kind || data.youtube !== undefined || data.mediaId ? await this.normalise(data, doc) : data.posterUrl !== undefined ? await this.normalise({ posterUrl: data.posterUrl }, doc) : {}) };
    return this.edited(doc, set, who, publish);
  }

  async publicList(f: { featured?: boolean; page: number; limit: number }) {
    const filter: Record<string, unknown> = { status: 'published' };
    if (f.featured) filter.featured = true;
    const [rows, total] = await Promise.all([
      VideoItem.find(filter).sort(this.sort).skip((f.page - 1) * f.limit).limit(f.limit).lean(),
      VideoItem.countDocuments(filter),
    ]);
    const aux = await this.prepare(rows as any[]);
    return { items: rows.map((d) => { const { status: _s, updatedAt: _u, order: _o, mediaId: _m, ...rest } = this.shape(d, aux); return rest; }), total, page: f.page, totalPages: Math.max(1, Math.ceil(total / f.limit)) };
  }
}

export { mediaUrl };
