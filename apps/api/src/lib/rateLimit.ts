/* Fixed-window rate limiter behind an interface. The in-memory store is fine for one process and for tests;
   production swaps in a Redis store (docs/02) without touching callers. */

export type HitResult = { allowed: boolean; remaining: number; retryAfterSec: number };
export interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number, now?: number): HitResult;
  reset(key?: string): void;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  hit(key: string, limit: number, windowMs: number, now = Date.now()): HitResult {
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
      if (this.buckets.size > 50_000) this.sweep(now); // bound memory
    }
    b.count += 1;
    const allowed = b.count <= limit;
    return { allowed, remaining: Math.max(0, limit - b.count), retryAfterSec: allowed ? 0 : Math.ceil((b.resetAt - now) / 1000) };
  }
  reset(key?: string): void { key ? this.buckets.delete(key) : this.buckets.clear(); }
  private sweep(now: number) { for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k); }
}

/** Named tiers (docs/04 §1). `keyed` combines the tier with a caller-supplied identity (ip, user, phone hash). */
export const TIERS = {
  public: { limit: 120, windowMs: 60_000 },
  publicWrite: { limit: 5, windowMs: 60_000 },
  publicWriteDaily: { limit: 20, windowMs: 86_400_000 },
  // checked BEFORE a complaint body (up to 13 MB) is read; looser than publicWrite, which the service checks after parsing
  complaintBody: { limit: 10, windowMs: 60_000 },
  tracking: { limit: 10, windowMs: 60_000 },
  // IP tier is generous on purpose: mobile carriers put thousands of users behind one address (CGNAT) and an
  // office shares one. Brute force is stopped per ACCOUNT below (BUG-2026-009).
  auth: { limit: 60, windowMs: 15 * 60_000 },
  authAccount: { limit: 10, windowMs: 15 * 60_000 },
  admin: { limit: 300, windowMs: 60_000 },
  media: { limit: 600, windowMs: 60_000 }, // image/video files: a gallery page loads dozens at once
  upload: { limit: 40, windowMs: 10 * 60_000 },
  pii: { limit: 30, windowMs: 3_600_000 },
  otpSend: { limit: 3, windowMs: 10 * 60_000 },
} as const;
export type TierName = keyof typeof TIERS;

export class RateLimiter {
  constructor(private store: RateLimitStore, private disabled = false) {}
  setDisabled(v: boolean) { this.disabled = v; }
  check(tier: TierName, identity: string): HitResult {
    if (this.disabled) return { allowed: true, remaining: 999, retryAfterSec: 0 };
    const t = TIERS[tier];
    return this.store.hit(`${tier}:${identity}`, t.limit, t.windowMs);
  }
}
