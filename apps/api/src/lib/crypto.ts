import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/* Envelope encryption (ADR-0004): master key -> per-tenant DEK -> AES-256-GCM field ciphertext.
   Format: v1:<keyVersion>:<iv b64>:<ciphertext b64>:<tag b64>.  AAD binds a ciphertext to its tenant/record/field
   so it cannot be copied into another row and still decrypt. No custom crypto: Node's crypto only. */

const ALG = 'aes-256-gcm';
const IV_LEN = 12;

export function generateKey(): Buffer { return randomBytes(32); }

function encryptRaw(key: Buffer, plaintext: Buffer, aad: string): { iv: Buffer; ct: Buffer; tag: Buffer } {
  if (key.length !== 32) throw new Error('key must be 32 bytes');
  const iv = randomBytes(IV_LEN);
  const c = createCipheriv(ALG, key, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return { iv, ct, tag: c.getAuthTag() };
}
function decryptRaw(key: Buffer, iv: Buffer, ct: Buffer, tag: Buffer, aad: string): Buffer {
  const d = createDecipheriv(ALG, key, iv);
  d.setAAD(Buffer.from(aad, 'utf8'));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

export function encryptField(key: Buffer, plaintext: string, aad: string, keyVersion = 1): string {
  const { iv, ct, tag } = encryptRaw(key, Buffer.from(plaintext, 'utf8'), aad);
  return ['v1', keyVersion, iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join(':');
}

export function decryptField(key: Buffer, packed: string, aad: string): string {
  const parts = packed.split(':');
  if (parts.length !== 5 || parts[0] !== 'v1') throw new Error('unsupported ciphertext format');
  const [, , iv, ct, tag] = parts as [string, string, string, string, string];
  return decryptRaw(key, Buffer.from(iv, 'base64'), Buffer.from(ct, 'base64'), Buffer.from(tag, 'base64'), aad).toString('utf8');
}

export const keyVersionOf = (packed: string): number => Number(packed.split(':')[1] ?? 0);

/** Wrap a per-tenant data key with the master key. Stored on the tenant document. */
export function wrapKey(master: Buffer, dek: Buffer, keyVersion = 1): { wrapped: string; keyVersion: number } {
  return { wrapped: encryptField(master, dek.toString('base64'), 'dek', keyVersion), keyVersion };
}
export function unwrapKey(master: Buffer, wrapped: string): Buffer {
  return Buffer.from(decryptField(master, wrapped, 'dek'), 'base64');
}

/** HMAC-SHA256 of a normalised phone with a server-side pepper: for rate limits and dedupe, not reversible. */
export function hmacPhone(pepper: string, normalizedPhone: string): string {
  return createHmac('sha256', pepper).update(normalizedPhone).digest('hex');
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

/** Field AAD: ties ciphertext to tenant + record + field name. */
export const piiAad = (tenantId: unknown, recordId: unknown, field: string): string => `${String(tenantId)}|${String(recordId)}|${field}`;
