import { smsSegments } from '@jonoshetu/shared';
import { SmsLog } from '../models/index.js';
import { hmacPhone } from './crypto.js';
import { logger } from './logger.js';

/* Pluggable SMS gateway (docs/02). The console provider records messages in memory (tests read `outbox`);
   a real Bangladeshi gateway is one more class implementing SmsProvider, selected by config. */

export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string, senderId?: string): Promise<{ id: string }>;
}

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  outbox: Array<{ to: string; text: string; senderId?: string; at: number }> = [];
  async send(to: string, text: string, senderId?: string) {
    this.outbox.push({ to, text, senderId, at: Date.now() });
    if (this.outbox.length > 1000) this.outbox.shift();
    logger.info({ to: to.slice(0, 5) + '******', segments: smsSegments(text) }, 'sms (console provider)');
    return { id: `console-${this.outbox.length}` };
  }
}

export type SmsPurpose = 'otp' | 'ack' | 'status' | 'invite' | 'reset' | 'owner_alert';

export class SmsService {
  constructor(private provider: SmsProvider, private pepper: string, private defaultCap: number) {}

  /** Daily per-tenant cap (period-bucket counter: no cron reset needed). Returns false if not sent. */
  async send(p: { tenantId?: unknown; to: string; text: string; purpose: SmsPurpose; complaintId?: unknown; senderId?: string; cap?: number }): Promise<boolean> {
    const day = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
    if (p.tenantId) {
      // the platform cap is a ceiling: a tenant setting may lower it but never raise it (BUG-2026-005)
      const cap = Math.min(p.cap ?? this.defaultCap, this.defaultCap);
      const used = await SmsLog.countDocuments({ tenantId: p.tenantId, day, status: 'sent' });
      if (used >= cap) {
        await SmsLog.create({ tenantId: p.tenantId, purpose: p.purpose, status: 'failed', provider: this.provider.name, template: 'daily-cap', day });
        return false;
      }
    }
    try {
      await this.provider.send(p.to, p.text, p.senderId);
      await SmsLog.create({ tenantId: p.tenantId, complaintId: p.complaintId, purpose: p.purpose, phoneHmac: hmacPhone(this.pepper, p.to), segments: smsSegments(p.text), provider: this.provider.name, status: 'sent', day });
      return true;
    } catch (e) {
      logger.error({ err: (e as Error).message }, 'sms send failed');
      await SmsLog.create({ tenantId: p.tenantId, purpose: p.purpose, status: 'failed', provider: this.provider.name, day });
      return false;
    }
  }
}
