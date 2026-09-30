/* Tiny in-memory cache for server-side API reads.
   - fresh for `ttlMs` (a few seconds, so a CMS edit shows almost immediately),
   - identical concurrent reads share one request,
   - when the API fails (rate limit, restart, network) the last good value is served for up to `staleMs`,
     so a hiccup never turns into an error page for visitors. Bounded size (oldest entries evicted). */
export class TtlCache {
  private store = new Map<string, { at: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();
  constructor(private ttlMs = 5_000, private staleMs = 10 * 60_000, private max = 500, private now: () => number = Date.now) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value as T;
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const p = (async () => {
      try {
        const value = await load();
        this.store.delete(key); // re-insert so the Map order is "least recently refreshed first"
        this.store.set(key, { at: this.now(), value });
        while (this.store.size > this.max) this.store.delete(this.store.keys().next().value as string);
        return value;
      } catch (e) {
        const old = this.store.get(key);
        if (old && this.now() - old.at < this.staleMs && isTransient(e)) return old.value as T;
        throw e;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  clear() { this.store.clear(); }
  get size() { return this.store.size; }
}

/** Errors worth hiding behind stale data: rate limiting, server errors, network. A 404 is an answer, not a hiccup. */
export function isTransient(e: unknown): boolean {
  const s = (e as { status?: number })?.status;
  return s === undefined || s === 0 || s === 429 || s >= 500;
}
