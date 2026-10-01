import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { tenantScoped } from '../plugins/tenantScoped.js';
import { appendOnly } from '../plugins/appendOnly.js';
import { COMPLAINT_STATUSES } from '@jonoprotinidhi/shared';

const { models, model } = mongoose;
type Scoped<T> = T & { tenantId: mongoose.Types.ObjectId };
const define = <T>(name: string, schema: Schema<any>): mongoose.Model<Scoped<T>> => (models[name] as mongoose.Model<Scoped<T>>) || model<Scoped<T>>(name, schema as never);

/* Complainant name/phone live ONLY as ciphertext in `pii` (ADR-0004). `select: false` keeps them out of every
   query unless a service asks for them explicitly (only viewPii and the SMS notifier do). */
const complaintSchema = new Schema(
  {
    trackingId: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    upazila: { type: String, required: true, index: true },
    union: { type: String, required: true },
    place: { type: String, default: '' },
    description: { type: String, default: '' }, // may be empty when the citizen sent a voice note instead (BUG-2026-030)
    channel: { type: String, enum: ['web', 'hearing', 'phone'], default: 'web' },
    voiceNote: {
      audioData: { type: String },
      durationSec: { type: Number },
    },
    files: [
      {
        name: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        data: { type: String, required: true },
        _id: false,
      },
    ],
    anonymous: { type: Boolean, default: false },
    pii: {
      nameEnc: { type: String, select: false },
      phoneEnc: { type: String, select: false },
      keyVersion: { type: Number, select: false },
    },
    phoneHmac: { type: String, select: false },
    otpVerified: { type: Boolean, default: false },
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'new', index: true },
    assignedTo: { type: Schema.Types.ObjectId, default: null },
    slaDueAt: Date,
    firstActionAt: Date,
    resolvedAt: Date,
    publicSteps: [{ label: String, note: String, at: { type: Date, default: Date.now }, _id: false }],
    version: { type: Number, default: 1 },
    retentionUntil: Date,
    piiPurgedAt: Date,
  },
  { timestamps: true },
);
complaintSchema.plugin(tenantScoped);
complaintSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
complaintSchema.index({ tenantId: 1, upazila: 1, status: 1 });
complaintSchema.index({ tenantId: 1, assignedTo: 1, status: 1 });
complaintSchema.index({ tenantId: 1, phoneHmac: 1, createdAt: -1 });
complaintSchema.index({ retentionUntil: 1 });
export type ComplaintDoc = HydratedDocument<Scoped<InferSchemaType<typeof complaintSchema>>>;
export const Complaint = define<InferSchemaType<typeof complaintSchema>>('Complaint', complaintSchema);

const complaintEventSchema = new Schema(
  {
    complaintId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['status', 'assign', 'note', 'sms', 'pii_view', 'created'], required: true },
    by: { userId: Schema.Types.ObjectId, name: String },
    data: Schema.Types.Mixed,
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
complaintEventSchema.plugin(tenantScoped);
complaintEventSchema.plugin(appendOnly);
complaintEventSchema.index({ tenantId: 1, complaintId: 1, at: 1 });
export const ComplaintEvent = define<InferSchemaType<typeof complaintEventSchema>>('ComplaintEvent', complaintEventSchema);
