import { promiseInputSchema, promiseUpdateSchema, PROMISE_STATUSES } from '@jonoprotinidhi/shared';
import { ApiError } from '../errors.js';
import { PromiseItem } from '../models/index.js';
import { audit } from '../lib/audit.js';

/* Promise tracker. Validation lives in the shared schema (done => 100%, late => a written reason), enforced here for
   every write. Every change is audited with before/after so nobody can quietly make progress look better (MIS-10). */

const KEYS = ['sector', 'name', 'place', 'budgetLabel', 'budgetBdt', 'targetLabel', 'targetDate', 'pct', 'status', 'delayReason', 'featured', 'order'] as const;
const view = (p: Record<string, unknown>) => Object.fromEntries(KEYS.map((k) => [k, p[k]]));

export class PromiseService {
  constructor(private now: () => number = Date.now) {}

  async list() { return PromiseItem.find().sort({ sector: 1, order: 1, createdAt: 1 }).lean(); }

  async create(input: unknown) {
    const d = promiseInputSchema.parse(input);
    const p = await PromiseItem.create({ ...d, lastChangedAt: new Date(this.now()) });
    await audit({ action: 'promise.create', entity: { type: 'promise', id: p._id, label: p.name }, diff: { after: view(p.toObject()) } });
    return p;
  }

  async update(id: string, patch: Record<string, unknown>) {
    const cur = await PromiseItem.findById(id);
    if (!cur) throw ApiError.notFound('প্রতিশ্রুতি পাওয়া যায়নি');
    const unknown = Object.keys(patch).filter((k) => !(KEYS as readonly string[]).includes(k));
    if (unknown.length) throw ApiError.validation({ unknownKeys: unknown });
    const before = view(cur.toObject());
    const merged = promiseInputSchema.parse({ ...before, budgetBdt: before.budgetBdt ?? undefined, targetDate: before.targetDate ?? undefined, ...patch });
    if (merged.status !== 'late') merged.delayReason = '';
    const res = await PromiseItem.findOneAndUpdate({ _id: cur._id }, { $set: { ...merged, lastChangedAt: new Date(this.now()) } }, { new: true });
    await audit({ action: 'promise.update', entity: { type: 'promise', id: cur._id, label: cur.name }, diff: { before, after: view(res!.toObject()) } });
    return res!;
  }

  async addUpdate(id: string, input: unknown, by: string) {
    const { text } = promiseUpdateSchema.parse(input);
    const res = await PromiseItem.findOneAndUpdate({ _id: id }, { $push: { updates: { $each: [{ date: new Date(this.now()), text, by }], $position: 0 } }, $set: { lastChangedAt: new Date(this.now()) } }, { new: true });
    if (!res) throw ApiError.notFound('প্রতিশ্রুতি পাওয়া যায়নি');
    await audit({ action: 'promise.add_update', entity: { type: 'promise', id: res._id, label: res.name }, diff: { after: { text } } });
    return res;
  }

  async remove(id: string) {
    const p = await PromiseItem.findById(id);
    if (!p) throw ApiError.notFound('প্রতিশ্রুতি পাওয়া যায়নি');
    await PromiseItem.updateOne({ _id: p._id }, { $set: { isDeleted: true, deletedAt: new Date(this.now()) } });
    await audit({ action: 'promise.delete', entity: { type: 'promise', id: p._id, label: p.name }, diff: { before: view(p.toObject()) } });
  }

  /** Public view: summary counts are computed, never typed by a person. */
  async publicList() {
    const rows = await PromiseItem.find().sort({ sector: 1, order: 1 }).lean();
    const summary: Record<string, number> = { total: rows.length };
    for (const s of PROMISE_STATUSES) summary[s] = rows.filter((r) => r.status === s).length;
    return {
      summary,
      items: rows.map((r) => ({ id: String(r._id), sector: r.sector, name: r.name, place: r.place, budget: r.budgetLabel, target: r.targetLabel, pct: r.pct, status: r.status, delayReason: r.status === 'late' ? r.delayReason : '', updates: (r.updates ?? []).map((u) => ({ date: u.date, text: u.text })), featured: r.featured, lastChangedAt: r.lastChangedAt })),
    };
  }
}
