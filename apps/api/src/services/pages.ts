import { isDeepStrictEqual } from 'node:util';
import { PAGE_KEYS, PAGE_LABELS, parsePage, type PageKey } from '@jonoshetu/shared';
import { ZodError } from 'zod';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';
import { ctx } from '../context.js';
import { PageContent } from '../models/index.js';
import { audit } from '../lib/audit.js';
import { mediaUrlAllowed } from '../lib/mediaUrl.js';

/* Site pages (home, profile, area, contact, ...). Editors save the DRAFT; the owner publishes it to LIVE. The public site
   only ever reads LIVE. Data is validated with the shared zod schema for the key (strict: unknown keys are rejected). */

type Actor = { userId: unknown; name: string; viaSuperAdmin: boolean };

export const isPageKey = (k: string): k is PageKey => (PAGE_KEYS as readonly string[]).includes(k);
const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));

export class PageService {
  constructor(private cfg: Config, private now: () => number = Date.now) {}

  private key(k: string): PageKey {
    if (!isPageKey(k)) throw ApiError.notFound('পেজ পাওয়া যায়নি');
    return k;
  }

  /** Portrait photo of the profile page must be an own upload or an allow-listed host. */
  private checkMedia(key: PageKey, data: Record<string, unknown>) {
    const portrait = data.portrait as { url?: string } | undefined;
    if (key === 'profile' && portrait?.url && !mediaUrlAllowed(this.cfg, ctx()?.tenantId, portrait.url)) throw ApiError.unprocessable('MEDIA_HOST_NOT_ALLOWED', 'ছবির ঠিকানা অনুমোদিত নয়', { url: portrait.url });
  }

  private state(doc: { draft?: unknown; live?: unknown } | null) {
    if (!doc) return { status: 'empty' as const, hasUnpublishedChanges: false };
    if (!doc.live) return { status: 'draft' as const, hasUnpublishedChanges: true };
    return same(doc.draft, doc.live) ? { status: 'published' as const, hasUnpublishedChanges: false } : { status: 'draft' as const, hasUnpublishedChanges: true };
  }

  async list() {
    const docs = await PageContent.find({}).lean();
    return PAGE_KEYS.map((key) => {
      const doc = docs.find((d) => d.key === key) ?? null;
      return { key, label: PAGE_LABELS[key], ...this.state(doc), updatedAt: doc?.updatedAt ?? null, publishedAt: doc?.publishedAt ?? null };
    });
  }

  async get(k: string) {
    const key = this.key(k);
    const doc = await PageContent.findOne({ key }).lean();
    return {
      key, label: PAGE_LABELS[key],
      draft: parsePage(key, doc?.draft ?? {}), live: doc?.live ? parsePage(key, doc.live) : null,
      ...this.state(doc), updatedAt: doc?.updatedAt ?? null, publishedAt: doc?.publishedAt ?? null, version: doc?.version ?? 0,
    };
  }

  async put(k: string, input: unknown, actor: Actor) {
    const key = this.key(k);
    const { version, ...body } = (input ?? {}) as Record<string, unknown>;
    let data: Record<string, unknown>;
    try { data = parsePage(key, body) as Record<string, unknown>; } catch (e) { if (e instanceof ZodError) throw e; throw e; }
    this.checkMedia(key, data);
    const cur = await PageContent.findOne({ key });
    if (version !== undefined && (cur?.version ?? 0) !== version) throw ApiError.conflict('VERSION_CONFLICT', 'পেজটি অন্য কেউ বদলেছেন, পাতা রিফ্রেশ করুন');
    const before = cur?.draft;
    let doc;
    if (!cur) doc = await PageContent.create({ key, draft: data, status: 'draft', updatedBy: actor.userId as never, version: 1 });
    else doc = await PageContent.findOneAndUpdate({ key, version: cur.version }, { $set: { draft: data, status: 'draft', updatedBy: actor.userId as never }, $inc: { version: 1 } }, { new: true });
    if (!doc) throw ApiError.conflict('VERSION_CONFLICT', 'পেজটি অন্য কেউ বদলেছেন, আবার চেষ্টা করুন');
    await audit({ action: 'page.update', entity: { type: 'page', id: doc._id, label: PAGE_LABELS[key] }, diff: { before: summarize(before), after: summarize(data) } });
    return this.get(key);
  }

  async publish(k: string, actor: Actor) {
    const key = this.key(k);
    const cur = await PageContent.findOne({ key });
    if (!cur) throw ApiError.unprocessable('NOTHING_TO_PUBLISH', 'এই পেজে এখনো কিছু লেখা হয়নি');
    const data = parsePage(key, cur.draft ?? {});
    await PageContent.updateOne({ _id: cur._id }, { $set: { live: data, status: 'published', publishedAt: new Date(this.now()), publishedBy: actor.userId as never }, $inc: { version: 1 } });
    await audit({ action: 'page.publish', entity: { type: 'page', id: cur._id, label: PAGE_LABELS[key] } });
    return this.get(key);
  }

  /** Throws away unpublished changes: the draft goes back to what is live (or is emptied when nothing was ever published). */
  async discard(k: string) {
    const key = this.key(k);
    const cur = await PageContent.findOne({ key });
    if (!cur) return this.get(key);
    await PageContent.updateOne({ _id: cur._id }, { $set: { draft: cur.live ?? {}, status: cur.live ? 'published' : 'draft' }, $inc: { version: 1 } });
    await audit({ action: 'page.discard', entity: { type: 'page', id: cur._id, label: PAGE_LABELS[key] } });
    return this.get(key);
  }

  /** What the public site shows. `published: false` means the office has not published this page yet (the site uses its defaults). */
  async publicPage(k: string) {
    const key = this.key(k);
    const doc = await PageContent.findOne({ key }).lean();
    return { key, published: !!doc?.live, data: parsePage(key, doc?.live ?? {}) };
  }

  async publicProfileData() {
    const doc = await PageContent.findOne({ key: 'profile' }).lean();
    if (!doc?.live) throw ApiError.notFound();
    return parsePage('profile', doc.live);
  }
}

/** Audit diffs carry only the field names and sizes, not the whole page text. */
function summarize(v: unknown) {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, Array.isArray(x) ? `${x.length} items` : typeof x === 'string' ? `${x.length} chars` : 'object']));
}
