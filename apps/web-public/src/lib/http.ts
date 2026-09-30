/* Minimal HTTP client for server-to-API calls. Node's global fetch (undici) silently replaces a custom Host header
   with the URL's host, but the public API selects the tenant by Host in production, so we use node:http(s). */
import http from 'node:http';
import https from 'node:https';

export type HttpResult = { status: number; headers: http.IncomingHttpHeaders; text: string };

export function httpRequest(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {}): Promise<HttpResult> {
  const u = new URL(url);
  const mod = u.protocol === 'https:' ? https : http;
  const body = opts.body !== undefined ? Buffer.from(opts.body, 'utf8') : undefined;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (body) headers['content-length'] = String(body.length);
  const max = opts.maxBytes ?? 5 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method: opts.method ?? 'GET', headers, timeout: opts.timeoutMs ?? 10_000,
      // TLS is verified against the URL's host name, not the tenant Host header
      ...(u.protocol === 'https:' ? { servername: u.hostname } : {}) }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => { size += c.length; if (size > max) { req.destroy(new Error('response too large')); return; } chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
