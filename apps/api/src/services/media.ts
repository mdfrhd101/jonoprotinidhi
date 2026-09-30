import type { Readable } from 'node:stream';
import type { Deps } from '../deps.js';
import { ApiError } from '../errors.js';
import { ctx } from '../context.js';
import { MediaAsset, Post, SiteConfig, GalleryItem, VideoItem, PageContent } from '../models/index.js';
import { processImage, sniffVideo, CONTENT_TYPES, TooLargeError, type MediaExt, type ByteRange } from '../lib/media.js';
import { mediaUrl } from '../lib/mediaUrl.js';
import { audit } from '../lib/audit.js';
import { isObjectId } from '../lib/sanitize.js';

type Actor = { userId: unknown; name: string; viaSuperAdmin: boolean };

const MAX_ASSETS = 2000; // per tenant: a runaway script or a leaked editor account cannot fill the disk
const MAX_VIDEOS = 200;

const tid = () => {
  const t = ctx()?.tenantId;
  if (!t) throw new Error('media service needs a tenant context');
  return String(t);
};
const clean = (s: string | undefined, max: number) => (s ?? '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, max);

type AssetRow = { _id: unknown; kind?: string | null; ext?: string | null; originalName?: string | null; bytes: number; width?: number | null; height?: number | null; credit?: string | null; createdAt?: Date };

export class MediaService {
  constructor(private d: Deps) {}

  private shape(a: AssetRow) {
    const kind = (a.kind ?? 'image') as 'image' | 'video';
    const ext = (a.ext ?? 'webp') as MediaExt;
    return { id: String(a._id), kind, url: mediaUrl(this.d.config, tid(), a._id, ext), name: a.originalName ?? '', bytes: a.bytes, width: a.width ?? null, height: a.height ?? null, credit: a.credit ?? '', createdAt: a.createdAt };
  }

  async upload(data: Buffer, meta: { name?: string; credit?: string }, actor: Actor) {
    const max = this.d.config.MAX_UPLOAD_MB * 1024 * 1024;
    if (!data?.length) throw ApiError.unprocessable('EMPTY_FILE', 'ছবি পাওয়া যায়নি');
    if (data.length > max) throw ApiError.unprocessable('FILE_TOO_LARGE', `ছবি সর্বোচ্চ ${this.d.config.MAX_UPLOAD_MB} মেগাবাইট হতে পারে`);
    if ((await MediaAsset.countDocuments({})) >= MAX_ASSETS) throw ApiError.unprocessable('MEDIA_QUOTA', 'ছবির সীমা পূর্ণ হয়েছে, পুরনো ছবি মুছুন');
    const img = await processImage(data);
    const asset = await MediaAsset.create({
      kind: 'image', ext: 'webp', originalName: clean(meta.name, 120), contentType: img.contentType, bytes: img.data.length, width: img.width, height: img.height,
      credit: clean(meta.credit, 200), uploadedBy: { userId: actor.userId as never, name: actor.name, viaSuperAdmin: actor.viaSuperAdmin },
    });
    await this.d.media.put(`${tid()}/${String(asset._id)}.webp`, img.data);
    await audit({ action: 'media.upload', entity: { type: 'media', id: asset._id, label: asset.originalName || String(asset._id) } });
    return this.shape(asset);
  }

  /** Streams a video (mp4/webm) into storage without holding it in memory. The container type is checked from the first bytes. */
  async uploadVideo(source: Readable, declaredType: string, declaredLength: number | undefined, meta: { name?: string; credit?: string }, actor: Actor) {
    const max = this.d.config.MAX_VIDEO_MB * 1024 * 1024;
    const tooLarge = () => ApiError.unprocessable('FILE_TOO_LARGE', `ভিডিও সর্বোচ্চ ${this.d.config.MAX_VIDEO_MB} মেগাবাইট হতে পারে। বড় ভিডিও YouTube-এ তুলে লিংক দিন`);
    if (declaredLength !== undefined && declaredLength > max) throw tooLarge();
    if (!['video/mp4', 'video/webm'].includes(declaredType)) throw ApiError.unprocessable('UNSUPPORTED_TYPE', 'শুধু MP4 বা WebM ভিডিও দেওয়া যায়');
    if ((await MediaAsset.countDocuments({ kind: 'video' })) >= MAX_VIDEOS) throw ApiError.unprocessable('MEDIA_QUOTA', 'ভিডিওর সীমা পূর্ণ হয়েছে, পুরনো ভিডিও মুছুন');

    // read until 12 bytes are available, sniff, then hand everything (head + rest) to the storage
    const it = source[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
    let head = Buffer.alloc(0), done = false;
    while (head.length < 12 && !done) { const n = await it.next(); if (n.done) done = true; else head = Buffer.concat([head, n.value]); }
    const ext = sniffVideo(head);
    if (!ext || `video/${ext}` !== declaredType) throw ApiError.unprocessable('BAD_VIDEO', 'ফাইলটি সঠিক MP4/WebM ভিডিও নয়');

    const asset = await MediaAsset.create({
      kind: 'video', ext, originalName: clean(meta.name, 120), contentType: CONTENT_TYPES[ext], bytes: 1,
      credit: clean(meta.credit, 200), uploadedBy: { userId: actor.userId as never, name: actor.name, viaSuperAdmin: actor.viaSuperAdmin },
    });
    const key = `${tid()}/${String(asset._id)}.${ext}`;
    async function* body() { yield head; while (!done) { const n = await it.next(); if (n.done) return; yield n.value; } }
    try {
      const size = await this.d.media.putStream(key, body(), max);
      if (size < 12) throw new Error('empty');
      asset.bytes = size; await asset.save();
    } catch (e) {
      await MediaAsset.deleteOne({ _id: asset._id });
      await this.d.media.remove(key);
      if (e instanceof TooLargeError) throw tooLarge();
      if (e instanceof ApiError) throw e;
      throw ApiError.unprocessable('UPLOAD_FAILED', 'ভিডিও আপলোড সম্পূর্ণ হয়নি, আবার চেষ্টা করুন');
    }
    await audit({ action: 'media.upload', entity: { type: 'media', id: asset._id, label: asset.originalName || String(asset._id) } });
    return this.shape(asset);
  }

  async list(page: number, limit: number, kind?: string) {
    const filter = kind === 'video' ? { kind: 'video' } : kind === 'image' ? { kind: { $ne: 'video' } } : {};
    const [items, total] = await Promise.all([
      MediaAsset.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      MediaAsset.countDocuments(filter),
    ]);
    return { items: items.map((a) => this.shape(a)), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  /** Looks a video up by id (used by the video collection to validate `mediaId`). */
  async findVideo(id: string) {
    if (!isObjectId(id)) return null;
    const a = await MediaAsset.findOne({ _id: id, kind: 'video' });
    return a ? { id: String(a._id), ext: (a.ext ?? 'mp4') as MediaExt, url: mediaUrl(this.d.config, tid(), a._id, (a.ext ?? 'mp4') as MediaExt), name: a.originalName ?? '' } : null;
  }

  async remove(id: string, actor: Actor) {
    if (!isObjectId(id)) throw ApiError.notFound();
    const a = await MediaAsset.findById(id);
    if (!a) throw ApiError.notFound('ফাইল পাওয়া যায়নি');
    const ext = (a.ext ?? 'webp') as MediaExt;
    const url = mediaUrl(this.d.config, tid(), a._id, ext);
    const used = a.kind === 'video'
      ? await VideoItem.exists({ mediaId: a._id })
      : (await Post.exists({ $or: [{ 'media.url': url }, { 'live.media.url': url }] })) || (await SiteConfig.exists({ 'banners.url': url })) || (await GalleryItem.exists({ url }))
        || (await VideoItem.exists({ posterUrl: url })) || (await PageContent.exists({ $or: [{ 'draft.portrait.url': url }, { 'live.portrait.url': url }] }));
    if (used) throw ApiError.conflict('MEDIA_IN_USE', 'এই ফাইলটি কোথাও ব্যবহৃত হচ্ছে (পোস্ট, গ্যালারি, ভিডিও বা পেজ), আগে সেখান থেকে সরান');
    await MediaAsset.deleteOne({ _id: a._id });
    await this.d.media.remove(`${tid()}/${String(a._id)}.${ext}`);
    await audit({ action: 'media.delete', entity: { type: 'media', id: a._id, label: a.originalName || String(a._id) }, reason: actor.name });
  }

  /** Public read: verifies the asset exists in this tenant and that the URL extension is the stored one. */
  async open(assetId: string, ext: string): Promise<{ contentType: string; size: number; stream: (range?: ByteRange) => Readable } | null> {
    if (!/^[a-f0-9]{24}$/.test(assetId) || !['webp', 'mp4', 'webm'].includes(ext)) return null;
    const a = await MediaAsset.findById(assetId).select('ext kind').lean();
    if (!a || (a.ext ?? 'webp') !== ext) return null;
    const key = `${tid()}/${assetId}.${ext}`;
    const st = await this.d.media.stat(key);
    if (!st) return null;
    return { contentType: CONTENT_TYPES[ext as MediaExt], size: st.size, stream: (range) => this.d.media.createReadStream(key, range) };
  }
}
