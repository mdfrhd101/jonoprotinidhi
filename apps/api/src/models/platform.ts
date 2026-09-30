import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { appendOnly } from '../plugins/appendOnly.js';

/* Platform-level collections: NOT tenant-scoped (docs/03 §1). */

const { models, model } = mongoose;
type Req<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
const define = <T>(name: string, schema: Schema<any>): mongoose.Model<T> => (models[name] as mongoose.Model<T>) || model<T>(name, schema as never);

/* ---------- tenants ---------- */
const tenantSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    trackingPrefix: { type: String, required: true, uppercase: true },
    mp: {
      name: { type: String, required: true },
      title: { type: String, default: '' },
      role: { type: String, enum: ['mp', 'minister', 'state_minister', 'deputy_minister'], required: true },
      ministry: { type: String, default: '' },
      seatName: { type: String, required: true },
      seatNumber: { type: Number, required: true },
    },
    status: { type: String, enum: ['setup', 'live', 'suspended'], default: 'setup', index: true },
    plan: { type: String, enum: ['basic', 'full'], default: 'full' },
    consent: {
      confirmed: { type: Boolean, required: true },
      documentRef: { type: String, required: true },
      receivedAt: { type: Date, default: Date.now },
      confirmedBy: { type: Schema.Types.ObjectId },
    },
    settings: {
      otpRequired: { type: Boolean, default: false },
      slaDays: { type: Number, default: 7, min: 1, max: 30 },
      complaintCategories: { type: [String], default: ['রাস্তা-ঘাট ও সেতু', 'বিদ্যুৎ', 'পানি ও পয়ঃনিষ্কাশন', 'স্বাস্থ্যসেবা', 'শিক্ষা', 'সামাজিক নিরাপত্তা ভাতা', 'আইনশৃঙ্খলা', 'হয়রানি বা দুর্নীতি', 'অন্যান্য'] },
      smsSenderId: { type: String, default: '' },
      complaintBoxEnabled: { type: Boolean, default: true },
      dailySmsCap: { type: Number, default: 500 },
    },
    theme: { accent: { type: String, enum: ['brass', 'river', 'maroon'], default: 'brass' } },
    dek: { wrapped: { type: String, required: true, select: false }, keyVersion: { type: Number, default: 1 } },
    statusHistory: [{ from: String, to: String, reason: String, by: Schema.Types.ObjectId, at: { type: Date, default: Date.now }, _id: false }],
  },
  { timestamps: true },
);
type TenantShape = Req<InferSchemaType<typeof tenantSchema>, 'mp' | 'settings' | 'consent' | 'theme'>;
export type TenantDoc = HydratedDocument<TenantShape>;
export const Tenant = define<TenantShape>('Tenant', tenantSchema);

/* ---------- domains ---------- */
const domainSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    host: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { type: String, enum: ['platform', 'custom'], required: true },
    primary: { type: Boolean, default: false },
    verification: { txtName: String, txtValue: String, verifiedAt: Date },
    dnsStatus: { type: String, enum: ['pending', 'active', 'error'], default: 'pending' },
    sslStatus: { type: String, enum: ['pending', 'active', 'error'], default: 'pending' },
    sslExpiresAt: Date,
  },
  { timestamps: true },
);
export const Domain = (models.Domain as mongoose.Model<InferSchemaType<typeof domainSchema>>) || model('Domain', domainSchema);

/* ---------- users ---------- */
const sessionSchema = new Schema(
  {
    sid: { type: String, required: true },
    refreshHash: { type: String, required: true },
    prevRefreshHash: { type: String, default: '' },
    device: { type: String, default: '' },
    ip: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String },
    email: { type: String, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    mfa: {
      totpSecretEnc: { type: String, select: false },
      totpPendingEnc: { type: String, select: false },
      enrolledAt: Date,
      lastStep: { type: Number, default: 0 },
      recoveryCodesHash: { type: [String], select: false, default: [] },
    },
    platformRole: { type: String, enum: ['super_admin', 'support', null], default: null },
    status: { type: String, enum: ['invited', 'active', 'disabled'], default: 'invited' },
    sessions: { type: [sessionSchema], default: [] },
    failedLogins: { count: { type: Number, default: 0 }, lockedUntil: Date },
  },
  { timestamps: true },
);
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = (models.User as mongoose.Model<InferSchemaType<typeof userSchema>>) || model('User', userSchema);

/* ---------- memberships ---------- */
const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    tenantId: { type: Schema.Types.ObjectId, required: true, ref: 'Tenant', index: true },
    role: { type: String, enum: ['owner', 'editor', 'officer'], required: true },
    scope: { upazilas: { type: [String], default: [] } },
    permissionOverrides: { type: [String], default: [] },
    status: { type: String, enum: ['invited', 'active', 'removed'], default: 'invited' },
    invitedBy: { type: Schema.Types.ObjectId },
    inviteTokenHash: { type: String, select: false },
    inviteExpiresAt: Date,
  },
  { timestamps: true },
);
membershipSchema.index({ userId: 1, tenantId: 1 }, { unique: true });
membershipSchema.index({ tenantId: 1, role: 1 });
type MembershipShape = Req<InferSchemaType<typeof membershipSchema>, 'scope'>;
export type MembershipDoc = HydratedDocument<MembershipShape>;
export const Membership = define<MembershipShape>('Membership', membershipSchema);

/* ---------- audit log (append-only) ---------- */
const auditSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, default: null, index: true },
    actor: {
      userId: { type: Schema.Types.ObjectId },
      name: String,
      role: String,
      viaSuperAdmin: { type: Boolean, default: false },
    },
    action: { type: String, required: true, index: true },
    entity: { type: { type: String }, id: String, label: String },
    diff: { before: Schema.Types.Mixed, after: Schema.Types.Mixed },
    reason: String,
    ip: String,
    userAgent: String,
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);
auditSchema.index({ tenantId: 1, at: -1 });
auditSchema.plugin(appendOnly);
export const AuditLog = (models.AuditLog as mongoose.Model<InferSchemaType<typeof auditSchema>>) || model('AuditLog', auditSchema);

/* ---------- counters (atomic human-readable ids) ---------- */
const counterSchema = new Schema({ _id: { type: String }, seq: { type: Number, default: 0 } }, { versionKey: false });
export const Counter = (models.Counter as mongoose.Model<{ _id: string; seq: number }>) || model('Counter', counterSchema);

export async function nextSeq(key: string): Promise<number> {
  const c = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return c.seq;
}

/* ---------- sms log (never the number or the OTP) ---------- */
const smsLogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, index: true },
    complaintId: Schema.Types.ObjectId,
    purpose: { type: String, enum: ['otp', 'ack', 'status', 'invite', 'reset', 'owner_alert'], required: true },
    phoneHmac: String,
    template: String,
    segments: Number,
    provider: String,
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'sent' },
    at: { type: Date, default: Date.now },
    day: { type: String, index: true },
  },
  { versionKey: false },
);
export const SmsLog = (models.SmsLog as mongoose.Model<InferSchemaType<typeof smsLogSchema>>) || model('SmsLog', smsLogSchema);
