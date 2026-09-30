import pino from 'pino';

/* Structured logs with a redaction list (docs/05 §6): no passwords, tokens, OTPs, phones or complaint text. */
export const REDACT_KEYS = ['password', 'passwordHash', 'token', 'refresh', 'refreshToken', 'accessToken', 'mfaToken', 'otp', 'code', 'phone', 'pii', 'description', 'authorization', 'cookie', 'totpSecretEnc', 'secret'];

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: { paths: REDACT_KEYS.flatMap((k) => [k, `*.${k}`, `req.headers.${k}`]), censor: '[redacted]' },
});
