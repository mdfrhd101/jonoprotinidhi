import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';

const cheap = { memory: 1024, passes: 1, parallelism: 1 };

describe('argon2id passwords', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const h = await hashPassword('correct horse 42', cheap);
    expect(h.startsWith('argon2id$m=1024,t=1,p=1$')).toBe(true);
    expect(await verifyPassword('correct horse 42', h)).toBe(true);
    expect(await verifyPassword('wrong horse 42', h)).toBe(false);
  });
  it('salts: same password hashes differently', async () => {
    expect(await hashPassword('same-password-1', cheap)).not.toBe(await hashPassword('same-password-1', cheap));
  });
  it('handles Bangla passwords', async () => {
    const h = await hashPassword('পাসওয়ার্ড১২৩৪৫', cheap);
    expect(await verifyPassword('পাসওয়ার্ড১২৩৪৫', h)).toBe(true);
  });
  it('returns false (never throws) for malformed stored values', async () => {
    for (const bad of ['', 'x', 'argon2id$m=1$bad', undefined as unknown as string]) expect(await verifyPassword('x', bad)).toBe(false);
  });
});
