import { AuditLog } from '../models/index.js';
import { ctx } from '../context.js';
import { logger, REDACT_KEYS } from './logger.js';

/* Fire-and-forget audit trail: NEVER throws (a failed audit write must not break the user's action, but it is
   logged loudly). Diffs are redacted: no PII, no secrets (MIS-10 needs before/after of promises and posts). */

export function redact<T>(v: T, depth = 0): T {
  if (depth > 6) return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1)) as unknown as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = REDACT_KEYS.includes(k) ? '[redacted]' : redact(val, depth + 1);
    return out as T;
  }
  return v;
}

export type AuditInput = {
  action: string;
  tenantId?: unknown;
  entity?: { type: string; id?: unknown; label?: string };
  diff?: { before?: unknown; after?: unknown };
  reason?: string;
};

export async function audit(e: AuditInput): Promise<void> {
  try {
    const c = ctx();
    await AuditLog.create({
      tenantId: (e.tenantId ?? c?.tenantId) || null,
      actor: c?.actor ? { userId: c.actor.userId as never, name: c.actor.name, role: c.actor.role, viaSuperAdmin: c.actor.viaSuperAdmin } : undefined,
      action: e.action,
      entity: e.entity ? { type: e.entity.type, id: e.entity.id != null ? String(e.entity.id) : undefined, label: e.entity.label } : undefined,
      diff: e.diff ? { before: redact(e.diff.before), after: redact(e.diff.after) } : undefined,
      reason: e.reason,
      ip: c?.ip,
      userAgent: c?.userAgent?.slice(0, 200),
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, action: e.action }, 'AUDIT WRITE FAILED');
  }
}
