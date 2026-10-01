import { describe, expect, it } from 'vitest';
import { BUILD_FETCH, createBuildRequester, createLimiter, retryDelayMs, withRetry } from '../src/lib/buildFetch';
import { publicApiUrl } from '../src/lib/publicApi';
import type { HttpResult } from '../src/lib/http';

/* Static export for GitHub Pages (docs/11-DEPLOY-GITHUB-PAGES.md): how the build talks to the API, and where the browser does. */

const res = (status: number, headers: HttpResult['headers'] = {}): HttpResult => ({ status, headers, text: '' });
const noSleep = () => Promise.resolve();

describe('build-time API retries', () => {
  it('waits for Retry-After when the API sends one, else backs off exponentially, never past the cap', () => {
    expect(retryDelayMs(0, '12')).toBe(12_000);
    expect(retryDelayMs(3, ['7'])).toBe(7_000);
    expect(retryDelayMs(0)).toBe(BUILD_FETCH.baseDelayMs);
    expect(retryDelayMs(3)).toBe(BUILD_FETCH.baseDelayMs * 8);
    expect(retryDelayMs(2, 'soon')).toBe(BUILD_FETCH.baseDelayMs * 4); // not a number: ignored
    expect(retryDelayMs(0, '9999')).toBe(BUILD_FETCH.maxDelayMs);
    expect(retryDelayMs(40)).toBe(BUILD_FETCH.maxDelayMs);
  });

  it('retries a rate-limited API (429) and honours its Retry-After', async () => {
    const answers = [res(429, { 'retry-after': '3' }), res(429, { 'retry-after': '5' }), res(200)];
    const waits: number[] = [];
    const out = await withRetry(async () => answers.shift()!, async (ms) => { waits.push(ms); });
    expect(out.status).toBe(200);
    expect(waits).toEqual([3_000, 5_000]);
  });

  it('retries 5xx and network errors (an API that is still waking up)', async () => {
    let calls = 0;
    const out = await withRetry(async () => { calls++; if (calls === 1) throw new Error('ECONNRESET'); if (calls === 2) return res(503); return res(200); }, noSleep);
    expect([out.status, calls]).toEqual([200, 3]);
  });

  it('returns any other answer at once, a 404 included (a missing post is an answer, not a hiccup)', async () => {
    for (const status of [200, 304, 400, 404]) {
      let calls = 0;
      const out = await withRetry(async () => { calls++; return res(status); }, noSleep);
      expect([out.status, calls]).toEqual([status, 1]);
    }
  });

  it('gives up after the last retry: the final 5xx is returned, the final network error is thrown (the build fails)', async () => {
    let calls = 0;
    const last = await withRetry(async () => { calls++; return res(502); }, noSleep, 2);
    expect([last.status, calls]).toEqual([502, 3]);
    calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error('timeout'); }, noSleep, 2)).rejects.toThrow('timeout');
    expect(calls).toBe(3);
  });
});

describe('build-time concurrency limit', () => {
  it('never runs more than `max` tasks at once and still finishes them all', async () => {
    const run = createLimiter(2);
    let active = 0, peak = 0;
    const task = (n: number) => run(async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return n; });
    const out = await Promise.all(Array.from({ length: 9 }, (_, i) => task(i)));
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(peak).toBe(2);
  });

  it('a failing task frees its slot', async () => {
    const run = createLimiter(1);
    await expect(run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await run(async () => 'next')).toBe('next');
  });
});

describe('build-time requester', () => {
  it('asks the API once per URL, however many pages need it', async () => {
    let calls = 0;
    const get = createBuildRequester(async () => { calls++; return res(200); }, { sleep: noSleep });
    const all = await Promise.all([get('/a', {}), get('/a', {}), get('/b', {})]);
    await get('/a', {});
    expect([all.map((r) => r.status), calls]).toEqual([[200, 200, 200], 2]);
  });

  it('retries inside, and remembers a URL that stays down: later callers fail at once instead of waiting out the retries again', async () => {
    let calls = 0;
    const get = createBuildRequester(async () => { calls++; throw new Error('down'); }, { sleep: noSleep, retries: 2 });
    await expect(get('/area', {})).rejects.toThrow('down');
    await expect(get('/area', {})).rejects.toThrow('down');
    expect(calls).toBe(3); // 1 try + 2 retries, once
  });
});

describe('where the browser calls the API (complaint, OTP, tracking)', () => {
  it('without NEXT_PUBLIC_API_ORIGIN: the same-origin proxy, exactly as before', () => {
    expect(publicApiUrl('otp/send', '')).toBe('/api/public/otp/send');
    expect(publicApiUrl('complaints', undefined)).toBe('/api/public/complaints');
  });
  it('static export: straight to the API, whatever the trailing slashes', () => {
    expect(publicApiUrl('otp/verify', 'https://jonoprotinidhi-api.onrender.com')).toBe('https://jonoprotinidhi-api.onrender.com/api/v1/public/otp/verify');
    expect(publicApiUrl('complaints/ABC-123', ' https://api.example/// ')).toBe('https://api.example/api/v1/public/complaints/ABC-123');
  });
});
