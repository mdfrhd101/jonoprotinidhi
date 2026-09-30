import { Schema, type Query, type Aggregate } from 'mongoose';

/* Soft delete as a plugin: history is kept, and every read path hides deleted rows without controller edits.
   Aggregations bypass query middleware, so the aggregate hook injects the filter too (docs skill note).
   Opt out per query with `.setOptions({ withDeleted: true })`. */

function hideDeleted(this: Query<unknown, unknown>) {
  if ((this.getOptions() as { withDeleted?: boolean }).withDeleted) return;
  if (this.getFilter().isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
}

export function softDelete(schema: Schema): void {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
    deletedBy: String,
  });
  for (const op of ['find', 'findOne', 'findOneAndUpdate', 'countDocuments', 'updateOne', 'updateMany'] as const) schema.pre(op as never, hideDeleted as never);
  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    const first = this.pipeline()[0] as { $match?: { isDeleted?: unknown } } | undefined;
    if (first?.$match && first.$match.isDeleted !== undefined) return;
    this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } } as never); // must run BEFORE $group/$count (BUG-2026-003)
  });
}
