import { describe, it, expect } from 'vitest';
import { generateKey, encryptField, decryptField, wrapKey, unwrapKey, hmacPhone, piiAad, keyVersionOf, sha256, safeEqual } from '../../src/lib/crypto.js';

describe('envelope encryption (ADR-0004)', () => {
  const key = generateKey();
  const aad = piiAad('tenantA', 'complaint1', 'phone');

  it('round-trips Bangla text', () => {
    const packed = encryptField(key, 'রহিম উদ্দিন', aad);
    expect(packed.startsWith('v1:1:')).toBe(true);
    expect(decryptField(key, packed, aad)).toBe('রহিম উদ্দিন');
  });

  it('uses a fresh IV each time (same plaintext, different ciphertext)', () => {
    expect(encryptField(key, '01712345678', aad)).not.toBe(encryptField(key, '01712345678', aad));
  });

  it('detects tampering with the ciphertext', () => {
    const parts = encryptField(key, 'secret', aad).split(':');
    const ct = Buffer.from(parts[3]!, 'base64'); ct[0] = ct[0]! ^ 0xff; parts[3] = ct.toString('base64');
    expect(() => decryptField(key, parts.join(':'), aad)).toThrow();
  });

  it('refuses to decrypt under a different AAD (ciphertext cannot be moved to another record/tenant/field)', () => {
    const packed = encryptField(key, '01712345678', aad);
    expect(() => decryptField(key, packed, piiAad('tenantB', 'complaint1', 'phone'))).toThrow();
    expect(() => decryptField(key, packed, piiAad('tenantA', 'complaint2', 'phone'))).toThrow();
    expect(() => decryptField(key, packed, piiAad('tenantA', 'complaint1', 'name'))).toThrow();
  });

  it('refuses to decrypt with a different key', () => {
    expect(() => decryptField(generateKey(), encryptField(key, 'x', aad), aad)).toThrow();
  });

  it('rejects malformed input and wrong key length', () => {
    expect(() => decryptField(key, 'garbage', aad)).toThrow(/unsupported/);
    expect(() => encryptField(Buffer.alloc(16), 'x', aad)).toThrow(/32 bytes/);
  });

  it('records the key version', () => {
    expect(keyVersionOf(encryptField(key, 'x', aad, 3))).toBe(3);
  });

  it('wraps and unwraps a tenant data key with the master key', () => {
    const master = generateKey(), dek = generateKey();
    const { wrapped, keyVersion } = wrapKey(master, dek);
    expect(keyVersion).toBe(1);
    expect(unwrapKey(master, wrapped).equals(dek)).toBe(true);
    expect(() => unwrapKey(generateKey(), wrapped)).toThrow();
  });
});

describe('phone hmac / helpers', () => {
  it('is deterministic per pepper and differs across peppers', () => {
    const a = hmacPhone('pepper-one-1234567', '01712345678');
    expect(a).toBe(hmacPhone('pepper-one-1234567', '01712345678'));
    expect(a).not.toBe(hmacPhone('pepper-two-1234567', '01712345678'));
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
  it('safeEqual compares in constant-time semantics and handles length differences', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(sha256('a')).toHaveLength(64);
  });
});
