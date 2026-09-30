import { randomInt } from 'node:crypto';
import { randomToken, sha256, safeEqual } from './crypto.js';

/* Complaint OTP (ADR-0007): 6 digits, 5 min, 5 attempts, resend after 60 s. Codes are stored hashed.
   A verified code yields a single-use ticket (10 min) that the complaint endpoint consumes.
   The in-memory store is fine for one process and tests; production swaps in Redis behind the same interface. */

export type OtpIssue = { ok: true; code: string } | { ok: false; retryAfterSec: number };

export class OtpService {
  private codes = new Map<string, { hash: string; expiresAt: number; attempts: number; issuedAt: number }>();
  private tickets = new Map<string, { key: string; expiresAt: number }>();

  constructor(private opts = { codeTtlMs: 5 * 60_000, ticketTtlMs: 10 * 60_000, maxAttempts: 5, resendMs: 60_000 }, private now: () => number = Date.now) {}

  issue(key: string): OtpIssue {
    const t = this.now();
    const prev = this.codes.get(key);
    if (prev && t - prev.issuedAt < this.opts.resendMs) return { ok: false, retryAfterSec: Math.ceil((this.opts.resendMs - (t - prev.issuedAt)) / 1000) };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.codes.set(key, { hash: sha256(code + key), expiresAt: t + this.opts.codeTtlMs, attempts: 0, issuedAt: t });
    return { ok: true, code };
  }

  /** Returns a ticket on success. Wrong codes count as attempts; after the limit the code is burned. */
  verify(key: string, code: string): string | null {
    const t = this.now();
    const rec = this.codes.get(key);
    if (!rec || rec.expiresAt <= t) { this.codes.delete(key); return null; }
    rec.attempts += 1;
    if (rec.attempts > this.opts.maxAttempts) { this.codes.delete(key); return null; }
    if (!safeEqual(rec.hash, sha256(String(code) + key))) return null;
    this.codes.delete(key);
    const ticket = randomToken(24);
    this.tickets.set(ticket, { key, expiresAt: t + this.opts.ticketTtlMs });
    return ticket;
  }

  /** Single use: a ticket is deleted whether or not it matches the key. */
  consumeTicket(ticket: string | undefined, key: string): boolean {
    if (!ticket) return false;
    const rec = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return !!rec && rec.expiresAt > this.now() && rec.key === key;
  }
}
