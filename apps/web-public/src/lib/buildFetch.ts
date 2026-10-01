/* API reads during a static export (build time, one machine, no visitors). The API's public rate limit is per IP (120 per
   minute) and the free-tier API can still be waking up, so the build is polite: few requests at once, and a retry with
   backoff on 429 / 5xx / network errors, honouring Retry-After. An error that survives every retry fails the build. */
import { httpRequest, type HttpResult } from './http';

export const BUILD_FETCH = { concurrency: 2, retries: 6, baseDelayMs: 1_000, maxDelayMs: 65_000, timeoutMs: 30_000 };

/** Wait before retry number `attempt` (0 = first retry): the API's Retry-After (seconds) when it sent one, else 1 s, 2 s, 4 s... */
export function retryDelayMs(attempt: number, retryAfter?: string | string[]): number {
  const secs = Number(Array.isArray(retryAfter) ? retryAfter[0] : retryAfter);
  const ms = Number.isFinite(secs) && secs > 0 ? secs * 1000 : BUILD_FETCH.baseDelayMs * 2 ** attempt;
  return Math.min(ms, BUILD_FETCH.maxDelayMs);
}

const sleepFor = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs `send`, retrying a rate-limited (429), failing (5xx) or unreachable API. Any other answer (incl. 404) is returned as is. */
export async function withRetry(send: () => Promise<HttpResult>, sleep: (ms: number) => Promise<void> = sleepFor, retries = BUILD_FETCH.retries): Promise<HttpResult> {
  for (let attempt = 0; ; attempt++) {
    let res: HttpResult;
    try {
      res = await send();
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(retryDelayMs(attempt));
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(retryDelayMs(attempt, res.headers['retry-after'])); continue; }
    return res;
  }
}

/** At most `max` tasks at a time; the rest wait their turn in order. */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>) => {
    if (active < max) active++;
    else await new Promise<void>((go) => waiting.push(go)); // a woken task inherits the slot of the one that finished
    try { return await task(); } finally { const go = waiting.shift(); if (go) go(); else active--; }
  };
}

type Send = (url: string, headers: Record<string, string>) => Promise<HttpResult>;

/** A requester for the whole build: limited concurrency, retried, and each URL asked once. A URL that still fails after every
    retry is remembered as failed, so the pages that need it fail at once instead of each waiting out the retries again.
    (One tenant per build: the URL alone identifies a read.) */
export function createBuildRequester(send: Send, opts: { concurrency?: number; retries?: number; sleep?: (ms: number) => Promise<void> } = {}): Send {
  const slot = createLimiter(opts.concurrency ?? BUILD_FETCH.concurrency);
  const settled = new Map<string, Promise<HttpResult>>();
  return (url, headers) => {
    let p = settled.get(url);
    if (!p) { p = slot(() => withRetry(() => send(url, headers), opts.sleep, opts.retries)); settled.set(url, p); }
    return p;
  };
}

/** One API GET for the static build. */
export const buildRequest = createBuildRequester((url, headers) => httpRequest(url, { headers, timeoutMs: BUILD_FETCH.timeoutMs }));
