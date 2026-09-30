import { randomBytes } from 'node:crypto';
import { normalizeBdPhone, toE164Bd, isValidBdMobile } from '@jonoshetu/shared';
import type { Deps } from '../deps.js';
import { ApiError } from '../errors.js';
import { User, Membership, Tenant, type UserDoc } from '../models/index.js';
import { hashPassword, verifyPassword, dummyVerify } from '../lib/password.js';
import { generateTotpSecret, verifyTotp, otpauthUri } from '../lib/totp.js';
import { encryptField, decryptField, sha256, randomToken, safeEqual } from '../lib/crypto.js';
import { signAccess, signMfa, verifyMfa } from '../lib/tokens.js';
import { audit } from '../lib/audit.js';

/* Authentication: password -> mandatory TOTP -> session. No admin session without a second factor (FR-AUTH-01).
   Refresh tokens rotate; presenting an old one revokes the whole session (reuse detection). */

const MAX_SESSIONS = 10;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;
const GENERIC = 'ভুল তথ্য অথবা অ্যাকাউন্ট সাময়িকভাবে বন্ধ';

export type Tokens = { accessToken: string; refreshToken: string; expiresInSec: number };
export type ReqInfo = { ip?: string; userAgent?: string };

export class AuthService {
  constructor(private d: Deps, private now: () => number = Date.now) {}
  private get cost() { return { memory: this.d.config.PW_MEMORY_KIB, passes: this.d.config.PW_PASSES }; }
  private mfaAad = (userId: unknown) => `mfa|${String(userId)}`;

  /** identifier: email (contains @) or a Bangladeshi mobile number in any common format. */
  static normalizeIdentifier(id: string): { email?: string; phone?: string } {
    const s = id.trim();
    if (s.includes('@')) return { email: s.toLowerCase() };
    return { phone: isValidBdMobile(s) ? toE164Bd(s) : s };
  }

  async login(identifier: string, password: string) {
    const q = AuthService.normalizeIdentifier(identifier);
    const user = await User.findOne(q.email ? { email: q.email } : { phone: q.phone }).select('+passwordHash +mfa.totpSecretEnc');
    if (!user || !user.passwordHash) { await dummyVerify(this.cost); throw ApiError.unauthorized(GENERIC); }
    if (user.failedLogins?.lockedUntil && user.failedLogins.lockedUntil.getTime() > this.now()) { await dummyVerify(this.cost); throw ApiError.unauthorized(GENERIC); }
    if (user.status !== 'active') { await dummyVerify(this.cost); throw ApiError.unauthorized(GENERIC); }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) { await this.registerFailure(user); throw ApiError.unauthorized(GENERIC); }
    const enrolled = !!user.mfa?.enrolledAt;
    return { mfaRequired: enrolled, mfaEnrollRequired: !enrolled, mfaToken: signMfa(this.d.config.JWT_SECRET, String(user._id)) };
  }

  private async registerFailure(user: UserDoc) {
    const count = (user.failedLogins?.count ?? 0) + 1;
    const set: Record<string, unknown> = { 'failedLogins.count': count };
    if (count >= LOCK_AFTER) { set['failedLogins.lockedUntil'] = new Date(this.now() + LOCK_MS); set['failedLogins.count'] = 0; }
    await User.updateOne({ _id: user._id }, { $set: set });
    if (count >= LOCK_AFTER) await audit({ action: 'auth.locked', tenantId: null, entity: { type: 'user', id: user._id, label: user.name } });
  }

  async beginTotpEnrollment(mfaToken: string) {
    const { sub } = verifyMfa(this.d.config.JWT_SECRET, mfaToken);
    const user = await User.findById(sub).select('+mfa.recoveryCodesHash');
    if (!user || user.status !== 'active') throw ApiError.unauthorized();
    if (user.mfa?.enrolledAt) throw ApiError.conflict('MFA_ALREADY_ENROLLED', '২-ধাপ যাচাই আগেই চালু আছে');
    const secret = generateTotpSecret();
    const recovery = Array.from({ length: 8 }, () => `${randomBytes(3).toString('hex')}-${randomBytes(3).toString('hex')}`);
    await User.updateOne({ _id: user._id }, { $set: { 'mfa.totpPendingEnc': encryptField(this.d.master, secret, this.mfaAad(user._id)), 'mfa.recoveryCodesHash': recovery.map(sha256) } });
    return { secret, otpauthUri: otpauthUri(secret, user.email ?? user.phone ?? user.name), recoveryCodes: recovery };
  }

  /** Verifies a TOTP (or recovery) code. A first successful code also confirms enrolment. Returns a session. */
  async completeMfa(mfaToken: string, input: { code?: string; recoveryCode?: string }, info: ReqInfo = {}): Promise<{ tokens: Tokens; userId: string }> {
    const { sub } = verifyMfa(this.d.config.JWT_SECRET, mfaToken);
    const user = await User.findById(sub).select('+mfa.totpSecretEnc +mfa.totpPendingEnc +mfa.recoveryCodesHash');
    if (!user || user.status !== 'active') throw ApiError.unauthorized();
    if (user.failedLogins?.lockedUntil && user.failedLogins.lockedUntil.getTime() > this.now()) throw ApiError.unauthorized(GENERIC);
    const enrolled = !!user.mfa?.enrolledAt;
    let ok = false;
    const set: Record<string, unknown> = {};
    if (input.recoveryCode) {
      const h = sha256(input.recoveryCode.trim().toLowerCase());
      const list = user.mfa?.recoveryCodesHash ?? [];
      if (enrolled && list.includes(h)) { ok = true; set['mfa.recoveryCodesHash'] = list.filter((x) => x !== h); }
    } else {
      const enc = enrolled ? user.mfa?.totpSecretEnc : user.mfa?.totpPendingEnc;
      if (enc) {
        const secret = decryptField(this.d.master, enc, this.mfaAad(user._id));
        const step = verifyTotp(secret, input.code ?? '', this.now());
        if (step !== null && step > (user.mfa?.lastStep ?? 0)) { // a step can be used once (replay protection)
          ok = true; set['mfa.lastStep'] = step;
          if (!enrolled) { set['mfa.totpSecretEnc'] = enc; set['mfa.enrolledAt'] = new Date(this.now()); set['mfa.totpPendingEnc'] = undefined; }
        }
      }
    }
    if (!ok) { await this.registerFailure(user); throw ApiError.unauthorized('কোড সঠিক নয়'); }
    const unset: Record<string, ''> = {};
    if ('mfa.totpPendingEnc' in set) { delete set['mfa.totpPendingEnc']; unset['mfa.totpPendingEnc'] = ''; }
    await User.updateOne({ _id: user._id }, { $set: { ...set, 'failedLogins.count': 0 }, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    return { tokens: await this.startSession(user, info), userId: String(user._id) };
  }

  /** Dev only (MFA_REQUIRED=false): password already verified in login(), so open the session directly. */
  async startSessionAfterPassword(mfaToken: string, info: ReqInfo = {}): Promise<Tokens> {
    if (this.d.config.MFA_REQUIRED) throw ApiError.forbidden('২-ধাপ যাচাই বাধ্যতামূলক');
    const { sub } = verifyMfa(this.d.config.JWT_SECRET, mfaToken);
    const user = await User.findById(sub);
    if (!user || user.status !== 'active') throw ApiError.unauthorized();
    return this.startSession(user, info);
  }

  private async startSession(user: UserDoc, info: ReqInfo): Promise<Tokens> {
    const sid = randomToken(12), secret = randomToken(32);
    const expiresAt = new Date(this.now() + this.d.config.REFRESH_TTL_DAYS * 86400_000);
    const entry = { sid, refreshHash: sha256(secret), prevRefreshHash: '', device: (info.userAgent ?? '').slice(0, 120), ip: info.ip ?? '', createdAt: new Date(this.now()), lastUsedAt: new Date(this.now()), expiresAt };
    const keep = [...(user.sessions ?? [])].filter((s) => s.expiresAt.getTime() > this.now()).slice(-(MAX_SESSIONS - 1));
    await User.updateOne({ _id: user._id }, { $set: { sessions: [...keep, entry] } });
    return { accessToken: signAccess(this.d.config.JWT_SECRET, { sub: String(user._id), sid, ttlSec: this.d.config.ACCESS_TTL_SEC }), refreshToken: `${sid}.${secret}`, expiresInSec: this.d.config.ACCESS_TTL_SEC };
  }

  /** Rotates the refresh token. Re-presenting a previous token means theft: the session is destroyed. */
  async refresh(refreshToken: string): Promise<Tokens> {
    const [sid, secret] = String(refreshToken ?? '').split('.');
    if (!sid || !secret) throw ApiError.unauthorized();
    const user = await User.findOne({ 'sessions.sid': sid });
    const s = user?.sessions.find((x) => x.sid === sid);
    if (!user || !s || user.status !== 'active') throw ApiError.unauthorized();
    if (s.expiresAt.getTime() <= this.now()) { await this.revoke(user._id, sid); throw ApiError.unauthorized(); }
    const h = sha256(secret);
    if (s.prevRefreshHash && safeEqual(s.prevRefreshHash, h)) {
      await this.revoke(user._id, sid);
      await audit({ action: 'auth.refresh_reuse', tenantId: null, entity: { type: 'user', id: user._id, label: user.name } });
      throw ApiError.unauthorized('নিরাপত্তার কারণে সেশন বাতিল হয়েছে, আবার লগইন করুন');
    }
    if (!safeEqual(s.refreshHash, h)) throw ApiError.unauthorized();
    const next = randomToken(32);
    await User.updateOne({ _id: user._id, 'sessions.sid': sid }, { $set: { 'sessions.$.refreshHash': sha256(next), 'sessions.$.prevRefreshHash': s.refreshHash, 'sessions.$.lastUsedAt': new Date(this.now()) } });
    return { accessToken: signAccess(this.d.config.JWT_SECRET, { sub: String(user._id), sid, ttlSec: this.d.config.ACCESS_TTL_SEC }), refreshToken: `${sid}.${next}`, expiresInSec: this.d.config.ACCESS_TTL_SEC };
  }

  async revoke(userId: unknown, sid: string) { await User.updateOne({ _id: userId }, { $pull: { sessions: { sid } } }); }
  async revokeAll(userId: unknown) { await User.updateOne({ _id: userId }, { $set: { sessions: [] } }); }

  async sessions(userId: unknown, currentSid: string) {
    const u = await User.findById(userId);
    return (u?.sessions ?? []).map((s) => ({ id: s.sid, device: s.device, ip: s.ip, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, current: s.sid === currentSid }));
  }

  async me(userId: unknown) {
    const u = await User.findById(userId);
    if (!u) throw ApiError.unauthorized();
    const ms = await Membership.find({ userId: u._id, status: 'active' });
    const tenants = await Tenant.find({ _id: { $in: ms.map((m) => m.tenantId) } });
    return {
      user: { id: String(u._id), name: u.name, phone: u.phone, email: u.email, platformRole: u.platformRole ?? null, mfaEnrolled: !!u.mfa?.enrolledAt },
      memberships: ms.map((m) => { const t = tenants.find((x) => String(x._id) === String(m.tenantId)); return { tenantId: String(m.tenantId), slug: t?.slug, seat: t ? `${t.mp.seatName}-${t.mp.seatNumber}` : '', mpName: t?.mp.name, tenantStatus: t?.status, role: m.role, scope: m.scope?.upazilas ?? [] }; }),
    };
  }

  /** Accepts an invitation: sets the password (the user still has to enrol TOTP before getting a session). */
  async acceptInvite(token: string, password: string) {
    const m = await Membership.findOne({ inviteTokenHash: sha256(token), status: 'invited' }).select('+inviteTokenHash');
    if (!m || !m.inviteExpiresAt || m.inviteExpiresAt.getTime() < this.now()) throw ApiError.notFound('আমন্ত্রণ লিংকের মেয়াদ শেষ বা সঠিক নয়');
    const hash = await hashPassword(password, this.cost);
    await User.updateOne({ _id: m.userId }, { $set: { passwordHash: hash, status: 'active' } });
    await Membership.updateOne({ _id: m._id }, { $set: { status: 'active' }, $unset: { inviteTokenHash: '', inviteExpiresAt: '' } });
    return { mfaToken: signMfa(this.d.config.JWT_SECRET, String(m.userId)), mfaEnrollRequired: true };
  }

  /** Used by seed/tests/super-admin bootstrap. */
  async createUser(p: { name: string; email?: string; phone?: string; password: string; platformRole?: 'super_admin' | 'support' | null; status?: 'active' | 'invited' }) {
    const phone = p.phone ? toE164Bd(p.phone) : undefined;
    return User.create({ name: p.name, email: p.email?.toLowerCase(), phone, passwordHash: await hashPassword(p.password, this.cost), platformRole: p.platformRole ?? null, status: p.status ?? 'active' });
  }
}

export { normalizeBdPhone };
