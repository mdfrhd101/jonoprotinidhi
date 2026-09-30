import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { tenantScoped } from '../plugins/tenantScoped.js';
import { softDelete } from '../plugins/softDelete.js';
import { POST_CATEGORIES, PROMISE_SECTORS, POST_STATUSES, PROMISE_STATUSES } from '@jonoprotinidhi/shared';

const { models, model } = mongoose;
type Scoped<T> = T & { tenantId: mongoose.Types.ObjectId };
const define = <T>(name: string, schema: Schema<any>): mongoose.Model<Scoped<T>> => (models[name] as mongoose.Model<Scoped<T>>) || model<Scoped<T>>(name, schema as never);

const mediaRef = new Schema({ url: { type: String, required: true }, caption: { type: String, default: '' }, credit: { type: String, default: '' } }, { _id: false });

/* The `live` subdocument is what the public sees. Editing a published post changes only the working copy and moves
   the status to `review`; the public keeps seeing `live` until the owner approves (ADR-0005). */
const liveSchema = new Schema(
  {
    title: String, summary: String, body: String, quote: String,
    category: String, upazila: String, place: String, eventDate: Date,
    media: [mediaRef], publishedAt: Date,
  },
  { _id: false },
);

const postSchema = new Schema(
  {
    slug: { type: String, required: true },
    category: { type: String, enum: POST_CATEGORIES, default: 'dev' },
    upazila: { type: String, default: '' },
    place: { type: String, default: '' },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    body: { type: String, default: '' },
    quote: { type: String, default: '' },
    eventDate: { type: Date, default: Date.now },
    media: { type: [mediaRef], default: [] },
    status: { type: String, enum: POST_STATUSES, default: 'draft', index: true },
    scheduledAt: Date,
    authorId: { type: Schema.Types.ObjectId, required: true },
    approvedBy: Schema.Types.ObjectId,
    rejectReason: String,
    version: { type: Number, default: 1 },
    live: { type: liveSchema, default: null },
  },
  { timestamps: true },
);
postSchema.plugin(tenantScoped);
postSchema.plugin(softDelete);
postSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
postSchema.index({ tenantId: 1, status: 1, eventDate: -1 });
postSchema.index({ tenantId: 1, category: 1, eventDate: -1 });
export type PostDoc = HydratedDocument<Scoped<InferSchemaType<typeof postSchema>>>;
export const Post = define<InferSchemaType<typeof postSchema>>('Post', postSchema);

const postVersionSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true },
    action: { type: String, enum: ['create', 'edit', 'submit', 'approve', 'reject', 'schedule', 'unpublish', 'restore', 'withdraw', 'publish'], required: true },
    snapshot: Schema.Types.Mixed,
    by: { userId: Schema.Types.ObjectId, name: String, viaSuperAdmin: { type: Boolean, default: false } },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
postVersionSchema.plugin(tenantScoped);
postVersionSchema.index({ tenantId: 1, postId: 1, version: -1 });
export const PostVersion = define<InferSchemaType<typeof postVersionSchema>>('PostVersion', postVersionSchema);

/* Uploaded image. The file itself lives in MediaStorage under `<tenantId>/<_id>.webp`; this row is the catalogue. */
const mediaAssetSchema = new Schema(
  {
    originalName: { type: String, default: '' },
    kind: { type: String, enum: ['image', 'video'], default: 'image' },
    contentType: { type: String, default: 'image/webp' },
    ext: { type: String, default: 'webp' },
    bytes: { type: Number, required: true },
    width: Number, height: Number,
    credit: { type: String, default: '' },
    uploadedBy: { userId: Schema.Types.ObjectId, name: String, viaSuperAdmin: { type: Boolean, default: false } },
  },
  { timestamps: true },
);
mediaAssetSchema.plugin(tenantScoped);
mediaAssetSchema.index({ tenantId: 1, createdAt: -1 });
export type MediaAssetDoc = HydratedDocument<Scoped<InferSchemaType<typeof mediaAssetSchema>>>;
export const MediaAsset = define<InferSchemaType<typeof mediaAssetSchema>>('MediaAsset', mediaAssetSchema);

/* One document per (tenant, page key). `draft` is what editors work on, `live` is what the public site shows.
   Saving changes only the draft; publishing (owner) copies draft to live. */
const pageContentSchema = new Schema(
  {
    key: { type: String, required: true },
    draft: { type: Schema.Types.Mixed, default: {} },
    live: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' }, // draft = unpublished changes exist
    publishedAt: Date, publishedBy: Schema.Types.ObjectId, updatedBy: Schema.Types.ObjectId,
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);
pageContentSchema.plugin(tenantScoped);
pageContentSchema.index({ tenantId: 1, key: 1 }, { unique: true });
export type PageContentDoc = HydratedDocument<Scoped<InferSchemaType<typeof pageContentSchema>>>;
export const PageContent = define<InferSchemaType<typeof pageContentSchema>>('PageContent', pageContentSchema);

const itemStatus = { type: String, enum: ['draft', 'published'], default: 'draft' };
const eventSchema = new Schema(
  { title: { type: String, required: true }, date: { type: Date, required: true }, time: { type: String, default: '' }, place: { type: String, default: '' }, note: { type: String, default: '' }, status: itemStatus, createdBy: Schema.Types.ObjectId },
  { timestamps: true },
);
eventSchema.plugin(tenantScoped); eventSchema.plugin(softDelete);
eventSchema.index({ tenantId: 1, status: 1, date: 1 });
export type EventDoc = HydratedDocument<Scoped<InferSchemaType<typeof eventSchema>>>;
export const EventItem = define<InferSchemaType<typeof eventSchema>>('EventItem', eventSchema);

const gallerySchema = new Schema(
  { url: { type: String, required: true }, caption: { type: String, default: '' }, credit: { type: String, default: '' }, album: { type: String, default: '' }, takenAt: Date, order: { type: Number, default: 0 }, featured: { type: Boolean, default: false }, status: itemStatus, createdBy: Schema.Types.ObjectId },
  { timestamps: true },
);
gallerySchema.plugin(tenantScoped); gallerySchema.plugin(softDelete);
gallerySchema.index({ tenantId: 1, status: 1, order: 1, createdAt: -1 });
export type GalleryDoc = HydratedDocument<Scoped<InferSchemaType<typeof gallerySchema>>>;
export const GalleryItem = define<InferSchemaType<typeof gallerySchema>>('GalleryItem', gallerySchema);

const videoSchema = new Schema(
  {
    title: { type: String, required: true }, description: { type: String, default: '' }, date: Date,
    kind: { type: String, enum: ['youtube', 'upload'], required: true },
    youtubeId: { type: String, default: '' }, mediaId: Schema.Types.ObjectId, posterUrl: { type: String, default: '' },
    duration: { type: String, default: '' }, order: { type: Number, default: 0 }, featured: { type: Boolean, default: false }, status: itemStatus, createdBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);
videoSchema.plugin(tenantScoped); videoSchema.plugin(softDelete);
videoSchema.index({ tenantId: 1, status: 1, order: 1, date: -1 });
export type VideoDoc = HydratedDocument<Scoped<InferSchemaType<typeof videoSchema>>>;
export const VideoItem = define<InferSchemaType<typeof videoSchema>>('VideoItem', videoSchema);

/* `Promise` would shadow the global, so the model is PromiseItem (collection: promises). */
const promiseSchema = new Schema(
  {
    sector: { type: String, enum: PROMISE_SECTORS, required: true },
    name: { type: String, required: true },
    place: { type: String, default: '' },
    budgetLabel: { type: String, default: '' },
    budgetBdt: Number,
    targetLabel: { type: String, default: '' },
    targetDate: Date,
    pct: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: PROMISE_STATUSES, default: 'plan' },
    delayReason: { type: String, default: '' },
    updates: [{ date: { type: Date, default: Date.now }, text: String, by: String, _id: false }],
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    lastChangedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'promises' },
);
promiseSchema.plugin(tenantScoped);
promiseSchema.plugin(softDelete);
promiseSchema.index({ tenantId: 1, sector: 1, order: 1 });
export const PromiseItem = define<InferSchemaType<typeof promiseSchema>>('PromiseItem', promiseSchema);

const siteConfigSchema = new Schema(
  {
    slogan: { type: String, default: '' },
    accent: { type: String, enum: ['brass', 'river', 'maroon'], default: 'brass' },
    banners: { type: [{ url: String, caption: String, title: String, subtitle: String, ctaLabel: String, ctaHref: String, _id: false }], default: [] },
    sections: {
      type: [{ key: String, on: Boolean, _id: false }],
      default: ['stats', 'about', 'activities', 'office', 'promises', 'area', 'gallery', 'videos', 'events', 'cta'].map((key) => ({ key, on: true })),
    },
    updatedBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);
siteConfigSchema.plugin(tenantScoped, { index: false });
siteConfigSchema.index({ tenantId: 1 }, { unique: true });
export const SiteConfig = define<InferSchemaType<typeof siteConfigSchema>>('SiteConfig', siteConfigSchema);

const timeline = new Schema({ year: String, title: String, place: String, note: String }, { _id: false });
const profileSchema = new Schema(
  {
    headline: { type: String, default: '' },
    intro: { type: String, default: '' },
    story: { type: [String], default: [] },
    personal: { type: [{ label: String, value: String, _id: false }], default: [] },
    education: { type: [timeline], default: [] },
    profession: { type: [timeline], default: [] },
    politics: { type: [timeline], default: [] },
    awards: { type: [{ year: String, title: String, by: String, _id: false }], default: [] },
    priorities: { type: [{ title: String, text: String, _id: false }], default: [] },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    publishedAt: Date,
  },
  { timestamps: true },
);
profileSchema.plugin(tenantScoped, { index: false });
profileSchema.index({ tenantId: 1 }, { unique: true });
export const Profile = define<InferSchemaType<typeof profileSchema>>('Profile', profileSchema);
