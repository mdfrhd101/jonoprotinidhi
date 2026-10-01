import mongoose from 'mongoose';
import { canComplaintTransition, complaintSubmitSchema, complaintPatchSchema, hasPermission, normalizeBdPhone, toE164Bd, type ComplaintStatus, type ComplaintSubmit, type Perm } from '@jonoprotinidhi/shared';
import type { Deps } from '../deps.js';
import { ApiError } from '../errors.js';
import { Complaint, ComplaintEvent, Membership, Tenant, nextSeq, type TenantDoc } from '../models/index.js';
import { encryptField, decryptField, unwrapKey, hmacPhone, piiAad } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { cleanAttachments } from '../lib/attachments.js';
import { csvCell, escapeRegex, isObjectId } from '../lib/sanitize.js';
import { ctx, runInTenant } from '../context.js';

/* Complaints (FR-CMP-*, ADR-0004, ADR-0007).
   - name/phone exist ONLY as AES-GCM ciphertext bound to (tenant, complaint, field)
   - only the ASSIGNED officer can decrypt, one at a time, with a purpose, rate-limited and logged
   - owner / editor / support / super admin (even acting-as) can never see identity
   - the public sees a tracking view and aggregate statistics only */

export type MemberCtx = { role: string; perms: Perm[]; scope: string[]; viaSuperAdmin: boolean; userId: string; name: string };

export const TEMPLATES: Record<string, string> = {
  received: 'আপনার অভিযোগ {id} গ্রহণ করা হয়েছে। অবস্থা জানতে ট্র্যাকিং আইডি ব্যবহার করুন।',
  verify: 'আপনার অভিযোগ {id} যাচাই করা হচ্ছে।',
  progress: 'আপনার অভিযোগ {id} সংশ্লিষ্ট দপ্তরে পাঠানো হয়েছে, কাজ চলছে।',
  solved: 'আপনার অভিযোগ {id}-এর সমাধান হয়েছে। ধন্যবাদ।',
  closed: 'আপনার অভিযোগ {id} বন্ধ করা হয়েছে।',
};
const STEP_LABEL: Partial<Record<ComplaintStatus, string>> = { verify: 'যাচাই চলছে', progress: 'প্রক্রিয়াধীন', solved: 'সমাধান হয়েছে', closed: 'বন্ধ', spam: 'গ্রহণযোগ্য নয়' };
const MS_DAY = 86400_000;
const NO_PAYLOAD = '-voiceNote.audioData -files.data';

export class ComplaintService {
  constructor(private d: Deps, private now: () => number = Date.now) {}

  private dhakaYear() { return new Date(this.now() + 6 * 3600_000).getUTCFullYear(); }
  private async dek(tenantId: unknown): Promise<Buffer> {
    const t = await Tenant.findById(tenantId).select('+dek.wrapped');
    if (!t?.dek?.wrapped) throw new Error('tenant key missing');
    return unwrapKey(this.d.master, t.dek.wrapped);
  }

  /* ---------- OTP ---------- */
  async sendOtp(tenant: TenantDoc, phoneRaw: string, turnstileToken: string | undefined, ip: string) {
    if (!(await this.d.turnstile.verify(turnstileToken, ip))) throw ApiError.badRequest('স্প্যাম যাচাই ব্যর্থ হয়েছে');
    const phone = normalizeBdPhone(phoneRaw);
    if (!/^01[3-9]\d{8}$/.test(phone)) throw ApiError.badRequest('সঠিক মোবাইল নম্বর দিন');
    const h = hmacPhone(this.d.config.PHONE_PEPPER, phone);
    for (const r of [this.d.rateLimiter.check('otpSend', `ip:${ip}`), this.d.rateLimiter.check('otpSend', `ph:${tenant._id}:${h}`)]) if (!r.allowed) throw ApiError.tooMany(r.retryAfterSec);
    const issued = this.d.otp.issue(`${tenant._id}:${h}`);
    if (issued.ok) await this.d.sms.send({ tenantId: tenant._id, to: toE164Bd(phone), text: `জনপ্রতিনিধি যাচাই কোড: ${issued.code} (৫ মিনিট)`, purpose: 'otp', senderId: tenant.settings.smsSenderId, cap: tenant.settings.dailySmsCap });
    // Same response whether or not a code was sent: no signal for enumeration or cooldown probing.
  }

  verifyOtp(tenant: TenantDoc, phoneRaw: string, code: string): string {
    const h = hmacPhone(this.d.config.PHONE_PEPPER, normalizeBdPhone(phoneRaw));
    const ticket = this.d.otp.verify(`${tenant._id}:${h}`, code);
    if (!ticket) throw ApiError.badRequest('কোড সঠিক নয় বা মেয়াদ শেষ');
    return ticket;
  }

  /* ---------- submit ---------- */
  async submit(tenant: TenantDoc, raw: unknown, info: { ip: string }, staff?: { channel: 'hearing' | 'phone'; userName: string }) {
    const input: ComplaintSubmit = complaintSubmitSchema.parse(raw);
    if (!tenant.settings.complaintBoxEnabled) throw ApiError.unprocessable('BOX_DISABLED', 'অভিযোগ বক্স এখন বন্ধ');
    if (!tenant.settings.complaintCategories.includes(input.category)) throw ApiError.unprocessable('BAD_CATEGORY', 'বিষয়টি তালিকায় নেই');

    const phone = input.anonymous ? '' : normalizeBdPhone(input.phone);
    const phoneHmac = phone ? hmacPhone(this.d.config.PHONE_PEPPER, phone) : undefined;
    let otpVerified = false;

    if (!staff) {
      if (!(await this.d.turnstile.verify(input.turnstileToken, info.ip))) throw ApiError.badRequest('স্প্যাম যাচাই ব্যর্থ হয়েছে');
      const checks = [this.d.rateLimiter.check('publicWrite', `ip:${info.ip}`)];
      if (phoneHmac) checks.push(this.d.rateLimiter.check('publicWriteDaily', `ph:${tenant._id}:${phoneHmac}`));
      for (const r of checks) if (!r.allowed) throw ApiError.tooMany(r.retryAfterSec);
      if (phoneHmac) {
        otpVerified = this.d.otp.consumeTicket(input.otpTicket, `${tenant._id}:${phoneHmac}`);
        if (tenant.settings.otpRequired && !otpVerified) throw ApiError.unprocessable('OTP_REQUIRED', 'মোবাইল নম্বর যাচাই (OTP) প্রয়োজন');
      }
    }

    // only after spam/rate checks: decoding and re-encoding attachments costs CPU (BUG-2026-027)
    const attachments = await cleanAttachments(input);

    const _id = new mongoose.Types.ObjectId();
    const key = await this.dek(tenant._id);
    const kv = tenant.dek?.keyVersion ?? 1;
    const pii = input.anonymous ? undefined : {
      nameEnc: input.name ? encryptField(key, input.name, piiAad(tenant._id, _id, 'name'), kv) : undefined,
      phoneEnc: encryptField(key, phone, piiAad(tenant._id, _id, 'phone'), kv),
      keyVersion: kv,
    };
    const year = this.dhakaYear();
    const seq = await nextSeq(`${tenant._id}:complaint:${year}`);
    const trackingId = `${tenant.trackingPrefix}-${year}-${String(seq).padStart(5, '0')}`;
    const c = await Complaint.create({
      _id: _id as never, trackingId, category: input.category, upazila: input.upazila, union: input.union, place: input.place, description: input.description,
      channel: staff?.channel ?? 'web', voiceNote: attachments.voiceNote, files: attachments.files, anonymous: input.anonymous, pii, phoneHmac, otpVerified,
      slaDueAt: new Date(this.now() + tenant.settings.slaDays * MS_DAY),
      publicSteps: [{ label: 'অভিযোগ গৃহীত', note: '', at: new Date(this.now()) }],
    });
    await ComplaintEvent.create({ complaintId: c._id, type: 'created', by: staff ? { name: staff.userName } : undefined, data: { channel: c.channel } });
    await audit({ action: 'complaint.create', entity: { type: 'complaint', id: c._id, label: trackingId } });
    if (!input.anonymous) await this.notify(tenant, c._id, 'received', phone);
    return { trackingId };
  }

  /** Sends a templated SMS. The phone is decrypted here, inside the service, and never leaves it. */
  private async notify(tenant: TenantDoc, complaintId: unknown, tpl: keyof typeof TEMPLATES, knownPhone?: string): Promise<boolean> {
    const c = await Complaint.findById(complaintId).select('+pii.phoneEnc trackingId anonymous piiPurgedAt');
    if (!c || c.anonymous || c.piiPurgedAt || !c.pii?.phoneEnc) return false;
    const phone = knownPhone ?? decryptField(await this.dek(tenant._id), c.pii.phoneEnc, piiAad(tenant._id, c._id, 'phone'));
    return this.d.sms.send({ tenantId: tenant._id, complaintId: c._id, to: toE164Bd(phone), text: TEMPLATES[tpl]!.replace('{id}', c.trackingId), purpose: tpl === 'received' ? 'ack' : 'status', senderId: tenant.settings.smsSenderId, cap: tenant.settings.dailySmsCap });
  }

  /* ---------- public reads ---------- */
  async track(trackingId: string) {
    const c = await Complaint.findOne({ trackingId: String(trackingId).toUpperCase().slice(0, 40) }).lean();
    if (!c) throw ApiError.notFound('এই আইডিতে কোনো অভিযোগ পাওয়া যায়নি');
    return { trackingId: c.trackingId, category: c.category, upazila: c.upazila, union: c.union, status: c.status, submittedAt: c.createdAt, steps: (c.publicSteps ?? []).map((s) => ({ label: s.label, note: s.note, at: s.at })) };
  }

  /** Aggregates only. Categories with fewer than 5 complaints are merged into "অন্যান্য" so a rare category cannot identify anyone. */
  async publicStats(month?: string) {
    const [y, m] = (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : new Date(this.now() + 6 * 3600_000).toISOString().slice(0, 7)).split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(y, m - 1, 1)), to = new Date(Date.UTC(y, m, 1));
    const rows = await Complaint.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to }, status: { $ne: 'spam' } } },
      { $group: { _id: '$category', received: { $sum: 1 }, resolved: { $sum: { $cond: [{ $in: ['$status', ['solved', 'closed']] }, 1, 0] } }, sumMs: { $sum: { $cond: [{ $and: [{ $in: ['$status', ['solved', 'closed']] }, { $ne: [{ $type: '$resolvedAt' }, 'missing'] }] }, { $subtract: ['$resolvedAt', '$createdAt'] }, 0] } } } },
    ]);
    let received = 0, resolved = 0, sumMs = 0;
    const byCat: Record<string, number> = {};
    for (const r of rows) { received += r.received; resolved += r.resolved; sumMs += r.sumMs; byCat[r._id] = r.received; }
    const merged: Record<string, number> = {};
    for (const [k, n] of Object.entries(byCat)) merged[n < 5 ? 'অন্যান্য' : k] = (merged[n < 5 ? 'অন্যান্য' : k] ?? 0) + n;
    return { month: `${y}-${String(m).padStart(2, '0')}`, received, resolved, avgDays: resolved ? Math.round((sumMs / resolved / MS_DAY) * 10) / 10 : 0, byCategory: Object.entries(merged).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count) };
  }

  /* ---------- staff side ---------- */
  private scopeFilter(m: MemberCtx): Record<string, unknown> {
    if (hasPermission(m.perms, 'complaints.view_all')) return {};
    if (hasPermission(m.perms, 'complaints.view_scoped')) return { upazila: { $in: m.scope } };
    throw ApiError.forbidden();
  }

  async list(m: MemberCtx, q: { status?: string; upazila?: string; q?: string; mine?: boolean; late?: boolean; page: number; limit: number }) {
    const filter: Record<string, unknown> = { ...this.scopeFilter(m) };
    if (q.status === 'open') filter.status = { $in: ['new', 'verify', 'progress'] };
    else if (q.status) filter.status = q.status;
    if (q.upazila) { // a filter may narrow the scope, never widen it
      const s = filter.upazila as { $in: string[] } | undefined;
      if (s && !s.$in.includes(q.upazila)) return { items: [], page: q.page, limit: q.limit, total: 0, totalPages: 0 };
      filter.upazila = q.upazila;
    }
    if (q.mine) filter.assignedTo = m.userId;
    if (q.late) { filter.slaDueAt = { $lt: new Date(this.now()) }; filter.status = { $in: ['new', 'verify', 'progress'] }; }
    if (q.q) { const rx = new RegExp(escapeRegex(q.q), 'i'); filter.$or = [{ trackingId: rx }, { category: rx }, { description: rx }]; }
    const [rows, total] = await Promise.all([
      // BUG-2026-029: the inbox never loads voice or file payloads, only what the list needs to show
      Complaint.find(filter).select(NO_PAYLOAD).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      Complaint.countDocuments(filter),
    ]);
    return { items: rows.map((c) => this.view(c)), page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) };
  }

  /** Shared shape for list, detail and patch responses: attachment metadata only, never the payloads. */
  private view(c: Record<string, any>) {
    const open = ['new', 'verify', 'progress'].includes(c.status);
    const files = (c.files ?? []) as Array<{ name: string; mimeType: string; size: number }>;
    return { id: String(c._id), trackingId: c.trackingId, category: c.category, upazila: c.upazila, union: c.union, place: c.place, description: c.description ?? '', channel: c.channel, anonymous: c.anonymous, otpVerified: c.otpVerified, status: c.status, assignedTo: c.assignedTo ? String(c.assignedTo) : null, createdAt: c.createdAt, slaDueAt: c.slaDueAt, resolvedAt: c.resolvedAt, overdue: open && !!c.slaDueAt && new Date(c.slaDueAt).getTime() < this.now(), version: c.version, pii: { available: !c.anonymous && !c.piiPurgedAt },
      hasVoice: !!c.voiceNote, voiceSec: c.voiceNote?.durationSec ?? null, fileCount: files.length, fileMeta: files.map((f) => ({ name: f.name, mimeType: f.mimeType, size: f.size })) };
  }

  async get(m: MemberCtx, id: string) {
    if (!isObjectId(id)) throw ApiError.notFound();
    const c = await Complaint.findOne({ _id: id, ...this.scopeFilter(m) }).lean();
    if (!c) throw ApiError.notFound();
    const events = await ComplaintEvent.find({ complaintId: c._id }).sort({ at: 1 }).lean();
    const canUpdate = hasPermission(m.perms, 'complaints.manage') || (!!c.assignedTo && String(c.assignedTo) === m.userId);
    return { ...this.view(c), voiceNote: c.voiceNote?.audioData ? { audioData: c.voiceNote.audioData, durationSec: c.voiceNote.durationSec ?? null } : null, files: c.files ?? [], canViewPii: this.canViewPii(m, c), canUpdate, events: events.map((e) => ({ type: e.type, by: e.by?.name, data: e.type === 'pii_view' ? { purpose: (e.data as { purpose?: string })?.purpose } : e.data, at: e.at })) };
  }

  private canViewPii(m: MemberCtx, c: { assignedTo?: unknown; anonymous?: boolean; piiPurgedAt?: unknown }) {
    return !m.viaSuperAdmin && m.role === 'officer' && hasPermission(m.perms, 'complaints.pii_view') && !!c.assignedTo && String(c.assignedTo) === m.userId && !c.anonymous && !c.piiPurgedAt;
  }

  async patch(tenant: TenantDoc, m: MemberCtx, id: string, raw: unknown) {
    if (!isObjectId(id)) throw ApiError.notFound();
    const p = complaintPatchSchema.parse(raw);
    const c = await Complaint.findOne({ _id: id, ...this.scopeFilter(m) }).select(NO_PAYLOAD);
    if (!c) throw ApiError.notFound();
    if (p.version !== undefined && p.version !== c.version) throw ApiError.conflict('VERSION_CONFLICT', 'অভিযোগটি অন্য কেউ বদলেছেন, রিফ্রেশ করুন');
    const manage = hasPermission(m.perms, 'complaints.manage');
    const isAssigned = !!c.assignedTo && String(c.assignedTo) === m.userId;
    if (!manage && !isAssigned) throw ApiError.forbidden('এই অভিযোগ আপনাকে দেওয়া হয়নি');
    const set: Record<string, unknown> = {}, events: Array<{ type: 'status' | 'assign' | 'note'; data: unknown }> = [];
    const at = new Date(this.now());

    if (p.assignedTo !== undefined) {
      if (!manage) throw ApiError.forbidden('দায়িত্ব দেওয়ার অনুমতি নেই');
      if (p.assignedTo !== null) {
        const ms = await Membership.findOne({ userId: p.assignedTo, tenantId: tenant._id, role: 'officer', status: 'active' });
        if (!ms || !ms.scope.upazilas.includes(c.upazila)) throw ApiError.unprocessable('BAD_ASSIGNEE', 'এই উপজেলার সক্রিয় কর্মকর্তা নন');
      }
      set.assignedTo = p.assignedTo;
      events.push({ type: 'assign', data: { from: c.assignedTo ? String(c.assignedTo) : null, to: p.assignedTo } });
    }
    if (p.status && p.status !== c.status) {
      if (!canComplaintTransition(c.status as ComplaintStatus, p.status)) throw ApiError.unprocessable('BAD_TRANSITION', `${c.status} থেকে ${p.status} করা যাবে না`);
      set.status = p.status;
      if (c.status === 'new' && !c.firstActionAt) set.firstActionAt = at;
      if (p.status === 'solved') set.resolvedAt = at;
      if (p.status === 'progress' && c.status === 'solved') set.resolvedAt = undefined;
      if (p.status === 'closed') set.retentionUntil = new Date(at.getTime() + this.d.config.PII_RETENTION_MONTHS * 30 * MS_DAY);
      if (STEP_LABEL[p.status]) set.publicSteps = [...(c.publicSteps ?? []), { label: STEP_LABEL[p.status], note: '', at }];
      events.push({ type: 'status', data: { from: c.status, to: p.status } });
    }
    if (p.note) {
      events.push({ type: 'note', data: { text: p.note } });
    }
    if (!events.length) return this.view(c.toObject());

    const res = await Complaint.findOneAndUpdate({ _id: c._id, version: c.version }, { $set: set, $inc: { version: 1 } }, { new: true, projection: NO_PAYLOAD });
    if (!res) throw ApiError.conflict('VERSION_CONFLICT', 'অভিযোগটি অন্য কেউ বদলেছেন, রিফ্রেশ করুন');
    for (const e of events) await ComplaintEvent.create({ complaintId: c._id, type: e.type, by: { userId: m.userId as never, name: m.name }, data: e.data });
    await audit({ action: 'complaint.update', entity: { type: 'complaint', id: c._id, label: c.trackingId }, diff: { before: { status: c.status, assignedTo: c.assignedTo }, after: { status: res.status, assignedTo: res.assignedTo } } });
    if (p.status && TEMPLATES[p.status]) await this.notify(tenant, c._id, p.status);
    return this.view(res.toObject());
  }

  async addNote(m: MemberCtx, id: string, text: string) {
    if (!isObjectId(id)) throw ApiError.notFound();
    const c = await Complaint.findOne({ _id: id, ...this.scopeFilter(m) }).select('trackingId');
    if (!c) throw ApiError.notFound();
    await ComplaintEvent.create({ complaintId: c._id, type: 'note', by: { userId: m.userId as never, name: m.name }, data: { text } });
    await audit({ action: 'complaint.note', entity: { type: 'complaint', id: c._id, label: c.trackingId } });
  }

  async sendSms(tenant: TenantDoc, m: MemberCtx, id: string, tpl: string) {
    if (!isObjectId(id)) throw ApiError.notFound();
    if (!TEMPLATES[tpl]) throw ApiError.badRequest('টেমপ্লেট নেই');
    const c = await Complaint.findOne({ _id: id, ...this.scopeFilter(m) }).select('trackingId anonymous assignedTo');
    if (!c) throw ApiError.notFound();
    if (!hasPermission(m.perms, 'complaints.manage') && String(c.assignedTo) !== m.userId) throw ApiError.forbidden();
    if (c.anonymous) throw ApiError.unprocessable('ANONYMOUS', 'বেনামী অভিযোগে SMS পাঠানো যায় না');
    const sent = await this.notify(tenant, c._id, tpl);
    await ComplaintEvent.create({ complaintId: c._id, type: 'sms', by: { userId: m.userId as never, name: m.name }, data: { template: tpl, sent } });
    await audit({ action: 'complaint.sms', entity: { type: 'complaint', id: c._id, label: c.trackingId } });
    return { sent };
  }

  /** The ONLY code path that returns a complainant's identity. */
  async viewPii(tenant: TenantDoc, m: MemberCtx, id: string, purpose: string) {
    if (!isObjectId(id)) throw ApiError.notFound();
    if (m.viaSuperAdmin) throw ApiError.forbidden('প্ল্যাটফর্ম অ্যাডমিন নাগরিকের পরিচয় দেখতে পারেন না');
    const r = this.d.rateLimiter.check('pii', `user:${m.userId}`);
    if (!r.allowed) throw ApiError.tooMany(r.retryAfterSec);
    const c = await Complaint.findOne({ _id: id, ...this.scopeFilter(m) }).select('+pii.nameEnc +pii.phoneEnc trackingId anonymous assignedTo piiPurgedAt');
    if (!c) throw ApiError.notFound();
    if (!this.canViewPii(m, c)) throw ApiError.forbidden('শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা পরিচয় দেখতে পারেন');
    if (!c.pii?.phoneEnc) throw ApiError.unprocessable('PII_UNAVAILABLE', 'পরিচয় পাওয়া যায় না');
    const key = await this.dek(tenant._id);
    const name = c.pii.nameEnc ? decryptField(key, c.pii.nameEnc, piiAad(tenant._id, c._id, 'name')) : '';
    const phone = decryptField(key, c.pii.phoneEnc, piiAad(tenant._id, c._id, 'phone'));
    await ComplaintEvent.create({ complaintId: c._id, type: 'pii_view', by: { userId: m.userId as never, name: m.name }, data: { purpose } });
    await audit({ action: 'complaint.pii_view', entity: { type: 'complaint', id: c._id, label: c.trackingId }, reason: purpose });
    return { name, phone };
  }

  async exportCsv(m: MemberCtx) {
    const rows = await Complaint.find(this.scopeFilter(m)).select('trackingId createdAt channel category upazila union status resolvedAt').sort({ createdAt: -1 }).limit(20000).lean();
    const head = ['trackingId', 'createdAt', 'channel', 'category', 'upazila', 'union', 'status', 'daysToResolve'];
    const lines = [head.map(csvCell).join(',')];
    for (const c of rows) lines.push([c.trackingId, c.createdAt.toISOString(), c.channel, c.category, c.upazila, c.union, c.status, c.resolvedAt ? Math.round(((c.resolvedAt.getTime() - c.createdAt.getTime()) / MS_DAY) * 10) / 10 : ''].map(csvCell).join(','));
    await audit({ action: 'complaint.export', reason: `${rows.length} rows, no PII` });
    return '﻿' + lines.join('\r\n');
  }

  /** Retention job: complainant identity is removed after the tenant retention period; the record stays for statistics.
      A recorded voice and attached photos/documents can identify the citizen too, so they go as well, anonymous or not
      (BUG-2026-032). */
  async purgeExpiredPii(): Promise<number> {
    let total = 0;
    for (const t of await Tenant.find().select('_id')) {
      total += await runInTenant(t._id, async () => {
        const due = { $lte: new Date(this.now()) };
        const res = await Complaint.updateMany({ retentionUntil: due, piiPurgedAt: { $exists: false }, anonymous: false }, { $set: { piiPurgedAt: new Date(this.now()) }, $unset: { pii: '', phoneHmac: '', voiceNote: '', files: '' } });
        const media = await Complaint.updateMany({ retentionUntil: due, $or: [{ voiceNote: { $exists: true } }, { 'files.0': { $exists: true } }] }, { $unset: { voiceNote: '', files: '' } });
        if (res.modifiedCount || media.modifiedCount) await audit({ action: 'complaint.pii_purge', reason: `${res.modifiedCount} records${media.modifiedCount ? `, attachments removed from ${media.modifiedCount} more` : ''}` });
        return res.modifiedCount;
      });
    }
    return total;
  }
}
export { ctx };
