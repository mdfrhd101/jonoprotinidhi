import { z } from 'zod';

/* Env is validated once at boot; a missing/invalid secret must crash loudly, not 500 on the first request
   (docs/05 §9). Everything configurable lives here: no secret, key or policy is hardcoded elsewhere. */

const base64Key = z
  .string()
  .refine((s) => {
    try { return Buffer.from(s, 'base64').length === 32; } catch { return false; }
  }, 'must be 32 bytes, base64');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(10),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  MASTER_KEY: base64Key,
  PHONE_PEPPER: z.string().min(16),
  PLATFORM_DOMAIN: z.string().min(3).default('jonoprotinidhi.localhost'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TURNSTILE_SECRET: z.string().optional().default(''),
  SMS_PROVIDER: z.enum(['console']).default('console'),
  ACCESS_TTL_SEC: z.coerce.number().int().min(60).default(600),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  ACT_AS_TTL_SEC: z.coerce.number().int().min(60).default(1800),
  MEDIA_HOSTS: z.string().default('upload.wikimedia.org,thumb.wikimedia.org,cdn.jonoprotinidhi.example'),
  PII_RETENTION_MONTHS: z.coerce.number().int().min(1).default(12),
  DAILY_SMS_CAP: z.coerce.number().int().min(1).default(500),
  // argon2id cost; lowered in tests only
  PW_MEMORY_KIB: z.coerce.number().int().min(1024).default(65536),
  PW_PASSES: z.coerce.number().int().min(1).default(3),
  // NOT z.coerce.boolean(): Boolean('false') is true, which would silently turn the limiter off (BUG-2026-007)
  // Dev convenience: false = password-only login (no 2-step code). Refused in production unless ALLOW_NO_MFA_IN_PRODUCTION is set.
  MFA_REQUIRED: z.enum(['true', 'false', '1', '0']).default('true').transform((v) => v === 'true' || v === '1'),
  // Owner opt-in (demo deployment, 2 Oct 2026): permits MFA_REQUIRED=false with NODE_ENV=production.
  ALLOW_NO_MFA_IN_PRODUCTION: z.enum(['true', 'false', '1', '0']).default('false').transform((v) => v === 'true' || v === '1'),
  // Uploaded images: where they live on disk, and the public origin used to build their URLs.
  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_BASE_URL: z.string().url().default('http://127.0.0.1:4000'),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(25).default(8),
  MAX_VIDEO_MB: z.coerce.number().min(1).max(1024).default(150),
  // Shared secret of our own server-rendered public site (apps/web-public). Only a request carrying it may name the real
  // visitor IP (X-Client-IP), so rate limits stay per visitor instead of per site server (BUG-2026-020). Empty = feature off.
  SITE_SERVER_TOKEN: z.string().refine((v) => v === '' || v.length >= 32, 'SITE_SERVER_TOKEN must be empty or at least 32 characters').default(''),
  RATE_LIMIT_DISABLED: z.enum(['true', 'false', '1', '0']).default('false').transform((v) => v === 'true' || v === '1'),
});

export type Config = z.infer<typeof schema> & { corsOrigins: string[]; mediaHosts: string[]; isProd: boolean };

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${msg}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && !c.MFA_REQUIRED && !c.ALLOW_NO_MFA_IN_PRODUCTION) throw new Error('Invalid environment: MFA_REQUIRED=false is not allowed in production');
  return {
    ...c,
    corsOrigins: c.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    mediaHosts: c.MEDIA_HOSTS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    isProd: c.NODE_ENV === 'production',
  };
}
