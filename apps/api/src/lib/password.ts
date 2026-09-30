import * as nodeCrypto from 'node:crypto';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/* argon2id via Node's built-in crypto (Node >= 24.7): no native dependency to compile on Windows-on-ARM.
   Stored form:  argon2id$m=<KiB>,t=<passes>,p=<lanes>$<salt b64>$<hash b64> */

// crypto.argon2 exists at runtime on Node >= 24.7 but not in @types/node yet
const argon2p = promisify((nodeCrypto as unknown as { argon2: (...a: unknown[]) => void }).argon2) as (alg: string, params: Record<string, unknown>) => Promise<Buffer>;
const TAG = 32;

export type PwCost = { memory: number; passes: number; parallelism: number };
export const defaultCost: PwCost = { memory: 65536, passes: 3, parallelism: 4 };

export async function hashPassword(password: string, cost: Partial<PwCost> = {}): Promise<string> {
  const c = { ...defaultCost, ...cost };
  const nonce = randomBytes(16);
  const tag = await argon2p('argon2id', { message: Buffer.from(password, 'utf8'), nonce, parallelism: c.parallelism, tagLength: TAG, memory: c.memory, passes: c.passes });
  return `argon2id$m=${c.memory},t=${c.passes},p=${c.parallelism}$${nonce.toString('base64')}$${tag.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = /^argon2id\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(stored ?? '');
  if (!m) return false;
  const [, mem, t, p, salt, hash] = m as unknown as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, 'base64');
  const tag = await argon2p('argon2id', { message: Buffer.from(password, 'utf8'), nonce: Buffer.from(salt, 'base64'), parallelism: Number(p), tagLength: expected.length, memory: Number(mem), passes: Number(t) });
  return tag.length === expected.length && timingSafeEqual(tag, expected);
}

/** Burn comparable time when the account does not exist, so login latency doesn't reveal valid identifiers. */
export async function dummyVerify(cost: Partial<PwCost> = {}): Promise<void> {
  await hashPassword('dummy-password-for-timing', cost);
}
