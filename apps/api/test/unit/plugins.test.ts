import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from '../helpers/db.js';
import { Post, PromiseItem, AuditLog, Complaint, ComplaintEvent } from '../../src/models/index.js';
import { runInTenant } from '../../src/context.js';
import { TenantScopeError } from '../../src/plugins/tenantScoped.js';
import { AppendOnlyError } from '../../src/plugins/appendOnly.js';

const A = new mongoose.Types.ObjectId();
const B = new mongoose.Types.ObjectId();
const author = new mongoose.Types.ObjectId();

const mkPost = (slug: string, extra: Record<string, unknown> = {}) => Post.create({ slug, title: 'একটি পরীক্ষামূলক পোস্ট ' + slug, authorId: author, ...extra });

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('tenantScoped plugin (ADR-0003)', () => {
  it('sets tenantId from the request context on create', async () => {
    const p = await runInTenant(A, () => mkPost('a1'));
    expect(String(p.tenantId)).toBe(String(A));
  });

  it('FAILS CLOSED: create without tenant context throws', async () => {
    await expect(mkPost('x')).rejects.toThrow(TenantScopeError);
  });

  it('FAILS CLOSED: find / findOne / count / update / delete without context throw instead of returning everything', async () => {
    await runInTenant(A, () => mkPost('a1'));
    await expect(Post.find()).rejects.toThrow(TenantScopeError);
    await expect(Post.findOne({ slug: 'a1' })).rejects.toThrow(TenantScopeError);
    await expect(Post.countDocuments()).rejects.toThrow(TenantScopeError);
    await expect(Post.updateMany({}, { title: 'zz' })).rejects.toThrow(TenantScopeError);
    await expect(Post.deleteMany({})).rejects.toThrow(TenantScopeError);
    await expect(Post.findOneAndUpdate({ slug: 'a1' }, { title: 'zz' })).rejects.toThrow(TenantScopeError);
    await expect(Post.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])).rejects.toThrow(TenantScopeError);
  });

  it('isolates reads between tenants (BUG-2026-002: queries are awaited inside the tenant context)', async () => {
    await runInTenant(A, () => mkPost('a1'));
    await runInTenant(B, () => mkPost('b1'));
    const seenByA = await runInTenant(A, () => Post.find().lean());
    const seenByB = await runInTenant(B, () => Post.find().lean());
    expect(seenByA.map((p) => p.slug)).toEqual(['a1']);
    expect(seenByB.map((p) => p.slug)).toEqual(['b1']);
  });

  it('the same slug can exist in two tenants (unique per tenant only)', async () => {
    await runInTenant(A, () => mkPost('same'));
    await expect(runInTenant(B, () => mkPost('same'))).resolves.toBeTruthy();
    await expect(runInTenant(A, () => mkPost('same'))).rejects.toThrow(/duplicate key/i);
  });

  it('a foreign id looks up as not found (findById cannot cross tenants)', async () => {
    const b = await runInTenant(B, () => mkPost('b1'));
    expect(await runInTenant(A, () => Post.findById(b._id))).toBeNull();
    expect(await runInTenant(B, () => Post.findById(b._id))).not.toBeNull();
  });

  it('updates and deletes cannot touch another tenant\'s documents', async () => {
    const b = await runInTenant(B, () => mkPost('b1'));
    const upd = await runInTenant(A, () => Post.updateOne({ _id: b._id }, { title: 'hijacked title' }));
    expect(upd.matchedCount).toBe(0);
    const del = await runInTenant(A, () => Post.deleteOne({ _id: b._id }));
    expect(del.deletedCount).toBe(0);
    const still = await runInTenant(B, () => Post.findById(b._id));
    expect(still?.title).toContain('b1');
  });

  it('aggregate is scoped by an injected $match', async () => {
    await runInTenant(A, () => mkPost('a1'));
    await runInTenant(A, () => mkPost('a2'));
    await runInTenant(B, () => mkPost('b1'));
    const rowsA = await runInTenant(A, () => Post.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]));
    const rowsB = await runInTenant(B, () => Post.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]));
    expect(rowsA[0].n).toBe(2);
    expect(rowsB[0].n).toBe(1);
  });

  it('an explicit tenantId different from the request tenant is rejected', async () => {
    await expect(runInTenant(A, () => Post.find({ tenantId: B }))).rejects.toThrow(TenantScopeError);
    await expect(runInTenant(A, () => Post.find({ tenantId: { $in: [A, B] } }))).rejects.toThrow(TenantScopeError);
  });

  it('an explicit tenantId works without a request context (jobs / super admin)', async () => {
    await runInTenant(A, () => mkPost('a1'));
    const rows = await Post.find({ tenantId: A }).lean();
    expect(rows).toHaveLength(1);
    const cross = await Post.find({ tenantId: { $in: [A, B] } }).lean();
    expect(cross).toHaveLength(1);
  });

  it('creating a document that carries a different tenantId than the request is rejected', async () => {
    await expect(runInTenant(A, () => Post.create({ tenantId: B, slug: 'evil', title: 'evil post title', authorId: author }))).rejects.toThrow(TenantScopeError);
  });

  it('insertMany stamps the request tenant and rejects a foreign one', async () => {
    await runInTenant(A, () => PromiseItem.insertMany([{ sector: 'road', name: 'রাস্তা প্রকল্প এক', pct: 10, status: 'ongoing' }]));
    const got = await runInTenant(A, () => PromiseItem.find().lean());
    expect(String(got[0]!.tenantId)).toBe(String(A));
    await expect(runInTenant(A, () => PromiseItem.insertMany([{ tenantId: B, sector: 'road', name: 'foreign one', pct: 1, status: 'plan' }]))).rejects.toThrow(TenantScopeError);
  });

  it('tenantId is immutable after creation', async () => {
    // BUG-2026-001 regression lives in the singleton test below (SiteConfig/Profile indexes must build)
    const p = await runInTenant(A, () => mkPost('a1'));
    await runInTenant(A, async () => {
      await Post.updateOne({ _id: p._id }, { $set: { tenantId: B } });
    });
    const after = await Post.findOne({ tenantId: A, _id: p._id }).lean();
    expect(String(after?.tenantId)).toBe(String(A));
  });
});

describe('softDelete plugin', () => {
  it('hides soft-deleted rows from find/count/aggregate but keeps them stored (BUG-2026-003)', async () => {
    const p = await runInTenant(A, () => mkPost('gone'));
    await runInTenant(A, () => mkPost('kept'));
    await runInTenant(A, () => Post.updateOne({ _id: p._id }, { isDeleted: true, deletedAt: new Date() }));
    expect((await runInTenant(A, () => Post.find().lean())).map((x) => x.slug)).toEqual(['kept']);
    expect(await runInTenant(A, () => Post.countDocuments())).toBe(1);
    const agg = await runInTenant(A, () => Post.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]));
    expect(agg[0].n).toBe(1);
    const all = await runInTenant(A, () => Post.find().setOptions({ withDeleted: true }).lean());
    expect(all).toHaveLength(2);
  });
});

describe('appendOnly plugin (audit log, complaint events)', () => {
  it('allows insert and read', async () => {
    await AuditLog.create({ action: 'x.y', tenantId: A });
    expect(await AuditLog.countDocuments()).toBe(1);
  });
  it('blocks every update and delete path', async () => {
    const doc = await AuditLog.create({ action: 'x.y', tenantId: A });
    await expect(AuditLog.updateOne({ _id: doc._id }, { action: 'z' })).rejects.toThrow(AppendOnlyError);
    await expect(AuditLog.updateMany({}, { action: 'z' })).rejects.toThrow(AppendOnlyError);
    await expect(AuditLog.findOneAndUpdate({ _id: doc._id }, { action: 'z' })).rejects.toThrow(AppendOnlyError);
    await expect(AuditLog.replaceOne({ _id: doc._id }, { action: 'z' })).rejects.toThrow(AppendOnlyError);
    await expect(AuditLog.deleteOne({ _id: doc._id })).rejects.toThrow(AppendOnlyError);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(AppendOnlyError);
    await expect(AuditLog.findOneAndDelete({ _id: doc._id })).rejects.toThrow(AppendOnlyError);
    doc.action = 'changed';
    await expect(doc.save()).rejects.toThrow(AppendOnlyError);
    expect((await AuditLog.findById(doc._id))?.action).toBe('x.y');
  });
  it('complaint events are append-only too', async () => {
    const ev = await runInTenant(A, () => ComplaintEvent.create({ complaintId: new mongoose.Types.ObjectId(), type: 'note', data: { text: 'hello' } }));
    await expect(runInTenant(A, () => ComplaintEvent.updateOne({ _id: ev._id }, { type: 'status' }))).rejects.toThrow(AppendOnlyError);
  });
});

describe('complaint PII fields are hidden by default', () => {
  it('select:false keeps ciphertext out of normal reads', async () => {
    const c = await runInTenant(A, () => Complaint.create({ trackingId: 'T-1', category: 'রাস্তা', upazila: 'x', union: 'y', description: 'একটি অভিযোগের বিবরণ যা যথেষ্ট লম্বা', pii: { nameEnc: 'v1:1:a:b:c', phoneEnc: 'v1:1:d:e:f', keyVersion: 1 }, phoneHmac: 'abc' }));
    const plain = await runInTenant(A, () => Complaint.findById(c._id).lean());
    expect((plain as { pii?: Record<string, unknown> }).pii?.nameEnc).toBeUndefined();
    expect((plain as { phoneHmac?: string }).phoneHmac).toBeUndefined();
    const withPii = await runInTenant(A, () => Complaint.findById(c._id).select('+pii.nameEnc +pii.phoneEnc').lean());
    expect((withPii as { pii?: { nameEnc?: string } }).pii?.nameEnc).toBe('v1:1:a:b:c');
  });
});

describe('singleton-per-tenant models (BUG-2026-001)', () => {
  it('SiteConfig and Profile build their unique tenantId index without a name clash and allow one row per tenant', async () => {
    const { SiteConfig, Profile } = await import('../../src/models/index.js');
    await SiteConfig.init(); await Profile.init();
    await runInTenant(A, () => SiteConfig.create({ slogan: 'x' }));
    await runInTenant(B, () => SiteConfig.create({ slogan: 'y' }));
    await expect(runInTenant(A, () => SiteConfig.create({ slogan: 'again' }))).rejects.toThrow(/duplicate key/i);
    await runInTenant(A, () => Profile.create({ headline: 'h' }));
    await expect(runInTenant(A, () => Profile.create({ headline: 'h2' }))).rejects.toThrow(/duplicate key/i);
  });
});
