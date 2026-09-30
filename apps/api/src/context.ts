import { AsyncLocalStorage } from 'node:async_hooks';
import type { Types } from 'mongoose';

/* Per-request context (docs/02 §3). The tenantScoped plugin reads `tenantId` from here. */

export type Actor = {
  userId: Types.ObjectId | string;
  name: string;
  role: string; // panel role for the current tenant, or platform role
  viaSuperAdmin: boolean;
};

export type Ctx = {
  requestId?: string;
  tenantId?: Types.ObjectId | string;
  actor?: Actor;
  ip?: string;
  userAgent?: string;
};

export const als = new AsyncLocalStorage<Ctx>();
export const ctx = (): Ctx | undefined => als.getStore();

/**
 * Run a function inside a tenant context (jobs, tests, seed scripts).
 *
 * The callback's result is AWAITED inside the context. A Mongoose Query is lazy: if it were returned un-awaited it would
 * execute after the context has been exited and (correctly, fail-closed) throw "no tenant context" (BUG-2026-002).
 */
export function runInTenant<T>(tenantId: Types.ObjectId | string, fn: () => T | PromiseLike<T>, extra: Partial<Ctx> = {}): Promise<T> {
  return als.run({ ...extra, tenantId }, async () => (await fn()) as T);
}
export function runWithCtx<T>(c: Ctx, fn: () => T | PromiseLike<T>): Promise<T> {
  return als.run(c, async () => (await fn()) as T);
}
