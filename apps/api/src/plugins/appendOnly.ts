import type { Schema } from 'mongoose';

/* Audit logs and complaint events are append-only at the application layer (tamper resistance). In production the
   app's database user should additionally have insert+find only on these collections (docs/08 T2). */

export class AppendOnlyError extends Error {
  constructor(op: string) { super(`append-only collection: ${op} is not allowed`); this.name = 'AppendOnlyError'; }
}

export function appendOnly(schema: Schema): void {
  const block = (op: string) => function () { throw new AppendOnlyError(op); };
  for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'findOneAndDelete', 'deleteMany'] as const) {
    schema.pre(op as never, block(op) as never);
  }
  schema.pre('deleteOne', { document: false, query: true } as never, block('deleteOne') as never);
  schema.pre('deleteOne', { document: true, query: false } as never, block('deleteOne') as never);
  schema.pre('save', function (next) {
    if (!this.isNew) return next(new AppendOnlyError('save on existing document'));
    next();
  });
}
