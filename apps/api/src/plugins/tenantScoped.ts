import { Schema, type Query, type Aggregate } from 'mongoose';
import { ctx } from '../context.js';

/* THE most important pattern (docs/05 §3, ADR-0003). Every tenant-owned model uses this plugin:
   - `tenantId` is required and immutable
   - every query/update/delete/aggregate is scoped to the request's tenant automatically
   - with NO tenant context and NO explicit tenantId the operation THROWS (fail closed), it never returns everything
   - an explicit tenantId that differs from the request's tenant also throws (no accidental foreign lookups) */

export class TenantScopeError extends Error {
  constructor(msg: string) { super(msg); this.name = 'TenantScopeError'; }
}

const QUERY_OPS = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'countDocuments', 'distinct'] as const;
const DOC_LESS_OPS = ['updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne'] as const;

function scopeQuery(this: Query<unknown, unknown>) {
  const op = (this as unknown as { op: string }).op;
  const explicit = this.getFilter().tenantId;
  const current = ctx()?.tenantId;
  if (explicit !== undefined) {
    // Inside a request the explicit value must be exactly the request's tenant (an `$in` list never matches).
    if (current && String(explicit) !== String(current)) throw new TenantScopeError(`tenantScoped: explicit tenantId differs from request tenant on ${op}`);
    return;
  }
  if (!current) throw new TenantScopeError(`tenantScoped: no tenant context for ${op}`);
  this.where({ tenantId: current });
}

function scopeAggregate(this: Aggregate<unknown>) {
  const pipeline = this.pipeline();
  const first = pipeline[0] as { $match?: { tenantId?: unknown } } | undefined;
  if (first?.$match && first.$match.tenantId !== undefined) return;
  const current = ctx()?.tenantId;
  if (!current) throw new TenantScopeError('tenantScoped: no tenant context for aggregate');
  pipeline.unshift({ $match: { tenantId: current } } as never);
}

/** `index:false` for singleton-per-tenant models that declare their own unique { tenantId: 1 } index. */
export function tenantScoped(schema: Schema, opts: { index?: boolean } = {}): void {
  schema.add({ tenantId: { type: Schema.Types.ObjectId, required: true, index: opts.index !== false, immutable: true } });

  for (const op of QUERY_OPS) schema.pre(op as never, scopeQuery as never);
  for (const op of DOC_LESS_OPS) schema.pre(op as never, { document: false, query: true } as never, scopeQuery as never);
  schema.pre('aggregate', scopeAggregate);

  // Runs before validation, so `required` is satisfied for documents created inside a tenant context.
  schema.pre('validate', function (next) {
    const current = ctx()?.tenantId;
    const doc = this as unknown as { tenantId?: unknown; isNew: boolean };
    if (!doc.tenantId) {
      if (!current) return next(new TenantScopeError('tenantScoped: no tenant context to set tenantId on create'));
      doc.tenantId = current;
    } else if (current && String(doc.tenantId) !== String(current)) {
      return next(new TenantScopeError('tenantScoped: document tenantId differs from request tenant'));
    }
    next();
  });

  schema.pre('insertMany', function (next, docs: Array<Record<string, unknown>>) {
    const current = ctx()?.tenantId;
    for (const d of docs) {
      if (!d.tenantId) {
        if (!current) return next(new TenantScopeError('tenantScoped: no tenant context for insertMany'));
        d.tenantId = current;
      } else if (current && String(d.tenantId) !== String(current)) {
        return next(new TenantScopeError('tenantScoped: insertMany tenantId differs from request tenant'));
      }
    }
    next();
  });
}
