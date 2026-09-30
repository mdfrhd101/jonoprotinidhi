import type { Config } from './config.js';
import type { Deps } from './deps.js';
import { DnsDomainProvider } from './deps.js';
import { MemoryRateLimitStore, RateLimiter } from './lib/rateLimit.js';
import { ConsoleSmsProvider, SmsService } from './lib/sms.js';
import { createTurnstile } from './lib/turnstile.js';
import { OtpService } from './lib/otp.js';
import { DiskMediaStorage } from './lib/media.js';
import path from 'node:path';

/** Production wiring. Tests build their own Deps with fakes (see test/helpers/app.ts). */
export function buildDeps(config: Config): Deps {
  const smsProvider = new ConsoleSmsProvider();
  return {
    config,
    master: Buffer.from(config.MASTER_KEY, 'base64'),
    rateLimiter: new RateLimiter(new MemoryRateLimitStore(), config.RATE_LIMIT_DISABLED),
    smsProvider,
    sms: new SmsService(smsProvider, config.PHONE_PEPPER, config.DAILY_SMS_CAP),
    turnstile: createTurnstile(config.TURNSTILE_SECRET),
    otp: new OtpService(),
    domainProvider: new DnsDomainProvider(),
    media: new DiskMediaStorage(path.resolve(config.UPLOAD_DIR)),
  };
}
