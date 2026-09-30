import { createHmac, randomBytes } from 'node:crypto';

/* RFC 6238 TOTP (SHA-1, 6 digits, 30 s) implemented with node:crypto: tiny, dependency-free, RFC test vectors in tests. */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = (): string => base32Encode(randomBytes(20));

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(buf).digest();
  const off = h[h.length - 1]! & 0x0f;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totp(secretB32: string, atMs = Date.now(), stepSec = 30, digits = 6): string {
  return hotp(base32Decode(secretB32), Math.floor(atMs / 1000 / stepSec), digits);
}

/** Accepts the current step and +/- `window` steps (clock drift). Returns the matched step or null (for replay checks). */
export function verifyTotp(secretB32: string, code: string, atMs = Date.now(), window = 1, stepSec = 30): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const step = Math.floor(atMs / 1000 / stepSec);
  for (let w = -window; w <= window; w++) if (hotp(secret, step + w) === code) return step + w;
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = 'Jonoshetu'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
