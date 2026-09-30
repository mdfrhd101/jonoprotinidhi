import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode, hotp, totp, verifyTotp, generateTotpSecret, otpauthUri } from '../../src/lib/totp.js';

describe('TOTP (RFC 4226 / 6238)', () => {
  const rfcSecret = Buffer.from('12345678901234567890');

  it('matches the RFC 4226 HOTP test vectors', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, i) => expect(hotp(rfcSecret, i)).toBe(code));
  });

  it('matches the RFC 6238 SHA-1 test vectors (6-digit tail of the 8-digit values)', () => {
    const b32 = base32Encode(rfcSecret);
    expect(totp(b32, 59_000)).toBe('287082');
    expect(totp(b32, 1_111_111_109_000)).toBe('081804');
    expect(totp(b32, 1_234_567_890_000)).toBe('005924');
  });

  it('base32 round-trips arbitrary bytes and rejects invalid characters', () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 128, 7, 9, 33, 44]);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(() => base32Decode('!!!')).toThrow();
  });

  it('accepts the current and adjacent steps, rejects outside the drift window', () => {
    const s = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(s, totp(s, now), now)).not.toBeNull();
    expect(verifyTotp(s, totp(s, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(s, totp(s, now + 30_000), now)).not.toBeNull();
    expect(verifyTotp(s, totp(s, now - 90_000), now)).toBeNull();
  });

  it('returns the matched step so callers can reject replays', () => {
    const s = generateTotpSecret(); const now = 1_700_000_000_000;
    expect(verifyTotp(s, totp(s, now), now)).toBe(Math.floor(now / 30_000));
  });

  it('rejects malformed codes', () => {
    const s = generateTotpSecret();
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 3456']) expect(verifyTotp(s, bad)).toBeNull();
  });

  it('builds an otpauth URI', () => {
    const u = otpauthUri('ABCDEF', 'user@x.com');
    expect(u).toContain('otpauth://totp/Jonoshetu:user%40x.com');
    expect(u).toContain('secret=ABCDEF');
  });
});
