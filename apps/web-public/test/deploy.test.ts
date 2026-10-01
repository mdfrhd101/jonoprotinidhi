import { describe, expect, it } from 'vitest';
import { resolveTenantHost } from '../src/lib/host';
import { challengeHeaders, checkGate, parseBasicAuth, safeEqualStr } from '../src/lib/demoGate';

const basic = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`, 'utf8').toString('base64');

describe('TENANT_PIN (single-tenant demo on an unknown host)', () => {
  const PIN = 'jonoprotinidhi-api.onrender.com';
  it('without pin an unknown host is used as-is (a non-tenant host would 404 at the API)', () => {
    expect(resolveTenantHost('demo.onrender.com', PIN)).toBe('demo.onrender.com');
  });
  it('with pin every request host maps to the pinned tenant host', () => {
    for (const h of ['demo.onrender.com', 'localhost:3000', '127.0.0.1', 'evil.example', '', null, undefined, 'bad host']) {
      expect(resolveTenantHost(h as string, PIN, true)).toBe(PIN);
    }
  });
  it('the pinned host is normalised like any host', () => {
    expect(resolveTenantHost('x', 'JONOPROTINIDHI-API.onrender.com:443', true)).toBe('jonoprotinidhi-api.onrender.com');
  });
});

describe('demo gate: Basic auth', () => {
  const E = { SITE_BASIC_AUTH_USER: 'demo', SITE_BASIC_AUTH_PASS: 'p:ss wörd/+=' };
  it('is off when neither variable is set (empty strings count as unset)', async () => {
    expect(await checkGate(null, {})).toBe('off');
    expect(await checkGate(undefined, { SITE_BASIC_AUTH_USER: '', SITE_BASIC_AUTH_PASS: '' })).toBe('off');
  });
  it('fails closed when only one of the two is set', async () => {
    expect(await checkGate(basic('demo', 'x'), { SITE_BASIC_AUTH_USER: 'demo' })).toBe('deny');
    expect(await checkGate(basic('', 'x'), { SITE_BASIC_AUTH_PASS: 'x' })).toBe('deny');
    expect(await checkGate(null, { SITE_BASIC_AUTH_PASS: 'x' })).toBe('deny');
  });
  it('accepts the right credentials, including a password with ":" and non-ASCII', async () => {
    expect(await checkGate(basic('demo', 'p:ss wörd/+='), E)).toBe('ok');
    expect(await checkGate(basic('demo', 'p:ss wörd/+=').replace('Basic', 'basic'), E)).toBe('ok'); // scheme is case-insensitive
  });
  it('denies wrong, missing and malformed credentials', async () => {
    for (const h of [null, undefined, '', 'Bearer abc', 'Basic', 'Basic !!!', 'Basic ' + Buffer.from('nocolon').toString('base64'),
      basic('demo', 'wrong'), basic('Demo', 'p:ss wörd/+='), basic('', ''), basic('demo', 'p:ss wörd/+=x'), basic('demo', 'p:ss wörd/+').slice(0, -3)]) {
      expect(await checkGate(h as string, E)).toBe('deny');
    }
  });
  it('rejects non-UTF-8 payloads without throwing', async () => {
    expect(parseBasicAuth('Basic ' + Buffer.from([0xff, 0xfe, 0x3a, 0xff]).toString('base64'))).toBeNull();
    expect(await checkGate('Basic ' + Buffer.from([0xff, 0xfe, 0x3a, 0xff]).toString('base64'), E)).toBe('deny');
  });
  it('parseBasicAuth splits on the first colon only', () => {
    expect(parseBasicAuth(basic('u', 'a:b:c'))).toEqual({ user: 'u', pass: 'a:b:c' });
  });
  it('safeEqualStr compares content, not length prefixes', async () => {
    expect(await safeEqualStr('abc', 'abc')).toBe(true);
    expect(await safeEqualStr('abc', 'abcd')).toBe(false);
    expect(await safeEqualStr('', '')).toBe(true);
  });
  it('the challenge asks the browser for credentials and is never cached', () => {
    const h = challengeHeaders();
    expect(h['WWW-Authenticate']).toMatch(/^Basic realm="[^"]+", charset="UTF-8"$/);
    expect(h['Cache-Control']).toBe('no-store');
  });
});
