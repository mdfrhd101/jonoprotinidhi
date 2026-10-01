import { toE164Bd } from '@jonoprotinidhi/shared';
import type { Deps } from '../deps.js';
import { ApiError } from '../errors.js';
import { Membership, User, type TenantDoc } from '../models/index.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { isObjectId } from '../lib/sanitize.js';
import { hashPassword } from '../lib/password.js';

/* Team management for one tenant. Membership is platform-level (a user can belong to several tenants),
   so every query here is explicitly scoped by the tenant id. */

export class TeamService {
  constructor(private d: Deps, private now: () => number = Date.now) {}

  async list(tenant: TenantDoc) {
    const ms = await Membership.find({ tenantId: tenant._id, status: { $ne: 'removed' } }).sort({ createdAt: 1 });
    const users = await User.find({ _id: { $in: ms.map((m) => m.userId) } });
    return ms.map((m) => {
      const u = users.find((x) => String(x._id) === String(m.userId));
      return { id: String(m._id), userId: String(m.userId), name: u?.name ?? '', phone: u?.phone ?? '', role: m.role, scope: m.scope?.upazilas ?? [], status: m.status, mfaEnrolled: !!u?.mfa?.enrolledAt, invitedExpired: m.status === 'invited' && !!m.inviteExpiresAt && m.inviteExpiresAt.getTime() < this.now() };
    });
  }

  async invite(tenant: TenantDoc, input: { name: string; phone: string; role: 'editor' | 'officer'; upazilas: string[]; password?: string }, invitedBy: unknown) {
    const phone = toE164Bd(input.phone);
    let user = await User.findOne({ phone });
    // Every conflict is decided before anything is written (BUG-2026-026)
    const existing = user ? await Membership.findOne({ userId: user._id, tenantId: tenant._id }) : null;
    if (existing && existing.status !== 'removed') throw ApiError.conflict('ALREADY_MEMBER', 'এই নম্বরের সদস্য আগেই আছেন');
    // A User is platform-wide (it may belong to other MPs' sites): a tenant owner may never set its password or status.
    if (user && input.password) throw ApiError.conflict('ACCOUNT_EXISTS', 'এই নম্বরে আগে থেকেই একটি অ্যাকাউন্ট আছে। পাসওয়ার্ড ছাড়া আমন্ত্রণ পাঠান, উনি নিজের পাসওয়ার্ডেই ঢুকবেন');

    const withPassword = !user && !!input.password;
    if (!user) {
      const passwordHash = withPassword ? await hashPassword(input.password!, { memory: this.d.config.PW_MEMORY_KIB, passes: this.d.config.PW_PASSES }) : undefined;
      user = await User.create({ name: input.name, phone, status: withPassword ? 'active' : 'invited', passwordHash });
    }

    const token = randomToken(24);
    const mStatus: 'active' | 'invited' = withPassword ? 'active' : 'invited';
    const fields = { role: input.role, scope: { upazilas: input.role === 'officer' ? input.upazilas : [] }, status: mStatus, invitedBy: invitedBy as never, inviteTokenHash: withPassword ? undefined : sha256(token), inviteExpiresAt: withPassword ? undefined : new Date(this.now() + 72 * 3600_000) };
    const m = existing ? await Membership.findOneAndUpdate({ _id: existing._id }, { $set: fields }, { new: true }) : await Membership.create({ userId: user._id, tenantId: tenant._id, ...fields });

    if (!withPassword) {
      await this.d.sms.send({ tenantId: tenant._id, to: phone, text: `জনপ্রতিনিধি: আপনাকে ${tenant.mp.name}-এর সাইটে যোগ করা হয়েছে। লিংক: https://admin.${this.d.config.PLATFORM_DOMAIN}/invite/${token}`, purpose: 'invite' });
    }
    await audit({ action: 'team.invite', tenantId: tenant._id, entity: { type: 'membership', id: m!._id, label: input.name }, diff: { after: { role: input.role, upazilas: input.upazilas, status: mStatus, ...(withPassword ? { passwordSetAtCreation: true } : {}) } } });
    return { id: String(m!._id), inviteToken: (this.d.config.isProd || withPassword) ? undefined : token };
  }

  async remove(tenant: TenantDoc, membershipId: string) {
    if (!isObjectId(membershipId)) throw ApiError.notFound();
    const m = await Membership.findOne({ _id: membershipId, tenantId: tenant._id });
    if (!m || m.status === 'removed') throw ApiError.notFound();
    if (m.role === 'owner' && m.status === 'active') {
      const owners = await Membership.countDocuments({ tenantId: tenant._id, role: 'owner', status: 'active' });
      if (owners <= 1) throw ApiError.unprocessable('LAST_OWNER', 'শেষ মালিককে সরানো যাবে না');
    }
    await Membership.updateOne({ _id: m._id }, { $set: { status: 'removed' }, $unset: { inviteTokenHash: '' } });
    await audit({ action: 'team.remove', tenantId: tenant._id, entity: { type: 'membership', id: m._id } });
  }

  async setScope(tenant: TenantDoc, membershipId: string, upazilas: string[]) {
    if (!isObjectId(membershipId)) throw ApiError.notFound();
    const m = await Membership.findOne({ _id: membershipId, tenantId: tenant._id, status: { $ne: 'removed' } });
    if (!m) throw ApiError.notFound();
    if (m.role !== 'officer') throw ApiError.unprocessable('NOT_OFFICER', 'শুধু কর্মকর্তার উপজেলা ঠিক করা যায়');
    if (!upazilas.length) throw ApiError.unprocessable('EMPTY_SCOPE', 'অন্তত একটি উপজেলা দিন');
    await Membership.updateOne({ _id: m._id }, { $set: { 'scope.upazilas': upazilas } });
    await audit({ action: 'team.scope', tenantId: tenant._id, entity: { type: 'membership', id: m._id }, diff: { before: { upazilas: m.scope?.upazilas }, after: { upazilas } } });
  }
}
