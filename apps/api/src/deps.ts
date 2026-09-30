import type { Config } from './config.js';
import type { RateLimiter } from './lib/rateLimit.js';
import type { SmsService, SmsProvider } from './lib/sms.js';
import type { Turnstile } from './lib/turnstile.js';
import type { OtpService } from './lib/otp.js';
import type { MediaStorage } from './lib/media.js';
import { resolveTxt } from 'node:dns/promises';

/* Everything a service needs from the outside world is injected, so tests swap fakes and production swaps
   Redis / a real SMS gateway / Cloudflare without touching business code. */

export interface DomainProvider {
  /** True when the customer's DNS carries the expected TXT verification value. */
  verifyTxt(host: string, expected: string): Promise<boolean>;
}

export class DnsDomainProvider implements DomainProvider {
  async verifyTxt(host: string, expected: string) {
    try {
      const rows = await resolveTxt(`_jonoprotinidhi.${host}`);
      return rows.some((r) => r.join('') === expected);
    } catch {
      return false;
    }
  }
}

export type Deps = {
  config: Config;
  master: Buffer;
  rateLimiter: RateLimiter;
  sms: SmsService;
  smsProvider: SmsProvider;
  turnstile: Turnstile;
  otp: OtpService;
  domainProvider: DomainProvider;
  media: MediaStorage;
};
